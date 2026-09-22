//! Attachments: the documents kept with a file, a person, a statement or an
//! item of evidence. Every document is sealed in the vault (`vault.rs`) under a
//! name made of its id alone, and the database records only the path relative to
//! the vault, so the folder can be moved or restored on another machine and no
//! name in it says whose document it is.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::fmt;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::vault::{self, VaultError};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub file_name: String,
    /// Where the sealed file sits, relative to the vault. Never sent to the UI:
    /// the webview names an attachment by id and the backend resolves it.
    #[serde(skip_serializing)]
    pub stored_path: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub created_at: i64,
    #[serde(skip_serializing)]
    pub content_sha256: Option<String>,
}

#[derive(Debug)]
pub enum AttachmentError {
    Io(std::io::Error),
    Db(sqlx::Error),
    Vault(VaultError),
    Invalid(&'static str),
}

impl fmt::Display for AttachmentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AttachmentError::Io(e) => write!(f, "{e}"),
            AttachmentError::Db(e) => write!(f, "{e}"),
            AttachmentError::Vault(e) => write!(f, "{e}"),
            AttachmentError::Invalid(m) => write!(f, "{m}"),
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

impl From<VaultError> for AttachmentError {
    fn from(e: VaultError) -> Self {
        AttachmentError::Vault(e)
    }
}

/// The kinds of record a document can be attached to.
const ENTITY_TYPES: &[&str] = &["prosecution_file", "person", "statement", "evidence_item"];

/// Entity ids come from the UI, so they are only accepted once they are known
/// to be a plain identifier of a kind of record that takes documents.
fn validate_entity(entity_type: &str, entity_id: &str) -> Result<(), AttachmentError> {
    if !ENTITY_TYPES.contains(&entity_type) {
        return Err(AttachmentError::Invalid("Documents can only be attached to a file, a person, a statement or an evidence item."));
    }
    if entity_id.is_empty() || !entity_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(AttachmentError::Invalid("That is not a valid record id."));
    }
    Ok(())
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
    validate_entity(entity_type, entity_id)?;
    let id = Uuid::new_v4().to_string();
    let stored_path = vault::write(vault_root, &id, bytes)?;

    let extension = Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("");
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, content_sha256)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(file_name)
    .bind(&stored_path)
    .bind(guess_mime(extension))
    .bind(bytes.len() as i64)
    .bind(vault::sha256_hex(bytes))
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("attachment_added").subject("attachment", &id).detail(file_name.to_string())).await?;
    tx.commit().await?;

    get_attachment(pool, &id).await?.ok_or_else(|| AttachmentError::Db(sqlx::Error::RowNotFound))
}

/// Tauri path: the frontend has a real filesystem path from the native
/// file-picker dialog, so Rust reads it directly rather than shipping bytes
/// over IPC.
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
    sqlx::query_as::<_, Attachment>("SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, content_sha256 FROM attachments WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn list_attachments(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, content_sha256
         FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(pool)
    .await
}

/// The document's own bytes, opened from the vault and checked against the hash
/// taken when it was sealed.
pub async fn read_attachment(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<(Attachment, Vec<u8>)>, AttachmentError> {
    let Some(attachment) = get_attachment(pool, id).await? else { return Ok(None) };
    let bytes = vault::read(vault_root, &attachment.stored_path, &attachment.id)?;
    if attachment.content_sha256.as_deref().is_some_and(|expected| expected != vault::sha256_hex(&bytes)) {
        return Err(AttachmentError::Vault(VaultError::Unreadable));
    }
    Ok(Some((attachment, bytes)))
}

/// A `data:` URL for an attachment, the one way to show a file in the UI that
/// works the same in a release build as in dev.
pub async fn get_attachment_data_url(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<String>, AttachmentError> {
    let Some((attachment, bytes)) = read_attachment(pool, vault_root, id).await? else { return Ok(None) };
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{};base64,{}", attachment.mime_type, encoded)))
}

/// A readable copy in a private folder, for opening in the program the system
/// associates with it. It exists only while it is being viewed: the folder is
/// emptied when the app starts and when it exits.
pub async fn open_copy(pool: &SqlitePool, vault_root: &Path, opened_dir: &Path, id: &str) -> Result<Option<PathBuf>, AttachmentError> {
    let Some((attachment, bytes)) = read_attachment(pool, vault_root, id).await? else { return Ok(None) };
    std::fs::create_dir_all(opened_dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(opened_dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let safe: String = attachment.file_name.chars().map(|c| if matches!(c, '/' | '\\' | ':') || c.is_control() { '-' } else { c }).collect();
    let path = opened_dir.join(format!("{}-{}", &attachment.id[..8.min(attachment.id.len())], safe.trim_start_matches('.')));
    std::fs::write(&path, bytes)?;
    Ok(Some(path))
}

/// Removes every readable copy left in the private folder.
pub fn clear_opened(opened_dir: &Path) {
    if let Ok(files) = vault::walk(opened_dir) {
        for file in files {
            let _ = vault::shred_file(&file);
        }
    }
}

pub async fn delete_attachment(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<(), AttachmentError> {
    let attachment = get_attachment(pool, id).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM attachments WHERE id = ?").bind(id).execute(&mut *tx).await?;
    if let Some(a) = &attachment {
        audit::record(&mut tx, Entry::new("attachment_removed").subject("attachment", id).detail(a.file_name.clone())).await?;
    }
    tx.commit().await?;
    if let Some(a) = attachment {
        if vault::is_relative(&a.stored_path) {
            let _ = vault::shred_file(&vault_root.join(&a.stored_path));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    fn vault_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dpp-attach-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn only_known_records_take_documents_and_only_by_plain_id() {
        let pool = pool().await;
        let root = vault_dir();
        for (kind, id) in [("prosecution_file", "../evil"), ("person", "a/b"), ("person", ""), ("../etc", "abc"), ("secrets", "abc")] {
            let result = add_attachment_bytes(&pool, &root, kind, id, "x.pdf", b"x").await;
            assert!(matches!(result, Err(AttachmentError::Invalid(_))), "{kind}/{id} was accepted");
        }
        assert!(vault::walk(&root).unwrap().is_empty(), "nothing was written");
    }

    #[tokio::test]
    async fn a_document_is_sealed_on_disk_named_by_id_and_read_back_intact() {
        let pool = pool().await;
        let root = vault_dir();
        let plain = b"%PDF-1.4 statement of the complainant".to_vec();
        let a = add_attachment_bytes(&pool, &root, "prosecution_file", "file-1", "Statement of Grace Namutebi.pdf", &plain).await.unwrap();

        let files = vault::walk(&root).unwrap();
        assert_eq!(files.len(), 1);
        let name = files[0].file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(name, format!("{}.enc", a.id), "the file name is the id and nothing else");
        assert!(!std::fs::read(&files[0]).unwrap().windows(plain.len()).any(|w| w == &plain[..]), "the document is not readable on disk");

        let (_, back) = read_attachment(&pool, &root, &a.id).await.unwrap().unwrap();
        assert_eq!(back, plain);

        delete_attachment(&pool, &root, &a.id).await.unwrap();
        assert!(vault::walk(&root).unwrap().is_empty());
        let audit: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log WHERE action IN ('attachment_added', 'attachment_removed')").fetch_one(&pool).await.unwrap();
        assert_eq!(audit, 2);
    }

    #[tokio::test]
    async fn a_document_altered_in_the_vault_is_refused() {
        let pool = pool().await;
        let root = vault_dir();
        let a = add_attachment_bytes(&pool, &root, "person", "p-1", "id.png", b"png bytes").await.unwrap();
        let path = root.join(&a.stored_path);
        let mut sealed = std::fs::read(&path).unwrap();
        *sealed.last_mut().unwrap() ^= 1;
        std::fs::write(&path, sealed).unwrap();
        assert!(read_attachment(&pool, &root, &a.id).await.is_err());
    }
}
