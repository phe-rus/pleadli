//! Secrets at rest (docs/prisons/SECURITY.md X9). The four network credentials
//! this node holds (the sync token, the Cloudflare API token, the tunnel run
//! token and a workstation's device token) are stored as ChaCha20-Poly1305
//! ciphertext, never as readable columns.
//!
//! The key is 32 random bytes in `secrets.key` beside the database, created on
//! first start with owner-only permissions. So a copy of the database on its
//! own (a backup, a support copy, a stray snapshot) reveals no credential.
//! What it does not defend against is someone who takes the whole data folder
//! including the key file; that needs the OS keystore or a passphrase and is
//! decision D14. Nothing outside this module knows where the key comes from,
//! so that change is a change to `init` only.
//!
//! Each value is bound to its column (the column name is the AEAD associated
//! data), so a ciphertext copied into another column does not open.

use std::io::Write;
use std::path::Path;
use std::sync::OnceLock;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand_core::{OsRng, RngCore};
use sqlx::SqlitePool;

const PREFIX: &str = "enc:v1:";
const KEY_FILE: &str = "secrets.key";
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;

pub const PEER_SYNC_TOKEN: &str = "peer_sync_config.sync_token";
pub const CLOUDFLARE_API_TOKEN: &str = "cloudflare_config.api_token";
pub const TUNNEL_RUN_TOKEN: &str = "cloudflare_tunnel_state.run_token";
pub const DEVICE_TOKEN: &str = "node_config.remote_device_token";

/// (table, column, purpose). Every table is a singleton row keyed by `id`.
const SECRET_COLUMNS: [(&str, &str, &str); 4] = [
    ("peer_sync_config", "sync_token", PEER_SYNC_TOKEN),
    ("cloudflare_config", "api_token", CLOUDFLARE_API_TOKEN),
    ("cloudflare_tunnel_state", "run_token", TUNNEL_RUN_TOKEN),
    ("node_config", "remote_device_token", DEVICE_TOKEN),
];

#[derive(Debug)]
pub enum SecretError {
    /// `init` has not run, so nothing can be sealed or opened.
    NotReady,
    /// The stored value is damaged, or was sealed under a different key (for
    /// example a database restored from another machine).
    Unreadable(&'static str),
    KeyFile(String),
}

impl std::fmt::Display for SecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SecretError::NotReady => write!(f, "the secret store is not ready"),
            SecretError::Unreadable(purpose) => write!(f, "a stored secret ({purpose}) cannot be read with this machine's key; it must be entered or paired again"),
            SecretError::KeyFile(reason) => write!(f, "the secrets key file is unusable: {reason}"),
        }
    }
}

impl From<SecretError> for sqlx::Error {
    fn from(e: SecretError) -> Self {
        sqlx::Error::Protocol(e.to_string())
    }
}

pub struct SecretBox {
    key: [u8; 32],
}

impl SecretBox {
    pub fn new(key: [u8; 32]) -> Self {
        SecretBox { key }
    }

    fn cipher(&self) -> ChaCha20Poly1305 {
        ChaCha20Poly1305::new((&self.key).into())
    }

    pub fn seal(&self, purpose: &'static str, plain: &str) -> Result<String, SecretError> {
        let mut nonce = [0u8; NONCE_LEN];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher()
            .encrypt(&Nonce::from(nonce), Payload { msg: plain.as_bytes(), aad: purpose.as_bytes() })
            .map_err(|_| SecretError::Unreadable(purpose))?;
        let mut blob = nonce.to_vec();
        blob.extend_from_slice(&ciphertext);
        Ok(format!("{PREFIX}{}", B64.encode(blob)))
    }

    /// A value without the prefix is a credential written before this module
    /// existed. It is returned as is, and `seal_existing` rewrites it at
    /// startup, so this only matters between reading a database and sealing it.
    pub fn open(&self, purpose: &'static str, stored: &str) -> Result<String, SecretError> {
        let Some(encoded) = stored.strip_prefix(PREFIX) else {
            return Ok(stored.to_string());
        };
        let unreadable = || SecretError::Unreadable(purpose);
        let blob = B64.decode(encoded).map_err(|_| unreadable())?;
        if blob.len() < NONCE_LEN + TAG_LEN {
            return Err(unreadable());
        }
        let (nonce, ciphertext) = blob.split_at(NONCE_LEN);
        let nonce: [u8; NONCE_LEN] = nonce.try_into().map_err(|_| unreadable())?;
        let plain = self
            .cipher()
            .decrypt(&Nonce::from(nonce), Payload { msg: ciphertext, aad: purpose.as_bytes() })
            .map_err(|_| unreadable())?;
        String::from_utf8(plain).map_err(|_| unreadable())
    }
}

static STORE: OnceLock<SecretBox> = OnceLock::new();

/// Loads the key from `data_dir`, creating it on first start. Called once by
/// `db::startup`, before any credential is read or written.
pub fn init(data_dir: &Path) -> Result<(), SecretError> {
    let key = load_or_create_key(data_dir)?;
    // A second call (tests start several nodes in one process) keeps the first
    // key, which is what every call after it must use.
    let _ = STORE.set(SecretBox::new(key));
    Ok(())
}

#[cfg(not(test))]
fn current() -> Result<&'static SecretBox, SecretError> {
    STORE.get().ok_or(SecretError::NotReady)
}

/// Tests call domain functions with a bare pool and no startup, so they get a
/// fixed key. A release build never has this path.
#[cfg(test)]
fn current() -> Result<&'static SecretBox, SecretError> {
    Ok(STORE.get_or_init(|| SecretBox::new([7u8; 32])))
}

pub fn seal(purpose: &'static str, plain: &str) -> Result<String, SecretError> {
    current()?.seal(purpose, plain)
}

pub fn open(purpose: &'static str, stored: &str) -> Result<String, SecretError> {
    current()?.open(purpose, stored)
}

fn load_or_create_key(dir: &Path) -> Result<[u8; 32], SecretError> {
    let path = dir.join(KEY_FILE);
    let bad = |e: std::io::Error| SecretError::KeyFile(e.to_string());
    let read = |path: &Path| -> Result<[u8; 32], SecretError> {
        let bytes = std::fs::read(path).map_err(bad)?;
        // A file of the wrong size is never replaced: doing so would orphan
        // every credential sealed under the old one.
        bytes.try_into().map_err(|_| SecretError::KeyFile("it is not 32 bytes".into()))
    };
    if path.exists() {
        return read(&path);
    }

    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    match options.open(&path) {
        Ok(mut file) => {
            file.write_all(&key).and_then(|_| file.sync_all()).map_err(bad)?;
            Ok(key)
        }
        // Another start won the race to create it: use theirs.
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => read(&path),
        Err(e) => Err(bad(e)),
    }
}

/// Seals every credential still stored as plaintext. Safe to run every start:
/// a value that is already sealed is left alone. Tolerates tables and columns
/// an older schema does not have yet, so it can run before migrations (ahead
/// of the pre-migration snapshot, which would otherwise copy the plaintext).
pub async fn seal_existing(pool: &SqlitePool) -> Result<usize, sqlx::Error> {
    let mut sealed = 0;
    for (table, column, purpose) in SECRET_COLUMNS {
        let present: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?")
            .bind(table)
            .bind(column)
            .fetch_one(pool)
            .await?;
        if present == 0 {
            continue;
        }
        // Table and column names come from the constant above, never input.
        let rows: Vec<(String, String)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT id, {column} FROM {table} WHERE {column} IS NOT NULL AND {column} NOT LIKE '{PREFIX}%'"
        )))
        .fetch_all(pool)
        .await?;
        for (id, plain) in rows {
            let stored = seal(purpose, &plain)?;
            sqlx::query(sqlx::AssertSqlSafe(format!("UPDATE {table} SET {column} = ? WHERE id = ?"))).bind(stored).bind(id).execute(pool).await?;
            sealed += 1;
        }
    }
    if sealed > 0 {
        // The old plaintext survives in freed pages and the WAL until they are
        // rewritten, so rewrite them once, now.
        let _ = sqlx::query("VACUUM").execute(pool).await;
        let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(pool).await;
    }
    Ok(sealed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn boxed(byte: u8) -> SecretBox {
        SecretBox::new([byte; 32])
    }

    #[test]
    fn a_sealed_value_opens_and_is_not_readable() {
        let b = boxed(1);
        let sealed = b.seal(PEER_SYNC_TOKEN, "s3cret-token").unwrap();
        assert!(sealed.starts_with(PREFIX));
        assert!(!sealed.contains("s3cret-token"));
        assert_eq!(b.open(PEER_SYNC_TOKEN, &sealed).unwrap(), "s3cret-token");
    }

    #[test]
    fn sealing_twice_gives_different_ciphertext() {
        let b = boxed(1);
        assert_ne!(b.seal(DEVICE_TOKEN, "same").unwrap(), b.seal(DEVICE_TOKEN, "same").unwrap());
    }

    #[test]
    fn a_value_moved_to_another_column_does_not_open() {
        let b = boxed(1);
        let sealed = b.seal(PEER_SYNC_TOKEN, "token").unwrap();
        assert!(b.open(CLOUDFLARE_API_TOKEN, &sealed).is_err());
    }

    #[test]
    fn another_key_or_a_tampered_value_does_not_open() {
        let sealed = boxed(1).seal(DEVICE_TOKEN, "token").unwrap();
        assert!(boxed(2).open(DEVICE_TOKEN, &sealed).is_err());

        let mut blob = B64.decode(sealed.strip_prefix(PREFIX).unwrap()).unwrap();
        *blob.last_mut().unwrap() ^= 1;
        assert!(boxed(1).open(DEVICE_TOKEN, &format!("{PREFIX}{}", B64.encode(blob))).is_err());
        assert!(boxed(1).open(DEVICE_TOKEN, &format!("{PREFIX}not base64!")).is_err());
        assert!(boxed(1).open(DEVICE_TOKEN, &format!("{PREFIX}{}", B64.encode([0u8; 4]))).is_err());
    }

    #[test]
    fn a_legacy_plaintext_value_is_passed_through() {
        assert_eq!(boxed(1).open(TUNNEL_RUN_TOKEN, "old-plain").unwrap(), "old-plain");
    }

    async fn migrated_pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn stored(pool: &SqlitePool, sql: &'static str) -> String {
        sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
    }

    #[tokio::test]
    async fn plaintext_credentials_are_sealed_once_and_still_usable() {
        let pool = migrated_pool().await;
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = 'https://hq.example.org', facility_id = 'fac-1', sync_token = 'plain-sync' WHERE id = 'default'").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cloudflare_config (id, api_token, account_id, domain, station_name) VALUES ('default', 'plain-cf', 'acct', 'example.org', 'hq')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO cloudflare_tunnel_state (id, tunnel_id, hostname, run_token) VALUES ('default', 't', 'h', 'plain-run')").execute(&pool).await.unwrap();
        sqlx::query("UPDATE node_config SET remote_device_token = 'plain-device' WHERE id = 'default'").execute(&pool).await.unwrap();

        assert_eq!(seal_existing(&pool).await.unwrap(), 4);
        assert_eq!(seal_existing(&pool).await.unwrap(), 0, "running it again must not seal twice");

        for sql in [
            "SELECT sync_token FROM peer_sync_config",
            "SELECT api_token FROM cloudflare_config",
            "SELECT run_token FROM cloudflare_tunnel_state",
            "SELECT remote_device_token FROM node_config",
        ] {
            let value = stored(&pool, sql).await;
            assert!(value.starts_with(PREFIX), "{sql} is still readable: {value}");
            assert!(!value.contains("plain-"));
        }

        // The rest of the app still gets the original values.
        assert_eq!(crate::domain::facilities::get_peer_sync_context(&pool).await.unwrap().unwrap().sync_token, "plain-sync");
        assert_eq!(crate::domain::cloudflare_tunnel::get_run_token(&pool).await.unwrap().as_deref(), Some("plain-run"));
        assert_eq!(crate::domain::nodeconfig::get(&pool).await.unwrap().remote_device_token.as_deref(), Some("plain-device"));
    }

    #[tokio::test]
    async fn a_credential_that_cannot_be_opened_is_an_error_not_a_blank() {
        let pool = migrated_pool().await;
        let foreign = boxed(9).seal(PEER_SYNC_TOKEN, "from-another-machine").unwrap();
        sqlx::query("UPDATE peer_sync_config SET hq_hostname = 'https://hq.example.org', facility_id = 'fac-1', sync_token = ? WHERE id = 'default'").bind(foreign).execute(&pool).await.unwrap();
        assert!(crate::domain::facilities::get_peer_sync_context(&pool).await.is_err());
    }

    #[test]
    fn the_key_file_is_created_once_private_and_reused() {
        let dir = std::env::temp_dir().join(format!("pleadli-secrets-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = load_or_create_key(&dir).unwrap();
        assert_eq!(load_or_create_key(&dir).unwrap(), first);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(dir.join(KEY_FILE)).unwrap().permissions().mode() & 0o777, 0o600);
        }
        std::fs::write(dir.join(KEY_FILE), b"short").unwrap();
        assert!(load_or_create_key(&dir).is_err(), "a damaged key file must not be replaced");
    }
}
