use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

#[cfg(debug_assertions)]
use crate::domain::prisoners;

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

    std::fs::create_dir_all(&vault_root).expect("create Pleadli Prisons Vault root");

    #[cfg(debug_assertions)]
    {
        prisoners::seed_if_empty(&pool).await?;
    }

    Ok(Db { pool, vault_root })
}
