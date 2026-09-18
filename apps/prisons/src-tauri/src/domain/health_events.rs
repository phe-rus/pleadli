use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;

/// docs/prisons/PRODUCT.md §Health & Welfare — event log only, never a
/// clinical record system. Confirmed event pairs (RESEARCH.md §5):
/// hospital_referral/hospital_return (ss.75-76) and
/// mental_hospital_transfer/mental_hospital_return (s.74). Recording one of
/// these never changes `prisoners.current_status` — see migration 0007's
/// comment for the statutory reason.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HealthEvent {
    pub id: String,
    pub prisoner_id: String,
    pub event_type: String,
    pub facility_name: Option<String>,
    pub occurred_at: i64,
    pub authorized_by: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHealthEventInput {
    pub prisoner_id: String,
    pub event_type: String,
    pub facility_name: Option<String>,
    pub occurred_at: i64,
    pub authorized_by: Option<String>,
    pub notes: Option<String>,
}

pub async fn create_health_event(conn: &mut SqliteConnection, actor: &Actor, input: CreateHealthEventInput) -> Result<HealthEvent, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO health_events (id, prisoner_id, event_type, facility_name, occurred_at, authorized_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.event_type)
    .bind(&input.facility_name)
    .bind(input.occurred_at)
    .bind(&input.authorized_by)
    .bind(&input.notes)
    .execute(&mut *conn)
    .await?;

    let event = sqlx::query_as::<_, HealthEvent>("SELECT * FROM health_events WHERE id = ?").bind(&id).fetch_one(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("health.movement", "health_event", Some(&id)).after(&event)).await?;
    Ok(event)
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<HealthEvent>, sqlx::Error> {
    sqlx::query_as::<_, HealthEvent>("SELECT * FROM health_events WHERE prisoner_id = ? ORDER BY occurred_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HealthEventSearchRow {
    pub id: String,
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub event_type: String,
    pub facility_name: Option<String>,
    pub occurred_at: i64,
}

pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<HealthEventSearchRow>, sqlx::Error> {
    let like = format!("%{query}%");
    sqlx::query_as::<_, HealthEventSearchRow>(
        "SELECT he.id, he.prisoner_id, p.first_name, p.last_name, he.event_type, he.facility_name, he.occurred_at
         FROM health_events he JOIN prisoners p ON p.id = he.prisoner_id
         WHERE he.facility_name LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR p.other_names LIKE ?1
         ORDER BY he.occurred_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HospitalisedEntry {
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub event_type: String,
    pub facility_name: Option<String>,
    pub occurred_at: i64,
}

/// Prisoners currently away at a hospital: their latest health event is a
/// referral/transfer with no later return recorded — the Overview queue
/// this drives (docs/prisons/PRODUCT.md §Work Queues: "sick prisoners
/// currently hospitalised, awaiting the return notification").
pub async fn list_hospitalised(pool: &SqlitePool) -> Result<Vec<HospitalisedEntry>, sqlx::Error> {
    sqlx::query_as::<_, HospitalisedEntry>(
        "SELECT p.id AS prisoner_id, p.first_name, p.last_name,
                latest.event_type, latest.facility_name, latest.occurred_at
         FROM prisoners p
         JOIN (
             SELECT he.prisoner_id, he.event_type, he.facility_name, he.occurred_at
             FROM health_events he
             JOIN (
                 SELECT prisoner_id, MAX(occurred_at) AS max_occurred_at
                 FROM health_events
                 GROUP BY prisoner_id
             ) latest_per_prisoner
               ON latest_per_prisoner.prisoner_id = he.prisoner_id
              AND latest_per_prisoner.max_occurred_at = he.occurred_at
         ) latest ON latest.prisoner_id = p.id
         WHERE p.current_status = 'in_custody'
           AND latest.event_type IN ('hospital_referral', 'mental_hospital_transfer')
         ORDER BY latest.occurred_at ASC",
    )
    .fetch_all(pool)
    .await
}
