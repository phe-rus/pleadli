//! Notes on a matter and time spent on it. Neither is written to the audit trail
//! one by one: they are the advocate's own working record, kept as they write
//! them, and the audit trail is for what changes the standing of a matter.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{check_timestamp, invalid, DomainError};
use super::matters::require_open;
use pleadli_node_core::db::begin_write;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MatterNote {
    pub id: String,
    pub matter_id: String,
    pub at: i64,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub body: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: String,
    pub matter_id: String,
    pub worked_on: i64,
    pub minutes: i64,
    pub description: String,
    pub created_at: i64,
    pub matter_title: Option<String>,
    pub court_number: Option<String>,
    pub engagement: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeInput {
    pub worked_on: i64,
    pub minutes: i64,
    pub description: String,
}

pub async fn list_notes(pool: &SqlitePool, matter_id: &str) -> Result<Vec<MatterNote>, sqlx::Error> {
    sqlx::query_as::<_, MatterNote>("SELECT id, matter_id, at, body, created_at, updated_at FROM matter_notes WHERE matter_id = ? ORDER BY at DESC, created_at DESC").bind(matter_id).fetch_all(pool).await
}

pub async fn add_note(pool: &SqlitePool, matter_id: &str, input: NoteInput) -> Result<MatterNote, DomainError> {
    let body = input.body.trim().to_string();
    if body.is_empty() {
        return invalid("A note needs some text.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    sqlx::query("INSERT INTO matter_notes (id, matter_id, at, body) VALUES (?, ?, ?, ?)").bind(&id).bind(matter_id).bind(chrono::Utc::now().timestamp_millis()).bind(&body).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, MatterNote>("SELECT id, matter_id, at, body, created_at, updated_at FROM matter_notes WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

pub async fn update_note(pool: &SqlitePool, id: &str, input: NoteInput) -> Result<MatterNote, DomainError> {
    let body = input.body.trim().to_string();
    if body.is_empty() {
        return invalid("A note needs some text.");
    }
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query("UPDATE matter_notes SET body = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(&body).bind(id).execute(&mut *tx).await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Note not found.".to_string()));
    }
    tx.commit().await?;
    Ok(sqlx::query_as::<_, MatterNote>("SELECT id, matter_id, at, body, created_at, updated_at FROM matter_notes WHERE id = ?").bind(id).fetch_one(pool).await?)
}

pub async fn remove_note(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query("DELETE FROM matter_notes WHERE id = ?").bind(id).execute(&mut *tx).await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Note not found.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}

const TIME_SELECT: &str = "SELECT e.id, e.matter_id, e.worked_on, e.minutes, e.description, e.created_at, m.title AS matter_title, m.court_number, m.engagement
    FROM time_entries e JOIN matters m ON m.id = e.matter_id";

pub async fn list_time(pool: &SqlitePool, matter_id: &str, from: i64, to: i64) -> Result<Vec<TimeEntry>, sqlx::Error> {
    sqlx::query_as::<_, TimeEntry>(sqlx::AssertSqlSafe(format!("{TIME_SELECT} WHERE (?1 = '' OR e.matter_id = ?1) AND e.worked_on >= ?2 AND e.worked_on < ?3 ORDER BY e.worked_on DESC, e.created_at DESC")))
        .bind(matter_id)
        .bind(from)
        .bind(to)
        .fetch_all(pool)
        .await
}

pub async fn add_time(pool: &SqlitePool, matter_id: &str, input: TimeInput) -> Result<TimeEntry, DomainError> {
    check_timestamp(input.worked_on, "The day worked")?;
    if input.minutes <= 0 || input.minutes > 1440 {
        return invalid("Time is between one minute and a full day.");
    }
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return invalid("Say what the time was spent on.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    sqlx::query("INSERT INTO time_entries (id, matter_id, worked_on, minutes, description) VALUES (?, ?, ?, ?, ?)").bind(&id).bind(matter_id).bind(input.worked_on).bind(input.minutes).bind(&description).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, TimeEntry>(sqlx::AssertSqlSafe(format!("{TIME_SELECT} WHERE e.id = ?"))).bind(&id).fetch_one(pool).await?)
}

pub async fn remove_time(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query("DELETE FROM time_entries WHERE id = ?").bind(id).execute(&mut *tx).await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Time entry not found.".to_string()));
    }
    tx.commit().await?;
    Ok(())
}
