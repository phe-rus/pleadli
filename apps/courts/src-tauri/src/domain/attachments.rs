//! Immutable original files, sealed locally and checked before every read.
//! Attaching a file does not admit it as an exhibit or certify its contents.
use base64::{engine::general_purpose::STANDARD, Engine};
use pleadli_node_core::{db::begin_write, vault};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use super::{audit::{self, Entry}, error::{invalid, DomainError}};

pub const MAX_SIZE: usize = 10 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String, pub case_id: String, pub name: String, pub media_type: String,
    pub size: i64, pub sha256: String, pub created_at: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddInput { pub name: String, pub content_base64: String }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent { pub attachment: Attachment, pub content_base64: String }
const COLUMNS: &str = "id, case_id, name, media_type, size, sha256, created_at";

fn validate(name: &str, bytes: &[u8]) -> Result<(&'static str, String), DomainError> {
    if bytes.is_empty() || bytes.len() > MAX_SIZE { return invalid("Choose a nonempty file no larger than 10 MB."); }
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 180 || name.chars().any(|c| c.is_control() || matches!(c, '/' | '\\')) || name.starts_with('.') {
        return invalid("Use a file name without folders, hidden prefixes or control characters.");
    }
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let media = match extension.as_str() {
        "pdf" if bytes.starts_with(b"%PDF-") => "application/pdf",
        "png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => "image/png",
        "jpg" | "jpeg" if bytes.starts_with(b"\xff\xd8\xff") => "image/jpeg",
        "txt" if std::str::from_utf8(bytes).is_ok() && !bytes.contains(&0) => "text/plain",
        _ => return invalid("Choose a PDF, PNG, JPEG or UTF-8 text file whose content matches its extension."),
    };
    Ok((media, name.to_string()))
}

pub async fn list(pool: &SqlitePool, case_id: &str) -> Result<Vec<Attachment>, DomainError> {
    let known: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cases WHERE id = ?)").bind(case_id).fetch_one(pool).await?;
    if !known { return Err(DomainError::NotFound("Case not found.".into())); }
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM attachments WHERE case_id = ? ORDER BY created_at DESC, id"))).bind(case_id).fetch_all(pool).await?)
}

pub async fn add(pool: &SqlitePool, root: &Path, case_id: &str, input: AddInput) -> Result<Attachment, DomainError> {
    if input.content_base64.len() > MAX_SIZE.div_ceil(3) * 4 { return invalid("Choose a file no larger than 10 MB."); }
    let bytes = STANDARD.decode(&input.content_base64).map_err(|_| DomainError::Invalid("The file could not be decoded.".into()))?;
    let (media, name) = validate(&input.name, &bytes)?;
    let mut tx = begin_write(pool).await?;
    let known: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM cases WHERE id = ?)").bind(case_id).fetch_one(&mut *tx).await?;
    if !known { return Err(DomainError::NotFound("Case not found.".into())); }
    let id = uuid::Uuid::new_v4().to_string();
    let sha256 = vault::sha256_hex(&bytes);
    let stored = vault::write(root, &id, &bytes).map_err(|_| DomainError::Invalid("The file could not be saved. Check available disk space.".into()))?;
    let save = async {
        sqlx::query("INSERT INTO attachments (id, case_id, name, media_type, size, sha256, stored_path) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(&id).bind(case_id).bind(&name).bind(media).bind(bytes.len() as i64).bind(&sha256).bind(&stored).execute(&mut *tx).await?;
        audit::record(&mut tx, Entry::new("attachment_added").subject("attachment", &id).scope(case_id).detail(&name)).await?;
        let result = sqlx::query_as::<_, Attachment>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM attachments WHERE id = ?"))).bind(&id).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok::<_, sqlx::Error>(result)
    }.await;
    if save.is_err() { let _ = vault::shred_file(&root.join(stored)); }
    Ok(save?)
}

pub async fn read(pool: &SqlitePool, root: &Path, case_id: &str, id: &str) -> Result<(Attachment, Vec<u8>), DomainError> {
    let attachment = sqlx::query_as::<_, Attachment>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM attachments WHERE id = ? AND case_id = ?"))).bind(id).bind(case_id).fetch_optional(pool).await?
        .ok_or_else(|| DomainError::NotFound("Attachment not found in this case.".into()))?;
    let stored: String = sqlx::query_scalar("SELECT stored_path FROM attachments WHERE id = ?").bind(id).fetch_one(pool).await?;
    let bytes = vault::read(root, &stored, id).map_err(|_| DomainError::Invalid("The original file is missing or unreadable. Restore it from a verified backup.".into()))?;
    if bytes.len() as i64 != attachment.size || vault::sha256_hex(&bytes) != attachment.sha256 {
        return invalid("The stored file does not match its original fingerprint. It cannot be opened or exported.");
    }
    Ok((attachment, bytes))
}

pub async fn content(pool: &SqlitePool, root: &Path, case_id: &str, id: &str) -> Result<FileContent, DomainError> {
    let (attachment, bytes) = read(pool, root, case_id, id).await?;
    Ok(FileContent { attachment, content_base64: STANDARD.encode(bytes) })
}
