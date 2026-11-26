//! The office's own time limits and the clocks they start (AC-11), and the
//! minute of a hearing with the witnesses served. Custody and the 14 day
//! threshold review have their own clocks elsewhere; these are the ones the
//! office edits. A clock only starts from a date the record already holds.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

const DAY: i64 = 86_400_000;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub const LIMIT_KEYS: &[&str] = &["allocation", "complaint_reply", "adjournments_before_review", "hearing_notice"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Limit {
    pub key: String,
    pub days: i64,
    pub updated_by: Option<String>,
    pub updated_at: i64,
}

pub async fn limits(pool: &SqlitePool) -> Result<Vec<Limit>, sqlx::Error> {
    sqlx::query_as("SELECT key, days, updated_by, updated_at FROM time_limits ORDER BY key").fetch_all(pool).await
}

pub async fn set_limit(pool: &SqlitePool, key: &str, days: i64, actor: Option<&str>) -> Result<Limit, DomainError> {
    if !LIMIT_KEYS.contains(&key) {
        return invalid("That is not a time limit the office keeps.");
    }
    if !(1..=365).contains(&days) {
        return invalid("A limit is between 1 and 365.");
    }
    sqlx::query("INSERT INTO time_limits (key, days, updated_by, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET days = excluded.days, updated_by = excluded.updated_by, updated_at = excluded.updated_at")
        .bind(key)
        .bind(days)
        .bind(actor)
        .bind(now())
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT key, days, updated_by, updated_at FROM time_limits WHERE key = ?").bind(key).fetch_one(pool).await?)
}

async fn days_of(pool: &SqlitePool, key: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT days FROM time_limits WHERE key = ?").bind(key).fetch_optional(pool).await.map(|d| d.unwrap_or(match key {
        "allocation" => 3,
        "complaint_reply" => 7,
        "hearing_notice" => 2,
        _ => 3,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clock {
    pub file_id: String,
    pub file_title: String,
    /// allocation, complaint_reply or adjournment_review.
    pub kind: String,
    /// When it runs out; none for a review that is simply due.
    pub due_at: Option<i64>,
    pub overdue: bool,
    /// For the adjournment review: how many adjournments so far.
    pub count: Option<i64>,
}

/// Every open clock, most urgent first.
pub async fn clocks(pool: &SqlitePool) -> Result<Vec<Clock>, sqlx::Error> {
    let t = now();
    let mut out = Vec::new();

    let alloc = days_of(pool, "allocation").await? * DAY;
    let rows: Vec<(String, String, i64)> =
        sqlx::query_as("SELECT id, title, received_at FROM prosecution_files WHERE kind = 'perusal' AND assigned_to IS NULL AND stage <> 'concluded' AND current_status IN ('under_review', 'resubmitted', 'returned_for_investigation')").fetch_all(pool).await?;
    for (id, title, at) in rows {
        out.push(Clock { file_id: id, file_title: title, kind: "allocation".into(), due_at: Some(at + alloc), overdue: at + alloc < t, count: None });
    }

    let reply = days_of(pool, "complaint_reply").await? * DAY;
    let rows: Vec<(String, String, i64)> = sqlx::query_as("SELECT id, title, received_at FROM prosecution_files WHERE kind = 'complaint' AND stage <> 'concluded'").fetch_all(pool).await?;
    for (id, title, at) in rows {
        out.push(Clock { file_id: id, file_title: title, kind: "complaint_reply".into(), due_at: Some(at + reply), overdue: at + reply < t, count: None });
    }

    let after = days_of(pool, "adjournments_before_review").await?;
    let rows: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT f.id, f.title, COUNT(*) FROM hearing_minutes m JOIN prosecution_files f ON f.id = m.prosecution_file_id
         WHERE m.adjournment_cause IS NOT NULL AND f.stage <> 'concluded' GROUP BY f.id HAVING COUNT(*) >= ?",
    )
    .bind(after)
    .fetch_all(pool)
    .await?;
    for (id, title, n) in rows {
        out.push(Clock { file_id: id, file_title: title, kind: "adjournment_review".into(), due_at: None, overdue: true, count: Some(n) });
    }
    out.sort_by_key(|c| (!c.overdue, c.due_at.unwrap_or(0)));
    Ok(out)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Witness {
    pub witness: String,
    #[sqlx(try_from = "i64")]
    pub served: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Minute {
    pub hearing_id: String,
    pub next_date: Option<i64>,
    pub adjournment_cause: Option<String>,
    pub exhibits: Vec<String>,
    pub note: Option<String>,
    pub sent_at: Option<i64>,
    pub updated_at: i64,
    pub witnesses: Vec<Witness>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WitnessInput {
    pub witness: String,
    pub served: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MinuteInput {
    pub next_date: Option<i64>,
    pub adjournment_cause: Option<String>,
    #[serde(default)]
    pub exhibits: Vec<String>,
    pub note: Option<String>,
    #[serde(default)]
    pub witnesses: Vec<WitnessInput>,
}

pub async fn minute(pool: &SqlitePool, hearing_id: &str) -> Result<Option<Minute>, sqlx::Error> {
    let row: Option<(Option<i64>, Option<String>, String, Option<String>, Option<i64>, i64)> =
        sqlx::query_as("SELECT next_date, adjournment_cause, exhibits_json, note, sent_at, updated_at FROM hearing_minutes WHERE hearing_id = ?").bind(hearing_id).fetch_optional(pool).await?;
    let Some((next_date, cause, exhibits, note, sent_at, updated_at)) = row else { return Ok(None) };
    let witnesses = sqlx::query_as("SELECT witness, served, reason FROM witness_service WHERE hearing_id = ? ORDER BY rowid").bind(hearing_id).fetch_all(pool).await?;
    Ok(Some(Minute { hearing_id: hearing_id.to_string(), next_date, adjournment_cause: cause, exhibits: serde_json::from_str(&exhibits).unwrap_or_default(), note, sent_at, updated_at, witnesses }))
}

/// Minutes for every hearing of a file, so the court record can show them at once.
pub async fn minutes_for_file(pool: &SqlitePool, file_id: &str) -> Result<Vec<Minute>, sqlx::Error> {
    let ids: Vec<String> = sqlx::query_scalar("SELECT hearing_id FROM hearing_minutes WHERE prosecution_file_id = ?").bind(file_id).fetch_all(pool).await?;
    let mut out = Vec::new();
    for id in ids {
        if let Some(m) = minute(pool, &id).await? {
            out.push(m);
        }
    }
    Ok(out)
}

pub async fn save_minute(pool: &SqlitePool, hearing_id: &str, input: MinuteInput, actor: Option<&str>) -> Result<Minute, DomainError> {
    let file_id: String = sqlx::query_scalar("SELECT prosecution_file_id FROM hearings WHERE id = ?").bind(hearing_id).fetch_one(pool).await?;
    if input.witnesses.iter().any(|w| w.witness.trim().is_empty()) {
        return invalid("Every witness needs a name.");
    }
    if input.witnesses.iter().any(|w| !w.served && clean(w.reason.clone()).is_none()) {
        return invalid("Say why a witness was not served.");
    }
    let exhibits: Vec<String> = input.exhibits.iter().map(|e| e.trim().to_string()).filter(|e| !e.is_empty()).collect();
    let t = now();
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "INSERT INTO hearing_minutes (id, prosecution_file_id, hearing_id, next_date, adjournment_cause, exhibits_json, note, created_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(hearing_id) DO UPDATE SET next_date = excluded.next_date, adjournment_cause = excluded.adjournment_cause, exhibits_json = excluded.exhibits_json,
           note = excluded.note, updated_at = excluded.updated_at",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&file_id)
    .bind(hearing_id)
    .bind(input.next_date)
    .bind(clean(input.adjournment_cause))
    .bind(serde_json::json!(exhibits).to_string())
    .bind(clean(input.note))
    .bind(actor)
    .bind(t)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM witness_service WHERE hearing_id = ?").bind(hearing_id).execute(&mut *tx).await?;
    for w in input.witnesses {
        sqlx::query("INSERT INTO witness_service (id, hearing_id, witness, served, reason, reported_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(hearing_id)
            .bind(w.witness.trim())
            .bind(i64::from(w.served))
            .bind(if w.served { None } else { clean(w.reason) })
            .bind(t)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(minute(pool, hearing_id).await?.expect("just saved"))
}
