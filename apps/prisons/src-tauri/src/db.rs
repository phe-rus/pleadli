use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Sqlite, Transaction};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::domain::backup::{self, RestoreApplied};

/// Opens the node's database with durability settings chosen for a machine
/// that can lose power: WAL for concurrent readers, `synchronous = FULL` so a
/// committed change survives a power cut, foreign keys enforced, and a busy
/// timeout so a second writer waits instead of failing.
pub fn connect_options(db_path: &Path) -> SqliteConnectOptions {
    SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(10))
}

/// Every state-changing operation runs in one of these. `BEGIN IMMEDIATE`
/// takes the write lock up front, so a read-then-write inside the
/// transaction (the audit chain's "read the last hash, append the next")
/// can never be interleaved with another writer.
pub async fn begin_write(pool: &SqlitePool) -> Result<Transaction<'static, Sqlite>, sqlx::Error> {
    pool.begin_with("BEGIN IMMEDIATE").await
}

pub struct Startup {
    pub pool: SqlitePool,
    /// Set when a staged restore was applied on this start.
    pub restored: Option<RestoreApplied>,
    /// Set when migrations were about to change the schema and a snapshot of
    /// the previous database was taken first.
    pub pre_migration_snapshot: Option<PathBuf>,
}

pub enum StartupError {
    /// The database cannot be trusted. The node starts in recovery mode:
    /// nothing else runs until a backup is restored.
    Recovery(String),
    Fatal(String),
}

const KEEP_PRE_MIGRATION_SNAPSHOTS: usize = 3;

/// The full start of a node's database, in the order that keeps data safe:
/// apply a staged restore, check integrity, snapshot before migrating,
/// migrate. A database that fails its integrity check is never opened for
/// normal work.
pub async fn startup(data_dir: &Path, vault_root: &Path) -> Result<Startup, StartupError> {
    let db_path = data_dir.join("prisons.db");

    let restored = backup::apply_pending_restore(data_dir, &db_path, vault_root).map_err(|e| StartupError::Fatal(format!("could not apply the staged restore: {e}")))?;
    let existed = db_path.exists();

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(connect_options(&db_path))
        .await
        .map_err(|e| StartupError::Recovery(format!("the database could not be opened: {e}")))?;

    if existed {
        let check: Result<Vec<String>, _> = sqlx::query_scalar("PRAGMA quick_check").fetch_all(&pool).await;
        match check {
            Ok(rows) if rows.len() == 1 && rows[0] == "ok" => {}
            Ok(rows) => return Err(StartupError::Recovery(format!("the database failed its integrity check: {}", rows.join("; ")))),
            Err(e) => return Err(StartupError::Recovery(format!("the database could not be checked: {e}"))),
        }
    }

    let migrator = sqlx::migrate!("./migrations");
    let mut pre_migration_snapshot = None;
    if existed {
        let applied: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations")
            .fetch_one(&pool)
            .await
            .unwrap_or(0);
        if applied > 0 && (applied as usize) < migrator.iter().count() {
            pre_migration_snapshot = snapshot_before_migration(&pool, data_dir).await;
        }
    }

    migrator.run(&pool).await.map_err(|e| StartupError::Fatal(format!("migration failed: {e}")))?;

    if let Some(applied) = &restored {
        backup::record_restore(&pool, applied).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    #[cfg(debug_assertions)]
    {
        crate::domain::prisoners::seed_if_empty(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    Ok(Startup { pool, restored, pre_migration_snapshot })
}

/// A plain copy of the database made just before an update changes its
/// schema, so a failed update can always be undone by restoring it. It is no
/// more exposed than the live database next to it.
async fn snapshot_before_migration(pool: &SqlitePool, data_dir: &Path) -> Option<PathBuf> {
    let dir = data_dir.join("pre-migration");
    std::fs::create_dir_all(&dir).ok()?;
    let target = dir.join(format!("prisons-{}.db", chrono::Utc::now().format("%Y%m%d-%H%M%S")));
    sqlx::query("VACUUM INTO ?1").bind(target.to_string_lossy().to_string()).execute(pool).await.ok()?;

    let mut snapshots: Vec<_> = std::fs::read_dir(&dir).ok()?.filter_map(|e| e.ok()).map(|e| e.path()).collect();
    snapshots.sort();
    while snapshots.len() > KEEP_PRE_MIGRATION_SNAPSHOTS {
        let oldest = snapshots.remove(0);
        let _ = std::fs::remove_file(oldest);
    }
    Some(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-startup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        dir
    }

    #[tokio::test]
    async fn a_corrupt_database_is_never_opened_for_work() {
        let dir = temp_dir();
        std::fs::write(dir.join("prisons.db"), vec![0xAB; 8192]).unwrap();
        match startup(&dir, &dir.join("vault")).await {
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

        let started = startup(&dir, &dir.join("vault")).await.ok().expect("startup migrates");
        let snapshot = started.pre_migration_snapshot.expect("a snapshot is taken before migrating");
        assert!(snapshot.exists());

        // The old admin survived the officers-table rebuild with its role mapped.
        let (role, is_admin): (String, bool) =
            sqlx::query_as("SELECT role, is_admin FROM officers WHERE id = 'o1'").fetch_one(&started.pool).await.unwrap();
        assert_eq!((role.as_str(), is_admin), ("oic", true), "a legacy admin becomes an OIC administrator");
    }

    #[tokio::test]
    async fn a_fresh_database_takes_no_snapshot() {
        let dir = temp_dir();
        let started = startup(&dir, &dir.join("vault")).await.ok().expect("fresh start");
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
}
