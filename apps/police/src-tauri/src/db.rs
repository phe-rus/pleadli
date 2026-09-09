use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::PathBuf;

#[cfg(debug_assertions)]
use crate::domain::people;
#[cfg(debug_assertions)]
use crate::domain::station_diary;

pub struct Db {
    pub pool: SqlitePool,
}

pub async fn connect(db_path: PathBuf) -> Result<Db, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    #[cfg(debug_assertions)]
    {
        people::seed_if_empty(&pool).await?;
        station_diary::seed_if_empty(&pool).await?;
    }

    Ok(Db { pool })
}
