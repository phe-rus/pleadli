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
    /// Which of a person's four identification-photo slots (front, left
    /// profile, right profile, back) this fills. Null for every
    /// attachment that isn't one of those angle photos.
    pub photo_angle: Option<String>,
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

/// Where a file is, written relative to the vault root with `/` separators.
/// This is what the database stores, so the vault can be moved (a new
/// Documents folder, a restored backup, another machine) without every row
/// pointing at the old place.
fn to_relative(vault_root: &Path, path: &Path) -> String {
    path.strip_prefix(vault_root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

/// The real path of a stored file. A stored path is relative to the vault
/// root; a row written before paths were relative is an absolute path and is
/// used as it stands until `normalise_stored_paths` has rewritten it.
pub fn absolute_path(vault_root: &Path, stored_path: &str) -> Result<PathBuf, AttachmentError> {
    let path = Path::new(stored_path);
    if path.is_absolute() {
        return Ok(path.to_path_buf());
    }
    resolve_within_vault(vault_root, stored_path)
}

/// Rewrites every attachment stored as an absolute path inside this vault to
/// the relative form. Safe to run on every start: rows already relative, and
/// rows for files outside the vault, are left alone.
pub async fn normalise_stored_paths(pool: &SqlitePool, vault_root: &Path) -> Result<u64, sqlx::Error> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, stored_path FROM attachments").fetch_all(pool).await?;
    let mut changed = 0;
    for (id, stored) in rows {
        let path = Path::new(&stored);
        if !path.is_absolute() {
            continue;
        }
        if let Ok(relative) = path.strip_prefix(vault_root) {
            let relative = relative.to_string_lossy().replace('\\', "/");
            sqlx::query("UPDATE attachments SET stored_path = ? WHERE id = ?").bind(relative).bind(&id).execute(pool).await?;
            changed += 1;
        }
    }
    Ok(changed)
}

/// Removes folders left empty by a move, walking up, but never the vault root
/// and never a top-level folder of it.
fn remove_empty_parents(vault_root: &Path, mut dir: &Path) {
    while dir != vault_root && dir.parent().is_some_and(|parent| parent != vault_root) {
        if std::fs::remove_dir(dir).is_err() {
            break;
        }
        match dir.parent() {
            Some(parent) => dir = parent,
            None => break,
        }
    }
}

fn move_file(from: &Path, to: &Path) -> std::io::Result<()> {
    if std::fs::rename(from, to).is_ok() {
        return Ok(());
    }
    std::fs::copy(from, to)?;
    std::fs::remove_file(from)
}

/// Brings a record's attachments into the folder its relationships say they
/// belong in. A file added while its case had one reference stays where it is
/// when the reference changes, or when the record moves to another case; this
/// is what moves it, so a case's files never end up split across two folders.
async fn settle(pool: &SqlitePool, vault_root: &Path, dir: &Path, entity_type: &str, entity_id: &str) -> Result<(), AttachmentError> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, stored_path FROM attachments WHERE entity_type = ? AND entity_id = ?")
        .bind(entity_type)
        .bind(entity_id)
        .fetch_all(pool)
        .await?;

    for (id, stored) in rows {
        let Ok(current) = absolute_path(vault_root, &stored) else { continue };
        let Some(name) = current.file_name() else { continue };
        let target = dir.join(name);
        let relative = to_relative(vault_root, &target);

        if current != target {
            if !current.exists() || target.exists() {
                continue;
            }
            if let Err(e) = move_file(&current, &target) {
                log::warn!("could not move attachment {id} into {}: {e}", dir.display());
                continue;
            }
            if let Some(old_dir) = current.parent() {
                remove_empty_parents(vault_root, old_dir);
            }
        }
        if relative != stored {
            sqlx::query("UPDATE attachments SET stored_path = ? WHERE id = ?").bind(&relative).bind(&id).execute(pool).await?;
        }
    }
    Ok(())
}

/// A case's reference changed: its whole folder (documents, companions, and
/// every folder of the records filed under it) is renamed in one step and the
/// stored paths beneath it follow. When the new name is already taken (two
/// cases sharing a reference) nothing is renamed here, and `settle` moves
/// each record's files one by one instead.
pub async fn rename_case_folder(pool: &SqlitePool, vault_root: &Path, old_reference: &str, new_reference: &str) -> Result<(), AttachmentError> {
    let old_name = sanitize_folder_name(old_reference);
    let new_name = sanitize_folder_name(new_reference);
    if old_name == new_name {
        return Ok(());
    }
    let old_dir = vault_root.join("cases").join(&old_name);
    let new_dir = vault_root.join("cases").join(&new_name);
    if !old_dir.exists() || new_dir.exists() {
        return Ok(());
    }
    std::fs::create_dir_all(vault_root.join("cases"))?;
    std::fs::rename(&old_dir, &new_dir)?;

    let old_prefix = format!("cases/{old_name}/");
    let new_prefix = format!("cases/{new_name}/");
    sqlx::query("UPDATE attachments SET stored_path = ?1 || substr(stored_path, ?2) WHERE substr(stored_path, 1, ?2 - 1) = ?3")
        .bind(&new_prefix)
        .bind(old_prefix.chars().count() as i64 + 1)
        .bind(&old_prefix)
        .execute(pool)
        .await?;
    Ok(())
}

/// Settles the case's own files and those of every record filed under it.
pub async fn settle_case(pool: &SqlitePool, vault_root: &Path, case_id: &str) -> Result<(), AttachmentError> {
    resolve_vault_dir(pool, vault_root, "case", case_id).await?;
    for (entity_type, table) in [
        ("statement", "statements"),
        ("custody_record", "custody_records"),
        ("bond", "bonds"),
        ("referral", "referrals"),
        ("charge_sheet", "charge_sheets"),
        ("exhibit", "exhibits"),
    ] {
        let ids: Vec<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT id FROM {table} WHERE case_id = ?")))
            .bind(case_id)
            .fetch_all(pool)
            .await?;
        for id in ids {
            resolve_vault_dir(pool, vault_root, entity_type, &id).await?;
        }
    }
    Ok(())
}

/// Where a given attachment physically belongs in the Police Vault, and
/// (as a consequence of asking) where the record's existing files are moved
/// to if they are somewhere else —
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
    // Wherever the record's folder is now, its files are there too.
    settle(pool, vault_root, &dir, entity_type, entity_id).await?;
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
    let stored_path_str = to_relative(vault_root, &stored_path);

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
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
             FROM attachments ORDER BY created_at DESC LIMIT 200",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Attachment>(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
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
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
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
        let absolute = path.to_string_lossy().to_string();

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
            "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle
             FROM attachments WHERE stored_path = ? OR stored_path = ?",
        )
        .bind(&relative)
        .bind(&absolute)
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
            },
        });
    }

    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

/// A `data:` URL for an attachment's bytes: the one way to show a file
/// inline in the React UI (an avatar image, say) that works the same in
/// a real release build as it does in dev. The dev-only HTTP server that
/// backs `attachmentFileUrl()` elsewhere doesn't exist once
/// `debug_assertions` is off, so inline display can't rely on it.
pub async fn get_attachment_data_url(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<Option<String>, AttachmentError> {
    let Some(attachment) = get_attachment(pool, id).await? else {
        return Ok(None);
    };
    let bytes = std::fs::read(absolute_path(vault_root, &attachment.stored_path)?)?;
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(Some(format!("data:{};base64,{}", attachment.mime_type, encoded)))
}

pub async fn delete_attachment(pool: &SqlitePool, vault_root: &Path, id: &str) -> Result<(), AttachmentError> {
    if let Some(attachment) = get_attachment(pool, id).await? {
        if let Ok(path) = absolute_path(vault_root, &attachment.stored_path) {
            let _ = std::fs::remove_file(path);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::cases::{self, CreateCaseInput};

    fn case_input(reference: &str) -> CreateCaseInput {
        CreateCaseInput { reference: reference.into(), summary: "Case".into(), status: "open".into(), incident_id: None, people: vec![] }
    }

    /// Files are stored relative to the vault; renaming a case moves its whole
    /// folder and every path with it; an old absolute row is rewritten; and a
    /// reference cannot walk out of the vault.
    #[tokio::test]
    async fn the_vault_follows_the_case_and_stays_inside_itself() {
        let dir = std::env::temp_dir().join(format!("pleadli-vault-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        let pool = &db.pool;

        let case = cases::create_case(pool, &vault_root, case_input("OLD CRB 1/2026")).await.unwrap();
        let on_case = add_attachment_bytes(pool, &vault_root, "case", &case.id, "notes.txt", b"case file").await.unwrap();
        assert!(!Path::new(&on_case.stored_path).is_absolute(), "stored relative: {}", on_case.stored_path);
        assert!(on_case.stored_path.starts_with("cases/OLD CRB 1-2026/documents/"));

        let statement_id = Uuid::new_v4().to_string();
        let person_id: String = sqlx::query_scalar("SELECT id FROM people LIMIT 1").fetch_one(pool).await.unwrap();
        sqlx::query("INSERT INTO statements (id, content, person_id, case_id, given_at) VALUES (?, 'x', ?, ?, 0)")
            .bind(&statement_id)
            .bind(&person_id)
            .bind(&case.id)
            .execute(pool)
            .await
            .unwrap();
        let on_statement = add_attachment_bytes(pool, &vault_root, "statement", &statement_id, "scan.pdf", b"statement scan").await.unwrap();
        assert!(on_statement.stored_path.starts_with("cases/OLD CRB 1-2026/statements/"));

        // Rename the case: the folder moves once, the paths follow, nothing is left behind.
        cases::update_case(pool, &vault_root, &case.id, case_input("NEW CRB 9/2026")).await.unwrap();
        assert!(!vault_root.join("cases/OLD CRB 1-2026").exists());
        for id in [&on_case.id, &on_statement.id] {
            let moved = get_attachment(pool, id).await.unwrap().unwrap();
            assert!(moved.stored_path.starts_with("cases/NEW CRB 9-2026/"), "{}", moved.stored_path);
            assert!(absolute_path(&vault_root, &moved.stored_path).unwrap().exists());
        }
        assert_eq!(get_attachment_data_url(pool, &vault_root, &on_case.id).await.unwrap().is_some(), true);

        // A statement moved to another case brings its file with it.
        let other = cases::create_case(pool, &vault_root, case_input("OTHER CRB 2/2026")).await.unwrap();
        sqlx::query("UPDATE statements SET case_id = ? WHERE id = ?").bind(&other.id).bind(&statement_id).execute(pool).await.unwrap();
        resolve_vault_dir(pool, &vault_root, "statement", &statement_id).await.unwrap();
        let moved = get_attachment(pool, &on_statement.id).await.unwrap().unwrap();
        assert!(moved.stored_path.starts_with("cases/OTHER CRB 2-2026/statements/"), "{}", moved.stored_path);
        assert!(absolute_path(&vault_root, &moved.stored_path).unwrap().exists());

        // A row written before paths were relative is rewritten.
        let current = get_attachment(pool, &on_case.id).await.unwrap().unwrap().stored_path;
        let absolute = absolute_path(&vault_root, &current).unwrap();
        sqlx::query("UPDATE attachments SET stored_path = ? WHERE id = ?").bind(absolute.to_string_lossy().to_string()).bind(&on_case.id).execute(pool).await.unwrap();
        assert_eq!(normalise_stored_paths(pool, &vault_root).await.unwrap(), 1);
        assert_eq!(get_attachment(pool, &on_case.id).await.unwrap().unwrap().stored_path, current);

        // A reference cannot name a place outside the vault.
        assert_eq!(sanitize_folder_name(".."), "unnamed");
        assert_eq!(sanitize_folder_name("../../etc"), "..-..-etc");
        assert_eq!(sanitize_folder_name("A: B*?"), "A- B--");
        assert!(resolve_within_vault(&vault_root, "cases/../../secret").is_err());

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
