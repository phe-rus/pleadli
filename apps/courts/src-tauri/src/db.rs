//! Opening the database, in the order that keeps it safe: find (or make) the
//! key, encrypt a database that is still plaintext, check integrity, snapshot
//! before migrating, migrate. A database that fails its integrity check is
//! never opened for normal work: the app starts in recovery.
//!
//! The steps that do not depend on the application live in
//! `packages/node-core` (`db`); this file keeps the order and what is Courts' own.
//! The vault stores sealed recordings and immutable case attachments.

use sqlx::sqlite::SqlitePool;
use std::path::{Path, PathBuf};

use pleadli_node_core::db as core;
pub use pleadli_node_core::db::StartupError;

use crate::domain::keys;

pub struct Db {
    pub pool: SqlitePool,
    /// Where sealed files are: `<data dir>/vault`.
    pub vault_root: PathBuf,
    pub security: std::sync::Arc<crate::domain::security::Security>,
}

const DB_FILE: &str = "courts.db";

/// The newest migration this build has: a backup from a newer build is refused.
pub fn latest_migration() -> i64 {
    sqlx::migrate!("./migrations").iter().map(|m| m.version).max().unwrap_or(0)
}

pub async fn startup(data_dir: &Path) -> Result<Db, StartupError> {
    let db_path = data_dir.join(DB_FILE);
    std::fs::create_dir_all(data_dir).map_err(|e| StartupError::Fatal(format!("could not create the data folder: {e}")))?;

    let vault_root = data_dir.join("vault");
    let incoming = data_dir.join("vault-incoming");

    // A backup staged for restore (Settings, Daily backups) goes in place
    // first; the current database and vault are kept aside.
    match pleadli_node_core::snapshot::apply_pending_sealed(data_dir, &db_path, &vault_root, &incoming) {
        Ok(Some(applied)) => log::info!("backup restored: {} vault files", applied.documents),
        Ok(None) => {}
        Err(e) => return Err(StartupError::Fatal(format!("could not put the restored backup in place: {e}"))),
    }

    core::finish_interrupted_encryption(&db_path);
    let (db_keys, state) = core::open_keys(keys::SERVICE, data_dir, &db_path)?;
    let opened = core::open_pool(&db_path, data_dir, &db_keys, state, 5).await?;
    let pool = opened.pool;

    let migrator = sqlx::migrate!("./migrations");
    core::snapshot_if_migrating(&pool, &migrator, data_dir, opened.existed, "courts").await;
    migrator.run(&pool).await.map_err(|e| StartupError::Fatal(format!("migration failed: {e}")))?;

    // Restored recordings and attachments, sealed under this computer's key.
    match crate::domain::orchestra::seal_restored(&incoming, &vault_root) {
        Ok(0) => {}
        Ok(n) => log::info!("restored vault files sealed: {n}"),
        Err(e) => return Err(StartupError::Fatal(format!("could not seal the restored files (they are kept): {e}"))),
    }

    // A recording still running at start was cut short: close it, keep what was saved.
    match crate::domain::recordings::mark_interrupted(&pool).await {
        Ok(0) => {}
        Ok(n) => log::warn!("{n} recording(s) were cut short by the last shutdown and were closed as interrupted"),
        Err(e) => return Err(StartupError::Fatal(e.to_string())),
    }

    #[cfg(debug_assertions)]
    crate::domain::seed::seed_if_empty(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;

    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    crate::domain::profile::sync_from_session(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;

    Ok(Db { pool, vault_root, security })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_node_core::db::{connect_options, is_plaintext};
    use sqlx::sqlite::SqlitePoolOptions;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("courts-startup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn a_new_installation_gets_an_encrypted_database_that_reopens() {
        let dir = temp_dir();
        let db = startup(&dir).await.ok().unwrap();
        sqlx::query("INSERT INTO cases (id, court_number, title) VALUES ('c1', 'CRB 1/2026', 'State v. Secret Name')").execute(&db.pool).await.unwrap();
        db.pool.close().await;
        let path = dir.join(DB_FILE);
        assert!(!is_plaintext(&path));
        assert!(!std::fs::read(&path).unwrap().windows(11).any(|w| w == b"Secret Name"), "the name is not readable on disk");

        let again = startup(&dir).await.ok().unwrap();
        let title: String = sqlx::query_scalar("SELECT title FROM cases WHERE id = 'c1'").fetch_one(&again.pool).await.unwrap();
        assert_eq!(title, "State v. Secret Name");
    }

    #[tokio::test]
    async fn an_encrypted_database_without_its_key_starts_in_recovery_and_is_not_re_keyed() {
        let dir = temp_dir();
        drop(startup(&dir).await.ok().unwrap());
        std::fs::remove_file(dir.join("node.key")).unwrap();
        match startup(&dir).await {
            Err(StartupError::Recovery(_)) => {}
            _ => panic!("expected recovery"),
        }
        assert!(!dir.join("node.key").exists(), "no key was invented for a database that already exists");
    }

    /// A registry that already has an order sent to a prison must still start
    /// after the order table is rebuilt for committal orders (found running the
    /// app on real earlier data: a fresh database has no rows pointing at orders).
    #[tokio::test]
    async fn an_older_database_with_a_sent_order_migrates_and_keeps_it() {
        use std::borrow::Cow;
        let dir = temp_dir();
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&dir.join("old.db"))).await.unwrap();
        let mut migrator = sqlx::migrate!("./migrations");
        let all = migrator.migrations.to_vec();
        migrator.migrations = Cow::Owned(all.iter().filter(|m| m.version < 18).cloned().collect());
        migrator.run(&pool).await.unwrap();
        sqlx::query("INSERT INTO cases (id, court_number, title) VALUES ('c1', 'CRB 1/2026', 'State v. X')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO orders (id, case_id, kind, title) VALUES ('o1', 'c1', 'remand', 'Remand')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO prison_links (id, prison_id, prison_name, prison_verifying_key, prison_encryption_key, fingerprint, status, responded_at) VALUES ('l1', 'p1', 'Prison', 'k', 'k', 'f', 'trusted', 1)").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO prison_outgoing (id, link_id, order_id, seq, payload, prepared_at) VALUES ('d1', 'l1', 'o1', 1, '{}', 1)").execute(&pool).await.unwrap();

        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prison_outgoing WHERE order_id = 'o1'").fetch_one(&pool).await.unwrap();
        assert_eq!(sent, 1, "the sent order is still there");
        let broken: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check").fetch_all(&pool).await.unwrap();
        assert!(broken.is_empty(), "{broken:?}");
        sqlx::query("INSERT INTO orders (id, case_id, kind, title) VALUES ('o2', 'c1', 'committal', 'Committal')").execute(&pool).await.unwrap();
        pool.close().await;
    }

    #[tokio::test]
    async fn a_plain_database_is_encrypted_in_place_and_keeps_its_rows() {
        let dir = temp_dir();
        let path = dir.join(DB_FILE);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&path)).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("INSERT INTO cases (id, court_number, title) VALUES ('c1', 'CRB 1/2026', 'State v. Secret Name')").execute(&pool).await.unwrap();
        pool.close().await;
        assert!(is_plaintext(&path));

        let db = startup(&dir).await.ok().unwrap();
        assert!(!is_plaintext(&path));
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE id = 'c1'").fetch_one(&db.pool).await.unwrap();
        assert_eq!(n, 1);
    }
}
