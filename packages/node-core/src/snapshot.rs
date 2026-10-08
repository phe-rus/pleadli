//! What an Orchestra backup holds, and restoring one (docs/platform/ORCHESTRA-BACKUP.md).
//!
//! Inside the encrypted file (`backup::BackupWriter`) is a plain sequence of
//! records: a description, the database exported plain (so whichever computer
//! restores it encrypts it under its own key), and each document under its
//! path relative to the application's document folder. The same shape as the
//! DPP passphrase backup, locked to the institution key instead.
//!
//! Restoring never touches the running database. It unpacks and checks the
//! backup into a staging folder and asks for a restart; the next start sets
//! the current data aside (kept) and puts the restored data in place, and the
//! ordinary startup then encrypts the plain database.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection, SqlitePool};

use crate::backup::{BackupError, BackupReader, BackupWriter};
use crate::vault;

const REC_END: u8 = 0;
const REC_META: u8 = 1;
const REC_DB: u8 = 2;
const REC_FILE: u8 = 3;

const PENDING: &str = "restore-pending";
const PENDING_PARTIAL: &str = "restore-pending.partial";
const KEEP_PRE_RESTORE: usize = 3;

/// Where an application keeps its documents, as the backup sees them: names
/// relative to one folder, read whole.
pub trait Documents: Send + Sync {
    fn list(&self) -> io::Result<Vec<String>>;
    fn open(&self, name: &str) -> io::Result<Box<dyn Read + Send>>;
}

/// Documents kept as ordinary files under one folder (the Police Vault).
pub struct FolderDocuments(pub PathBuf);

impl Documents for FolderDocuments {
    fn list(&self) -> io::Result<Vec<String>> {
        if !self.0.exists() {
            return Ok(Vec::new());
        }
        let mut names = Vec::new();
        for file in vault::walk(&self.0)? {
            if let Ok(rel) = file.strip_prefix(&self.0) {
                let parts: Vec<String> = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect();
                names.push(parts.join("/"));
            }
        }
        names.sort();
        Ok(names)
    }

    fn open(&self, name: &str) -> io::Result<Box<dyn Read + Send>> {
        Ok(Box::new(fs::File::open(self.0.join(safe_relative(name).ok_or_else(|| io::Error::other("bad name"))?))?))
    }
}

/// A name from a backup as a path that stays inside its folder, or nothing.
fn safe_relative(name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.contains('\\') || name.contains('\0') {
        return None;
    }
    let path = PathBuf::from(name);
    path.components().all(|c| matches!(c, Component::Normal(_))).then_some(path)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub app: String,
    pub created_at: i64,
    pub documents: i64,
    /// Documents that could not be read, and so are not in the backup.
    pub missing: i64,
    pub latest_migration: i64,
}

fn record_head(out: &mut impl Write, kind: u8, name: &str, len: u64) -> io::Result<()> {
    out.write_all(&[kind])?;
    out.write_all(&(name.len() as u16).to_be_bytes())?;
    out.write_all(name.as_bytes())?;
    out.write_all(&len.to_be_bytes())
}

/// Exports the live, keyed database plain to `tmp`. The caller destroys it.
async fn export_plain(pool: &SqlitePool, tmp: &Path) -> Result<(), BackupError> {
    let db = |e: sqlx::Error| BackupError::Io(io::Error::other(e));
    let mut conn = pool.acquire().await.map_err(db)?;
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut *conn).await;
    sqlx::query("ATTACH DATABASE ?1 AS plain KEY ''").bind(tmp.to_string_lossy().to_string()).execute(&mut *conn).await.map_err(db)?;
    let exported = sqlx::query("SELECT sqlcipher_export('plain')").execute(&mut *conn).await;
    let _ = sqlx::query("DETACH DATABASE plain").execute(&mut *conn).await;
    exported.map_err(db)?;
    Ok(())
}

/// Writes a whole backup (database and documents) to `out`, locked to the
/// institution key. The plain database copy lives only while it is read.
#[allow(clippy::too_many_arguments)]
pub async fn write<W: Write>(
    pool: &SqlitePool,
    documents: &dyn Documents,
    work_dir: &Path,
    institution: &x25519_dalek::PublicKey,
    app: &str,
    computer: &str,
    latest_migration: i64,
    out: W,
) -> Result<(Meta, u64), BackupError> {
    fs::create_dir_all(work_dir)?;
    let tmp = work_dir.join(format!("export-{}.sqlite", uuid::Uuid::new_v4()));
    let exported = export_plain(pool, &tmp).await;
    let result = match exported {
        Ok(()) => write_records(&tmp, documents, institution, app, computer, latest_migration, out),
        Err(e) => Err(e),
    };
    let _ = vault::shred_file(&tmp);
    result
}

fn write_records<W: Write>(db_file: &Path, documents: &dyn Documents, institution: &x25519_dalek::PublicKey, app: &str, computer: &str, latest_migration: i64, out: W) -> Result<(Meta, u64), BackupError> {
    let names = documents.list()?;
    // The description goes first so a restore can refuse before unpacking
    // anything large; a document that fails to open is counted, not fatal.
    let mut readable = Vec::new();
    let mut missing = 0;
    for name in names {
        match documents.open(&name) {
            Ok(_) => readable.push(name),
            Err(_) => missing += 1,
        }
    }
    let meta = Meta { app: app.to_string(), created_at: chrono::Utc::now().timestamp_millis(), documents: readable.len() as i64, missing, latest_migration };
    let mut w = BackupWriter::new(institution, app, computer, out)?;
    let json = serde_json::to_vec(&meta).map_err(|e| BackupError::Io(io::Error::other(e)))?;
    record_head(&mut w, REC_META, "meta", json.len() as u64)?;
    w.write_all(&json)?;
    let mut db = fs::File::open(db_file)?;
    record_head(&mut w, REC_DB, "db", db.metadata()?.len())?;
    io::copy(&mut db, &mut w)?;
    for name in &readable {
        // Read whole first, so the length written is the length that follows
        // even if the file changes in between.
        let mut bytes = Vec::new();
        documents.open(name)?.read_to_end(&mut bytes)?;
        record_head(&mut w, REC_FILE, name, bytes.len() as u64)?;
        w.write_all(&bytes)?;
    }
    record_head(&mut w, REC_END, "", 0)?;
    let (_, size) = w.finish()?;
    Ok((meta, size))
}

#[derive(Debug)]
pub enum RestoreError {
    /// The phrase is mistyped, or this backup was locked with another phrase.
    Phrase,
    /// Not a backup, or damaged.
    Unreadable,
    /// A backup of another application.
    WrongApp(String),
    /// Made by a newer version of the application.
    Newer,
    Io(io::Error),
}

impl std::fmt::Display for RestoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RestoreError::Phrase => write!(f, "the recovery phrase does not open this backup"),
            RestoreError::Unreadable => write!(f, "this is not an intact backup"),
            RestoreError::WrongApp(app) => write!(f, "this is a backup of Pleadli {app}"),
            RestoreError::Newer => write!(f, "this backup was made by a newer version; update first"),
            RestoreError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<io::Error> for RestoreError {
    fn from(e: io::Error) -> Self {
        if e.kind() == io::ErrorKind::InvalidData {
            RestoreError::Unreadable
        } else {
            RestoreError::Io(e)
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Staged {
    pub created_at: i64,
    pub computer: String,
    pub documents: i64,
    pub missing: i64,
}

/// Opens a backup with the recovery phrase, unpacks it into a staging folder
/// and checks it can be restored here (`required_tables` must all be in its
/// database). Nothing live is touched; a restart applies it.
pub async fn stage(data_dir: &Path, input: impl Read, phrase: &str, app: &str, latest_migration: i64, required_tables: &[&str]) -> Result<Staged, RestoreError> {
    let entropy = crate::backup::read_recovery_phrase(phrase).map_err(|_| RestoreError::Phrase)?;
    let secret = crate::backup::institution_key(&entropy);
    let reader = match BackupReader::open(&secret, input) {
        Ok(r) => r,
        Err(BackupError::WrongKey) => return Err(RestoreError::Phrase),
        Err(BackupError::Io(e)) if e.kind() != io::ErrorKind::UnexpectedEof => return Err(RestoreError::Io(e)),
        Err(_) => return Err(RestoreError::Unreadable),
    };
    let computer = reader.header().computer.clone();
    let partial = data_dir.join(PENDING_PARTIAL);
    let pending = data_dir.join(PENDING);
    let _ = remove_tree(&partial);
    fs::create_dir_all(partial.join("files"))?;
    match unpack(&partial, reader, app, latest_migration, required_tables).await {
        Ok(meta) => {
            let _ = remove_tree(&pending);
            fs::rename(&partial, &pending)?;
            fs::write(pending.join("ready"), b"1")?;
            Ok(Staged { created_at: meta.created_at, computer, documents: meta.documents, missing: meta.missing })
        }
        Err(e) => {
            let _ = remove_tree(&partial);
            Err(e)
        }
    }
}

fn take(r: &mut impl Read, n: usize) -> Result<Vec<u8>, RestoreError> {
    let mut buf = vec![0u8; n];
    r.read_exact(&mut buf).map_err(|e| if e.kind() == io::ErrorKind::UnexpectedEof { RestoreError::Unreadable } else { e.into() })?;
    Ok(buf)
}

fn copy_exact(r: &mut impl Read, len: u64, to: &Path) -> Result<(), RestoreError> {
    let mut file = fs::File::create(to)?;
    let copied = io::copy(&mut r.take(len), &mut file)?;
    if copied != len {
        return Err(RestoreError::Unreadable);
    }
    Ok(())
}

async fn unpack<R: Read>(dir: &Path, mut reader: BackupReader<R>, app: &str, latest_migration: i64, required_tables: &[&str]) -> Result<Meta, RestoreError> {
    let mut meta: Option<Meta> = None;
    let mut have_db = false;
    loop {
        let kind = take(&mut reader, 1)?[0];
        let name_len = u16::from_be_bytes(take(&mut reader, 2)?.try_into().unwrap()) as usize;
        let name = String::from_utf8(take(&mut reader, name_len)?).map_err(|_| RestoreError::Unreadable)?;
        let len = u64::from_be_bytes(take(&mut reader, 8)?.try_into().unwrap());
        match kind {
            REC_END => break,
            REC_META => {
                let m: Meta = serde_json::from_slice(&take(&mut reader, len.min(64 * 1024) as usize)?).map_err(|_| RestoreError::Unreadable)?;
                // Refuse early, before anything large is unpacked.
                if m.app != app {
                    return Err(RestoreError::WrongApp(m.app));
                }
                if m.latest_migration > latest_migration {
                    return Err(RestoreError::Newer);
                }
                meta = Some(m);
            }
            REC_DB => {
                copy_exact(&mut reader, len, &dir.join("db.sqlite"))?;
                have_db = true;
            }
            REC_FILE => {
                let rel = safe_relative(&name).ok_or(RestoreError::Unreadable)?;
                let to = dir.join("files").join(rel);
                if let Some(parent) = to.parent() {
                    fs::create_dir_all(parent)?;
                }
                copy_exact(&mut reader, len, &to)?;
            }
            _ => return Err(RestoreError::Unreadable),
        }
    }
    // Read to the end: only then is the last chunk checked, so a cut-short
    // file is refused rather than half restored.
    let mut rest = Vec::new();
    reader.read_to_end(&mut rest)?;
    if !rest.is_empty() {
        return Err(RestoreError::Unreadable);
    }
    let meta = meta.ok_or(RestoreError::Unreadable)?;
    if !have_db {
        return Err(RestoreError::Unreadable);
    }

    let opts = sqlx::sqlite::SqliteConnectOptions::new().filename(dir.join("db.sqlite")).create_if_missing(false).read_only(true);
    let mut conn = SqliteConnection::connect_with(&opts).await.map_err(|_| RestoreError::Unreadable)?;
    let check: Vec<String> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(&mut conn).await.unwrap_or_default();
    let mut found = 0;
    for table in required_tables.iter().chain(["_sqlx_migrations"].iter()) {
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?").bind(table).fetch_one(&mut conn).await.unwrap_or(0);
        found += n;
    }
    let _ = conn.close().await;
    if check != ["ok"] || found != required_tables.len() as i64 + 1 {
        return Err(RestoreError::Unreadable);
    }
    Ok(meta)
}

/// Whether a restore is staged and waiting for the next start.
pub fn pending(data_dir: &Path) -> bool {
    data_dir.join(PENDING).join("ready").exists()
}

/// Throws away a staged restore that has not been applied.
pub fn cancel(data_dir: &Path) -> io::Result<()> {
    remove_tree(&data_dir.join(PENDING))
}

fn remove_tree(path: &Path) -> io::Result<()> {
    if path.exists() {
        for file in vault::walk(path)? {
            let _ = vault::shred_file(&file);
        }
        fs::remove_dir_all(path)?;
    }
    Ok(())
}

/// Moves a file or folder, copying when it is on another drive.
fn move_path(from: &Path, to: &Path) -> io::Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    if from.is_dir() {
        for file in vault::walk(from)? {
            let rel = file.strip_prefix(from).map_err(io::Error::other)?;
            let dest = to.join(rel);
            if let Some(parent) = dest.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&file, &dest)?;
        }
        fs::remove_dir_all(from)
    } else {
        fs::copy(from, to)?;
        fs::remove_file(from)
    }
}

fn keep_newest(dir: &Path) {
    if let Ok(read) = fs::read_dir(dir) {
        let mut entries: Vec<PathBuf> = read.flatten().map(|e| e.path()).collect();
        entries.sort();
        // A database and a document folder per restore.
        while entries.len() > KEEP_PRE_RESTORE * 2 {
            let oldest = entries.remove(0);
            let _ = if oldest.is_dir() { remove_tree(&oldest) } else { vault::shred_file(&oldest) };
        }
    }
}

#[derive(Debug)]
pub struct Applied {
    pub documents: usize,
}

/// Runs first at start, before the database is opened. Sets the current
/// database and document folder aside under `pre-restore` (the database
/// still encrypted) and puts the staged backup in place; the plain database
/// is encrypted by the ordinary startup that follows.
pub fn apply_pending(data_dir: &Path, db_path: &Path, documents_root: &Path) -> io::Result<Option<Applied>> {
    if !pending(data_dir) {
        let _ = remove_tree(&data_dir.join(PENDING));
        let _ = remove_tree(&data_dir.join(PENDING_PARTIAL));
        return Ok(None);
    }
    let staged = data_dir.join(PENDING);
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let aside = data_dir.join("pre-restore");
    fs::create_dir_all(&aside)?;
    let db_name = db_path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "database".into());

    if db_path.exists() {
        fs::rename(db_path, aside.join(format!("{stamp}-{db_name}.db")))?;
    }
    for suffix in ["-wal", "-shm"] {
        let mut name = db_path.as_os_str().to_owned();
        name.push(suffix);
        let _ = fs::remove_file(PathBuf::from(name));
    }
    if documents_root.exists() {
        move_path(documents_root, &aside.join(format!("{stamp}-documents")))?;
    }
    keep_newest(&aside);

    fs::rename(staged.join("db.sqlite"), db_path)?;
    fs::create_dir_all(documents_root)?;
    let files = staged.join("files");
    let mut documents = 0;
    for file in vault::walk(&files)? {
        let rel = file.strip_prefix(&files).map_err(io::Error::other)?;
        let dest = documents_root.join(rel);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)?;
        }
        move_path(&file, &dest)?;
        documents += 1;
    }
    remove_tree(&staged)?;
    Ok(Some(Applied { documents }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::institution_key;

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("pleadli-snapshot-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    const PHRASE_ENTROPY: [u8; 16] = [3u8; 16];

    fn phrase() -> String {
        // The phrase for PHRASE_ENTROPY, written as the browser does.
        use sha2::{Digest, Sha256};
        let mut all = PHRASE_ENTROPY.to_vec();
        all.extend_from_slice(&Sha256::digest(PHRASE_ENTROPY)[..4]);
        let alphabet = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
        let (mut bits, mut value, mut out) = (0u32, 0u32, String::new());
        for b in all {
            value = (value << 8) | b as u32;
            bits += 8;
            while bits >= 5 {
                out.push(alphabet[((value >> (bits - 5)) & 31) as usize] as char);
                bits -= 5;
            }
        }
        out
    }

    #[tokio::test]
    async fn a_backup_restores_on_another_computer_with_the_phrase_only() {
        let a = dir();
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect_with(crate::db::connect_options(&a.join("a.db"))).await.unwrap();
        sqlx::query("CREATE TABLE cases (id TEXT, note TEXT)").execute(&pool).await.unwrap();
        sqlx::query("CREATE TABLE _sqlx_migrations (version INTEGER)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cases VALUES ('c1', 'Secret Name')").execute(&pool).await.unwrap();
        let docs = a.join("vault");
        fs::create_dir_all(docs.join("2026/10")).unwrap();
        fs::write(docs.join("2026/10/statement.pdf"), b"the statement").unwrap();

        let public = x25519_dalek::PublicKey::from(&institution_key(&PHRASE_ENTROPY));
        let mut file = Vec::new();
        let (meta, size) = write(&pool, &FolderDocuments(docs.clone()), &a.join("work"), &public, "police", "pc1", 31, &mut file).await.unwrap();
        pool.close().await;
        assert_eq!((meta.documents, size as usize), (1, file.len()));
        assert!(!file.windows(11).any(|w| w == b"Secret Name"));
        assert!(fs::read_dir(a.join("work")).unwrap().next().is_none(), "the plain export was destroyed");

        let b = dir();
        assert!(matches!(stage(&b, &file[..], "AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA", "police", 31, &["cases"]).await, Err(RestoreError::Phrase)));
        assert!(matches!(stage(&b, &file[..], &phrase(), "dpp", 31, &["cases"]).await, Err(RestoreError::WrongApp(_))));
        assert!(matches!(stage(&b, &file[..], &phrase(), "police", 30, &["cases"]).await, Err(RestoreError::Newer)));
        assert!(stage(&b, &file[..file.len() - 5], &phrase(), "police", 31, &["cases"]).await.is_err(), "cut short");
        assert!(!pending(&b));
        let staged = stage(&b, &file[..], &phrase(), "police", 31, &["cases"]).await.unwrap();
        assert_eq!((staged.documents, staged.computer.as_str()), (1, "pc1"));
        assert!(pending(&b));

        let (db_path, root) = (b.join("police.db"), b.join("Pleadli Police"));
        fs::write(&db_path, b"the old database").unwrap();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("old.txt"), b"old").unwrap();
        let applied = apply_pending(&b, &db_path, &root).unwrap().unwrap();
        assert_eq!(applied.documents, 1);
        assert_eq!(fs::read(root.join("2026/10/statement.pdf")).unwrap(), b"the statement");
        assert!(!root.join("old.txt").exists());
        assert_eq!(fs::read_dir(b.join("pre-restore")).unwrap().count(), 2, "the old database and documents are kept");
        let back = sqlx::sqlite::SqlitePoolOptions::new().connect_with(crate::db::connect_options(&db_path)).await.unwrap();
        let note: String = sqlx::query_scalar("SELECT note FROM cases").fetch_one(&back).await.unwrap();
        back.close().await;
        assert_eq!(note, "Secret Name");
        assert!(!pending(&b));
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }

    #[test]
    fn names_cannot_climb_out() {
        assert!(safe_relative("a/b.pdf").is_some());
        for bad in ["", "../x", "/etc/passwd", "a/../../x", "a\\b", "./a"] {
            assert!(safe_relative(bad).is_none(), "{bad}");
        }
    }
}
