//! Backup, verification, restore and startup recovery
//! (docs/prisons/product-map/04 "Production readiness", W17).
//!
//! A backup is one file: a consistent snapshot of the SQLite database
//! (`VACUUM INTO`, safe while the node is running) plus every file in the
//! vault, described by a manifest of SHA-256 hashes, encrypted end to end with
//! ChaCha20-Poly1305 (chunked STREAM construction) under a key derived from a
//! recovery passphrase the Officer in Charge keeps offline. The file header
//! carries the salt, so a brand new machine can restore with the passphrase
//! alone. Nothing is ever deleted by a restore: the database being replaced is
//! moved aside, and vault files are only added.
//!
//! The database and the vault are encrypted at rest under keys that belong to
//! one machine (`keys.rs`). A backup has to open on a different machine, so
//! inside the archive the database is a plain SQLite file and each document is
//! its plain bytes; the archive's own passphrase encryption is what protects
//! them. A restore unpacks them as plaintext, and the next start encrypts the
//! database and seals the documents under the new machine's keys (`db.rs`,
//! `vault.rs`) before destroying the plaintext.

use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use argon2::Argon2;
use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::KeyInit;
use chacha20poly1305::ChaCha20Poly1305;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;

const MAGIC: &[u8; 10] = b"PLEADLIBK1";
const SALT_LEN: usize = 16;
const STREAM_NONCE_LEN: usize = 7;
const CHUNK: usize = 64 * 1024;
const MAX_FRAME: usize = CHUNK + 64;
const FILE_PREFIX: &str = "pleadli-backup-";
const FILE_SUFFIX: &str = ".pbk";
pub const MIN_PASSPHRASE_LEN: usize = 10;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[derive(Debug)]
pub enum BackupError {
    Db(sqlx::Error),
    Io(io::Error),
    /// The file is not a Pleadli backup, is damaged, or the passphrase is
    /// wrong. These cannot be told apart from authenticated encryption, and
    /// that is intended.
    Unreadable,
    /// The archive decrypted but does not match its own manifest, or holds an
    /// unsafe path, or the database inside it fails an integrity check.
    Inconsistent(String),
    NotConfigured,
    WeakPassphrase,
}

impl From<sqlx::Error> for BackupError {
    fn from(e: sqlx::Error) -> Self {
        BackupError::Db(e)
    }
}

impl From<io::Error> for BackupError {
    fn from(e: io::Error) -> Self {
        BackupError::Io(e)
    }
}

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    pub backup_dir: Option<String>,
    pub backup_interval_hours: i64,
    pub backup_retention: i64,
    pub last_backup_at: Option<i64>,
    pub last_backup_status: Option<String>,
    pub last_backup_error: Option<String>,
    /// Whether a recovery passphrase has been set, so backups can run.
    #[sqlx(skip)]
    pub configured: bool,
    /// The folder backups actually go to (the default when none is chosen).
    #[sqlx(skip)]
    pub effective_dir: String,
}

pub fn default_backup_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("backups")
}

pub async fn get_config(pool: &SqlitePool, data_dir: &Path) -> Result<BackupConfig, sqlx::Error> {
    let mut config = sqlx::query_as::<_, BackupConfig>(
        "SELECT backup_dir, backup_interval_hours, backup_retention, last_backup_at, last_backup_status, last_backup_error
         FROM node_config WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await?;
    let key: Option<String> = sqlx::query_scalar("SELECT backup_key FROM node_config WHERE id = 'default'").fetch_one(pool).await?;
    config.configured = key.is_some();
    config.effective_dir = config
        .backup_dir
        .clone()
        .filter(|d| !d.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_backup_dir(data_dir))
        .to_string_lossy()
        .to_string();
    Ok(config)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBackupConfigInput {
    pub backup_dir: Option<String>,
    pub interval_hours: i64,
    pub retention: i64,
    /// Setting or changing the recovery passphrase. Required the first time.
    pub passphrase: Option<String>,
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], BackupError> {
    let mut key = [0u8; 32];
    Argon2::default().hash_password_into(passphrase.as_bytes(), salt, &mut key).map_err(|_| BackupError::Unreadable)?;
    Ok(key)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 {
        return None;
    }
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok()).collect()
}

pub async fn save_config(
    conn: &mut SqliteConnection,
    actor: &Actor,
    input: SaveBackupConfigInput,
) -> Result<(), BackupError> {
    let interval = input.interval_hours.clamp(1, 24 * 30);
    let retention = input.retention.clamp(1, 365);
    let dir = input.backup_dir.map(|d| d.trim().to_string()).filter(|d| !d.is_empty());

    sqlx::query("UPDATE node_config SET backup_dir = ?, backup_interval_hours = ?, backup_retention = ? WHERE id = 'default'")
        .bind(&dir)
        .bind(interval)
        .bind(retention)
        .execute(&mut *conn)
        .await?;

    let mut passphrase_changed = false;
    if let Some(passphrase) = input.passphrase.as_deref().filter(|p| !p.is_empty()) {
        if passphrase.chars().count() < MIN_PASSPHRASE_LEN {
            return Err(BackupError::WeakPassphrase);
        }
        let mut salt = [0u8; SALT_LEN];
        OsRng.fill_bytes(&mut salt);
        let key = derive_key(passphrase, &salt)?;
        sqlx::query("UPDATE node_config SET backup_salt = ?, backup_key = ? WHERE id = 'default'")
            .bind(hex(&salt))
            .bind(hex(&key))
            .execute(&mut *conn)
            .await?;
        passphrase_changed = true;
    } else {
        let key: Option<String> = sqlx::query_scalar("SELECT backup_key FROM node_config WHERE id = 'default'").fetch_one(&mut *conn).await?;
        if key.is_none() {
            return Err(BackupError::NotConfigured);
        }
    }

    // The passphrase and key are never written to the audit trail.
    audit::record(
        conn,
        actor,
        AuditEntry::new("system.backup_configured", "node_config", Some("default")).after(&serde_json::json!({
            "backupDir": dir,
            "intervalHours": interval,
            "retention": retention,
            "passphraseChanged": passphrase_changed,
        })),
    )
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------
// The encrypted container
// ---------------------------------------------------------------------

struct ChunkWriter<W: Write> {
    inner: W,
    enc: Option<EncryptorBE32<ChaCha20Poly1305>>,
    buf: Vec<u8>,
}

impl<W: Write> ChunkWriter<W> {
    fn new(mut inner: W, key: &[u8; 32], salt: &[u8; SALT_LEN]) -> io::Result<Self> {
        let mut nonce = [0u8; STREAM_NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        inner.write_all(MAGIC)?;
        inner.write_all(salt)?;
        inner.write_all(&nonce)?;
        let cipher = ChaCha20Poly1305::new(key.into());
        Ok(ChunkWriter { inner, enc: Some(EncryptorBE32::from_aead(cipher, &nonce.into())), buf: Vec::with_capacity(CHUNK * 2) })
    }

    fn frame(&mut self, ciphertext: &[u8]) -> io::Result<()> {
        self.inner.write_all(&(ciphertext.len() as u32).to_be_bytes())?;
        self.inner.write_all(ciphertext)
    }

    fn finish(mut self) -> io::Result<W> {
        let enc = self.enc.take().expect("finish once");
        let last = enc.encrypt_last(&self.buf[..]).map_err(|_| io::Error::other("encryption failed"))?;
        self.frame(&last)?;
        self.inner.flush()?;
        Ok(self.inner)
    }
}

impl<W: Write> Write for ChunkWriter<W> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.buf.extend_from_slice(data);
        // Keep at least one byte back so the final frame is always the
        // "last" one, however the input divides into chunks.
        while self.buf.len() > CHUNK {
            let chunk: Vec<u8> = self.buf.drain(..CHUNK).collect();
            let ct = self.enc.as_mut().expect("not finished").encrypt_next(&chunk[..]).map_err(|_| io::Error::other("encryption failed"))?;
            self.frame(&ct)?;
        }
        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct ChunkReader<R: Read> {
    inner: R,
    dec: Option<DecryptorBE32<ChaCha20Poly1305>>,
    pending: Option<Vec<u8>>,
    plain: Vec<u8>,
    pos: usize,
}

fn read_frame<R: Read>(inner: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut len = [0u8; 4];
    match inner.read_exact(&mut len) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_be_bytes(len) as usize;
    if len == 0 || len > MAX_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "bad frame"));
    }
    let mut ct = vec![0u8; len];
    inner.read_exact(&mut ct)?;
    Ok(Some(ct))
}

impl<R: Read> ChunkReader<R> {
    /// Reads the header and the first frame. Returns the salt too, so the
    /// caller can derive the key before constructing the reader.
    fn read_header(inner: &mut R) -> Result<([u8; SALT_LEN], [u8; STREAM_NONCE_LEN]), BackupError> {
        let mut magic = [0u8; MAGIC.len()];
        inner.read_exact(&mut magic).map_err(|_| BackupError::Unreadable)?;
        if &magic != MAGIC {
            return Err(BackupError::Unreadable);
        }
        let mut salt = [0u8; SALT_LEN];
        let mut nonce = [0u8; STREAM_NONCE_LEN];
        inner.read_exact(&mut salt).map_err(|_| BackupError::Unreadable)?;
        inner.read_exact(&mut nonce).map_err(|_| BackupError::Unreadable)?;
        Ok((salt, nonce))
    }

    fn new(mut inner: R, key: &[u8; 32], nonce: [u8; STREAM_NONCE_LEN]) -> Result<Self, BackupError> {
        let pending = read_frame(&mut inner).map_err(|_| BackupError::Unreadable)?;
        let cipher = ChaCha20Poly1305::new(key.into());
        Ok(ChunkReader { inner, dec: Some(DecryptorBE32::from_aead(cipher, &nonce.into())), pending, plain: Vec::new(), pos: 0 })
    }

    fn fill(&mut self) -> io::Result<bool> {
        let Some(current) = self.pending.take() else { return Ok(false) };
        let ahead = read_frame(&mut self.inner).map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "unreadable backup"))?;
        let bad = || io::Error::new(io::ErrorKind::InvalidData, "wrong passphrase or damaged backup");
        self.plain = match ahead {
            Some(next) => {
                let plain = self.dec.as_mut().ok_or_else(bad)?.decrypt_next(&current[..]).map_err(|_| bad())?;
                self.pending = Some(next);
                plain
            }
            None => self.dec.take().ok_or_else(bad)?.decrypt_last(&current[..]).map_err(|_| bad())?,
        };
        self.pos = 0;
        Ok(true)
    }
}

impl<R: Read> Read for ChunkReader<R> {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        while self.pos >= self.plain.len() {
            if !self.fill()? {
                return Ok(0);
            }
        }
        let n = out.len().min(self.plain.len() - self.pos);
        out[..n].copy_from_slice(&self.plain[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

// ---------------------------------------------------------------------
// The archive inside
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestFile {
    pub path: String,
    pub size: u64,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format: u32,
    pub app_version: String,
    pub created_at: i64,
    pub schema_version: i64,
    pub audit_entries: i64,
    pub audit_head: String,
    pub files: Vec<ManifestFile>,
}

fn sha256_file(path: &Path) -> io::Result<(String, u64)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut size = 0u64;
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok((hex(&hasher.finalize()), size))
}

fn walk_files(root: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !root.exists() {
        return Ok(files);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let file_type = entry.file_type()?;
            if file_type.is_dir() {
                stack.push(entry.path());
            } else if file_type.is_file() {
                files.push(entry.path());
            }
        }
    }
    files.sort();
    Ok(files)
}

fn write_entry<W: Write>(out: &mut W, name: &str, source: &mut impl Read, size: u64) -> io::Result<()> {
    let name_bytes = name.as_bytes();
    out.write_all(&(name_bytes.len() as u16).to_be_bytes())?;
    out.write_all(name_bytes)?;
    out.write_all(&size.to_be_bytes())?;
    let copied = io::copy(&mut source.take(size), out)?;
    if copied != size {
        return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "file changed while backing up"));
    }
    Ok(())
}

/// Only plain relative names inside the archive are ever written to disk.
fn safe_relative(name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') || name.contains(':') {
        return None;
    }
    let mut path = PathBuf::new();
    for part in name.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return None;
        }
        path.push(part);
    }
    Some(path)
}

// ---------------------------------------------------------------------
// Creating a backup
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: i64,
}

/// Writes a plain (unencrypted) SQLite copy of `sealed` at `plain`, for the
/// archive. `sealed` is a `VACUUM INTO` copy of the live database, so it is
/// under this node's key, unless the node runs unkeyed (tests), in which case it
/// is already plain and is just moved.
async fn export_plain(sealed: &Path, plain: &Path) -> Result<(), BackupError> {
    use sqlx::Connection;
    if crate::db::is_plaintext(sealed) {
        fs::rename(sealed, plain).or_else(|_| fs::copy(sealed, plain).map(|_| ()))?;
        return Ok(());
    }
    let _ = fs::remove_file(plain);
    let mut conn = SqliteConnection::connect_with(&crate::db::keyed_options(sealed, super::keys::current())).await?;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&mut conn).await?;
    sqlx::query("ATTACH DATABASE ?1 AS plain KEY ''").bind(plain.to_string_lossy().to_string()).execute(&mut conn).await?;
    sqlx::query("SELECT sqlcipher_export('plain')").execute(&mut conn).await?;
    sqlx::query(sqlx::AssertSqlSafe(format!("PRAGMA plain.user_version = {version}"))).execute(&mut conn).await?;
    sqlx::query("DETACH DATABASE plain").execute(&mut conn).await?;
    conn.close().await?;
    Ok(())
}

/// Writes one archive: the manifest, then each file in `files`.
fn write_archive(
    files: &[(String, PathBuf)],
    partial: &Path,
    key: &[u8; 32],
    salt: &[u8; SALT_LEN],
    created_at: i64,
    schema_version: i64,
    chain: &audit::ChainStatus,
) -> Result<u64, BackupError> {
        let mut manifest_files = Vec::with_capacity(files.len());
        for (name, path) in files {
            let (sha256, size) = sha256_file(path)?;
            manifest_files.push(ManifestFile { path: name.clone(), size, sha256 });
        }
        let manifest = Manifest {
            format: 1,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            created_at,
            schema_version,
            audit_entries: chain.checked,
            audit_head: chain.head_hash.clone(),
            files: manifest_files,
        };
        let manifest_bytes = serde_json::to_vec(&manifest).map_err(|e| BackupError::Io(io::Error::other(e)))?;

        let file = File::create(partial)?;
        let mut writer = ChunkWriter::new(BufWriter::new(file), key, salt)?;
        write_entry(&mut writer, "manifest.json", &mut &manifest_bytes[..], manifest_bytes.len() as u64)?;
        for ((name, path), listed) in files.iter().zip(&manifest.files) {
            let mut source = File::open(path)?;
            write_entry(&mut writer, name, &mut source, listed.size)?;
        }
        // End-of-archive marker: a zero-length name.
        writer.write_all(&0u16.to_be_bytes())?;
        let mut inner = writer.finish()?;
        inner.flush()?;
        let file = inner.into_inner().map_err(|e| BackupError::Io(e.into_error()))?;
        file.sync_all()?;
        Ok(fs::metadata(partial)?.len())
}

/// Snapshots the database and writes one encrypted backup file into `dir`.
/// Safe while the node is serving requests.
pub async fn create_backup(
    pool: &SqlitePool,
    data_dir: &Path,
    vault_root: &Path,
    dir: &Path,
) -> Result<BackupInfo, BackupError> {
    let (salt_hex, key_hex): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT backup_salt, backup_key FROM node_config WHERE id = 'default'").fetch_one(pool).await?;
    let (Some(salt_hex), Some(key_hex)) = (salt_hex, key_hex) else { return Err(BackupError::NotConfigured) };
    let salt: [u8; SALT_LEN] = unhex(&salt_hex).and_then(|v| v.try_into().ok()).ok_or(BackupError::NotConfigured)?;
    let key: [u8; 32] = unhex(&key_hex).and_then(|v| v.try_into().ok()).ok_or(BackupError::NotConfigured)?;

    let tmp_dir = data_dir.join("backup-tmp");
    fs::create_dir_all(&tmp_dir)?;
    fs::create_dir_all(dir)?;
    let snapshot = tmp_dir.join(format!("db-{}.sqlite", uuid::Uuid::new_v4()));

    // `VACUUM INTO` is consistent while the node serves requests, and writes the
    // copy under the same key. The archive needs a portable, plain one.
    let sealed_snapshot = tmp_dir.join(format!("db-{}.sealed", uuid::Uuid::new_v4()));
    sqlx::query("VACUUM INTO ?1").bind(sealed_snapshot.to_string_lossy().to_string()).execute(pool).await?;
    let exported = export_plain(&sealed_snapshot, &snapshot).await;
    let _ = crate::domain::vault::shred_file(&sealed_snapshot);
    exported?;

    let schema_version: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations").fetch_one(pool).await?;
    let chain = audit::verify_chain(pool).await?;
    let created_at = now_ms();
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let file_name = format!("{FILE_PREFIX}{stamp}-{}{FILE_SUFFIX}", &uuid::Uuid::new_v4().to_string()[..8]);
    let final_path = dir.join(&file_name);
    let partial_path = dir.join(format!("{file_name}.partial"));

    let vault_root = vault_root.to_path_buf();
    let snapshot_for_task = snapshot.clone();
    let partial_for_task = partial_path.clone();

    let scratch_dir = tmp_dir.clone();
    let outcome = tokio::task::spawn_blocking(move || -> Result<u64, BackupError> {
        let mut files: Vec<(String, PathBuf)> = vec![("db.sqlite".to_string(), snapshot_for_task.clone())];
        let mut plain_copies: Vec<PathBuf> = Vec::new();
        let listed = (|| -> Result<(), BackupError> {
            for path in walk_files(&vault_root)? {
                let relative = path.strip_prefix(&vault_root).map_err(|_| BackupError::Unreadable)?;
                let name = relative.to_string_lossy().replace('\\', "/");
                if name.ends_with(".partial") {
                    continue;
                }
                match name.strip_suffix(".enc") {
                    // A sealed document goes into the archive as its plain bytes.
                    Some(plain_name) => {
                        let id = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.split('.').next()).unwrap_or_default().to_string();
                        let bytes = crate::domain::vault::open_bytes(&id, &fs::read(&path)?).map_err(|_| BackupError::Inconsistent(format!("{name} could not be opened from the vault")))?;
                        let copy = scratch_dir.join(format!("vault-{}", uuid::Uuid::new_v4()));
                        fs::write(&copy, bytes)?;
                        plain_copies.push(copy.clone());
                        files.push((format!("vault/{plain_name}"), copy));
                    }
                    // Anything else is an older plaintext file not yet sealed: keep it.
                    None => files.push((format!("vault/{name}"), path)),
                }
            }
            Ok(())
        })();
        if let Err(e) = listed {
            for copy in &plain_copies {
                let _ = crate::domain::vault::shred_file(copy);
            }
            return Err(e);
        }
        let result = write_archive(&files, &partial_for_task, &key, &salt, created_at, schema_version, &chain);
        for copy in &plain_copies {
            let _ = crate::domain::vault::shred_file(copy);
        }
        result
    })
    .await
    .map_err(|e| BackupError::Io(io::Error::other(e)))?;

    let _ = crate::domain::vault::shred_file(&snapshot);
    let size = match outcome {
        Ok(size) => size,
        Err(e) => {
            let _ = fs::remove_file(&partial_path);
            return Err(e);
        }
    };
    fs::rename(&partial_path, &final_path)?;

    Ok(BackupInfo { file_name, path: final_path.to_string_lossy().to_string(), size_bytes: size, created_at })
}

pub fn list_backups(dir: &Path) -> io::Result<Vec<BackupInfo>> {
    let mut backups = Vec::new();
    if !dir.exists() {
        return Ok(backups);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !(name.starts_with(FILE_PREFIX) && name.ends_with(FILE_SUFFIX)) {
            continue;
        }
        let meta = entry.metadata()?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        backups.push(BackupInfo { file_name: name, path: entry.path().to_string_lossy().to_string(), size_bytes: meta.len(), created_at: modified });
    }
    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(backups)
}

/// Removes the oldest backups this node created beyond `retention`.
pub fn prune(dir: &Path, retention: usize) -> io::Result<usize> {
    let backups = list_backups(dir)?;
    let mut removed = 0;
    for old in backups.into_iter().skip(retention) {
        fs::remove_file(&old.path)?;
        removed += 1;
    }
    Ok(removed)
}

// ---------------------------------------------------------------------
// Reading a backup: verify, and stage a restore
// ---------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub created_at: i64,
    pub app_version: String,
    pub schema_version: i64,
    pub files: usize,
    pub audit_entries: i64,
}

/// Decrypts and unpacks a backup into `target`, checking every file against
/// the manifest as it is written. Nothing outside `target` is touched.
fn unpack(path: &Path, passphrase: &str, target: &Path) -> Result<Manifest, BackupError> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let (salt, nonce) = ChunkReader::<BufReader<File>>::read_header(&mut reader)?;
    let key = derive_key(passphrase, &salt)?;
    let mut stream = ChunkReader::new(reader, &key, nonce)?;

    let mut manifest: Option<Manifest> = None;
    let mut seen = std::collections::HashSet::new();

    loop {
        let mut len = [0u8; 2];
        stream.read_exact(&mut len).map_err(|_| BackupError::Unreadable)?;
        let name_len = u16::from_be_bytes(len) as usize;
        if name_len == 0 {
            break;
        }
        let mut name = vec![0u8; name_len];
        stream.read_exact(&mut name).map_err(|_| BackupError::Unreadable)?;
        let name = String::from_utf8(name).map_err(|_| BackupError::Inconsistent("a file name is not text".into()))?;
        let mut size = [0u8; 8];
        stream.read_exact(&mut size).map_err(|_| BackupError::Unreadable)?;
        let size = u64::from_be_bytes(size);

        if name == "manifest.json" {
            if size > 64 * 1024 * 1024 {
                return Err(BackupError::Inconsistent("manifest is too large".into()));
            }
            let mut bytes = vec![0u8; size as usize];
            stream.read_exact(&mut bytes).map_err(|_| BackupError::Unreadable)?;
            manifest = Some(serde_json::from_slice(&bytes).map_err(|_| BackupError::Inconsistent("manifest is unreadable".into()))?);
            continue;
        }

        let manifest = manifest.as_ref().ok_or_else(|| BackupError::Inconsistent("manifest missing".into()))?;
        let listed = manifest
            .files
            .iter()
            .find(|f| f.path == name)
            .ok_or_else(|| BackupError::Inconsistent(format!("{name} is not in the manifest")))?;
        let relative = safe_relative(&name).ok_or_else(|| BackupError::Inconsistent(format!("unsafe path {name}")))?;
        if size != listed.size {
            return Err(BackupError::Inconsistent(format!("{name} has the wrong size")));
        }

        let destination = target.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut out = BufWriter::new(File::create(&destination)?);
        let mut hasher = Sha256::new();
        let mut remaining = size;
        let mut buf = vec![0u8; 256 * 1024];
        while remaining > 0 {
            let want = buf.len().min(remaining as usize);
            stream.read_exact(&mut buf[..want]).map_err(|_| BackupError::Unreadable)?;
            hasher.update(&buf[..want]);
            out.write_all(&buf[..want])?;
            remaining -= want as u64;
        }
        out.flush()?;
        if hex(&hasher.finalize()) != listed.sha256 {
            return Err(BackupError::Inconsistent(format!("{name} does not match its checksum")));
        }
        seen.insert(name);
    }

    let manifest = manifest.ok_or_else(|| BackupError::Inconsistent("manifest missing".into()))?;
    for listed in &manifest.files {
        if !seen.contains(&listed.path) {
            return Err(BackupError::Inconsistent(format!("{} is missing from the archive", listed.path)));
        }
    }
    if !seen.contains("db.sqlite") {
        return Err(BackupError::Inconsistent("the database is missing".into()));
    }
    Ok(manifest)
}

async fn quick_check(db_file: &Path) -> Result<bool, sqlx::Error> {
    use sqlx::Connection;
    let options = sqlx::sqlite::SqliteConnectOptions::new().filename(db_file).read_only(true);
    let mut conn = SqliteConnection::connect_with(&options).await?;
    let rows: Vec<String> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(&mut conn).await?;
    conn.close().await?;
    Ok(rows.len() == 1 && rows[0] == "ok")
}

/// Removes a scratch directory, overwriting the files in it first: what an
/// archive unpacks into is plaintext.
fn shred_dir(dir: &Path) {
    if let Ok(files) = walk_files(dir) {
        for file in files {
            let _ = crate::domain::vault::shred_file(&file);
        }
    }
    let _ = fs::remove_dir_all(dir);
}

fn scratch(data_dir: &Path, name: &str) -> io::Result<PathBuf> {
    let dir = data_dir.join(name);
    if dir.exists() {
        shred_dir(&dir);
    }
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Proves a backup can be restored, without changing anything: decrypts it
/// completely, checks every checksum, and integrity-checks the database inside.
pub async fn verify_backup(data_dir: &Path, path: &Path, passphrase: &str) -> Result<BackupSummary, BackupError> {
    let dir = scratch(data_dir, "backup-verify")?;
    let (p, pass, d) = (path.to_path_buf(), passphrase.to_string(), dir.clone());
    let manifest = tokio::task::spawn_blocking(move || unpack(&p, &pass, &d)).await.map_err(|e| BackupError::Io(io::Error::other(e)))?;
    let result = match manifest {
        Ok(manifest) => {
            if !quick_check(&dir.join("db.sqlite")).await.unwrap_or(false) {
                Err(BackupError::Inconsistent("the database inside failed its integrity check".into()))
            } else {
                Ok(BackupSummary {
                    created_at: manifest.created_at,
                    app_version: manifest.app_version,
                    schema_version: manifest.schema_version,
                    files: manifest.files.len(),
                    audit_entries: manifest.audit_entries,
                })
            }
        }
        Err(e) => Err(e),
    };
    shred_dir(&dir);
    result
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRestore {
    source: String,
    staged_at: i64,
}

const PENDING_FILE: &str = "pending-restore.json";
const STAGING_DIR: &str = "restore-staging";

/// Unpacks and verifies a backup and marks it to be applied at the next start.
/// The running database is not touched: replacing a live SQLite file under an
/// open pool is how data gets lost, so the swap happens before the pool opens.
pub async fn stage_restore(data_dir: &Path, path: &Path, passphrase: &str) -> Result<BackupSummary, BackupError> {
    let staging = scratch(data_dir, STAGING_DIR)?;
    let (p, pass, d) = (path.to_path_buf(), passphrase.to_string(), staging.clone());
    let manifest = tokio::task::spawn_blocking(move || unpack(&p, &pass, &d)).await.map_err(|e| BackupError::Io(io::Error::other(e)))?;
    let manifest = match manifest {
        Ok(m) => m,
        Err(e) => {
            shred_dir(&staging);
            return Err(e);
        }
    };
    if !quick_check(&staging.join("db.sqlite")).await.unwrap_or(false) {
        shred_dir(&staging);
        return Err(BackupError::Inconsistent("the database inside failed its integrity check".into()));
    }
    let pending = PendingRestore { source: path.to_string_lossy().to_string(), staged_at: now_ms() };
    fs::write(data_dir.join(PENDING_FILE), serde_json::to_vec(&pending).map_err(|e| BackupError::Io(io::Error::other(e)))?)?;
    Ok(BackupSummary {
        created_at: manifest.created_at,
        app_version: manifest.app_version,
        schema_version: manifest.schema_version,
        files: manifest.files.len(),
        audit_entries: manifest.audit_entries,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreApplied {
    pub source: String,
    pub applied_at: i64,
    pub previous_database_moved_to: String,
}

fn move_aside(from: &Path, into: &Path) -> io::Result<()> {
    if from.exists() {
        fs::create_dir_all(into)?;
        fs::rename(from, into.join(from.file_name().unwrap_or_default()))?;
    }
    Ok(())
}

/// Called at startup, before the database is opened. If a restore was staged,
/// moves the current database (and its WAL files) aside, puts the restored one
/// in its place, and unpacks the restored documents into `incoming` as plaintext
/// for `vault::adopt` to seal under this machine's key. Nothing is deleted.
pub fn apply_pending_restore(data_dir: &Path, db_path: &Path, incoming: &Path) -> io::Result<Option<RestoreApplied>> {
    let marker = data_dir.join(PENDING_FILE);
    if !marker.exists() {
        return Ok(None);
    }
    let pending: PendingRestore = serde_json::from_slice(&fs::read(&marker)?).map_err(io::Error::other)?;
    let staging = data_dir.join(STAGING_DIR);
    let staged_db = staging.join("db.sqlite");
    if !staged_db.exists() {
        // A marker without its staged files is stale; drop it rather than loop.
        fs::remove_file(&marker)?;
        return Ok(None);
    }

    let applied_at = now_ms();
    let aside = data_dir.join("pre-restore").join(applied_at.to_string());
    move_aside(db_path, &aside)?;
    for suffix in ["-wal", "-shm"] {
        let mut name = db_path.as_os_str().to_owned();
        name.push(suffix);
        move_aside(Path::new(&name), &aside)?;
    }
    fs::rename(&staged_db, db_path)?;

    let staged_vault = staging.join("vault");
    for file in walk_files(&staged_vault)? {
        let relative = file.strip_prefix(&staged_vault).map_err(io::Error::other)?;
        let destination = incoming.join(relative);
        if destination.exists() {
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }
        if fs::rename(&file, &destination).is_err() {
            fs::copy(&file, &destination)?;
        }
    }

    shred_dir(&staging);
    fs::remove_file(&marker)?;
    let applied = RestoreApplied {
        source: pending.source,
        applied_at,
        previous_database_moved_to: aside.to_string_lossy().to_string(),
    };
    let mut log = fs::OpenOptions::new().create(true).append(true).open(data_dir.join("restore-log.jsonl"))?;
    writeln!(log, "{}", serde_json::to_string(&applied).map_err(io::Error::other)?)?;
    Ok(Some(applied))
}

/// Records, in the restored database's own audit trail, that it was restored.
pub async fn record_restore(pool: &SqlitePool, applied: &RestoreApplied) -> Result<(), sqlx::Error> {
    let mut tx = crate::db::begin_write(pool).await?;
    audit::record(
        &mut tx,
        &Actor::system("restore"),
        AuditEntry::new("system.restored", "installation", Some("default")).after(&serde_json::json!({
            "source": applied.source,
            "previousDatabaseMovedTo": applied.previous_database_moved_to,
        })),
    )
    .await?;
    tx.commit().await
}

// ---------------------------------------------------------------------
// Scheduled backups
// ---------------------------------------------------------------------

/// Runs one backup and records its outcome in `node_config` and the audit
/// trail. Returns the new backup, or the reason it failed.
pub async fn run_and_record(pool: &SqlitePool, data_dir: &Path, vault_root: &Path, actor: &Actor) -> Result<BackupInfo, BackupError> {
    let config = get_config(pool, data_dir).await?;
    let dir = PathBuf::from(&config.effective_dir);
    let result = create_backup(pool, data_dir, vault_root, &dir).await;

    let mut tx = crate::db::begin_write(pool).await?;
    match &result {
        Ok(info) => {
            sqlx::query("UPDATE node_config SET last_backup_at = ?, last_backup_status = 'ok', last_backup_error = NULL WHERE id = 'default'")
                .bind(info.created_at)
                .execute(&mut *tx)
                .await?;
            audit::record(
                &mut tx,
                actor,
                AuditEntry::new("system.backup", "backup", Some(&info.file_name)).after(&serde_json::json!({ "sizeBytes": info.size_bytes, "dir": config.effective_dir })),
            )
            .await?;
        }
        Err(e) => {
            let message = format!("{e:?}");
            sqlx::query("UPDATE node_config SET last_backup_status = 'error', last_backup_error = ? WHERE id = 'default'")
                .bind(&message)
                .execute(&mut *tx)
                .await?;
            audit::record(&mut tx, actor, AuditEntry::new("system.backup_failed", "backup", None).reason(&message)).await?;
        }
    }
    tx.commit().await?;

    if result.is_ok() {
        let _ = prune(&dir, config.backup_retention.max(1) as usize);
    }
    result
}

/// Checks every ten minutes whether a backup is due. Does nothing until a
/// recovery passphrase has been set.
pub async fn scheduler(node: crate::node::NodeRef) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(600)).await;
        let Ok(config) = get_config(&node.pool, &node.data_dir).await else { continue };
        if !config.configured {
            continue;
        }
        let due = match config.last_backup_at {
            None => true,
            Some(last) => now_ms() - last >= config.backup_interval_hours * 3_600_000,
        };
        if due {
            match run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("scheduled backup")).await {
                Ok(info) => log::info!("scheduled backup written: {}", info.file_name),
                Err(e) => log::warn!("scheduled backup failed: {e:?}"),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn node_with_backup_key() -> (crate::node::NodeRef, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(dir.join("vault/prisoners/REF-1")).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(crate::db::connect_options(&dir.join("prisons.db")))
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let node = crate::node::Node::new(pool, dir.join("vault"), dir.clone());

        let mut tx = crate::db::begin_write(&node.pool).await.unwrap();
        save_config(
            &mut tx,
            &Actor::system("test"),
            SaveBackupConfigInput { backup_dir: None, interval_hours: 24, retention: 2, passphrase: Some("a long recovery passphrase".into()) },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();
        (node, dir)
    }

    #[tokio::test]
    async fn a_backup_round_trips_and_verifies() {
        let (node, dir) = node_with_backup_key().await;
        crate::domain::vault::write(&node.vault_root, "doc-warrant", b"remand warrant").unwrap();
        let big: Vec<u8> = (0..(CHUNK * 3 + 17)).map(|i| (i % 251) as u8).collect();
        crate::domain::vault::write(&node.vault_root, "doc-scan", &big).unwrap();

        let info = run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("test")).await.unwrap();
        assert!(Path::new(&info.path).exists());
        assert!(!fs::read(&info.path).unwrap().windows(14).any(|w| w == b"remand warrant"), "the backup must not contain plaintext");

        let summary = verify_backup(&dir, Path::new(&info.path), "a long recovery passphrase").await.unwrap();
        assert_eq!(summary.files, 3, "database plus two vault files");
        assert!(matches!(verify_backup(&dir, Path::new(&info.path), "the wrong passphrase!").await, Err(BackupError::Unreadable)));
    }

    #[tokio::test]
    async fn a_tampered_backup_is_refused() {
        let (node, dir) = node_with_backup_key().await;
        let info = run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("test")).await.unwrap();
        let mut bytes = fs::read(&info.path).unwrap();
        let middle = bytes.len() / 2;
        bytes[middle] ^= 0xFF;
        fs::write(&info.path, bytes).unwrap();
        assert!(verify_backup(&dir, Path::new(&info.path), "a long recovery passphrase").await.is_err());
    }

    #[tokio::test]
    async fn a_restore_swaps_the_database_at_startup_and_deletes_nothing() {
        let (node, dir) = node_with_backup_key().await;
        // State at backup time: one audit entry marker row.
        let mut tx = crate::db::begin_write(&node.pool).await.unwrap();
        audit::record(&mut tx, &Actor::system("test"), AuditEntry::new("test.before_backup", "thing", None)).await.unwrap();
        tx.commit().await.unwrap();
        fs::write(dir.join("vault/prisoners/REF-1/a.txt"), b"a").unwrap();
        let info = run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("test")).await.unwrap();

        // Work done after the backup, which the restore will roll back.
        let mut tx = crate::db::begin_write(&node.pool).await.unwrap();
        audit::record(&mut tx, &Actor::system("test"), AuditEntry::new("test.after_backup", "thing", None)).await.unwrap();
        tx.commit().await.unwrap();

        stage_restore(&dir, Path::new(&info.path), "a long recovery passphrase").await.unwrap();
        node.pool.close().await;

        let db_path = dir.join("prisons.db");
        let incoming = dir.join(crate::domain::vault::INCOMING_DIR);
        let applied = apply_pending_restore(&dir, &db_path, &incoming).unwrap().expect("a restore was staged");
        assert!(Path::new(&applied.previous_database_moved_to).join("prisons.db").exists(), "the replaced database is kept");
        assert!(dir.join("restore-log.jsonl").exists());
        assert_eq!(fs::read(incoming.join("prisoners/REF-1/a.txt")).unwrap(), b"a", "restored documents wait as plaintext to be sealed");

        let pool = sqlx::sqlite::SqlitePoolOptions::new().connect_with(crate::db::connect_options(&db_path)).await.unwrap();
        let actions: Vec<String> = sqlx::query_scalar("SELECT action FROM audit_log ORDER BY seq").fetch_all(&pool).await.unwrap();
        assert!(actions.contains(&"test.before_backup".to_string()));
        assert!(!actions.contains(&"test.after_backup".to_string()), "work after the backup is not in the restored database");
        record_restore(&pool, &applied).await.unwrap();
        assert!(audit::verify_chain(&pool).await.unwrap().ok, "the restored audit chain is intact and continues");
    }

    /// The whole point of a portable backup: a document sealed on one machine is
    /// recovered, from the archive alone, as a sealed document on a machine that
    /// has none of the original vault.
    #[tokio::test]
    async fn a_restored_document_is_sealed_again_and_reads_back() {
        use crate::domain::{attachments, vault};
        let (node, dir) = node_with_backup_key().await;
        let mut tx = crate::db::begin_write(&node.pool).await.unwrap();
        let added = attachments::add_attachment_bytes(&mut tx, &Actor::system("test"), &node.vault_root, "prisoner", "p-1", "warrant.txt", b"remand warrant, Buganda Road")
            .await
            .unwrap();
        tx.commit().await.unwrap();
        assert!(vault::is_relative(&sqlx::query_scalar::<_, String>("SELECT stored_path FROM attachments").fetch_one(&node.pool).await.unwrap()));
        let info = run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("test")).await.unwrap();

        // A machine with no vault at all.
        stage_restore(&dir, Path::new(&info.path), "a long recovery passphrase").await.unwrap();
        node.pool.close().await;
        fs::remove_dir_all(&node.vault_root).unwrap();
        let db_path = dir.join("prisons.db");
        let incoming = dir.join(vault::INCOMING_DIR);
        apply_pending_restore(&dir, &db_path, &incoming).unwrap().expect("staged");

        let pool = sqlx::sqlite::SqlitePoolOptions::new().connect_with(crate::db::connect_options(&db_path)).await.unwrap();
        let adopted = vault::adopt(&pool, &node.vault_root, &[], &incoming).await.unwrap();
        assert_eq!(adopted.sealed, 1);
        assert!(vault::walk(&incoming).unwrap().is_empty(), "no plaintext is left behind");
        let attachment = attachments::get_attachment(&pool, &added.id).await.unwrap().unwrap();
        assert_eq!(attachments::read_bytes(&node.vault_root, &attachment).unwrap(), b"remand warrant, Buganda Road");
    }

    #[test]
    fn archive_names_cannot_escape_the_target() {
        for bad in ["", "/etc/passwd", "../x", "a/../../x", "a//b", "C:\\x", "a\\b", "./x"] {
            assert!(safe_relative(bad).is_none(), "{bad:?} must be refused");
        }
        assert_eq!(safe_relative("vault/prisoners/REF-1/a.txt").unwrap(), PathBuf::from("vault/prisoners/REF-1/a.txt"));
        assert_eq!(safe_relative("vault/attachments/doc-1").unwrap(), PathBuf::from("vault/attachments/doc-1"));
    }

    #[tokio::test]
    async fn retention_keeps_only_the_newest_backups() {
        let (node, dir) = node_with_backup_key().await;
        for _ in 0..3 {
            run_and_record(&node.pool, &node.data_dir, &node.vault_root, &Actor::system("test")).await.unwrap();
            tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
        }
        assert_eq!(list_backups(&default_backup_dir(&dir)).unwrap().len(), 2, "retention is 2");
    }
}
