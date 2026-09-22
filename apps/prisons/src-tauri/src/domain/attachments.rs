use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::fmt;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::vault;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub file_name: String,
    /// Relative to the vault, and never sent to a client: where a document sits
    /// on disk is not something a screen needs, and it named a real folder on the
    /// machine before the vault was sealed.
    #[serde(default, skip_serializing)]
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
    let file_name = Path::new(&file_name).file_name().and_then(|n| n.to_str()).unwrap_or("attachment").to_string();
    let extension: String = Path::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    let id = Uuid::new_v4().to_string();

    // The file is sealed and on disk before the row that points at it exists.
    let stored_path = vault::write(vault_root, &id, bytes).map_err(vault_error)?;

    let mime_type = guess_mime(&extension);
    let size_bytes = bytes.len() as i64;

    sqlx::query(
        "INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, content_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(&file_name)
    .bind(&stored_path)
    .bind(mime_type)
    .bind(size_bytes)
    .bind(vault::sha256_hex(bytes))
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

/// The document's plain bytes, opened from the sealed vault.
pub fn read_bytes(vault_root: &Path, attachment: &Attachment) -> Result<Vec<u8>, AttachmentError> {
    vault::read(vault_root, &attachment.stored_path, &attachment.id).map_err(vault_error)
}

fn vault_error(e: vault::VaultError) -> AttachmentError {
    match e {
        vault::VaultError::Io(e) => AttachmentError::Io(e),
        other => AttachmentError::Io(std::io::Error::other(other.to_string())),
    }
}

pub async fn get_attachment_data_url(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<String>, AttachmentError> {
    let Some(attachment) = get_attachment(pool, id).await? else {
        return Ok(None);
    };
    let bytes = read_bytes(vault_root, &attachment)?;
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
