//! The custody record of a file: when the accused was arrested, brought
//! before a court or magistrate, held on which warrant or order, bailed or
//! released. The legal clocks are counted from these on the screen, from the
//! country pack's rules; this module only keeps the dated facts.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

pub const KINDS: &[&str] = &["arrest", "court_production", "remand", "remand_both", "remand_high_court", "map", "odp", "odp_extension", "bail", "release", "trial_start"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustodyEvent {
    pub id: String,
    pub prosecution_file_id: String,
    pub kind: String,
    pub at: i64,
    pub person_name: Option<String>,
    pub note: Option<String>,
    pub source: String,
    pub created_by: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustodyEventInput {
    pub prosecution_file_id: String,
    pub kind: String,
    pub at: i64,
    pub person_name: Option<String>,
    pub note: Option<String>,
}

pub async fn list(pool: &SqlitePool, file_id: &str) -> Result<Vec<CustodyEvent>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM custody_events WHERE prosecution_file_id = ? ORDER BY at").bind(file_id).fetch_all(pool).await
}

/// Every event on files still open, for the clocks on Today and the board.
pub async fn open_files(pool: &SqlitePool) -> Result<Vec<CustodyEvent>, sqlx::Error> {
    sqlx::query_as("SELECT e.* FROM custody_events e JOIN prosecution_files f ON f.id = e.prosecution_file_id WHERE f.stage != 'concluded' ORDER BY e.at")
        .fetch_all(pool)
        .await
}

pub async fn create(pool: &SqlitePool, input: CustodyEventInput, source: &str, actor: Option<&str>) -> Result<CustodyEvent, DomainError> {
    if !KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a custody event.");
    }
    super::error::check_timestamp(input.at, "The date")?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO custody_events (id, prosecution_file_id, kind, at, person_name, note, source, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(&input.kind)
        .bind(input.at)
        .bind(clean(input.person_name))
        .bind(clean(input.note))
        .bind(source)
        .bind(actor)
        .bind(now)
        .execute(pool)
        .await?;
    Ok(sqlx::query_as("SELECT * FROM custody_events WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM custody_events WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
