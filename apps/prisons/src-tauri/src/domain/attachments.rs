use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::fmt;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub file_name: String,
    pub stored_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub created_at: i64,
}

#[derive(Debug)]
pub enum AttachmentError {
    Io(std::io::Error),
    Db(sqlx::Error),
    /// The request itself is not acceptable (unknown entity type, empty or
    /// oversized file). Never a server fault.
    Rejected(String),
}

impl fmt::Display for AttachmentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AttachmentError::Io(e) => write!(f, "{e}"),
            AttachmentError::Db(e) => write!(f, "{e}"),
            AttachmentError::Rejected(reason) => write!(f, "{reason}"),
        }
    }
}

impl From<std::io::Error> for AttachmentError {
    fn from(e: std::io::Error) -> Self {
        AttachmentError::Io(e)
    }
}

impl From<sqlx::Error> for AttachmentError {
    fn from(e: sqlx::Error) -> Self {
        AttachmentError::Db(e)
    }
}

/// Folder and file names come from user input, so only a plain, safe
/// character set survives, and a name can never begin with a dot (which
/// would make `..` a path traversal).
fn sanitize_folder_name(input: &str) -> String {
    let cleaned: String = input
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim().trim_start_matches('.').to_string();
    if trimmed.is_empty() { "unnamed".to_string() } else { trimmed }
}

/// The entity types a document may belong to. Anything else is refused,
/// which also keeps a caller-supplied value out of the vault path.
pub const ENTITY_TYPES: &[&str] = &[
    "prisoner",
    "release",
    "transfer",
    "court_production",
    "health_event",
    "visit",
    "property_record",
    "programme_participation",
    "request",
    "instrument",
];

pub const MAX_ATTACHMENT_BYTES: usize = 25 * 1024 * 1024;

/// A prisoner's documents (admission warrant, production orders, reception/
/// transfer letters) live under a folder named by their reference when
/// known, else their full name, else their id.
pub async fn resolve_vault_dir(
    conn: &mut SqliteConnection,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
) -> Result<PathBuf, AttachmentError> {
    let dir = match entity_type {
        "prisoner" => {
            let row: Option<(Option<String>, String, String)> =
                sqlx::query_as("SELECT reference, first_name, last_name FROM prisoners WHERE id = ?")
                    .bind(entity_id)
                    .fetch_optional(&mut *conn)
                    .await?;
            match row {
                Some((Some(reference), _, _)) if !reference.trim().is_empty() => {
                    vault_root.join("prisoners").join(sanitize_folder_name(&reference))
                }
                Some((_, first, last)) => vault_root.join("prisoners").join(sanitize_folder_name(&format!("{last}-{first}"))),
                None => vault_root.join("prisoners").join(sanitize_folder_name(entity_id)),
            }
        }
        other => vault_root.join(sanitize_folder_name(other)),
    };

    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn guess_mime(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt" => "text/plain",
        _ => "application/octet-stream",
    }
}

pub async fn add_attachment_bytes(
    conn: &mut SqliteConnection,
    actor: &Actor,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<Attachment, AttachmentError> {
    if !ENTITY_TYPES.contains(&entity_type) {
        return Err(AttachmentError::Rejected("Documents cannot be attached to that kind of record.".to_string()));
    }
    if bytes.is_empty() {
        return Err(AttachmentError::Rejected("That file is empty.".to_string()));
    }
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(AttachmentError::Rejected("That file is larger than 25 MB.".to_string()));
    }

    // Only the final path component is ever used as the display name.
    let file_name = Path::new(file_name).file_name().and_then(|n| n.to_str()).unwrap_or("attachment").to_string();
    let target_dir = resolve_vault_dir(conn, vault_root, entity_type, entity_id).await?;

    let extension: String = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let id = Uuid::new_v4().to_string();
    let stored_file_name = if extension.is_empty() { id.clone() } else { format!("{id}.{extension}") };
    let stored_path = target_dir.join(&stored_file_name);
    std::fs::write(&stored_path, bytes)?;

    let mime_type = guess_mime(&extension);
    let size_bytes = bytes.len() as i64;
    let stored_path_str = stored_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(&file_name)
    .bind(&stored_path_str)
    .bind(mime_type)
    .bind(size_bytes)
    .execute(&mut *conn)
    .await?;

    let attachment = get_attachment_conn(conn, &id).await?.ok_or_else(|| AttachmentError::Db(sqlx::Error::RowNotFound))?;
    audit::record(conn, actor, AuditEntry::new("document.add", "attachment", Some(&id)).after(&attachment)).await?;
    Ok(attachment)
}

pub async fn get_attachment(pool: &SqlitePool, id: &str) -> Result<Option<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE id = ? AND voided_at IS NULL",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

async fn get_attachment_conn(conn: &mut SqliteConnection, id: &str) -> Result<Option<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE id = ? AND voided_at IS NULL",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
}

pub async fn list_attachments(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE entity_type = ? AND entity_id = ? AND voided_at IS NULL ORDER BY created_at DESC",
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(pool)
    .await
}

pub async fn get_attachment_data_url(pool: &SqlitePool, id: &str) -> Result<Option<String>, AttachmentError> {
    let Some(attachment) = get_attachment(pool, id).await? else {
        return Ok(None);
    };
    let bytes = std::fs::read(&attachment.stored_path)?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{};base64,{}", attachment.mime_type, encoded)))
}

/// Documents are never deleted. A voided document keeps its file and its
/// row, records who voided it and why, and disappears from listings.
pub async fn void_attachment(
    conn: &mut SqliteConnection,
    actor: &Actor,
    id: &str,
    reason: &str,
) -> Result<(), AttachmentError> {
    if reason.trim().is_empty() {
        return Err(AttachmentError::Rejected("A reason is required to void a document.".to_string()));
    }
    let before = get_attachment_conn(conn, id).await?.ok_or_else(|| AttachmentError::Db(sqlx::Error::RowNotFound))?;
    sqlx::query("UPDATE attachments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?")
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&actor.officer_id)
        .bind(reason)
        .bind(id)
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("document.void", "attachment", Some(id)).before(&before).reason(reason)).await?;
    Ok(())
}
