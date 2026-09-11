use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::fmt;
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
}

impl fmt::Display for AttachmentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AttachmentError::Io(e) => write!(f, "{e}"),
            AttachmentError::Db(e) => write!(f, "{e}"),
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

fn sanitize_folder_name(input: &str) -> String {
    input
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':') { '-' } else { c })
        .collect()
}

/// A prisoner's documents (admission warrant, production orders, reception/
/// transfer letters) live under a folder named by their reference when
/// known, else their full name, else their id.
pub async fn resolve_vault_dir(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
) -> Result<PathBuf, AttachmentError> {
    let dir = match entity_type {
        "prisoner" => {
            let row: Option<(Option<String>, String, String)> =
                sqlx::query_as("SELECT reference, first_name, last_name FROM prisoners WHERE id = ?")
                    .bind(entity_id)
                    .fetch_optional(pool)
                    .await?;
            match row {
                Some((Some(reference), _, _)) if !reference.trim().is_empty() => {
                    vault_root.join("prisoners").join(sanitize_folder_name(&reference))
                }
                Some((_, first, last)) => vault_root.join("prisoners").join(sanitize_folder_name(&format!("{last}-{first}"))),
                None => vault_root.join("prisoners").join(entity_id),
            }
        }
        other => vault_root.join(other),
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
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<Attachment, AttachmentError> {
    let target_dir = resolve_vault_dir(pool, vault_root, entity_type, entity_id).await?;

    let extension = Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("");
    let id = Uuid::new_v4().to_string();
    let stored_file_name = if extension.is_empty() { id.clone() } else { format!("{id}.{extension}") };
    let stored_path = target_dir.join(&stored_file_name);
    std::fs::write(&stored_path, bytes)?;

    let mime_type = guess_mime(extension);
    let size_bytes = bytes.len() as i64;
    let stored_path_str = stored_path.to_string_lossy().to_string();

    sqlx::query(
        "INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(file_name)
    .bind(&stored_path_str)
    .bind(mime_type)
    .bind(size_bytes)
    .execute(pool)
    .await?;

    get_attachment(pool, &id).await?.ok_or_else(|| AttachmentError::Db(sqlx::Error::RowNotFound))
}

pub async fn add_attachment_from_path(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    source_path: &Path,
) -> Result<Attachment, AttachmentError> {
    let bytes = std::fs::read(source_path)?;
    let file_name = source_path.file_name().and_then(|n| n.to_str()).unwrap_or("attachment").to_string();
    add_attachment_bytes(pool, vault_root, entity_type, entity_id, &file_name, &bytes).await
}

pub async fn get_attachment(pool: &SqlitePool, id: &str) -> Result<Option<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at FROM attachments WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_attachments(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
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

pub async fn delete_attachment(pool: &SqlitePool, id: &str) -> Result<(), AttachmentError> {
    if let Some(attachment) = get_attachment(pool, id).await? {
        let _ = std::fs::remove_file(&attachment.stored_path);
    }
    sqlx::query("DELETE FROM attachments WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
