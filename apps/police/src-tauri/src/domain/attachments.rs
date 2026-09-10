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

/// Case references are real UPF-style strings like `CRB/123/2026` (see
/// docs/police/research/custody-and-bonds.md) — used directly as a path
/// component they'd create nested folders no one asked for, so every
/// path-unsafe character is folded to `-` before it becomes a folder name.
fn sanitize_folder_name(input: &str) -> String {
    input
        .chars()
        .map(|c| if matches!(c, '/' | '\\' | ':') { '-' } else { c })
        .collect()
}

/// Where a given attachment physically belongs in the Police Vault —
/// derived from the record's own relationships, not chosen by whoever is
/// attaching the file. Case-linked material (a statement, a bond, a
/// custody record that names a case, or the case record itself) files
/// under that case's own folder, since that's how an officer actually
/// looks for "everything about this case." Everything else keeps its own
/// top-level bucket — Person deliberately included, since PRODUCT.md is
/// explicit that a case is not the organizing structure everything else
/// hangs off, even when the person happens to be involved in one.
pub async fn resolve_vault_dir(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
) -> Result<PathBuf, AttachmentError> {
    async fn case_folder(pool: &SqlitePool, vault_root: &Path, case_id: &str, subfolder: &str) -> Result<PathBuf, AttachmentError> {
        let reference: Option<String> = sqlx::query_scalar("SELECT reference FROM cases WHERE id = ?")
            .bind(case_id)
            .fetch_optional(pool)
            .await?;
        Ok(match reference {
            Some(reference) => vault_root.join("cases").join(sanitize_folder_name(&reference)).join(subfolder),
            None => vault_root.join(subfolder),
        })
    }

    let dir = match entity_type {
        "person" => vault_root.join("people").join(entity_id),
        "case" => {
            let reference: Option<String> = sqlx::query_scalar("SELECT reference FROM cases WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            match reference {
                Some(reference) => vault_root.join("cases").join(sanitize_folder_name(&reference)).join("documents"),
                None => vault_root.join("cases").join(entity_id),
            }
        }
        "statement" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM statements WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
                .flatten();
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "statements").await?,
                None => vault_root.join("statements"),
            }
        }
        "custody_record" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM custody_records WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
                .flatten();
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "custody").await?,
                None => vault_root.join("custody"),
            }
        }
        "bond" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM bonds WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
                .flatten();
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "bonds").await?,
                None => vault_root.join("bonds"),
            }
        }
        "referral" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM referrals WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "referrals").await?,
                None => vault_root.join("referrals"),
            }
        }
        "charge_sheet" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM charge_sheets WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "forms").await?,
                None => vault_root.join("forms"),
            }
        }
        "exhibit" => {
            let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM exhibits WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?
                .flatten();
            match case_id {
                Some(case_id) => case_folder(pool, vault_root, &case_id, "evidence").await?,
                None => vault_root.join("evidence"),
            }
        }
        "incident" => vault_root.join("incidents"),
        "station_diary_entry" => vault_root.join("station-diary"),
        "duty_assignment" => vault_root.join("duty"),
        "station_asset" => {
            let category: Option<String> = sqlx::query_scalar("SELECT category FROM station_assets WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            vault_root.join("stores").join(category.unwrap_or_else(|| "other".to_string()))
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

/// Copies bytes into the app's own attachments folder under a fresh UUID
/// filename (so two attachments can never collide, even with the same
/// original name) and records the metadata row.
pub async fn add_attachment_bytes(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<Attachment, AttachmentError> {
    let target_dir = resolve_vault_dir(pool, vault_root, entity_type, entity_id).await?;

    let extension = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let id = Uuid::new_v4().to_string();
    let stored_file_name = if extension.is_empty() {
        id.clone()
    } else {
        format!("{id}.{extension}")
    };
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

    get_attachment(pool, &id)
        .await?
        .ok_or_else(|| AttachmentError::Db(sqlx::Error::RowNotFound))
}

/// Tauri path: the frontend already has a real filesystem path (from the
/// native file-picker dialog), so Rust reads it directly rather than
/// shipping bytes over IPC.
pub async fn add_attachment_from_path(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    source_path: &Path,
) -> Result<Attachment, AttachmentError> {
    let bytes = std::fs::read(source_path)?;
    let file_name = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .to_string();
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

pub async fn list_attachments(
    pool: &SqlitePool,
    entity_type: &str,
    entity_id: &str,
) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
    )
    .bind(entity_type)
    .bind(entity_id)
    .fetch_all(pool)
    .await
}

/// Where a file's owning record actually lives — shared by the global
/// search aggregator and the Files browser, so the two never resolve a
/// route differently for the same attachment.
pub async fn resolve_entity_route(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<String, sqlx::Error> {
    let route = match entity_type {
        "person" => format!("/search/people/{entity_id}"),
        "case" => format!("/investigations/{entity_id}"),
        "incident" => format!("/incidents?open={entity_id}"),
        "statement" => format!("/statements?open={entity_id}"),
        "custody_record" => format!("/search/custody?open={entity_id}"),
        "bond" => format!("/search/bonds?open={entity_id}"),
        "station_diary_entry" => format!("/sd-log?open={entity_id}"),
        "duty_assignment" => format!("/roster?open={entity_id}"),
        "exhibit" => format!("/evidence?open={entity_id}"),
        "charge_sheet" => format!("/legal-forms?open={entity_id}"),
        "referral" => format!("/referrals?open={entity_id}"),
        "station_asset" => {
            let category: Option<String> = sqlx::query_scalar("SELECT category FROM station_assets WHERE id = ?")
                .bind(entity_id)
                .fetch_optional(pool)
                .await?;
            let base = if category.as_deref() == Some("armory") { "/stores/armory" } else { "/stores/impounded" };
            format!("{base}?open={entity_id}")
        }
        other => format!("/{other}?open={entity_id}"),
    };
    Ok(route)
}

/// All attachments across the Vault, most recent first — the Files
/// browser's own listing, distinct from `list_attachments` (one entity)
/// and `search_attachments` (global search's filename match).
pub async fn list_all(pool: &SqlitePool, query: &str) -> Result<Vec<Attachment>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Attachment>(
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
             FROM attachments ORDER BY created_at DESC LIMIT 200",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE file_name LIKE ? ORDER BY created_at DESC LIMIT 200",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Filename/metadata search only, for the global search aggregator
/// (domain/search.rs) — deliberately not document-content search, which
/// needs OCR/text-extraction infrastructure this app doesn't have yet.
pub async fn search_attachments(pool: &SqlitePool, query: &str) -> Result<Vec<Attachment>, sqlx::Error> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
         FROM attachments WHERE file_name LIKE ? ORDER BY created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub name: String,
    /// Posix-style, relative to the vault root — what the frontend
    /// navigates with; never an absolute filesystem path.
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: Option<i64>,
    pub modified_at: Option<i64>,
    /// Set when a database attachment row matches this file on disk —
    /// lets the file manager link back to the record it belongs to.
    /// Files that exist on disk without a matching row (a generated
    /// `.md` companion, or something dropped in by hand) still list,
    /// just without that link.
    pub attachment_id: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub mime_type: Option<String>,
    /// The real OS path — needed to open the file or reveal it in the
    /// system file manager, the same way `Attachment::stored_path`
    /// already works for attachments opened from a record's own page.
    pub absolute_path: String,
}

/// Rejects `.`, `..`, and empty segments outright rather than resolving
/// and canonicalizing — a target that doesn't exist yet (a folder about
/// to be created) can't be canonicalized anyway, and this is cheaper and
/// just as safe: no segment can ever walk the path outside vault_root.
fn resolve_within_vault(vault_root: &Path, relative_path: &str) -> Result<PathBuf, AttachmentError> {
    let trimmed = relative_path.trim_matches('/');
    let mut resolved = vault_root.to_path_buf();
    if trimmed.is_empty() {
        return Ok(resolved);
    }
    for segment in trimmed.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(AttachmentError::Io(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "invalid path segment",
            )));
        }
        resolved.push(segment);
    }
    Ok(resolved)
}

/// The Files browser's real listing: the actual Vault folder on disk,
/// not the `attachments` table — folders that exist only because a
/// record was saved (and so far hold nothing) show up here just as
/// they would in the OS's own file manager. Each file is enriched with
/// its owning record when one matches, so the browser can link back to
/// it; unmatched files (Markdown companions, anything dropped in by
/// hand) still list, just without that link.
pub async fn list_vault_directory(
    pool: &SqlitePool,
    vault_root: &Path,
    relative_path: &str,
) -> Result<Vec<VaultEntry>, AttachmentError> {
    std::fs::create_dir_all(vault_root)?;
    let target = resolve_within_vault(vault_root, relative_path)?;

    if !target.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    for dir_entry in std::fs::read_dir(&target)? {
        let dir_entry = dir_entry?;
        let path = dir_entry.path();
        let metadata = dir_entry.metadata()?;
        let raw_name = dir_entry.file_name().to_string_lossy().to_string();
        let relative = path
            .strip_prefix(vault_root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let absolute_path = path.to_string_lossy().to_string();

        if metadata.is_dir() {
            entries.push(VaultEntry {
                name: raw_name,
                relative_path: relative,
                is_dir: true,
                size_bytes: None,
                modified_at: None,
                attachment_id: None,
                entity_type: None,
                entity_id: None,
                mime_type: None,
                absolute_path,
            });
            continue;
        }

        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
        let size_bytes = Some(metadata.len() as i64);

        let attachment = sqlx::query_as::<_, Attachment>(
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at
             FROM attachments WHERE stored_path = ?",
        )
        .bind(&absolute_path)
        .fetch_optional(pool)
        .await?;

        entries.push(match attachment {
            Some(a) => VaultEntry {
                name: a.file_name,
                relative_path: relative,
                is_dir: false,
                size_bytes,
                modified_at,
                attachment_id: Some(a.id),
                entity_type: Some(a.entity_type),
                entity_id: Some(a.entity_id),
                mime_type: Some(a.mime_type),
                absolute_path,
            },
            None => VaultEntry {
                name: raw_name,
                relative_path: relative,
                is_dir: false,
                size_bytes,
                modified_at,
                attachment_id: None,
                entity_type: None,
                entity_id: None,
                mime_type: None,
                absolute_path,
            },
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

pub async fn delete_attachment(pool: &SqlitePool, id: &str) -> Result<(), AttachmentError> {
    if let Some(attachment) = get_attachment(pool, id).await? {
        let _ = std::fs::remove_file(&attachment.stored_path);
    }
    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
