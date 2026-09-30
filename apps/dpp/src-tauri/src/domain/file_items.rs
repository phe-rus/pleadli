//! The file's index: one row per document in the file, as it would sit in the
//! paper folder. A row either stands on typed text (a statement recorded
//! straight into the app, no paper) or points at pages of a stored scan.
//!
//! `kind` is the same in every country; which section of the file a kind sits
//! in is the country pack's (`@pleadli/setup` jurisdictions). Rows Assist
//! placed stay marked until a person confirms them.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{clean, invalid, DomainError};

pub const KINDS: &[&str] = &[
    "complaint",
    "initial_report",
    "witness_statement",
    "accused_statement",
    "exhibit",
    "expert_report",
    "medical_report",
    "detention",
    "investigation_diary",
    "charge_sheet",
    "lists",
    "io_report",
    "minute",
    "correspondence",
    "decision",
    "court_record",
    "other",
];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub id: String,
    pub prosecution_file_id: String,
    pub kind: String,
    pub title: String,
    pub document_date: Option<i64>,
    pub attachment_id: Option<String>,
    pub page_from: Option<i64>,
    pub page_to: Option<i64>,
    pub summary: Option<String>,
    pub body: Option<String>,
    /// Names mentioned, comma separated, as read from the document.
    pub people: Option<String>,
    pub position: f64,
    pub source: String,
    pub confirmed_by: Option<String>,
    pub confirmed_at: Option<i64>,
    pub created_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItemInput {
    pub prosecution_file_id: String,
    pub kind: String,
    pub title: String,
    pub document_date: Option<i64>,
    pub attachment_id: Option<String>,
    pub page_from: Option<i64>,
    pub page_to: Option<i64>,
    pub summary: Option<String>,
    pub body: Option<String>,
    pub people: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItemUpdate {
    pub kind: Option<String>,
    pub title: Option<String>,
    pub document_date: Option<Option<i64>>,
    pub page_from: Option<Option<i64>>,
    pub page_to: Option<Option<i64>>,
    pub summary: Option<Option<String>>,
    pub body: Option<Option<String>>,
    pub people: Option<Option<String>>,
    pub position: Option<f64>,
    /// A person accepts where Assist put it.
    pub confirm: Option<bool>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn check(kind: &str, title: &str, from: Option<i64>, to: Option<i64>) -> Result<(), DomainError> {
    if !KINDS.contains(&kind) {
        return invalid("That is not a kind of document.");
    }
    if title.trim().is_empty() {
        return invalid("Give the document a title.");
    }
    if let (Some(a), Some(b)) = (from, to) {
        if a < 1 || b < a {
            return invalid("The pages do not make sense.");
        }
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool, file_id: &str) -> Result<Vec<FileItem>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM file_items WHERE prosecution_file_id = ? ORDER BY position, created_at").bind(file_id).fetch_all(pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<FileItem, DomainError> {
    Ok(sqlx::query_as("SELECT * FROM file_items WHERE id = ?").bind(id).fetch_one(pool).await?)
}

pub async fn create(pool: &SqlitePool, input: FileItemInput, source: &str, actor: Option<&str>) -> Result<FileItem, DomainError> {
    check(&input.kind, &input.title, input.page_from, input.page_to)?;
    let position: f64 = sqlx::query_scalar("SELECT CAST(COALESCE(MAX(position), 0) + 1 AS REAL) FROM file_items WHERE prosecution_file_id = ?")
        .bind(&input.prosecution_file_id)
        .fetch_one(pool)
        .await?;
    let id = Uuid::new_v4().to_string();
    let t = now();
    // What a person enters is confirmed by entering it.
    let confirmed = source == "person";
    sqlx::query(
        "INSERT INTO file_items (id, prosecution_file_id, kind, title, document_date, attachment_id, page_from, page_to, summary, body, people,
                                 position, source, confirmed_by, confirmed_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prosecution_file_id)
    .bind(&input.kind)
    .bind(input.title.trim())
    .bind(input.document_date)
    .bind(clean(input.attachment_id))
    .bind(input.page_from)
    .bind(input.page_to)
    .bind(clean(input.summary))
    .bind(clean(input.body))
    .bind(clean(input.people))
    .bind(position)
    .bind(source)
    .bind(if confirmed { actor } else { None })
    .bind(if confirmed { Some(t) } else { None })
    .bind(actor)
    .bind(t)
    .bind(t)
    .execute(pool)
    .await?;
    get(pool, &id).await
}

pub async fn update(pool: &SqlitePool, id: &str, input: FileItemUpdate, actor: Option<&str>) -> Result<FileItem, DomainError> {
    let c = get(pool, id).await?;
    let kind = input.kind.unwrap_or(c.kind);
    let title = input.title.unwrap_or(c.title);
    let page_from = input.page_from.unwrap_or(c.page_from);
    let page_to = input.page_to.unwrap_or(c.page_to);
    check(&kind, &title, page_from, page_to)?;
    // Moving or retitling an Assist row is also accepting it.
    let touched = input.confirm == Some(true);
    let (confirmed_by, confirmed_at) = if touched && c.confirmed_at.is_none() { (actor.map(str::to_string), Some(now())) } else { (c.confirmed_by, c.confirmed_at) };
    sqlx::query(
        "UPDATE file_items SET kind = ?, title = ?, document_date = ?, page_from = ?, page_to = ?, summary = ?, body = ?, people = ?, position = ?,
                confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&kind)
    .bind(title.trim())
    .bind(input.document_date.unwrap_or(c.document_date))
    .bind(page_from)
    .bind(page_to)
    .bind(input.summary.map(clean).unwrap_or(c.summary))
    .bind(input.body.map(clean).unwrap_or(c.body))
    .bind(input.people.map(clean).unwrap_or(c.people))
    .bind(input.position.unwrap_or(c.position))
    .bind(confirmed_by)
    .bind(confirmed_at)
    .bind(now())
    .bind(id)
    .execute(pool)
    .await?;
    get(pool, id).await
}

/// Accept every row Assist placed in a file at once.
pub async fn confirm_all(pool: &SqlitePool, file_id: &str, actor: Option<&str>) -> Result<u64, DomainError> {
    Ok(sqlx::query("UPDATE file_items SET confirmed_by = ?, confirmed_at = ?, updated_at = ? WHERE prosecution_file_id = ? AND confirmed_at IS NULL")
        .bind(actor)
        .bind(now())
        .bind(now())
        .bind(file_id)
        .execute(pool)
        .await?
        .rows_affected())
}

pub async fn delete(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM file_items WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
