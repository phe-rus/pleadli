use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

/// Court Production & Remand (docs/prisons/PRODUCT.md) — s.118's pre-session
/// list and s.67's reactive production orders. Each row is one production
/// event; "date last appeared in court" (one of s.118's three required
/// fields) is derived as the latest `production_date` for a prisoner, not
/// a separately maintained field.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourtProduction {
    pub id: String,
    pub prisoner_id: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCourtProductionInput {
    pub prisoner_id: String,
    pub court_reference: Option<String>,
    pub production_date: i64,
    pub purpose: Option<String>,
}

pub async fn create_court_production(pool: &SqlitePool, input: CreateCourtProductionInput) -> Result<CourtProduction, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO court_productions (id, prisoner_id, court_reference, production_date, purpose)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.court_reference)
    .bind(input.production_date)
    .bind(&input.purpose)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, CourtProduction>("SELECT * FROM court_productions WHERE id = ?")
        .bind(&id)
        .fetch_one(pool)
        .await
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<CourtProduction>, sqlx::Error> {
    sqlx::query_as::<_, CourtProduction>(
        "SELECT * FROM court_productions WHERE prisoner_id = ? ORDER BY production_date DESC",
    )
    .bind(prisoner_id)
    .fetch_all(pool)
    .await
}

/// Every in-custody prisoner alongside their most recent production date
/// (null if never produced) — the working data behind both the s.118
/// pre-session list and the Overview "upcoming/overdue" queue.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RemandListEntry {
    pub prisoner_id: String,
    pub first_name: String,
    pub last_name: String,
    pub admitted_at: i64,
    pub admission_authority: Option<String>,
    pub high_court_only_offence: bool,
    pub last_produced_at: Option<i64>,
}

pub async fn list_remand(pool: &SqlitePool) -> Result<Vec<RemandListEntry>, sqlx::Error> {
    sqlx::query_as::<_, RemandListEntry>(
        "SELECT
            p.id AS prisoner_id, p.first_name, p.last_name, p.admitted_at, p.admission_authority,
            p.high_court_only_offence,
            (SELECT MAX(cp.production_date) FROM court_productions cp WHERE cp.prisoner_id = p.id) AS last_produced_at
         FROM prisoners p
         WHERE p.current_status = 'in_custody' AND p.status = 'unconvicted'
         ORDER BY p.admitted_at ASC",
    )
    .fetch_all(pool)
    .await
}
