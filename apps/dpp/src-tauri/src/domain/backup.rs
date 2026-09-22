//! Encrypted backups and restore.
//!
//! A backup is one file (`.dppbk`) holding the whole record and every document,
//! sealed with ChaCha20-Poly1305 (chunked STREAM) under a key derived from a
//! passphrase the prosecutor chooses (Argon2id). It does not depend on the key
//! this machine holds, so it restores on another machine: the passphrase is the
//! only thing that opens it, and it is not stored anywhere.
//!
//! Inside, after opening, is a plain sequence of records: a description, the
//! database (exported plain, so it can be re-encrypted under the key of whatever
//! machine restores it), and each document as it was received. Every chunk is
//! authenticated, so a backup that has been changed or truncated is refused
//! rather than half restored.
//!
//! Restoring never touches the running database. It unpacks and checks the
//! backup into a staging folder and asks for a restart; the next start sets the
//! current data aside (kept, encrypted) and puts the restored data in place. The
//! plain database and plain documents it unpacks are re-encrypted and sealed by
//! the ordinary startup and then destroyed.

use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::{KeyInit, Payload};
use chacha20poly1305::ChaCha20Poly1305;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, SqliteConnection, SqlitePool};

use super::audit::{self, Entry};
use super::vault;

const MAGIC: &[u8; 8] = b"PLDPPBK1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 7;
const CHUNK: usize = 64 * 1024;
const TAG: usize = 16;
const AAD: &[u8] = b"dpp-backup-v1";
pub const MIN_PASSPHRASE: usize = 10;

const PENDING: &str = "restore-pending";
const PENDING_PARTIAL: &str = "restore-pending.partial";
const KEEP_PRE_RESTORE: usize = 3;

const REC_END: u8 = 0;
const REC_META: u8 = 1;
const REC_DB: u8 = 2;
const REC_FILE: u8 = 3;

#[derive(Debug)]
pub enum BackupError {
    Io(io::Error),
    Db(sqlx::Error),
    /// Not a backup, the wrong passphrase, or damaged. Deliberately not told apart.
    Unreadable,
    /// The backup opens but cannot be restored here, and says why.
    Refused(String),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BackupError::Io(e) => write!(f, "{e}"),
            BackupError::Db(e) => write!(f, "{e}"),
            BackupError::Unreadable => write!(f, "The passphrase is wrong, or this is not an intact backup."),
            BackupError::Refused(why) => write!(f, "{why}"),
        }
    }
}

impl From<io::Error> for BackupError {
    fn from(e: io::Error) -> Self {
        BackupError::Io(e)
    }
}

impl From<sqlx::Error> for BackupError {
    fn from(e: sqlx::Error) -> Self {
        BackupError::Db(e)
    }
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], BackupError> {
    let params = argon2::Params::new(64 * 1024, 3, 1, Some(32)).map_err(|_| BackupError::Unreadable)?;
    let mut key = [0u8; 32];
    argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|_| BackupError::Unreadable)?;
    Ok(key)
}

// ---- sealed streams -------------------------------------------------

struct SealWriter<W: Write> {
    out: W,
    enc: Option<EncryptorBE32<ChaCha20Poly1305>>,
    pending: Vec<u8>,
}

impl<W: Write> SealWriter<W> {
    fn new(mut out: W, passphrase: &str) -> Result<Self, BackupError> {
        let mut salt = [0u8; SALT_LEN];
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut salt);
        OsRng.fill_bytes(&mut nonce);
        let key = derive_key(passphrase, &salt)?;
        out.write_all(MAGIC)?;
        out.write_all(&salt)?;
        out.write_all(&nonce)?;
        Ok(SealWriter { out, enc: Some(EncryptorBE32::from_aead(ChaCha20Poly1305::new((&key).into()), &nonce.into())), pending: Vec::with_capacity(CHUNK * 2) })
    }

    /// Chunks are sealed once more data has arrived, so the last one is known.
    fn flush_full(&mut self) -> io::Result<()> {
        while self.pending.len() > CHUNK {
            let chunk: Vec<u8> = self.pending.drain(..CHUNK).collect();
            let sealed = self.enc.as_mut().unwrap().encrypt_next(Payload { msg: &chunk, aad: AAD }).map_err(|_| io::Error::other("sealing failed"))?;
            self.out.write_all(&sealed)?;
        }
        Ok(())
    }

    fn finish(mut self) -> io::Result<W> {
        let sealed = self.enc.take().unwrap().encrypt_last(Payload { msg: &self.pending, aad: AAD }).map_err(|_| io::Error::other("sealing failed"))?;
        self.out.write_all(&sealed)?;
        self.out.flush()?;
        Ok(self.out)
    }

    fn record(&mut self, kind: u8, name: &str, data: &[u8]) -> io::Result<()> {
        self.write_all(&[kind])?;
        self.write_all(&(name.len() as u16).to_be_bytes())?;
        self.write_all(name.as_bytes())?;
        self.write_all(&(data.len() as u64).to_be_bytes())?;
        self.write_all(data)
    }
}

impl<W: Write> Write for SealWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.pending.extend_from_slice(buf);
        self.flush_full()?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

struct SealReader<R: Read> {
    input: R,
    dec: Option<DecryptorBE32<ChaCha20Poly1305>>,
    frame: Vec<u8>,
    ahead: Vec<u8>,
    plain: Vec<u8>,
    at: usize,
    done: bool,
}

fn read_frame<R: Read>(input: &mut R) -> io::Result<Vec<u8>> {
    let mut frame = vec![0u8; CHUNK + TAG];
    let mut filled = 0;
    while filled < frame.len() {
        let n = input.read(&mut frame[filled..])?;
        if n == 0 {
            break;
        }
        filled += n;
    }
    frame.truncate(filled);
    Ok(frame)
}

impl<R: Read> SealReader<R> {
    fn open(mut input: R, passphrase: &str) -> Result<Self, BackupError> {
        let mut head = [0u8; 8 + SALT_LEN + NONCE_LEN];
        input.read_exact(&mut head).map_err(|_| BackupError::Unreadable)?;
        if &head[..8] != MAGIC {
            return Err(BackupError::Unreadable);
        }
        let key = derive_key(passphrase, &head[8..8 + SALT_LEN])?;
        let nonce: [u8; NONCE_LEN] = head[8 + SALT_LEN..].try_into().map_err(|_| BackupError::Unreadable)?;
        let ahead = read_frame(&mut input)?;
        Ok(SealReader {
            input,
            dec: Some(DecryptorBE32::from_aead(ChaCha20Poly1305::new((&key).into()), &nonce.into())),
            frame: Vec::new(),
            ahead,
            plain: Vec::new(),
            at: 0,
            done: false,
        })
    }

    fn next_chunk(&mut self) -> Result<bool, BackupError> {
        if self.done {
            return Ok(false);
        }
        if self.ahead.len() < TAG {
            return Err(BackupError::Unreadable);
        }
        self.frame = std::mem::take(&mut self.ahead);
        self.ahead = read_frame(&mut self.input)?;
        let payload = Payload { msg: &self.frame, aad: AAD };
        self.plain = if self.ahead.is_empty() {
            self.done = true;
            self.dec.take().ok_or(BackupError::Unreadable)?.decrypt_last(payload)
        } else {
            self.dec.as_mut().ok_or(BackupError::Unreadable)?.decrypt_next(payload)
        }
        .map_err(|_| BackupError::Unreadable)?;
        self.at = 0;
        Ok(true)
    }

    fn take(&mut self, n: usize) -> Result<Vec<u8>, BackupError> {
        let mut out = Vec::with_capacity(n.min(CHUNK));
        while out.len() < n {
            if self.at >= self.plain.len() && !self.next_chunk()? {
                return Err(BackupError::Unreadable);
            }
            let want = (n - out.len()).min(self.plain.len() - self.at);
            out.extend_from_slice(&self.plain[self.at..self.at + want]);
            self.at += want;
        }
        Ok(out)
    }

    fn skip_to_end_is_clean(&mut self) -> bool {
        self.at >= self.plain.len() && self.done
    }
}

// ---- creating -------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupMeta {
    pub app: String,
    pub created_at: i64,
    pub documents: i64,
    /// Documents whose sealed file could not be read, and so are not in the backup.
    pub missing: i64,
    pub latest_migration: i64,
}

fn migrator_latest() -> i64 {
    sqlx::migrate!("./migrations").iter().map(|m| m.version).max().unwrap_or(0)
}

/// Writes a complete backup to `out`. The database is exported plain from the
/// live, keyed connection; the temporary plain copy is destroyed as soon as it
/// has been read.
pub async fn write_backup<W: Write>(pool: &SqlitePool, vault_root: &Path, data_dir: &Path, passphrase: &str, out: W) -> Result<BackupMeta, BackupError> {
    if passphrase.chars().count() < MIN_PASSPHRASE {
        return Err(BackupError::Refused(format!("A backup passphrase needs at least {MIN_PASSPHRASE} characters.")));
    }
    let tmp_dir = data_dir.join("backup-tmp");
    fs::create_dir_all(&tmp_dir)?;
    let tmp = tmp_dir.join(format!("export-{}.sqlite", uuid::Uuid::new_v4()));
    {
        let mut conn = pool.acquire().await?;
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut *conn).await;
        sqlx::query("ATTACH DATABASE ?1 AS plain KEY ''").bind(tmp.to_string_lossy().to_string()).execute(&mut *conn).await?;
        let exported = sqlx::query("SELECT sqlcipher_export('plain')").execute(&mut *conn).await;
        let _ = sqlx::query("DETACH DATABASE plain").execute(&mut *conn).await;
        exported?;
    }
    let db_bytes = fs::read(&tmp);
    let _ = vault::shred_file(&tmp);
    let db_bytes = db_bytes?;

    let mut writer = SealWriter::new(out, passphrase)?;
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, stored_path FROM attachments ORDER BY created_at").fetch_all(pool).await?;
    let mut missing = 0;

    // Meta first, so a reader can refuse before unpacking anything large. The
    // counts are known once the documents have been read, so they are read first.
    let mut readable = Vec::new();
    for (id, stored) in &rows {
        match vault::is_relative(stored).then(|| vault::read(vault_root, stored, id)) {
            Some(Ok(bytes)) => readable.push((id.clone(), bytes)),
            _ => missing += 1,
        }
    }
    let meta = BackupMeta { app: "dpp".into(), created_at: chrono::Utc::now().timestamp_millis(), documents: readable.len() as i64, missing, latest_migration: migrator_latest() };
    writer.record(REC_META, "meta", &serde_json::to_vec(&meta).unwrap_or_default())?;
    writer.record(REC_DB, "db", &db_bytes)?;
    for (id, bytes) in readable {
        writer.record(REC_FILE, &id, &bytes)?;
    }
    writer.record(REC_END, "", &[])?;
    writer.finish()?;

    sqlx::query("INSERT INTO security_settings (key, value) VALUES ('last_backup_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .bind(meta.created_at.to_string())
        .execute(pool)
        .await?;
    let _ = audit::log(pool, Entry::new("backup_created").detail(format!("{} documents", meta.documents))).await;
    Ok(meta)
}

// ---- restoring ------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Staged {
    pub created_at: i64,
    pub documents: i64,
    pub missing: i64,
}

/// Opens a backup, unpacks it into a staging folder, and checks that it can be
/// restored here. Nothing live is touched. A restart applies it.
pub async fn stage_restore<R: Read>(data_dir: &Path, input: R, passphrase: &str) -> Result<Staged, BackupError> {
    let partial = data_dir.join(PENDING_PARTIAL);
    let pending = data_dir.join(PENDING);
    let _ = remove_tree(&partial);
    fs::create_dir_all(partial.join("files"))?;
    let result = unpack(&partial, input, passphrase).await;
    match result {
        Ok(meta) => {
            let _ = remove_tree(&pending);
            fs::rename(&partial, &pending)?;
            fs::write(pending.join("ready"), b"1")?;
            Ok(Staged { created_at: meta.created_at, documents: meta.documents, missing: meta.missing })
        }
        Err(e) => {
            let _ = remove_tree(&partial);
            Err(e)
        }
    }
}

async fn unpack<R: Read>(dir: &Path, input: R, passphrase: &str) -> Result<BackupMeta, BackupError> {
    let mut reader = SealReader::open(input, passphrase)?;
    let mut meta: Option<BackupMeta> = None;
    let mut have_db = false;
    loop {
        let kind = reader.take(1)?[0];
        let name_len = u16::from_be_bytes(reader.take(2)?.try_into().unwrap()) as usize;
        let name = String::from_utf8(reader.take(name_len)?).map_err(|_| BackupError::Unreadable)?;
        let data_len = u64::from_be_bytes(reader.take(8)?.try_into().unwrap()) as usize;
        match kind {
            REC_END => break,
            REC_META => meta = Some(serde_json::from_slice(&reader.take(data_len)?).map_err(|_| BackupError::Unreadable)?),
            REC_DB => {
                fs::write(dir.join("db.sqlite"), reader.take(data_len)?)?;
                have_db = true;
            }
            REC_FILE => {
                if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                    return Err(BackupError::Unreadable);
                }
                fs::write(dir.join("files").join(&name), reader.take(data_len)?)?;
            }
            _ => return Err(BackupError::Unreadable),
        }
    }
    if !reader.skip_to_end_is_clean() {
        return Err(BackupError::Unreadable);
    }
    let meta = meta.ok_or(BackupError::Unreadable)?;
    if meta.app != "dpp" || !have_db {
        return Err(BackupError::Refused("This is not a Pleadli DPP backup.".into()));
    }
    if meta.latest_migration > migrator_latest() {
        return Err(BackupError::Refused("This backup was made by a newer version of Pleadli DPP. Update the application first.".into()));
    }

    let mut conn = SqliteConnection::connect_with(&sqlx::sqlite::SqliteConnectOptions::new().filename(dir.join("db.sqlite")).create_if_missing(false).read_only(true)).await?;
    let check: Vec<String> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(&mut conn).await.map_err(|_| BackupError::Refused("The database inside the backup could not be read.".into()))?;
    let tables: Vec<String> = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('prosecution_files', '_sqlx_migrations')").fetch_all(&mut conn).await?;
    let _ = conn.close().await;
    if check != ["ok"] || tables.len() != 2 {
        return Err(BackupError::Refused("The database inside the backup is damaged or is not a Pleadli DPP database.".into()));
    }
    Ok(meta)
}

/// Whether a restore is staged and waiting for the next start.
pub fn pending(data_dir: &Path) -> bool {
    data_dir.join(PENDING).join("ready").exists()
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

#[derive(Debug)]
pub struct RestoreApplied {
    pub documents: usize,
}

fn keep_newest(dir: &Path) {
    if let Ok(read) = fs::read_dir(dir) {
        let mut entries: Vec<PathBuf> = read.flatten().map(|e| e.path()).collect();
        entries.sort();
        while entries.len() > KEEP_PRE_RESTORE {
            let oldest = entries.remove(0);
            let _ = if oldest.is_dir() { remove_tree(&oldest) } else { vault::shred_file(&oldest) };
        }
    }
}

/// Runs first at start. Sets the current data aside (kept, encrypted) and puts
/// the staged backup in place, plain: the ordinary startup then encrypts the
/// database under this machine's key and seals the documents.
pub fn apply_pending_restore(data_dir: &Path, db_path: &Path, vault_root: &Path, incoming: &Path) -> io::Result<Option<RestoreApplied>> {
    if !pending(data_dir) {
        // A staging folder that never became ready is only ever discarded.
        let _ = remove_tree(&data_dir.join(PENDING));
        let _ = remove_tree(&data_dir.join(PENDING_PARTIAL));
        return Ok(None);
    }
    let staged = data_dir.join(PENDING);
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let aside = data_dir.join("pre-restore");
    fs::create_dir_all(&aside)?;

    if db_path.exists() {
        fs::rename(db_path, aside.join(format!("dpp-{stamp}.db")))?;
    }
    for suffix in ["-wal", "-shm"] {
        let mut name = db_path.as_os_str().to_owned();
        name.push(suffix);
        let _ = fs::remove_file(PathBuf::from(name));
    }
    if vault_root.exists() {
        fs::rename(vault_root, aside.join(format!("vault-{stamp}")))?;
    }
    keep_newest(&aside);

    fs::rename(staged.join("db.sqlite"), db_path)?;
    fs::create_dir_all(incoming)?;
    let mut documents = 0;
    for file in vault::walk(&staged.join("files"))? {
        if let Some(name) = file.file_name() {
            fs::rename(&file, incoming.join(name))?;
            documents += 1;
        }
    }
    remove_tree(&staged)?;
    Ok(Some(RestoreApplied { documents }))
}

pub async fn record_restore(pool: &SqlitePool, applied: &RestoreApplied) -> Result<(), sqlx::Error> {
    audit::log(pool, Entry::new("backup_restored").detail(format!("{} documents", applied.documents))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("dpp-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_sealed_stream_opens_only_with_its_passphrase_and_only_whole() {
        for len in [0usize, 5, CHUNK - 3, CHUNK, CHUNK + 1, 3 * CHUNK + 40] {
            let plain: Vec<u8> = (0..len).map(|i| (i % 253) as u8).collect();
            let mut sealed = Vec::new();
            let mut w = SealWriter::new(&mut sealed, "correct horse battery").unwrap();
            w.write_all(&plain).unwrap();
            w.finish().unwrap();

            let mut r = SealReader::open(&sealed[..], "correct horse battery").unwrap();
            assert_eq!(r.take(len).unwrap(), plain, "length {len}");
            assert!(SealReader::open(&sealed[..], "wrong passphrase!").and_then(|mut r| r.take(len.max(1))).is_err(), "a wrong passphrase must not open it (length {len})");
        }
    }

    #[test]
    fn a_truncated_or_altered_backup_is_refused() {
        let mut sealed = Vec::new();
        let mut w = SealWriter::new(&mut sealed, "correct horse battery").unwrap();
        w.write_all(&vec![7u8; 3 * CHUNK]).unwrap();
        w.finish().unwrap();

        let truncated = &sealed[..sealed.len() - CHUNK - TAG];
        assert!(SealReader::open(truncated, "correct horse battery").and_then(|mut r| r.take(3 * CHUNK)).is_err());
        let mut altered = sealed.clone();
        altered[40] ^= 1;
        assert!(SealReader::open(&altered[..], "correct horse battery").and_then(|mut r| r.take(3 * CHUNK)).is_err());
        assert!(SealReader::open(&b"not a backup at all, just words"[..], "x").is_err());
    }

    #[test]
    fn restoring_sets_the_current_data_aside_and_puts_the_backup_in_place() {
        let d = dir();
        let (db, vault_root, incoming) = (d.join("dpp.db"), d.join("vault"), d.join("vault-incoming"));
        fs::write(&db, b"current database").unwrap();
        fs::create_dir_all(vault_root.join("attachments")).unwrap();
        fs::write(vault_root.join("attachments/a.enc"), b"sealed").unwrap();
        fs::create_dir_all(d.join(PENDING).join("files")).unwrap();
        fs::write(d.join(PENDING).join("db.sqlite"), b"restored database").unwrap();
        fs::write(d.join(PENDING).join("files/doc-1"), b"restored doc").unwrap();
        fs::write(d.join(PENDING).join("ready"), b"1").unwrap();

        let applied = apply_pending_restore(&d, &db, &vault_root, &incoming).unwrap().unwrap();
        assert_eq!(applied.documents, 1);
        assert_eq!(fs::read(&db).unwrap(), b"restored database");
        assert_eq!(fs::read(incoming.join("doc-1")).unwrap(), b"restored doc");
        assert!(!pending(&d));
        let kept: Vec<_> = fs::read_dir(d.join("pre-restore")).unwrap().flatten().collect();
        assert_eq!(kept.len(), 2, "the old database and the old vault are kept");
    }

    #[test]
    fn a_staging_folder_that_never_became_ready_is_discarded() {
        let d = dir();
        fs::create_dir_all(d.join(PENDING)).unwrap();
        fs::write(d.join(PENDING).join("db.sqlite"), b"half").unwrap();
        assert!(apply_pending_restore(&d, &d.join("dpp.db"), &d.join("vault"), &d.join("vault-incoming")).unwrap().is_none());
        assert!(!d.join(PENDING).exists());
    }
}
