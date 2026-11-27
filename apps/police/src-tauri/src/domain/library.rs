//! The Police library: a file manager of the officer's own. Folders are rows
//! (`library_folders`), files are sealed attachments with `entity_type =
//! 'library'` and `entity_id =` the folder they sit in (`ROOT` at the top), so a
//! file is sealed exactly like every other file and a move is one row update.
//! Names are unique within a folder, compared without regard to case, as on Windows.

use crate::domain::attachments::{self, Attachment};
use serde::Serialize;
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const ROOT: &str = "root";
pub const ENTITY: &str = "library";

type Result<T> = std::result::Result<T, String>;

fn db(e: sqlx::Error) -> String {
    e.to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    /// The folder's id, or the file's attachment id.
    pub id: String,
    pub kind: String,
    pub name: String,
    pub folder_id: String,
    pub size_bytes: Option<i64>,
    pub mime_type: Option<String>,
    pub modified_at: i64,
    pub item_count: Option<i64>,
    /// Where it is, for a search result ("Cases / Odongo").
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Crumb {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryListing {
    pub folder_id: String,
    pub crumbs: Vec<Crumb>,
    pub entries: Vec<LibraryEntry>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub files: usize,
    pub folders: usize,
    pub failed: Vec<String>,
}

/// A name a file system accepts as one file or folder name.
pub fn clean_name(input: &str) -> Result<String> {
    let name = input.trim();
    if name.is_empty() {
        return Err("Give it a name.".into());
    }
    if name == "." || name == ".." || name.ends_with('.') {
        return Err("That name cannot be used.".into());
    }
    if name.chars().any(|c| c.is_control() || "/\\:*?\"<>|".contains(c)) {
        return Err("A name cannot contain / \\ : * ? \" < > |".into());
    }
    if name.chars().count() > 120 {
        return Err("That name is too long.".into());
    }
    Ok(name.to_string())
}

fn same(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

async fn folder_name(pool: &SqlitePool, id: &str) -> Result<Option<(Option<String>, String)>> {
    sqlx::query_as::<_, (Option<String>, String)>("SELECT parent_id, name FROM library_folders WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .map_err(db)
}

async fn require_folder(pool: &SqlitePool, id: &str) -> Result<()> {
    let binned: i64 = sqlx::query_scalar("SELECT count(*) FROM library_trash WHERE item_kind = 'folder' AND item_id = ?").bind(id).fetch_one(pool).await.map_err(db)?;
    if id == ROOT || (binned == 0 && folder_name(pool, id).await?.is_some()) {
        Ok(())
    } else {
        Err("That folder no longer exists.".into())
    }
}

/// The path from the top to a folder, the folder last. Empty for the top itself.
pub async fn crumbs(pool: &SqlitePool, id: &str) -> Result<Vec<Crumb>> {
    let mut out = Vec::new();
    let mut at = id.to_string();
    for _ in 0..64 {
        if at == ROOT {
            break;
        }
        let Some((parent, name)) = folder_name(pool, &at).await? else { break };
        out.push(Crumb { id: at.clone(), name });
        at = parent.unwrap_or_else(|| ROOT.to_string());
    }
    out.reverse();
    Ok(out)
}

fn parent_key(id: &str) -> Option<&str> {
    if id == ROOT {
        None
    } else {
        Some(id)
    }
}

async fn names_in(pool: &SqlitePool, folder_id: &str, except: Option<&str>) -> Result<Vec<String>> {
    let mut names: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM library_folders WHERE parent_id IS ? AND id NOT IN (SELECT item_id FROM library_trash WHERE item_kind = 'folder')")
        .bind(parent_key(folder_id))
        .fetch_all(pool)
        .await
        .map_err(db)?;
    let files: Vec<(String, String)> = sqlx::query_as("SELECT id, file_name FROM attachments WHERE entity_type = ? AND entity_id = ?")
        .bind(ENTITY)
        .bind(folder_id)
        .fetch_all(pool)
        .await
        .map_err(db)?;
    names.extend(files);
    Ok(names.into_iter().filter(|(id, _)| Some(id.as_str()) != except).map(|(_, n)| n).collect())
}

async fn ensure_free(pool: &SqlitePool, folder_id: &str, name: &str, except: Option<&str>) -> Result<()> {
    if names_in(pool, folder_id, except).await?.iter().any(|n| same(n, name)) {
        return Err(format!("This folder already has something named \"{name}\"."));
    }
    Ok(())
}

/// "Report.pdf", then "Report (2).pdf", as a file manager does when two files meet.
async fn free_file_name(pool: &SqlitePool, folder_id: &str, name: &str) -> Result<String> {
    let taken = names_in(pool, folder_id, None).await?;
    if !taken.iter().any(|n| same(n, name)) {
        return Ok(name.to_string());
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (name.to_string(), String::new()),
    };
    for n in 2.. {
        let candidate = format!("{stem} ({n}){ext}");
        if !taken.iter().any(|t| same(t, &candidate)) {
            return Ok(candidate);
        }
    }
    unreachable!()
}

pub async fn list(pool: &SqlitePool, folder_id: &str) -> Result<LibraryListing> {
    require_folder(pool, folder_id).await?;
    let folders: Vec<(String, String, i64)> = sqlx::query_as(
        "SELECT f.id, f.name, f.created_at FROM library_folders f WHERE f.parent_id IS ? AND f.id NOT IN (SELECT item_id FROM library_trash WHERE item_kind = 'folder')",
    )
    .bind(parent_key(folder_id))
    .fetch_all(pool)
    .await
    .map_err(db)?;
    let mut entries = Vec::new();
    for (id, name, created_at) in folders {
        let sub: i64 = sqlx::query_scalar("SELECT (SELECT count(*) FROM library_folders WHERE parent_id = ?1 AND id NOT IN (SELECT item_id FROM library_trash WHERE item_kind = 'folder')) + (SELECT count(*) FROM attachments WHERE entity_type = 'library' AND entity_id = ?1)")
            .bind(&id)
            .fetch_one(pool)
            .await
            .map_err(db)?;
        entries.push(LibraryEntry { id, kind: "folder".into(), name, folder_id: folder_id.into(), size_bytes: None, mime_type: None, modified_at: created_at, item_count: Some(sub), path: None });
    }
    for a in attachments::list_attachments(pool, ENTITY, folder_id).await.map_err(db)? {
        entries.push(file_entry(a, None));
    }
    entries.sort_by(|a, b| (a.kind != "folder").cmp(&(b.kind != "folder")).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(LibraryListing { folder_id: folder_id.into(), crumbs: crumbs(pool, folder_id).await?, entries })
}

fn file_entry(a: Attachment, path: Option<String>) -> LibraryEntry {
    LibraryEntry { id: a.id, kind: "file".into(), name: a.file_name, folder_id: a.entity_id, size_bytes: Some(a.size_bytes), mime_type: Some(a.mime_type), modified_at: a.created_at, item_count: None, path }
}

async fn path_text(pool: &SqlitePool, folder_id: &str) -> Result<String> {
    let c = crumbs(pool, folder_id).await?;
    Ok(c.into_iter().map(|c| c.name).collect::<Vec<_>>().join(" / "))
}

/// Every folder and file in the whole library whose name holds the words typed.
pub async fn search(pool: &SqlitePool, query: &str) -> Result<Vec<LibraryEntry>> {
    let words: Vec<String> = query.split_whitespace().map(|w| w.to_lowercase()).collect();
    if words.is_empty() {
        return Ok(vec![]);
    }
    let matches = |name: &str, path: &str| {
        let hay = format!("{} {}", name.to_lowercase(), path.to_lowercase());
        words.iter().all(|w| hay.contains(w))
    };
    let mut out = Vec::new();
    let folders: Vec<(String, Option<String>, String, i64)> = sqlx::query_as("SELECT id, parent_id, name, created_at FROM library_folders WHERE id NOT IN (SELECT item_id FROM library_trash WHERE item_kind = 'folder')").fetch_all(pool).await.map_err(db)?;
    for (id, parent, name, created_at) in folders {
        let parent = parent.unwrap_or_else(|| ROOT.to_string());
        let path = path_text(pool, &parent).await?;
        if matches(&name, &path) {
            out.push(LibraryEntry { id, kind: "folder".into(), name, folder_id: parent, size_bytes: None, mime_type: None, modified_at: created_at, item_count: None, path: Some(path) });
        }
    }
    let files: Vec<Attachment> = sqlx::query_as(
        "SELECT id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes, created_at, photo_angle FROM attachments WHERE entity_type = 'library'",
    )
    .fetch_all(pool)
    .await
    .map_err(db)?;
    for a in files {
        let path = path_text(pool, &a.entity_id).await?;
        if matches(&a.file_name, &path) {
            out.push(file_entry(a, Some(path)));
        }
    }
    out.sort_by(|a, b| (a.kind != "folder").cmp(&(b.kind != "folder")).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    out.truncate(200);
    Ok(out)
}

pub async fn create_folder(pool: &SqlitePool, parent_id: &str, name: &str) -> Result<LibraryEntry> {
    let name = clean_name(name)?;
    require_folder(pool, parent_id).await?;
    ensure_free(pool, parent_id, &name, None).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO library_folders (id, parent_id, name) VALUES (?, ?, ?)").bind(&id).bind(parent_key(parent_id)).bind(&name).execute(pool).await.map_err(db)?;
    Ok(LibraryEntry { id, kind: "folder".into(), name, folder_id: parent_id.into(), size_bytes: None, mime_type: None, modified_at: 0, item_count: Some(0), path: None })
}

pub async fn rename(pool: &SqlitePool, kind: &str, id: &str, name: &str) -> Result<()> {
    let name = clean_name(name)?;
    match kind {
        "folder" => {
            let (parent, _) = folder_name(pool, id).await?.ok_or("That folder no longer exists.")?;
            ensure_free(pool, parent.as_deref().unwrap_or(ROOT), &name, Some(id)).await?;
            sqlx::query("UPDATE library_folders SET name = ? WHERE id = ?").bind(&name).bind(id).execute(pool).await.map_err(db)?;
        }
        "file" => {
            let a = library_file(pool, id).await?;
            ensure_free(pool, &a.entity_id, &name, Some(id)).await?;
            sqlx::query("UPDATE attachments SET file_name = ? WHERE id = ?").bind(&name).bind(id).execute(pool).await.map_err(db)?;
        }
        _ => return Err("Unknown kind.".into()),
    }
    Ok(())
}

async fn library_file(pool: &SqlitePool, id: &str) -> Result<Attachment> {
    match attachments::get_attachment(pool, id).await.map_err(db)? {
        Some(a) if a.entity_type == ENTITY => Ok(a),
        _ => Err("That file is not in the library.".into()),
    }
}

/// Moves a folder or file into another folder. A folder cannot go into itself or anything inside it.
pub async fn move_to(pool: &SqlitePool, kind: &str, id: &str, dest: &str) -> Result<()> {
    require_folder(pool, dest).await?;
    match kind {
        "folder" => {
            let (_, name) = folder_name(pool, id).await?.ok_or("That folder no longer exists.")?;
            if dest == id || crumbs(pool, dest).await?.iter().any(|c| c.id == id) {
                return Err("A folder cannot be moved into itself.".into());
            }
            ensure_free(pool, dest, &name, Some(id)).await?;
            sqlx::query("UPDATE library_folders SET parent_id = ? WHERE id = ?").bind(parent_key(dest)).bind(id).execute(pool).await.map_err(db)?;
        }
        "file" => {
            let a = library_file(pool, id).await?;
            ensure_free(pool, dest, &a.file_name, Some(id)).await?;
            sqlx::query("UPDATE attachments SET entity_id = ? WHERE id = ?").bind(dest).bind(id).execute(pool).await.map_err(db)?;
        }
        _ => return Err("Unknown kind.".into()),
    }
    Ok(())
}

/// How long a deleted item stays in the recycle bin before it is removed for good.
pub const BIN_DAYS: i64 = 30;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BinEntry {
    pub id: String,
    pub kind: String,
    pub name: String,
    /// Where it was, for the line under its name.
    pub from_path: String,
    pub size_bytes: Option<i64>,
    /// Files inside a folder, folders included in the count of items.
    pub item_count: Option<i64>,
    pub deleted_at: i64,
    pub expires_at: i64,
}

/// Moves a folder (with everything in it) or a file to the recycle bin. Nothing is removed:
/// it can be restored for 30 days.
pub async fn delete(pool: &SqlitePool, kind: &str, id: &str, by: &str) -> Result<()> {
    let batch = Uuid::new_v4().to_string();
    let now = now_ms();
    match kind {
        "file" => {
            let a = library_file(pool, id).await?;
            bin_row(pool, "file", id, &batch, true, &a.file_name, &a.entity_id, now, by).await?;
            sqlx::query("UPDATE attachments SET entity_type = 'library_trash' WHERE id = ?").bind(id).execute(pool).await.map_err(db)?;
        }
        "folder" => {
            let (parent, name) = folder_name(pool, id).await?.ok_or("That folder no longer exists.")?;
            // The whole subtree that is still in the library; anything binned earlier keeps its own entry.
            let mut order = vec![id.to_string()];
            let mut i = 0;
            while i < order.len() {
                let kids: Vec<String> = sqlx::query_scalar("SELECT id FROM library_folders WHERE parent_id = ? AND id NOT IN (SELECT item_id FROM library_trash WHERE item_kind = 'folder')").bind(&order[i]).fetch_all(pool).await.map_err(db)?;
                order.extend(kids);
                i += 1;
            }
            for (n, folder) in order.iter().enumerate() {
                let label = if n == 0 { name.clone() } else { folder_name(pool, folder).await?.map(|f| f.1).unwrap_or_default() };
                bin_row(pool, "folder", folder, &batch, n == 0, &label, parent.as_deref().unwrap_or(ROOT), now, by).await?;
                for a in attachments::list_attachments(pool, ENTITY, folder).await.map_err(db)? {
                    bin_row(pool, "file", &a.id, &batch, false, &a.file_name, folder, now, by).await?;
                    sqlx::query("UPDATE attachments SET entity_type = 'library_trash' WHERE id = ?").bind(&a.id).execute(pool).await.map_err(db)?;
                }
            }
        }
        _ => return Err("Unknown kind.".into()),
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn bin_row(pool: &SqlitePool, kind: &str, id: &str, batch: &str, root: bool, name: &str, from: &str, at: i64, by: &str) -> Result<()> {
    sqlx::query("INSERT INTO library_trash (item_kind, item_id, batch, is_root, name, from_folder, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(kind)
        .bind(id)
        .bind(batch)
        .bind(root as i64)
        .bind(name)
        .bind(from)
        .bind(at)
        .bind(by)
        .execute(pool)
        .await
        .map_err(db)?;
    Ok(())
}

/// What the recycle bin holds, newest first. Anything past its 30 days is removed first.
pub async fn bin(pool: &SqlitePool, vault_root: &Path) -> Result<Vec<BinEntry>> {
    purge_expired(pool, vault_root).await?;
    let roots: Vec<(String, String, String, String, i64, String)> =
        sqlx::query_as("SELECT item_kind, item_id, name, from_folder, deleted_at, batch FROM library_trash WHERE is_root = 1 ORDER BY deleted_at DESC").fetch_all(pool).await.map_err(db)?;
    let mut out = Vec::new();
    for (kind, id, name, from, deleted_at, batch) in roots {
        let from_path = path_text(pool, &from).await?;
        let (size, count) = if kind == "file" {
            (sqlx::query_scalar::<_, i64>("SELECT size_bytes FROM attachments WHERE id = ?").bind(&id).fetch_optional(pool).await.map_err(db)?, None)
        } else {
            let n: i64 = sqlx::query_scalar("SELECT count(*) FROM library_trash WHERE batch = ? AND item_id != ?").bind(&batch).bind(&id).fetch_one(pool).await.map_err(db)?;
            (None, Some(n))
        };
        out.push(BinEntry { id, kind, name, from_path, size_bytes: size, item_count: count, deleted_at, expires_at: deleted_at + BIN_DAYS * DAY_MS });
    }
    Ok(out)
}

async fn batch_of(pool: &SqlitePool, kind: &str, id: &str) -> Result<String> {
    sqlx::query_scalar("SELECT batch FROM library_trash WHERE item_kind = ? AND item_id = ? AND is_root = 1").bind(kind).bind(id).fetch_optional(pool).await.map_err(db)?.ok_or_else(|| "That is no longer in the recycle bin.".to_string())
}

/// Puts a deleted item back where it was; if that folder is gone (or itself in the bin) it
/// goes to the top of the library. A name that is taken by now becomes "name (2)".
pub async fn restore(pool: &SqlitePool, kind: &str, id: &str) -> Result<()> {
    let batch = batch_of(pool, kind, id).await?;
    let (name, from): (String, String) = sqlx::query_as("SELECT name, from_folder FROM library_trash WHERE item_kind = ? AND item_id = ?").bind(kind).bind(id).fetch_one(pool).await.map_err(db)?;
    let target = if require_folder(pool, &from).await.is_ok() { from } else { ROOT.to_string() };
    let free = free_file_name(pool, &target, &name).await?;
    let ids: Vec<(String, String)> = sqlx::query_as("SELECT item_kind, item_id FROM library_trash WHERE batch = ?").bind(&batch).fetch_all(pool).await.map_err(db)?;
    for (k, i) in &ids {
        if k == "file" {
            sqlx::query("UPDATE attachments SET entity_type = 'library' WHERE id = ?").bind(i).execute(pool).await.map_err(db)?;
        }
    }
    sqlx::query("DELETE FROM library_trash WHERE batch = ?").bind(&batch).execute(pool).await.map_err(db)?;
    if kind == "folder" {
        sqlx::query("UPDATE library_folders SET parent_id = ?, name = ? WHERE id = ?").bind(parent_key(&target)).bind(&free).bind(id).execute(pool).await.map_err(db)?;
    } else {
        sqlx::query("UPDATE attachments SET entity_id = ?, file_name = ? WHERE id = ?").bind(&target).bind(&free).bind(id).execute(pool).await.map_err(db)?;
    }
    Ok(())
}

/// Removes one binned item for good: every file in it is shredded and its records removed.
pub async fn purge(pool: &SqlitePool, vault_root: &Path, kind: &str, id: &str) -> Result<()> {
    let batch = batch_of(pool, kind, id).await?;
    purge_batch(pool, vault_root, &batch).await
}

async fn purge_batch(pool: &SqlitePool, vault_root: &Path, batch: &str) -> Result<()> {
    let files: Vec<String> = sqlx::query_scalar("SELECT item_id FROM library_trash WHERE batch = ? AND item_kind = 'file'").bind(batch).fetch_all(pool).await.map_err(db)?;
    for file in files {
        attachments::delete_attachment(pool, vault_root, &file).await.map_err(|e| e.to_string())?;
    }
    // Folders last, innermost first, since a folder cannot go while another still sits in it.
    let mut folders: Vec<(String, Option<String>)> = sqlx::query_as("SELECT t.item_id, f.parent_id FROM library_trash t JOIN library_folders f ON f.id = t.item_id WHERE t.batch = ? AND t.item_kind = 'folder'").bind(batch).fetch_all(pool).await.map_err(db)?;
    while !folders.is_empty() {
        let parents: HashSet<String> = folders.iter().filter_map(|(_, p)| p.clone()).collect();
        let (leaves, rest): (Vec<_>, Vec<_>) = folders.into_iter().partition(|(id, _)| !parents.contains(id));
        if leaves.is_empty() {
            break;
        }
        for (id, _) in leaves {
            sqlx::query("DELETE FROM library_folders WHERE id = ?").bind(id).execute(pool).await.map_err(db)?;
        }
        folders = rest;
    }
    sqlx::query("DELETE FROM library_trash WHERE batch = ?").bind(batch).execute(pool).await.map_err(db)?;
    Ok(())
}

/// Empties the recycle bin.
pub async fn empty_bin(pool: &SqlitePool, vault_root: &Path) -> Result<usize> {
    let batches: Vec<String> = sqlx::query_scalar("SELECT batch FROM library_trash WHERE is_root = 1").fetch_all(pool).await.map_err(db)?;
    for batch in &batches {
        purge_batch(pool, vault_root, batch).await?;
    }
    Ok(batches.len())
}

/// Removes what has been in the bin for more than 30 days.
pub async fn purge_expired(pool: &SqlitePool, vault_root: &Path) -> Result<usize> {
    let old: Vec<String> = sqlx::query_scalar("SELECT batch FROM library_trash WHERE is_root = 1 AND deleted_at < ?").bind(now_ms() - BIN_DAYS * DAY_MS).fetch_all(pool).await.map_err(db)?;
    for batch in &old {
        purge_batch(pool, vault_root, batch).await?;
    }
    Ok(old.len())
}

/// Adds files and whole folders from the computer, keeping their structure. A folder that
/// meets one of the same name is merged into it; a file that meets one of its name is kept
/// beside it as "name (2)". One that cannot be read is reported and the rest carry on.
pub async fn import_paths(pool: &SqlitePool, vault_root: &Path, dest: &str, paths: &[PathBuf]) -> Result<ImportResult> {
    require_folder(pool, dest).await?;
    let mut result = ImportResult::default();
    for path in paths {
        import_one(pool, vault_root, dest, path, &mut result).await;
    }
    Ok(result)
}

fn import_one<'a>(pool: &'a SqlitePool, vault_root: &'a Path, dest: &'a str, path: &'a Path, result: &'a mut ImportResult) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send + 'a>> {
    Box::pin(async move {
        let shown = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned());
        if path.is_dir() {
            let Ok(name) = clean_name(&shown) else {
                result.failed.push(shown);
                return;
            };
            let existing: Option<String> = sqlx::query_scalar("SELECT id FROM library_folders WHERE parent_id IS ? AND lower(name) = lower(?)").bind(parent_key(dest)).bind(&name).fetch_optional(pool).await.ok().flatten();
            let folder_id = match existing {
                Some(id) => id,
                None => match create_folder(pool, dest, &name).await {
                    Ok(f) => {
                        result.folders += 1;
                        f.id
                    }
                    Err(_) => {
                        result.failed.push(shown);
                        return;
                    }
                },
            };
            let mut children: Vec<PathBuf> = match std::fs::read_dir(path) {
                Ok(rd) => rd.filter_map(|e| e.ok().map(|e| e.path())).collect(),
                Err(_) => {
                    result.failed.push(shown);
                    return;
                }
            };
            children.sort();
            for child in children {
                import_one(pool, vault_root, &folder_id, &child, result).await;
            }
        } else {
            let bytes = match std::fs::read(path) {
                Ok(b) => b,
                Err(_) => {
                    result.failed.push(shown);
                    return;
                }
            };
            let name = match clean_name(&shown) {
                Ok(n) => n,
                Err(_) => {
                    result.failed.push(shown);
                    return;
                }
            };
            let name = match free_file_name(pool, dest, &name).await {
                Ok(n) => n,
                Err(_) => {
                    result.failed.push(shown);
                    return;
                }
            };
            match attachments::add_attachment_bytes(pool, vault_root, ENTITY, dest, &name, &bytes).await {
                Ok(_) => result.files += 1,
                Err(_) => result.failed.push(shown),
            }
        }
    })
}

/// Adds one file whose bytes the window already holds (a file dropped in the browser view).
pub async fn add_file(pool: &SqlitePool, vault_root: &Path, dest: &str, name: &str, bytes: &[u8]) -> Result<LibraryEntry> {
    require_folder(pool, dest).await?;
    let name = free_file_name(pool, dest, &clean_name(name)?).await?;
    let a = attachments::add_attachment_bytes(pool, vault_root, ENTITY, dest, &name, bytes).await.map_err(|e| e.to_string())?;
    Ok(file_entry(a, None))
}

/// Writes a file, or a folder as a .zip with its structure, to `target`.
pub async fn export(pool: &SqlitePool, vault_root: &Path, kind: &str, id: &str, target: &Path) -> Result<()> {
    match kind {
        "file" => {
            library_file(pool, id).await?;
            let (_, bytes) = attachments::read_attachment(pool, vault_root, id).await.map_err(|e| e.to_string())?.ok_or("That file no longer exists.")?;
            std::fs::write(target, bytes).map_err(|e| e.to_string())
        }
        "folder" => {
            use std::io::Write;
            let (_, root_name) = folder_name(pool, id).await?.ok_or("That folder no longer exists.")?;
            let file = std::fs::File::create(target).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let mut stack = vec![(id.to_string(), root_name)];
            let mut seen = HashSet::new();
            while let Some((folder, prefix)) = stack.pop() {
                if !seen.insert(folder.clone()) {
                    continue;
                }
                zip.add_directory(format!("{prefix}/"), options).map_err(|e| e.to_string())?;
                for a in attachments::list_attachments(pool, ENTITY, &folder).await.map_err(db)? {
                    if let Some((_, bytes)) = attachments::read_attachment(pool, vault_root, &a.id).await.map_err(|e| e.to_string())? {
                        zip.start_file(format!("{prefix}/{}", a.file_name), options).map_err(|e| e.to_string())?;
                        zip.write_all(&bytes).map_err(|e| e.to_string())?;
                    }
                }
                let kids: Vec<(String, String)> = sqlx::query_as("SELECT id, name FROM library_folders WHERE parent_id = ?").bind(&folder).fetch_all(pool).await.map_err(db)?;
                for (kid, name) in kids {
                    stack.push((kid, format!("{prefix}/{name}")));
                }
            }
            zip.finish().map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => Err("Unknown kind.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_files(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    out.extend(vault_files(&p));
                } else {
                    out.push(p);
                }
            }
        }
        out
    }

    async fn setup() -> (SqlitePool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-library-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault = dir.join("vault");
        (crate::db::startup(&dir, vault.clone()).await.ok().unwrap().pool, vault)
    }

    #[tokio::test]
    async fn folders_nest_files_move_and_search_finds_them_by_path() {
        let (pool, vault) = setup().await;
        let cases = create_folder(&pool, ROOT, "Cases").await.unwrap();
        let odongo = create_folder(&pool, &cases.id, "Odongo").await.unwrap();
        assert!(create_folder(&pool, ROOT, "cases").await.is_err(), "names are unique without regard to case");
        let file = add_file(&pool, &vault, &odongo.id, "PF3 form.pdf", b"%PDF-1").await.unwrap();
        let same_again = add_file(&pool, &vault, &odongo.id, "PF3 form.pdf", b"%PDF-2").await.unwrap();
        assert_eq!(same_again.name, "PF3 form (2).pdf");

        let found = search(&pool, "odongo pf3").await.unwrap();
        assert_eq!(found.len(), 2);
        assert_eq!(found[0].path.as_deref(), Some("Cases / Odongo"));

        assert!(move_to(&pool, "folder", &cases.id, &odongo.id).await.is_err(), "a folder cannot enter its own child");
        let archive = create_folder(&pool, ROOT, "Archive").await.unwrap();
        move_to(&pool, "file", &file.id, &archive.id).await.unwrap();
        assert_eq!(list(&pool, &archive.id).await.unwrap().entries.len(), 1);
        assert_eq!(list(&pool, &odongo.id).await.unwrap().crumbs.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), ["Cases", "Odongo"]);

        rename(&pool, "file", &file.id, "PF3.pdf").await.unwrap();
        delete(&pool, "folder", &cases.id, "tester").await.unwrap();
        assert_eq!(list(&pool, ROOT).await.unwrap().entries.len(), 1, "only Archive is left");
        assert!(search(&pool, "odongo").await.unwrap().is_empty());
        assert!(add_file(&pool, &vault, &cases.id, "x.txt", b"x").await.is_err(), "nothing can be added into a binned folder");
        let held = bin(&pool, &vault).await.unwrap();
        assert_eq!((held.len(), held[0].item_count), (1, Some(2)), "the subfolder and the file left in it");
        pool.close().await;
    }

    #[tokio::test]
    async fn a_dropped_folder_keeps_its_structure_and_leaves_as_a_zip() {
        let (pool, vault) = setup().await;
        let src = std::env::temp_dir().join(format!("pleadli-library-src-{}", Uuid::new_v4())).join("Bundle");
        std::fs::create_dir_all(src.join("Photos")).unwrap();
        std::fs::write(src.join("note.txt"), "hello").unwrap();
        std::fs::write(src.join("Photos").join("a.jpg"), [1u8, 2, 3]).unwrap();

        let result = import_paths(&pool, &vault, ROOT, &[src.clone()]).await.unwrap();
        assert_eq!((result.files, result.folders, result.failed.len()), (2, 2, 0));
        let bundle = &list(&pool, ROOT).await.unwrap().entries[0];
        assert_eq!(bundle.name, "Bundle");
        assert_eq!(bundle.item_count, Some(2));

        let out = src.parent().unwrap().join("Bundle.zip");
        export(&pool, &vault, "folder", &bundle.id, &out).await.unwrap();
        let mut zip = zip::ZipArchive::new(std::fs::File::open(&out).unwrap()).unwrap();
        let mut names: Vec<String> = (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().to_string()).collect();
        names.sort();
        assert_eq!(names, ["Bundle/", "Bundle/Photos/", "Bundle/Photos/a.jpg", "Bundle/note.txt"]);
        pool.close().await;
    }
    #[tokio::test]
    async fn the_recycle_bin_restores_purges_and_empties_itself_after_thirty_days() {
        let (pool, vault) = setup().await;
        let cases = create_folder(&pool, ROOT, "Cases").await.unwrap();
        let sub = create_folder(&pool, &cases.id, "Odongo").await.unwrap();
        let file = add_file(&pool, &vault, &sub.id, "PF3.pdf", b"%PDF").await.unwrap();
        let stored = attachments::get_attachment(&pool, &file.id).await.unwrap().unwrap().stored_path;

        delete(&pool, "folder", &cases.id, "tester").await.unwrap();
        assert!(vault.join(&stored).exists(), "binning keeps the sealed file");
        // A binned file is deleted as far as the rest of the app is concerned: not listed, not searched, not exported.
        assert!(attachments::all_attachments(&pool).await.unwrap().iter().all(|a| a.id != file.id));
        assert!(attachments::list_all(&pool, "").await.unwrap().iter().all(|a| a.id != file.id));
        assert!(attachments::search_attachments(&pool, "PF3").await.unwrap().is_empty());
        let staging = std::env::temp_dir().join(format!("pleadli-staging-{}", Uuid::new_v4()));
        attachments::place_for_export(&pool, &vault, &staging).await.unwrap();
        assert!(!staging.exists() || vault_files(&staging).is_empty(), "nothing of it is exported");

        // Restore: everything comes back where it was, structure intact.
        let held = bin(&pool, &vault).await.unwrap();
        assert_eq!(held.len(), 1);
        restore(&pool, "folder", &cases.id).await.unwrap();
        assert!(bin(&pool, &vault).await.unwrap().is_empty());
        assert_eq!(search(&pool, "pf3").await.unwrap()[0].path.as_deref(), Some("Cases / Odongo"));

        // A name taken while it was in the bin: the restored one is "Cases (2)".
        delete(&pool, "folder", &cases.id, "tester").await.unwrap();
        create_folder(&pool, ROOT, "Cases").await.unwrap();
        restore(&pool, "folder", &cases.id).await.unwrap();
        let names: Vec<String> = list(&pool, ROOT).await.unwrap().entries.into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["Cases", "Cases (2)"]);

        // Permanent delete: the sealed file is shredded and every record is gone.
        delete(&pool, "folder", &cases.id, "tester").await.unwrap();
        purge(&pool, &vault, "folder", &cases.id).await.unwrap();
        assert!(!vault.join(&stored).exists());
        assert!(bin(&pool, &vault).await.unwrap().is_empty());
        assert!(attachments::get_attachment(&pool, &file.id).await.unwrap().is_none());

        // 30 days: an item older than that is removed when the bin is next looked at; a younger one stays.
        let old = add_file(&pool, &vault, ROOT, "old.txt", b"o").await.unwrap();
        let young = add_file(&pool, &vault, ROOT, "young.txt", b"y").await.unwrap();
        delete(&pool, "file", &old.id, "tester").await.unwrap();
        delete(&pool, "file", &young.id, "tester").await.unwrap();
        sqlx::query("UPDATE library_trash SET deleted_at = ? WHERE item_id = ?").bind(now_ms() - 31 * DAY_MS).bind(&old.id).execute(&pool).await.unwrap();
        let held = bin(&pool, &vault).await.unwrap();
        assert_eq!(held.iter().map(|b| b.name.as_str()).collect::<Vec<_>>(), ["young.txt"]);
        assert_eq!(empty_bin(&pool, &vault).await.unwrap(), 1);
        pool.close().await;
    }
}
