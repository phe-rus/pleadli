//! Opening the database, in the order that keeps it safe: find (or make) the
//! key, encrypt a database that is still plaintext, check integrity, snapshot
//! before migrating, migrate. A database that fails its integrity check is
//! never opened for normal work: the app starts in recovery.
//!
//! The steps that do not depend on the application live in
//! `packages/node-core` (`db`); this file keeps the order and what is
//! Police's own: the Police Vault (a separate, content-addressed store of
//! original files and generated documents, not yet sealed under the vault
//! key node-core provides) and this application's debug-only seed data.

use sqlx::sqlite::SqlitePool;
use std::path::{Path, PathBuf};

use pleadli_node_core::db as core;
pub use pleadli_node_core::db::StartupError;

use crate::domain::keys;

#[cfg(debug_assertions)]
use crate::domain::bonds;
#[cfg(debug_assertions)]
use crate::domain::cases;
#[cfg(debug_assertions)]
use crate::domain::charge_sheets;
#[cfg(debug_assertions)]
use crate::domain::custody;
#[cfg(debug_assertions)]
use crate::domain::duty;
#[cfg(debug_assertions)]
use crate::domain::exhibits;
#[cfg(debug_assertions)]
use crate::domain::incidents;
#[cfg(debug_assertions)]
use crate::domain::people;
#[cfg(debug_assertions)]
use crate::domain::referrals;
#[cfg(debug_assertions)]
use crate::domain::statements;
#[cfg(debug_assertions)]
use crate::domain::station_admin;
#[cfg(debug_assertions)]
use crate::domain::station_assets;
#[cfg(debug_assertions)]
use crate::domain::shift_log;
#[cfg(debug_assertions)]
use crate::domain::station_diary;
#[cfg(debug_assertions)]
use crate::domain::vehicles;

pub struct Db {
    pub pool: SqlitePool,
    pub vault_root: PathBuf,
}

const DB_FILE: &str = "police.db";

pub async fn startup(data_dir: &Path, vault_root: PathBuf) -> Result<Db, StartupError> {
    let db_path = data_dir.join(DB_FILE);
    std::fs::create_dir_all(data_dir).map_err(|e| StartupError::Fatal(format!("could not create the data folder: {e}")))?;

    core::finish_interrupted_encryption(&db_path);
    let (db_keys, state) = core::open_keys(keys::SERVICE, data_dir, &db_path)?;
    let opened = core::open_pool(&db_path, data_dir, &db_keys, state, 5).await?;
    let pool = opened.pool;

    let migrator = sqlx::migrate!("./migrations");
    core::snapshot_if_migrating(&pool, &migrator, data_dir, opened.existed, "police").await;
    migrator.run(&pool).await.map_err(|e| StartupError::Fatal(format!("migration failed: {e}")))?;

    std::fs::create_dir_all(&vault_root).map_err(|e| StartupError::Fatal(format!("could not create the Police Vault: {e}")))?;

    // Older rows stored where a file is as an absolute path; the vault's own
    // files are now recorded relative to the vault root.
    crate::domain::attachments::normalise_stored_paths(&pool, &vault_root)
        .await
        .map_err(|e| StartupError::Fatal(format!("could not normalise vault paths: {e}")))?;

    #[cfg(debug_assertions)]
    seed_debug_data(&pool, &vault_root).await.map_err(|e| StartupError::Fatal(e.to_string()))?;

    Ok(Db { pool, vault_root })
}

#[cfg(debug_assertions)]
async fn seed_debug_data(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    people::seed_if_empty(pool, vault_root).await?;
    station_diary::seed_if_empty(pool, vault_root).await?;
    incidents::seed_if_empty(pool, vault_root).await?;
    duty::seed_if_empty(pool, vault_root).await?;
    station_assets::seed_if_empty(pool, vault_root).await?;
    vehicles::seed_if_empty(pool, vault_root).await?;
    cases::seed_if_empty(pool, vault_root).await?;
    statements::seed_if_empty(pool, vault_root).await?;
    custody::seed_if_empty(pool, vault_root).await?;
    bonds::seed_if_empty(pool, vault_root).await?;
    exhibits::seed_if_empty(pool, vault_root).await?;
    charge_sheets::seed_if_empty(pool, vault_root).await?;
    referrals::seed_if_empty(pool, vault_root).await?;
    station_admin::seed_if_empty(pool, vault_root).await?;
    // Depends on at least one officer already existing: officer accounts are
    // never auto-seeded (they carry real login credentials), so this is a
    // no-op until one is created through the app itself, same as the whole
    // remote-access/backup-alert system already requires.
    shift_log::seed_if_empty(pool, vault_root).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_node_core::db::{connect_options, is_plaintext};
    use sqlx::sqlite::SqlitePoolOptions;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("police-startup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn a_new_installation_gets_an_encrypted_database_that_reopens() {
        let dir = temp_dir();
        let vault = dir.join("vault");
        let db = startup(&dir, vault.clone()).await.ok().unwrap();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Secret', 'Person')")
            .execute(&db.pool)
            .await
            .unwrap();
        db.pool.close().await;
        let path = dir.join(DB_FILE);
        assert!(!is_plaintext(&path));
        assert!(!std::fs::read(&path).unwrap().windows(12).any(|w| w == b"Secret Perso"), "the name is not readable on disk");

        let again = startup(&dir, vault).await.ok().unwrap();
        let name: String = sqlx::query_scalar("SELECT first_name FROM people WHERE id = 'p1'").fetch_one(&again.pool).await.unwrap();
        assert_eq!(name, "Secret");
        again.pool.close().await;
    }

    #[tokio::test]
    async fn an_encrypted_database_without_its_key_starts_in_recovery_and_is_not_re_keyed() {
        let dir = temp_dir();
        let vault = dir.join("vault");
        startup(&dir, vault.clone()).await.ok().unwrap().pool.close().await;
        std::fs::remove_file(dir.join("node.key")).unwrap();
        match startup(&dir, vault).await {
            Err(StartupError::Recovery(_)) => {}
            _ => panic!("expected recovery"),
        }
        assert!(!dir.join("node.key").exists(), "no key was invented for a database that already exists");
    }

    #[tokio::test]
    async fn a_plain_database_is_encrypted_in_place_and_keeps_its_rows() {
        let dir = temp_dir();
        let vault = dir.join("vault");
        let path = dir.join(DB_FILE);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&path)).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("INSERT INTO people (id, first_name, last_name) VALUES ('p1', 'Secret', 'Person')")
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;
        assert!(is_plaintext(&path));

        let db = startup(&dir, vault).await.ok().unwrap();
        assert!(!is_plaintext(&path));
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people WHERE id = 'p1'").fetch_one(&db.pool).await.unwrap();
        assert_eq!(n, 1);
        db.pool.close().await;
    }
}
