//! Attachments: the files kept with a record.
//!
//! Every file is sealed (ChaCha20-Poly1305, under the station's vault key) in one flat file named
//! by its id, under the vault root inside the app's own data folder. The database records the file's
//! name, type, size and a hash, and nothing about where a person would look for it: the folders the
//! Files page shows (a case's documents, statements, custody papers...) are worked out from the
//! record each file belongs to, so renaming a case or moving a statement to another case changes
//! where the file is shown without touching the file. Nothing here is readable by another program;
//! a file is opened by writing a plain copy to a private folder for the moment it is viewed.

use pleadli_node_core::vault;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::{BTreeMap, BTreeSet};
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
    /// Which of a person's four identification-photo slots (front, left
    /// profile, right profile, back) this fills. Null for every
    /// attachment that isn't one of those angle photos.
    pub photo_angle: Option<String>,
}


#[derive(Debug)]
pub enum AttachmentError {
    Io(std::io::Error),
    Db(sqlx::Error),
    /// The sealed file is missing, damaged, or not this attachment's.
    Vault(String),
    /// The file's record is one the signed-in officer may not open.
    NotFound,
}

impl fmt::Display for AttachmentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AttachmentError::Io(e) => write!(f, "{e}"),
            AttachmentError::Db(e) => write!(f, "{e}"),
            AttachmentError::Vault(e) => write!(f, "{e}"),
            AttachmentError::NotFound => write!(f, "That file no longer exists."),
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

impl From<vault::VaultError> for AttachmentError {
    fn from(e: vault::VaultError) -> Self {
        AttachmentError::Vault(e.to_string())
    }
}

/// Case references are real UPF-style strings like `JINJA CRB 314/2019`,
/// the station name spelled out, not a code (see
/// docs/police/research/file-structure-and-numbering.md). Used directly as a
/// path component they would create nested folders no one asked for, and one
/// typed as `..` would walk out of the vault, so every character a file
/// system dislikes is folded to `-`, trailing dots and spaces (which Windows
/// drops) are removed, and a name left empty or made only of dots becomes
/// `unnamed`.
fn sanitize_folder_name(input: &str) -> String {
    let folded: String = input
        .chars()
        .map(|c| if c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') { '-' } else { c })
        .collect();
    let trimmed = folded.trim().trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Present only in the throwaway folder a Markdown export is built in. A record's Markdown companion
/// and the folder tree of an export are written only where this marker is, never into the vault.
pub const EXPORT_MARKER: &str = ".export-staging";

/// Where a record's files are shown, relative to the top of the Files page: derived from the
/// record's own relationships, not chosen by whoever attached the file. Case-linked material (a
/// statement, a bond, a custody record that names a case, or the case itself) is shown under that
/// case's folder, since that is how an officer looks for "everything about this case". Everything
/// else keeps its own top-level folder, Person included, since a case is not the structure
/// everything else hangs off.
async fn folder_of(pool: &SqlitePool, entity_type: &str, entity_id: &str) -> Result<PathBuf, AttachmentError> {
    let vault_root = PathBuf::new();
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
    let vault_root = vault_root.as_path();

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
        "library" => {
            let mut dir = vault_root.join("library");
            for crumb in crate::domain::library::crumbs(pool, entity_id).await.map_err(AttachmentError::Vault)? {
                dir = dir.join(sanitize_folder_name(&crumb.name));
            }
            dir
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
    Ok(dir)
}

/// A folder inside an export's throwaway directory for one record's companion files. Refused anywhere
/// else, so the sealed vault never gets a plain copy of a record written beside it.
pub async fn resolve_vault_dir(pool: &SqlitePool, vault_root: &Path, entity_type: &str, entity_id: &str) -> Result<PathBuf, AttachmentError> {
    if !vault_root.join(EXPORT_MARKER).exists() {
        return Err(AttachmentError::Io(std::io::Error::new(std::io::ErrorKind::PermissionDenied, "records are not written to the vault as plain files")));
    }
    let dir = vault_root.join(folder_of(pool, entity_type, entity_id).await?);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// `<id>` or `<id>.<extension>`: how the Files page names a file in its folder, so that two files
/// with the same name never share a path and a path leads back to exactly one attachment.
fn shown_file_name(id: &str, file_name: &str) -> String {
    match Path::new(file_name).extension().and_then(|e| e.to_str()).filter(|e| !e.is_empty()) {
        Some(extension) => format!("{id}.{extension}"),
        None => id.to_string(),
    }
}

/// The attachment a Files page path leads to: the last part of the path starts with its id.
pub async fn attachment_at(pool: &SqlitePool, relative_path: &str) -> Result<Option<Attachment>, sqlx::Error> {
    let name = relative_path.trim_matches('/').rsplit('/').next().unwrap_or("");
    let id = name.split('.').next().unwrap_or("");
    if id.is_empty() {
        return Ok(None);
    }
    get_attachment(pool, id).await
}

fn guess_mime(extension: &str) -> &'static str {
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" => "image/heic",
        "pdf" => "application/pdf",
        "webm" => "audio/webm",
        "ogg" | "oga" => "audio/ogg",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt" | "log" => "text/plain",
        "md" | "markdown" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        _ => "application/octet-stream",
    }
}

/// Seals the bytes into the vault under a fresh id (so two attachments can never collide, even with
/// the same original name) and records the metadata row.
pub async fn add_attachment_bytes(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<Attachment, AttachmentError> {
    let extension = Path::new(file_name).extension().and_then(|e| e.to_str()).unwrap_or("");
    let id = Uuid::new_v4().to_string();
    let stored_path = vault::write(vault_root, &id, bytes)?;

    let mime_type = guess_mime(extension);
    let size_bytes = bytes.len() as i64;

    let inserted = sqlx::query(
        "INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, content_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(entity_type)
    .bind(entity_id)
    .bind(file_name)
    .bind(&stored_path)
    .bind(mime_type)
    .bind(size_bytes)
    .bind(vault::sha256_hex(bytes))
    .execute(pool)
    .await;
    if let Err(e) = inserted {
        // No row, so nothing would ever find or remove the sealed file.
        let _ = vault::shred_file(&vault_root.join(&stored_path));
        return Err(e.into());
    }

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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAttachFailure {
    pub source: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkAttachResult {
    pub attached: Vec<Attachment>,
    pub failed: Vec<BulkAttachFailure>,
}

/// Attaches many files to the same record in one call: bulk paperwork
/// intake (an existing person's file, a case's supporting documents)
/// instead of one file at a time. Each file goes through the exact same
/// `add_attachment_bytes` every other attachment already does, so it
/// lands in the correct Vault folder automatically; "arranging them in
/// order" is that existing per-record path resolution, just looped. One
/// bad file (unreadable, say) doesn't lose track of the rest of the
/// batch: it's recorded in `failed` and the loop continues.
pub async fn bulk_attach_bytes(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    files: Vec<(String, Vec<u8>)>,
) -> BulkAttachResult {
    let mut attached = Vec::with_capacity(files.len());
    let mut failed = Vec::new();

    for (file_name, bytes) in files {
        match add_attachment_bytes(pool, vault_root, entity_type, entity_id, &file_name, &bytes).await {
            Ok(attachment) => attached.push(attachment),
            Err(e) => failed.push(BulkAttachFailure { source: file_name, error: e.to_string() }),
        }
    }

    BulkAttachResult { attached, failed }
}

/// Tauri path: source paths already exist on disk (from the native
/// multi-file picker), so bytes are read directly rather than shipped
/// over IPC, same reasoning as `add_attachment_from_path`.
pub async fn bulk_attach_from_paths(
    pool: &SqlitePool,
    vault_root: &Path,
    entity_type: &str,
    entity_id: &str,
    source_paths: &[PathBuf],
) -> BulkAttachResult {
    let mut attached = Vec::with_capacity(source_paths.len());
    let mut failed = Vec::new();

    for source_path in source_paths {
        match add_attachment_from_path(pool, vault_root, entity_type, entity_id, source_path).await {
            Ok(attachment) => attached.push(attachment),
            Err(e) => failed.push(BulkAttachFailure { source: source_path.to_string_lossy().to_string(), error: e.to_string() }),
        }
    }

    BulkAttachResult { attached, failed }
}

pub async fn get_attachment(pool: &SqlitePool, id: &str) -> Result<Option<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle FROM attachments WHERE id = ?",
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
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC",
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
        "bond" => format!("/search/bonds?view=all&open={entity_id}"),
        "station_diary_entry" => format!("/sd-log?open={entity_id}"),
        "duty_assignment" => format!("/roster?open={entity_id}"),
        "exhibit" => format!("/evidence?open={entity_id}"),
        "charge_sheet" => format!("/legal-forms?open={entity_id}"),
        "referral" => format!("/referrals?view=all&open={entity_id}"),
        "medical_exam" => format!("/medical?open={entity_id}"),
        "vehicle" => format!("/vehicles?open={entity_id}"),
        "station_diary_day" => "/sd-log".to_string(),
        "officer" => format!("/station/officers?open={entity_id}"),
        "nominal_roll" => "/station/officers".to_string(),
        "duty_roster_day" => "/roster?view=week".to_string(),
        "shift_handover" | "officer_check_in" => format!("/roster?view=book&open={entity_id}"),
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
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
             FROM attachments WHERE entity_type NOT IN ('library', 'library_trash') ORDER BY created_at DESC LIMIT 200",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
         FROM attachments WHERE file_name LIKE ? AND entity_type NOT IN ('library', 'library_trash') ORDER BY created_at DESC LIMIT 200",
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
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
         FROM attachments WHERE file_name LIKE ? AND entity_type NOT IN ('library', 'library_trash') ORDER BY created_at DESC LIMIT 50",
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
    /// What a person calls the file: a record's own title (the first heading
    /// of its Markdown), else nothing and the window names it.
    pub title: Option<String>,
    /// For a folder, how many things are directly inside it.
    pub item_count: Option<i64>,
    /// What to call it on screen when the folder's own name is only a safe file name (a case's reference as written).
    pub label: Option<String>,
}

/// Every attachment, for a listing or an export (the search lists stop at 200). What is in the library's
/// recycle bin is deleted as far as anyone is concerned, so it is never listed or exported.
pub async fn all_attachments(pool: &SqlitePool) -> Result<Vec<Attachment>, sqlx::Error> {
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle FROM attachments WHERE entity_type != 'library_trash' ORDER BY created_at",
    )
    .fetch_all(pool)
    .await
}

/// The Files page's listing of one folder, built from the records: the sealed vault has no folders of
/// its own. Files that belong to a restricted case the officer may not open are left out (`hidden`),
/// and so are the folders that would hold only those.
pub async fn list_vault_directory(pool: &SqlitePool, relative_path: &str, hidden: &[String]) -> Result<Vec<VaultEntry>, AttachmentError> {
    let wanted: Vec<&str> = relative_path.trim_matches('/').split('/').filter(|s| !s.is_empty()).collect();
    if wanted.iter().any(|s| *s == "." || *s == "..") {
        return Err(AttachmentError::Io(std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid path segment")));
    }

    let mut folders: BTreeMap<String, usize> = BTreeMap::new();
    let mut files = Vec::new();
    let mut folder_cache: BTreeMap<(String, String), Vec<String>> = BTreeMap::new();
    for attachment in all_attachments(pool).await? {
        if attachment.entity_type == crate::domain::library::ENTITY {
            continue;
        }
        if !crate::domain::cases::may_see_entity(pool, &attachment.entity_type, &attachment.entity_id, hidden).await? {
            continue;
        }
        let key = (attachment.entity_type.clone(), attachment.entity_id.clone());
        if !folder_cache.contains_key(&key) {
            let folder = folder_of(pool, &key.0, &key.1).await?;
            folder_cache.insert(key.clone(), folder.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect());
        }
        let folder = &folder_cache[&key];
        if folder.len() < wanted.len() || folder[..wanted.len()] != wanted[..] {
            continue;
        }
        if folder.len() == wanted.len() {
            files.push(attachment);
        } else {
            *folders.entry(folder[wanted.len()].clone()).or_default() += 1;
        }
    }

    let prefix = if wanted.is_empty() { String::new() } else { format!("{}/", wanted.join("/")) };
    let mut entries: Vec<VaultEntry> = folders
        .into_iter()
        .map(|(name, count)| VaultEntry {
            relative_path: format!("{prefix}{name}"),
            name,
            is_dir: true,
            size_bytes: None,
            modified_at: None,
            attachment_id: None,
            entity_type: None,
            entity_id: None,
            mime_type: None,
            title: None,
            item_count: Some(count as i64),
            label: None,
        })
        .collect();
    for attachment in files {
        entries.push(VaultEntry {
            relative_path: format!("{prefix}{}", shown_file_name(&attachment.id, &attachment.file_name)),
            name: attachment.file_name,
            is_dir: false,
            size_bytes: Some(attachment.size_bytes),
            modified_at: Some(attachment.created_at),
            attachment_id: Some(attachment.id),
            entity_type: Some(attachment.entity_type),
            entity_id: Some(attachment.entity_id),
            mime_type: Some(attachment.mime_type),
            title: None,
            item_count: None,
            label: None,
        });
    }
    // Every case has its folder whether or not a file has been attached to it yet, so the library
    // shows the station's cases from the first day. A case's folder carries the case itself
    // (entity) and its summary, so the window can open the case from it.
    if wanted.is_empty() || wanted.as_slice() == ["cases"] {
        let cases: Vec<(String, String, String)> = sqlx::query_as("SELECT id, reference, summary FROM cases ORDER BY created_at DESC").fetch_all(pool).await?;
        let visible: Vec<(String, String, String)> = cases.into_iter().filter(|(id, _, _)| !hidden.contains(id)).collect();
        let folder = |name: String, path: String, entity: Option<(String, String, String)>, count: i64| VaultEntry {
            relative_path: path,
            name,
            is_dir: true,
            size_bytes: None,
            modified_at: None,
            attachment_id: None,
            entity_type: entity.as_ref().map(|_| "case".to_string()),
            entity_id: entity.as_ref().map(|e| e.0.clone()),
            mime_type: None,
            title: entity.as_ref().map(|e| e.1.clone()),
            label: entity.map(|e| e.2),
            item_count: Some(count),
        };
        if wanted.is_empty() {
            if !visible.is_empty() {
                match entries.iter_mut().find(|e| e.is_dir && e.name == "cases") {
                    Some(e) => e.item_count = Some(visible.len() as i64),
                    None => entries.push(folder("cases".into(), "cases".into(), None, visible.len() as i64)),
                }
            }
        } else {
            for (id, reference, summary) in visible {
                let name = sanitize_folder_name(&reference);
                match entries.iter_mut().find(|e| e.is_dir && e.name == name) {
                    Some(e) => {
                        e.entity_type = Some("case".into());
                        e.entity_id = Some(id);
                        e.title = Some(summary);
                        e.label = Some(reference.clone());
                    }
                    None => entries.push(folder(name.clone(), format!("cases/{name}"), Some((id, summary, reference.clone())), 0)),
                }
            }
        }
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

/// An attachment and its plain bytes, opened from the sealed vault.
pub async fn read_attachment(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<(Attachment, Vec<u8>)>, AttachmentError> {
    let Some(attachment) = get_attachment(pool, id).await? else {
        return Ok(None);
    };
    let bytes = vault::read(vault_root, &attachment.stored_path, &attachment.id)?;
    Ok(Some((attachment, bytes)))
}

/// A `data:` URL for an attachment's bytes: the one way to show a file
/// inline in the React UI (an avatar image, say) that works the same in
/// a real release build as it does in dev.
pub async fn get_attachment_data_url(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<String>, AttachmentError> {
    use base64::Engine;
    Ok(read_attachment(pool, vault_root, id)
        .await?
        .map(|(attachment, bytes)| format!("data:{};base64,{}", attachment.mime_type, base64::engine::general_purpose::STANDARD.encode(bytes))))
}

/// Any file of the Files page as a `data:` URL, named by its place there, so the app can show it in
/// its own viewer rather than another program.
pub async fn read_vault_file(pool: &SqlitePool, vault_root: &Path, relative_path: &str) -> Result<String, AttachmentError> {
    let attachment = attachment_at(pool, relative_path).await?.ok_or(AttachmentError::NotFound)?;
    get_attachment_data_url(pool, vault_root, &attachment.id).await?.ok_or(AttachmentError::NotFound)
}

pub async fn delete_attachment(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<(), AttachmentError> {
    if let Some(attachment) = get_attachment(pool, id).await? {
        if vault::is_relative(&attachment.stored_path) {
            let _ = vault::shred_file(&vault_root.join(&attachment.stored_path));
        }
    }
    // people.headshot_attachment_id references this table with foreign
    // keys enforced (sqlx defaults PRAGMA foreign_keys = ON): deleting a
    // still-referenced row outright would fail the constraint, so any
    // person currently pointing at this attachment as their headshot is
    // freed first.
    sqlx::query("UPDATE people SET headshot_attachment_id = NULL WHERE headshot_attachment_id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Writes every attachment, opened, into an export's throwaway folder at the place the Files page shows
/// it, under its own name (the id is put in front only when two files in a folder share a name).
pub async fn place_for_export(pool: &SqlitePool, vault_root: &Path, staging: &Path) -> Result<(), AttachmentError> {
    let mut used: BTreeSet<PathBuf> = BTreeSet::new();
    for attachment in all_attachments(pool).await? {
        let Ok(plain) = vault::read(vault_root, &attachment.stored_path, &attachment.id) else {
            log::warn!("export: attachment {} could not be opened from the vault and was left out", attachment.id);
            continue;
        };
        let dir = staging.join(folder_of(pool, &attachment.entity_type, &attachment.entity_id).await?);
        std::fs::create_dir_all(&dir)?;
        let name = sanitize_folder_name(&attachment.file_name);
        let mut target = dir.join(&name);
        if used.contains(&target) {
            target = dir.join(format!("{}-{name}", attachment.id));
        }
        std::fs::write(&target, plain)?;
        used.insert(target);
    }
    Ok(())
}

/// A record's Markdown companion as older builds wrote it: `<kind>-<id>.md`.
fn is_record_companion(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".md") else { return false };
    stem.len() >= 38 && stem.is_char_boundary(stem.len() - 36) && Uuid::parse_str(&stem[stem.len() - 36..]).is_ok() && stem[..stem.len() - 36].ends_with('-')
}

/// Removes the plain copies older builds wrote beside the files: a Markdown page for each record, the
/// README and the index pages. They hold names, charges and statements, so once the files are sealed they
/// would undo it. Only files the app itself generated are touched; anything else a person put in the
/// old folder is left where it is. Returns how many were removed.
pub fn retire_plain_copies(legacy: &Path) -> usize {
    let mut removed = 0;
    let Ok(files) = vault::walk(legacy) else { return 0 };
    for file in files {
        let Some(name) = file.file_name().and_then(|n| n.to_str()) else { continue };
        let in_index = file.parent().and_then(|p| p.file_name()).is_some_and(|d| d == "index") && file.parent().and_then(|p| p.parent()) == Some(legacy);
        let readme = name == "README.md" && file.parent() == Some(legacy);
        if (is_record_companion(name) || in_index || readme) && vault::shred_file(&file).is_ok() {
            removed += 1;
        }
    }
    // Folders left empty, deepest first; never the top.
    let mut dirs: Vec<PathBuf> = Vec::new();
    fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
        if let Ok(read) = std::fs::read_dir(dir) {
            for entry in read.flatten() {
                if entry.path().is_dir() {
                    collect(&entry.path(), out);
                    out.push(entry.path());
                }
            }
        }
    }
    collect(legacy, &mut dirs);
    for dir in dirs {
        let _ = std::fs::remove_dir(dir);
    }
    removed
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::cases::{self, CreateCaseInput};

    fn case_input(reference: &str) -> CreateCaseInput {
        CreateCaseInput { reference: reference.into(), summary: "Case".into(), status: "open".into(), incident_id: None, people: vec![], restricted: false, actor_id: None, access_officer_ids: None }
    }

    /// A file is sealed in the vault and unreadable there; the Files page shows it under its case, and
    /// renaming the case or moving a statement to another case moves what is shown, not the file.
    #[tokio::test]
    async fn files_are_sealed_and_shown_under_their_records() {
        let dir = std::env::temp_dir().join(format!("pleadli-vault-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        let pool = &db.pool;

        let case = cases::create_case(pool, &vault_root, case_input("OLD CRB 1/2026")).await.unwrap();
        let on_case = add_attachment_bytes(pool, &vault_root, "case", &case.id, "notes.txt", b"case file contents").await.unwrap();
        assert_eq!(on_case.stored_path, format!("attachments/{}.enc", on_case.id));
        let on_disk = std::fs::read(vault_root.join(&on_case.stored_path)).unwrap();
        assert!(!on_disk.windows(18).any(|w| w == b"case file contents"), "the file on disk is sealed");
        assert_eq!(read_attachment(pool, &vault_root, &on_case.id).await.unwrap().unwrap().1, b"case file contents");

        let statement_id = Uuid::new_v4().to_string();
        let person_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES (?, 'A', 'B')").bind(&person_id).execute(pool).await.unwrap();
        sqlx::query("INSERT INTO statements (id, content, person_id, case_id, given_at) VALUES (?, 'x', ?, ?, 0)")
            .bind(&statement_id)
            .bind(&person_id)
            .bind(&case.id)
            .execute(pool)
            .await
            .unwrap();
        let on_statement = add_attachment_bytes(pool, &vault_root, "statement", &statement_id, "scan.pdf", b"statement scan").await.unwrap();

        let top = list_vault_directory(pool, "", &[]).await.unwrap();
        assert!(top.iter().any(|e| e.is_dir && e.name == "cases"));
        let docs = list_vault_directory(pool, "cases/OLD CRB 1-2026/documents", &[]).await.unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].name, "notes.txt");
        assert_eq!(docs[0].attachment_id.as_deref(), Some(on_case.id.as_str()));
        assert_eq!(read_vault_file(pool, &vault_root, &docs[0].relative_path).await.unwrap(), get_attachment_data_url(pool, &vault_root, &on_case.id).await.unwrap().unwrap());

        // Rename the case: what is shown follows, and no file moved.
        cases::update_case(pool, &vault_root, &case.id, case_input("NEW CRB 9/2026")).await.unwrap();
        assert!(list_vault_directory(pool, "cases/OLD CRB 1-2026", &[]).await.unwrap().is_empty());
        assert_eq!(list_vault_directory(pool, "cases/NEW CRB 9-2026/statements", &[]).await.unwrap().len(), 1);
        assert!(vault_root.join(&on_statement.stored_path).exists());

        // A statement moved to another case is shown there.
        let other = cases::create_case(pool, &vault_root, case_input("OTHER CRB 2/2026")).await.unwrap();
        sqlx::query("UPDATE statements SET case_id = ? WHERE id = ?").bind(&other.id).bind(&statement_id).execute(pool).await.unwrap();
        assert_eq!(list_vault_directory(pool, "cases/OTHER CRB 2-2026/statements", &[]).await.unwrap().len(), 1);

        // A restricted case's files are not listed for an officer who may not open it.
        let hidden = vec![case.id.clone()];
        assert!(list_vault_directory(pool, "cases/NEW CRB 9-2026/documents", &hidden).await.unwrap().is_empty());

        // A path cannot walk out, and records are never written beside the vault as plain files.
        assert_eq!(sanitize_folder_name(".."), "unnamed");
        assert_eq!(sanitize_folder_name("../../etc"), "..-..-etc");
        assert_eq!(sanitize_folder_name("A: B*?"), "A- B--");
        assert!(list_vault_directory(pool, "cases/../..", &[]).await.is_err());
        assert!(resolve_vault_dir(pool, &vault_root, "case", &case.id).await.is_err());

        // Deleting removes the sealed file as well as the row.
        delete_attachment(pool, &vault_root, &on_case.id).await.unwrap();
        assert!(!vault_root.join(&on_case.stored_path).exists());
        assert!(get_attachment(pool, &on_case.id).await.unwrap().is_none());

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    /// An older build's plain Police Vault folder is sealed into the vault at start: the file opens from
    /// the vault, the plain original and the plain record copies are gone, and a file a person put there
    /// themselves is left alone.
    #[tokio::test]
    async fn an_old_plain_vault_is_sealed_at_start_and_the_plain_copies_are_removed() {
        let dir = std::env::temp_dir().join(format!("pleadli-vault-adopt-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let sealed_root = dir.join("vault");
        let db = crate::db::startup(&dir, sealed_root.clone()).await.ok().unwrap();
        let id = Uuid::new_v4().to_string();
        let person = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes) VALUES (?, 'case', 'c', 'old.txt', ?, 'text/plain', 9)")
            .bind(&id)
            .bind(format!("cases/OLD CRB 1-2026/documents/{id}.txt"))
            .execute(&db.pool)
            .await
            .unwrap();
        db.pool.close().await;

        let legacy = dir.join("Documents").join("Pleadli Police");
        std::fs::create_dir_all(legacy.join("cases/OLD CRB 1-2026/documents")).unwrap();
        std::fs::create_dir_all(legacy.join("index")).unwrap();
        std::fs::write(legacy.join(format!("cases/OLD CRB 1-2026/documents/{id}.txt")), b"old plain").unwrap();
        std::fs::write(legacy.join(format!("person-{person}.md")), b"# Amina").unwrap();
        std::fs::write(legacy.join("README.md"), b"index").unwrap();
        std::fs::write(legacy.join("index/people.md"), b"names").unwrap();
        std::fs::write(legacy.join("mine.txt"), b"a person's own file").unwrap();

        let db = crate::db::startup(&dir, legacy.clone()).await.ok().unwrap();
        let (attachment, bytes) = read_attachment(&db.pool, &db.vault_root, &id).await.unwrap().unwrap();
        assert_eq!(bytes, b"old plain");
        assert_eq!(attachment.stored_path, format!("attachments/{id}.enc"));
        assert!(!legacy.join(format!("cases/OLD CRB 1-2026/documents/{id}.txt")).exists(), "the plain original is gone");
        assert!(!legacy.join(format!("person-{person}.md")).exists(), "the plain record copy is gone");
        assert!(!legacy.join("README.md").exists() && !legacy.join("index").exists());
        assert!(legacy.join("mine.txt").exists(), "a person's own file is not touched");

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    /// An export of the whole vault holds opened copies, in folders, in a throwaway folder only.
    #[tokio::test]
    async fn an_export_places_opened_copies_in_a_throwaway_folder() {
        let dir = std::env::temp_dir().join(format!("pleadli-vault-export-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        let pool = &db.pool;
        let case = cases::create_case(pool, &vault_root, case_input("EXP CRB 5/2026")).await.unwrap();
        add_attachment_bytes(pool, &vault_root, "case", &case.id, "same.txt", b"one").await.unwrap();
        add_attachment_bytes(pool, &vault_root, "case", &case.id, "same.txt", b"two").await.unwrap();

        let staging = dir.join("staging");
        std::fs::create_dir_all(&staging).unwrap();
        place_for_export(pool, &vault_root, &staging).await.unwrap();
        let placed: Vec<_> = std::fs::read_dir(staging.join("cases/EXP CRB 5-2026/documents")).unwrap().flatten().collect();
        assert_eq!(placed.len(), 2, "two files with one name both survive");

        // The whole export: a zip with the folders, the opened files and the index, and nothing plain left behind.
        let zip_path = dir.join("out.zip");
        crate::domain::documents::export_all_markdown(pool, &vault_root, &zip_path).await.unwrap();
        let mut archive = zip::ZipArchive::new(std::fs::File::open(&zip_path).unwrap()).unwrap();
        let names: Vec<String> = (0..archive.len()).map(|i| archive.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.iter().any(|n| n == "README.md"), "{names:?}");
        assert_eq!(names.iter().filter(|n| n.starts_with("cases/EXP CRB 5-2026/documents/") && n.ends_with("same.txt")).count(), 2, "{names:?}");
        assert!(!names.iter().any(|n| n.contains(".export-staging")));
        let leftovers = std::fs::read_dir(std::env::temp_dir()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("pleadli-police-export-")).count();
        assert_eq!(leftovers, 0, "the throwaway folder is removed");

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
