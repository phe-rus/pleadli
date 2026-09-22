//! Opening a node's database safely: the parts of an application's start that
//! do not depend on what the application is.
//!
//! An application's own `startup` keeps the order (its restore, its own
//! secrets, its migrations, its seed data) and calls these in between:
//!
//! 1. `finish_interrupted_encryption`, before anything else looks at the file;
//! 2. `open_keys`: find or make this installation's key;
//! 3. `open_pool`: encrypt a database that is still plaintext, protect the
//!    leftovers, open under the key, check integrity;
//! 4. `snapshot_if_migrating`, then the application runs its migrator;
//! 5. `adopt_documents`: bring every document into the sealed vault.
//!
//! A database that fails its integrity check is never opened for normal work:
//! the application starts in recovery and offers a restore from a backup.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Connection, Sqlite, SqliteConnection, Transaction};

use crate::keys::{self, KeyError, Keys};
use crate::vault;

pub enum StartupError {
    /// The data cannot be trusted or opened. The application starts in recovery
    /// mode: nothing else runs until a backup is restored.
    Recovery(String),
    Fatal(String),
}

const KEEP_PRE_MIGRATION_SNAPSHOTS: usize = 3;
const PLAINTEXT_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Durability settings for a machine that can lose power: WAL for concurrent
/// readers, `synchronous = FULL` so a committed change survives a power cut,
/// foreign keys enforced, and a busy timeout so a second writer waits instead
/// of failing.
///
/// This is the plain form, with no key. A node itself always opens with
/// `keyed_options`; the plain form is for tests and for reading a plaintext file
/// that is about to be encrypted.
pub fn connect_options(db_path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10))
}

/// The same, under this installation's database key. sqlx runs the `key` pragma
/// before any other statement on every connection.
pub fn keyed_options(db_path: &Path, keys: &Keys) -> SqliteConnectOptions {
    connect_options(db_path).pragma("key", keys.db_pragma())
}

/// Every state-changing operation runs in one of these. `BEGIN IMMEDIATE` takes
/// the write lock up front, so a read-then-write inside the transaction (an
/// audit chain's "read the last hash, append the next") can never be
/// interleaved with another writer.
pub async fn begin_write(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}

#[derive(Debug, PartialEq, Eq)]
pub enum DbFile {
    Absent,
    /// A readable SQLite file: a database from before encryption, or a restored one.
    Plain,
    /// Anything else. An encrypted database looks like noise, and so does a
    /// damaged one, which the key or the integrity check tells apart.
    Encrypted,
}

pub fn detect(path: &Path) -> DbFile {
    let Ok(mut file) = std::fs::File::open(path) else { return DbFile::Absent };
    let mut head = [0u8; 16];
    match file.read(&mut head) {
        Ok(0) | Err(_) => DbFile::Absent,
        Ok(n) if n == 16 && &head == PLAINTEXT_HEADER => DbFile::Plain,
        Ok(_) => DbFile::Encrypted,
    }
}

/// Whether the file is a readable, unencrypted SQLite database.
pub fn is_plaintext(path: &Path) -> bool {
    detect(path) == DbFile::Plain
}

/// `path` with `suffix` appended to its file name (`prisons.db` to `prisons.db-wal`).
pub fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

/// Finds this installation's key (making one only for a database that does not
/// exist yet or is still plaintext) and installs it for the vault. Returns the
/// keys and what the database file looks like now, which `open_pool` needs.
pub fn open_keys(service: &str, data_dir: &Path, db_path: &Path) -> Result<(Keys, DbFile), StartupError> {
    let state = detect(db_path);
    // Tests keep their key in a file, never in this machine's real keystore.
    // `cfg!(test)` is not set here when an application runs its own tests, so
    // the `test-keys` feature (turned on by dev-dependencies) says it too.
    let use_keystore = !cfg!(any(test, feature = "test-keys"));
    let keys = match keys::open(service, data_dir, state != DbFile::Encrypted, use_keystore) {
        Ok(keys) => keys,
        Err(KeyError::Missing) => {
            return Err(StartupError::Recovery(
                "This machine does not hold the key for the encrypted database (it was copied from another machine, or the key store was cleared). Restore a backup with its passphrase.".into(),
            ))
        }
        Err(e) => return Err(StartupError::Fatal(e.to_string())),
    };
    keys::install(keys.clone());
    Ok((keys, state))
}

/// An open, keyed, integrity-checked database.
pub struct Opened {
    pub pool: SqlitePool,
    /// Whether the database file existed before this start (so a snapshot
    /// before migrating is worth taking).
    pub existed: bool,
}

/// Encrypts a plaintext database in place, protects the plaintext leftovers,
/// opens the pool under the key and checks the database's integrity.
pub async fn open_pool(db_path: &Path, data_dir: &Path, keys: &Keys, state: DbFile, max_connections: u32) -> Result<Opened, StartupError> {
    let existed = state != DbFile::Absent;
    if state == DbFile::Plain {
        encrypt_in_place(db_path, keys).await.map_err(|e| StartupError::Fatal(format!("could not encrypt the database (it is unchanged): {e}")))?;
    }
    protect_leftovers(data_dir, keys).await;

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .connect_with(keyed_options(db_path, keys))
        .await
        .map_err(|e| StartupError::Recovery(format!("The database could not be opened: {e}")))?;

    if existed {
        match sqlx::query_scalar::<_, String>("PRAGMA quick_check").fetch_all(&pool).await {
            Ok(rows) if rows == ["ok"] => {}
            Ok(rows) => return Err(StartupError::Recovery(format!("The database failed its integrity check: {}", rows.join("; ")))),
            Err(e) => return Err(StartupError::Recovery(format!("The database could not be checked: {e}"))),
        }
    }
    Ok(Opened { pool, existed })
}

/// Takes a snapshot of the database when `migrator` is about to change an
/// existing schema (some migrations are applied and some are not), and returns
/// where it went. `name` prefixes the snapshot file (`prisons`, `dpp`). A
/// fresh database, or one already up to date, takes none.
pub async fn snapshot_if_migrating(pool: &SqlitePool, migrator: &Migrator, data_dir: &Path, existed: bool, name: &str) -> Option<PathBuf> {
    if !existed {
        return None;
    }
    let applied: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations").fetch_one(pool).await.unwrap_or(0);
    if applied > 0 && (applied as usize) < migrator.iter().count() {
        snapshot_before_migration(pool, data_dir, name).await
    } else {
        None
    }
}

/// Brings every document into the sealed vault. Needs the migrated
/// `attachments` table, and a restore's plain files are matched against the
/// restored rows, so it runs last.
pub async fn adopt_documents(pool: &SqlitePool, vault_root: &Path, legacy_vault: Option<&Path>, incoming: &Path) -> Result<(), StartupError> {
    std::fs::create_dir_all(vault_root).map_err(|e| StartupError::Fatal(format!("could not create the document vault: {e}")))?;
    let legacy: Vec<PathBuf> = legacy_vault.map(|p| vec![p.to_path_buf()]).unwrap_or_default();
    match vault::adopt(pool, vault_root, &legacy, incoming).await {
        Ok(adopted) if adopted != vault::Adopted::default() => log::info!("documents moved into the sealed vault: {adopted:?}"),
        Ok(_) => {}
        Err(e) => return Err(StartupError::Fatal(format!("could not move documents into the sealed vault (they are unchanged): {e}"))),
    }
    Ok(())
}

/// Turns the plaintext database at `db_path` into one encrypted under `keys`,
/// in place, without ever leaving the data unreadable or half converted:
///
/// 1. `sqlcipher_export` writes a complete encrypted copy beside it;
/// 2. the copy is opened with the key and compared with the original table by
///    table, and integrity-checked;
/// 3. only then is the original set aside, the copy renamed into its place, and
///    the original overwritten and removed.
///
/// If any step before 3 fails the original is untouched.
pub async fn encrypt_in_place(db_path: &Path, keys: &Keys) -> Result<(), String> {
    let copy = sibling(db_path, ".encrypting");
    let aside = sibling(db_path, ".plain-old");
    let _ = std::fs::remove_file(&copy);

    let mut plain = SqliteConnection::connect_with(&connect_options(db_path)).await.map_err(|e| e.to_string())?;
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&mut plain).await;
    let version: i64 = sqlx::query_scalar("PRAGMA user_version").fetch_one(&mut plain).await.map_err(|e| e.to_string())?;
    let raw = keys.db_pragma().trim_matches('"').to_string();

    sqlx::query("ATTACH DATABASE ?1 AS sealed KEY ?2").bind(copy.to_string_lossy().to_string()).bind(&raw).execute(&mut plain).await.map_err(|e| e.to_string())?;
    sqlx::query("SELECT sqlcipher_export('sealed')").execute(&mut plain).await.map_err(|e| e.to_string())?;
    sqlx::query(sqlx::AssertSqlSafe(format!("PRAGMA sealed.user_version = {version}"))).execute(&mut plain).await.map_err(|e| e.to_string())?;
    sqlx::query("DETACH DATABASE sealed").execute(&mut plain).await.map_err(|e| e.to_string())?;

    let verified = verify_copy(&mut plain, &copy, keys).await;
    let _ = plain.close().await;
    if let Err(reason) = verified {
        let _ = std::fs::remove_file(&copy);
        return Err(reason);
    }

    // From here a crash can be finished at the next start, because this marker
    // says the copy is whole; without it the copy is only ever discarded.
    let verified_marker = sibling(db_path, ".verified");
    std::fs::write(&verified_marker, b"1").map_err(|e| e.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(sibling(db_path, suffix));
    }
    std::fs::rename(db_path, &aside).map_err(|e| e.to_string())?;
    std::fs::rename(&copy, db_path).map_err(|e| e.to_string())?;
    vault::shred_file(&aside).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&verified_marker);
    Ok(())
}

/// The encrypted copy must open with the key, pass its integrity check, and
/// hold exactly the rows the original does.
async fn verify_copy(plain: &mut SqliteConnection, copy: &Path, keys: &Keys) -> Result<(), String> {
    let mut sealed = SqliteConnection::connect_with(&keyed_options(copy, keys)).await.map_err(|e| format!("the encrypted copy would not open: {e}"))?;
    let check: Vec<String> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(&mut sealed).await.map_err(|e| format!("the encrypted copy could not be checked: {e}"))?;
    if check != ["ok"] {
        return Err("the encrypted copy failed its integrity check".into());
    }
    let tables: Vec<String> = sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .fetch_all(&mut *plain)
        .await
        .map_err(|e| e.to_string())?;
    for table in tables {
        let count = format!("SELECT COUNT(*) FROM \"{}\"", table.replace('"', "\"\""));
        let before: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(count.clone())).fetch_one(&mut *plain).await.map_err(|e| e.to_string())?;
        let after: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(count)).fetch_one(&mut sealed).await.map_err(|e| format!("the encrypted copy is missing {table}: {e}"))?;
        if before != after {
            return Err(format!("the encrypted copy of {table} has {after} rows, the original {before}"));
        }
    }
    let _ = sealed.close().await;
    Ok(())
}

/// Finishes or undoes an encryption a crash interrupted. Runs first at start.
pub fn finish_interrupted_encryption(db_path: &Path) {
    let copy = sibling(db_path, ".encrypting");
    let aside = sibling(db_path, ".plain-old");
    let verified_marker = sibling(db_path, ".verified");
    // Stopped between setting the original aside and putting the copy in place:
    // finish the swap if the copy was verified whole, otherwise put the original back.
    if !db_path.exists() && aside.exists() {
        if copy.exists() && verified_marker.exists() {
            let _ = std::fs::rename(&copy, db_path);
        } else {
            let _ = std::fs::rename(&aside, db_path);
        }
    }
    // The copy is in place; the original was not yet destroyed.
    if db_path.exists() && aside.exists() && detect(db_path) == DbFile::Encrypted {
        let _ = vault::shred_file(&aside);
    }
    if db_path.exists() && !aside.exists() {
        let _ = std::fs::remove_file(&verified_marker);
    }
    // A partial copy from a run that never reached the swap.
    if copy.exists() && detect(db_path) != DbFile::Absent {
        let _ = std::fs::remove_file(&copy);
    }
}

/// Encrypts the plaintext databases earlier builds left around (snapshots taken
/// before a migration, databases a restore moved aside), so the data folder
/// holds no plaintext copy of the records. Best effort: a failure is logged and
/// the file is left as it was.
async fn protect_leftovers(data_dir: &Path, keys: &Keys) {
    for root in [data_dir.join("pre-migration"), data_dir.join("pre-restore")] {
        let Ok(files) = vault::walk(&root) else { continue };
        for file in files {
            if file.extension().is_some_and(|e| e == "db") && detect(&file) == DbFile::Plain {
                if let Err(e) = encrypt_in_place(&file, keys).await {
                    log::warn!("could not encrypt {}: {e}", file.display());
                }
            }
        }
    }
}

/// A copy of the database made just before an update changes its schema, so a
/// failed update can always be undone by restoring it. `VACUUM INTO` from the
/// open, keyed connection writes it under the same key.
async fn snapshot_before_migration(pool: &SqlitePool, data_dir: &Path, name: &str) -> Option<PathBuf> {
    let dir = data_dir.join("pre-migration");
    std::fs::create_dir_all(&dir).ok()?;
    let target = dir.join(format!("{name}-{}.db", chrono::Utc::now().format("%Y%m%d-%H%M%S")));
    sqlx::query("VACUUM INTO ?1").bind(target.to_string_lossy().to_string()).execute(pool).await.ok()?;

    let mut snapshots: Vec<_> = std::fs::read_dir(&dir).ok()?.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    snapshots.sort();
    while snapshots.len() > KEEP_PRE_MIGRATION_SNAPSHOTS {
        let oldest = snapshots.remove(0);
        let _ = vault::shred_file(&oldest);
    }
    Some(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SERVICE: &str = "com.pleadli.node-core-test";

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-db-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn an_interrupted_encryption_is_finished_or_undone_never_left_half_done() {
        let dir = temp_dir();
        let path = dir.join("test.db");
        let key = keys::open(SERVICE, &dir, true, false).unwrap();
        let plain = SqlitePoolOptions::new().connect_with(connect_options(&path)).await.unwrap();
        sqlx::query("CREATE TABLE t (v TEXT)").execute(&plain).await.unwrap();
        sqlx::query("INSERT INTO t VALUES ('kept')").execute(&plain).await.unwrap();
        plain.close().await;
        let original = std::fs::read(&path).unwrap();

        // Crashed after the original was set aside and before the copy was placed,
        // with no usable copy: the original comes back.
        std::fs::rename(&path, sibling(&path, ".plain-old")).unwrap();
        std::fs::write(sibling(&path, ".encrypting"), b"half written").unwrap();
        finish_interrupted_encryption(&path);
        assert!(std::fs::read(&path).unwrap() == original, "the original came back");

        // Crashed at the same point but with a whole encrypted copy: it is placed
        // and the plaintext original is destroyed.
        encrypt_in_place(&path, &key).await.unwrap();
        let encrypted = std::fs::read(&path).unwrap();
        std::fs::rename(&path, sibling(&path, ".encrypting")).unwrap();
        std::fs::write(sibling(&path, ".plain-old"), &original).unwrap();
        std::fs::write(sibling(&path, ".verified"), b"1").unwrap();
        finish_interrupted_encryption(&path);
        assert!(std::fs::read(&path).unwrap() == encrypted, "the whole copy was put in place");
        assert!(!sibling(&path, ".plain-old").exists(), "the plaintext original is gone");
        let mut conn = SqliteConnection::connect_with(&keyed_options(&path, &key)).await.unwrap();
        assert_eq!(sqlx::query_scalar::<_, String>("SELECT v FROM t").fetch_one(&mut conn).await.unwrap(), "kept");
    }

    #[tokio::test]
    async fn a_plain_database_is_encrypted_opened_and_checked_in_three_calls() {
        let dir = temp_dir();
        let path = dir.join("test.db");
        let plain = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&path)).await.unwrap();
        sqlx::query("CREATE TABLE t (v TEXT)").execute(&plain).await.unwrap();
        sqlx::query("INSERT INTO t VALUES ('Secret Name')").execute(&plain).await.unwrap();
        plain.close().await;
        assert!(is_plaintext(&path));

        let (keys, state) = match open_keys(SERVICE, &dir, &path) {
            Ok(opened) => opened,
            Err(_) => panic!("a plaintext database may be given a key"),
        };
        assert_eq!(state, DbFile::Plain);
        let opened = match open_pool(&path, &dir, &keys, state, 2).await {
            Ok(opened) => opened,
            Err(_) => panic!("the plain database must open once encrypted"),
        };
        assert!(opened.existed);
        assert!(!is_plaintext(&path));
        assert!(!std::fs::read(&path).unwrap().windows(11).any(|w| w == b"Secret Name"), "not readable on disk");
        let v: String = sqlx::query_scalar("SELECT v FROM t").fetch_one(&opened.pool).await.unwrap();
        assert_eq!(v, "Secret Name");
        assert!(!sibling(&path, ".plain-old").exists() && !sibling(&path, ".encrypting").exists());
    }

    #[tokio::test]
    async fn an_encrypted_database_without_its_key_is_recovery_and_no_key_is_invented() {
        let dir = temp_dir();
        let path = dir.join("test.db");
        // Any file that is not plain SQLite reads as "encrypted".
        std::fs::write(&path, [7u8; 4096]).unwrap();
        match open_keys(SERVICE, &dir, &path) {
            Err(StartupError::Recovery(reason)) => assert!(reason.contains("key"), "{reason}"),
            _ => panic!("expected recovery"),
        }
        assert!(!dir.join("node.key").exists(), "nothing was invented");
    }
}
