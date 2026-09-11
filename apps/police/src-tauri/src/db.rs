use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

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

pub async fn connect(db_path: PathBuf, vault_root: PathBuf) -> Result<Db, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    std::fs::create_dir_all(&vault_root).expect("create Police Vault root");

    #[cfg(debug_assertions)]
    {
        people::seed_if_empty(&pool, &vault_root).await?;
        station_diary::seed_if_empty(&pool, &vault_root).await?;
        incidents::seed_if_empty(&pool, &vault_root).await?;
        duty::seed_if_empty(&pool, &vault_root).await?;
        station_assets::seed_if_empty(&pool, &vault_root).await?;
        vehicles::seed_if_empty(&pool, &vault_root).await?;
        cases::seed_if_empty(&pool, &vault_root).await?;
        statements::seed_if_empty(&pool, &vault_root).await?;
        custody::seed_if_empty(&pool, &vault_root).await?;
        bonds::seed_if_empty(&pool, &vault_root).await?;
        exhibits::seed_if_empty(&pool, &vault_root).await?;
        charge_sheets::seed_if_empty(&pool, &vault_root).await?;
        referrals::seed_if_empty(&pool, &vault_root).await?;
        station_admin::seed_if_empty(&pool, &vault_root).await?;
        // Depends on at least one officer already existing — officer
        // accounts are never auto-seeded (they carry real login
        // credentials), so this is a no-op until one is created through
        // the app itself, same as the whole remote-access/backup-alert
        // system already requires.
        shift_log::seed_if_empty(&pool, &vault_root).await?;
    }

    Ok(Db { pool, vault_root })
}
