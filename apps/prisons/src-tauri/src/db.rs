//! Opening the node's database: the full start of a node's data, in the order
//! that keeps it safe. The steps that do not depend on the application live in
//! `packages/node-core` (`db`); this file keeps the order and what is Prisons'
//! own (its restore, its sealed credentials, its migrations, its seed data).

use sqlx::sqlite::SqlitePool;
use std::path::{Path, PathBuf};

use pleadli_node_core::db as core;
pub use pleadli_node_core::db::{begin_write, is_plaintext, keyed_options, StartupError};
#[cfg(test)]
pub use pleadli_node_core::db::connect_options;

use crate::domain::backup::{self, RestoreApplied};
use crate::domain::keys;
use crate::domain::vault;

pub struct Startup {
    pub pool: SqlitePool,
    /// Set when a staged restore was applied on this start.
    #[cfg_attr(not(test), allow(dead_code))]
    pub restored: Option<RestoreApplied>,
    /// Set when migrations were about to change the schema and a snapshot of
    /// the previous database was taken first.
    pub pre_migration_snapshot: Option<PathBuf>,
}

/// The full start of a node's database, in the order that keeps data safe:
/// apply a staged restore, find (or make) the key, encrypt a database that is
/// still plaintext, check integrity, snapshot before migrating, migrate, then
/// bring every document into the sealed vault. A database that fails its
/// integrity check is never opened for normal work.
///
/// `legacy_vault` is where older builds kept plaintext documents; it is read
/// only to move what is there into the sealed vault.
pub async fn startup(data_dir: &Path, vault_root: &Path, legacy_vault: Option<&Path>) -> Result<Startup, StartupError> {
    let db_path = data_dir.join("prisons.db");
    let incoming = data_dir.join(vault::INCOMING_DIR);

    core::finish_interrupted_encryption(&db_path);
    let restored = backup::apply_pending_restore(data_dir, &db_path, &incoming).map_err(|e| StartupError::Fatal(format!("could not apply the staged restore: {e}")))?;

    let (db_keys, state) = core::open_keys(keys::SERVICE, data_dir, &db_path)?;
    crate::domain::secrets::init(data_dir).map_err(|e| StartupError::Fatal(e.to_string()))?;
    let opened = core::open_pool(&db_path, data_dir, &db_keys, state, 8).await?;
    let pool = opened.pool;

    // Before the pre-migration snapshot below, which would otherwise copy any
    // credential still stored as plaintext into a second file.
    crate::domain::secrets::seal_existing(&pool).await.map_err(|e| StartupError::Fatal(format!("could not seal stored credentials: {e}")))?;

    let migrator = sqlx::migrate!("./migrations");
    let pre_migration_snapshot = core::snapshot_if_migrating(&pool, &migrator, data_dir, opened.existed, "prisons").await;

    migrator.run(&pool).await.map_err(|e| StartupError::Fatal(format!("migration failed: {e}")))?;
    crate::domain::secrets::seal_existing(&pool).await.map_err(|e| StartupError::Fatal(format!("could not seal stored credentials: {e}")))?;

    if let Some(applied) = &restored {
        backup::record_restore(&pool, applied).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    core::adopt_documents(&pool, vault_root, legacy_vault, &incoming).await?;

    #[cfg(debug_assertions)]
    {
        crate::domain::prisoners::seed_if_empty(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    Ok(Startup { pool, restored, pre_migration_snapshot })
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_node_core::db::{detect, sibling, DbFile};
    use sqlx::sqlite::SqlitePoolOptions;
    use sqlx::{Connection, SqliteConnection};
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-startup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        dir
    }

    #[tokio::test]
    async fn starting_creates_the_key_and_seals_a_credential_left_as_plaintext() {
        let dir = temp_dir();
        let first = match startup(&dir, &dir.join("vault"), None).await {
            Ok(started) => started,
            Err(_) => panic!("a fresh start must succeed"),
        };
        assert!(dir.join("secrets.key").exists());
        sqlx::query("UPDATE node_config SET remote_device_token = 'plain-device' WHERE id = 'default'").execute(&first.pool).await.unwrap();
        first.pool.close().await;

        // An install from before secrets were sealed comes up sealed.
        let second = match startup(&dir, &dir.join("vault"), None).await {
            Ok(started) => started,
            Err(_) => panic!("a restart must succeed"),
        };
        let stored: String = sqlx::query_scalar("SELECT remote_device_token FROM node_config WHERE id = 'default'").fetch_one(&second.pool).await.unwrap();
        assert!(stored.starts_with("enc:v1:") && !stored.contains("plain-device"));
        assert_eq!(crate::domain::nodeconfig::get(&second.pool).await.unwrap().remote_device_token.as_deref(), Some("plain-device"));
    }

    #[tokio::test]
    async fn a_corrupt_database_is_never_opened_for_work() {
        let dir = temp_dir();
        std::fs::write(dir.join("prisons.db"), vec![0xAB; 8192]).unwrap();
        match startup(&dir, &dir.join("vault"), None).await {
            Err(StartupError::Recovery(reason)) => assert!(!reason.is_empty()),
            Err(StartupError::Fatal(reason)) => panic!("should be recoverable, got fatal: {reason}"),
            Ok(_) => panic!("a corrupt database must not start normally"),
        }
    }

    #[tokio::test]
    async fn an_update_snapshots_the_database_before_it_changes_the_schema() {
        let dir = temp_dir();
        // A database left by an older build: migrations only up to 20.
        let old = SqlitePoolOptions::new().connect_with(connect_options(&dir.join("prisons.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run_to(20, &old).await.unwrap();
        sqlx::query("INSERT INTO officers (id, badge_number, name, role, password_hash) VALUES ('o1', 'B1', 'Old Admin', 'admin', 'x')")
            .execute(&old)
            .await
            .unwrap();
        old.close().await;

        let started = startup(&dir, &dir.join("vault"), None).await.ok().expect("startup migrates");
        let snapshot = started.pre_migration_snapshot.expect("a snapshot is taken before migrating");
        assert!(snapshot.exists());
        assert_eq!(detect(&snapshot), DbFile::Encrypted, "the snapshot is no more readable than the database");
        assert_eq!(detect(&dir.join("prisons.db")), DbFile::Encrypted, "the older plaintext database was encrypted in place");
        assert!(!sibling(&dir.join("prisons.db"), ".plain-old").exists() && !sibling(&dir.join("prisons.db"), ".encrypting").exists());
        let raw = std::fs::read(dir.join("prisons.db")).unwrap();
        assert!(!raw.windows(9).any(|w| w == b"Old Admin"), "no record is readable in the file");

        // The old admin survived the officers-table rebuild with its role mapped.
        let (role, is_admin): (String, bool) =
            sqlx::query_as("SELECT role, is_admin FROM officers WHERE id = 'o1'").fetch_one(&started.pool).await.unwrap();
        assert_eq!((role.as_str(), is_admin), ("oic", true), "a legacy admin becomes an OIC administrator");
    }

    #[tokio::test]
    async fn a_fresh_database_takes_no_snapshot() {
        let dir = temp_dir();
        let started = startup(&dir, &dir.join("vault"), None).await.ok().expect("fresh start");
        assert!(started.pre_migration_snapshot.is_none());
        assert!(started.restored.is_none());
    }

    #[tokio::test]
    async fn recovery_mode_serves_only_recovery_and_only_to_the_local_machine() {
        let dir = temp_dir();
        let router = crate::api::recovery::router(dir.clone(), "the database failed its integrity check".into());

        let get = |path: &str, ingress: Option<crate::api::guard::Ingress>| {
            let mut req = Request::builder().uri(path).body(Body::empty()).unwrap();
            if let Some(i) = ingress {
                req.extensions_mut().insert(i);
            }
            router.clone().oneshot(req)
        };
        let response = get("/api/system/recovery", None).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        assert!(String::from_utf8_lossy(&body).contains("\"recovering\":true"));

        // Nothing of the domain exists in recovery mode.
        assert_eq!(get("/api/prisons/prisoners", None).await.unwrap().status(), StatusCode::NOT_FOUND);

        // Restore is for the node's own machine only.
        let mut req = Request::builder()
            .method("POST")
            .uri("/api/system/recovery/restore")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"path":"/x","passphrase":"y"}"#))
            .unwrap();
        req.extensions_mut().insert(crate::api::guard::Ingress::Lan);
        assert_eq!(router.clone().oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn an_encrypted_database_needs_its_key_and_is_never_re_keyed() {
        let dir = temp_dir();
        let first = startup(&dir, &dir.join("vault"), None).await.ok().expect("fresh start");
        first.pool.close().await;
        assert_eq!(detect(&dir.join("prisons.db")), DbFile::Encrypted);

        // The data folder is copied without its key.
        std::fs::remove_file(dir.join("node.key")).unwrap();
        match startup(&dir, &dir.join("vault"), None).await {
            Err(StartupError::Recovery(reason)) => assert!(reason.contains("key"), "{reason}"),
            _ => panic!("a database without its key must go to recovery"),
        }
        assert!(!dir.join("node.key").exists(), "no new key was invented for it");
    }

    #[tokio::test]
    async fn an_encrypted_database_opens_only_with_the_right_key() {
        let dir = temp_dir();
        let started = startup(&dir, &dir.join("vault"), None).await.ok().expect("fresh start");
        started.pool.close().await;
        let path = dir.join("prisons.db");
        let wrong = pleadli_node_core::keys::open(crate::domain::keys::SERVICE, &temp_dir(), true, false).unwrap();
        assert!(SqliteConnection::connect_with(&keyed_options(&path, &wrong)).await.is_err(), "another key reads nothing");
        let none = SqliteConnection::connect_with(&connect_options(&path)).await;
        let unreadable = match none {
            Err(_) => true,
            Ok(mut conn) => sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sqlite_master").fetch_one(&mut conn).await.is_err(),
        };
        assert!(unreadable, "no key reads nothing");
    }
}
