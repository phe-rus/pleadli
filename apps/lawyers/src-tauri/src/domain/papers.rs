//! Papers: what the client brings, or the other side and the court send,
//! photographed or scanned into a matter (docs/lawyers/REVIEW-2026-09-30.md,
//! L3). Each is one file sealed in the vault (node-core `vault`) under its id.
//! Assist can read them (`assist::read_papers`); what it writes stays marked
//! as unchecked until a person edits the paper.

use base64::Engine as _;
use pleadli_node_core::db::begin_write;
use pleadli_node_core::vault;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::matters::require_open;

pub const KINDS: [&str; 8] = ["pleading", "court_document", "letter", "contract", "receipt", "identity", "evidence", "other"];
/// A phone photo or a scanned bundle; larger belongs in several papers.
pub const MAX_BYTES: usize = 20 * 1024 * 1024;
/// What Assist can read: PDFs and photos. Word files are printed to PDF first.
const TYPES: [(&str, &str); 5] = [("pdf", "application/pdf"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("png", "image/png"), ("webp", "image/webp")];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Paper {
    pub id: String,
    pub matter_id: String,
    pub title: String,
    pub kind: String,
    pub dated: Option<String>,
    pub from_whom: Option<String>,
    pub summary: Option<String>,
    /// The text read from it. Not listed: fetched with the paper.
    #[serde(skip_serializing)]
    pub transcript: Option<String>,
    pub has_transcript: bool,
    pub assisted: bool,
    pub file_name: String,
    #[serde(skip_serializing)]
    pub stored_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub added_by: Option<String>,
    pub created_at: i64,
}

const COLUMNS: &str = "id, matter_id, title, kind, dated, from_whom, summary, transcript, transcript IS NOT NULL AND transcript <> '' AS has_transcript, assisted, file_name, stored_path, mime_type, size_bytes, added_by, created_at";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddInput {
    pub file_name: String,
    /// The file, base64 (the API carries JSON in the desktop app too).
    pub data: String,
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditInput {
    pub title: String,
    pub kind: String,
    pub dated: Option<String>,
    pub from_whom: Option<String>,
    pub summary: Option<String>,
}

/// What Assist found in a paper, written onto it (`assisted` = 1).
pub struct Reading {
    pub title: String,
    pub kind: String,
    pub dated: Option<String>,
    pub from_whom: Option<String>,
    pub summary: Option<String>,
    pub transcript: Option<String>,
}

fn mime_for(file_name: &str) -> Option<&'static str> {
    let ext = Path::new(file_name).extension()?.to_str()?.to_ascii_lowercase();
    TYPES.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

/// A day as YYYY-MM-DD, or nothing. Anything else is refused, not guessed.
pub fn check_day(day: Option<String>) -> Result<Option<String>, DomainError> {
    match clean(day) {
        None => Ok(None),
        Some(d) if chrono::NaiveDate::parse_from_str(&d, "%Y-%m-%d").is_ok() => Ok(Some(d)),
        Some(_) => invalid("Give the date as a day, for example 2026-09-20."),
    }
}

fn title_from(file_name: &str) -> String {
    let stem = Path::new(file_name).file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let t = stem.replace(['_', '-'], " ").trim().to_string();
    if t.is_empty() { "Paper".to_string() } else { t }
}

pub async fn add(pool: &SqlitePool, vault_root: &Path, matter_id: &str, input: AddInput, by: Option<String>) -> Result<Paper, DomainError> {
    let file_name = input.file_name.trim().to_string();
    let Some(mime) = mime_for(&file_name) else {
        return invalid("Add a PDF or a photo (JPG, PNG or WebP). Print a Word file to PDF first.");
    };
    let bytes = base64::engine::general_purpose::STANDARD.decode(input.data.trim()).map_err(|_| DomainError::Invalid("The file did not arrive whole. Try again.".into()))?;
    if bytes.is_empty() {
        return invalid("That file is empty.");
    }
    if bytes.len() > MAX_BYTES {
        return invalid("That file is over 20 MB. Split it into several papers.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    let stored = vault::write(vault_root, &id, &bytes).map_err(|e| DomainError::Invalid(format!("The paper could not be sealed: {e}")))?;
    let title = clean(input.title).unwrap_or_else(|| title_from(&file_name));
    let inserted = sqlx::query(
        "INSERT INTO papers (id, matter_id, title, file_name, stored_path, mime_type, size_bytes, content_sha256, added_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(matter_id)
    .bind(&title)
    .bind(&file_name)
    .bind(&stored)
    .bind(mime)
    .bind(bytes.len() as i64)
    .bind(vault::sha256_hex(&bytes))
    .bind(&by)
    .execute(&mut *tx)
    .await;
    if let Err(e) = inserted {
        let _ = vault::shred_file(&vault_root.join(&stored));
        return Err(e.into());
    }
    audit::record(&mut tx, Entry::new("paper_added").subject("paper", &id).scope(matter_id)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Paper>, sqlx::Error> {
    sqlx::query_as::<_, Paper>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM papers WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

pub async fn list(pool: &SqlitePool, matter_id: &str) -> Result<Vec<Paper>, sqlx::Error> {
    sqlx::query_as::<_, Paper>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM papers WHERE matter_id = ? ORDER BY COALESCE(dated, '9999'), created_at"))).bind(matter_id).fetch_all(pool).await
}

/// The paper and its file, opened from the vault.
pub async fn open(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<(Paper, Vec<u8>), DomainError> {
    let paper = get(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such paper.".into()))?;
    let bytes = vault::read(vault_root, &paper.stored_path, &paper.id).map_err(|e| DomainError::Invalid(format!("The paper could not be opened: {e}")))?;
    Ok((paper, bytes))
}

/// A person's correction. It also marks the paper as checked.
pub async fn edit(pool: &SqlitePool, id: &str, input: EditInput) -> Result<Paper, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A paper needs a title.");
    }
    if !KINDS.contains(&input.kind.as_str()) {
        return invalid("Unknown kind of paper.");
    }
    let dated = check_day(input.dated)?;
    let paper = get(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such paper.".into()))?;
    let mut tx = begin_write(pool).await?;
    sqlx::query(
        "UPDATE papers SET title = ?, kind = ?, dated = ?, from_whom = ?, summary = ?, assisted = 0, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(&title)
    .bind(&input.kind)
    .bind(&dated)
    .bind(clean(input.from_whom))
    .bind(clean(input.summary))
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("paper_changed").subject("paper", id).scope(&paper.matter_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// What Assist read, written onto the paper and marked as unchecked.
pub async fn record_reading(pool: &SqlitePool, id: &str, r: Reading) -> Result<(), DomainError> {
    let kind = if KINDS.contains(&r.kind.as_str()) { r.kind } else { "other".to_string() };
    let dated = check_day(r.dated).unwrap_or(None);
    let title = if r.title.trim().is_empty() { None } else { Some(r.title.trim().to_string()) };
    sqlx::query(
        "UPDATE papers SET title = COALESCE(?, title), kind = ?, dated = ?, from_whom = ?, summary = ?, transcript = ?, assisted = 1,
           updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(title)
    .bind(kind)
    .bind(dated)
    .bind(clean(r.from_whom))
    .bind(clean(r.summary))
    .bind(clean(r.transcript))
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

/// Removes the paper and shreds its sealed file.
pub async fn remove(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<(), DomainError> {
    let paper = get(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such paper.".into()))?;
    let mut tx = begin_write(pool).await?;
    sqlx::query("DELETE FROM papers WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("paper_removed").subject("paper", id).scope(&paper.matter_id).detail(paper.title.clone())).await?;
    tx.commit().await?;
    let _ = vault::shred_file(&vault_root.join(&paper.stored_path));
    Ok(())
}
