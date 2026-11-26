//! The proving checklist of the Decide step: which of the things an offence
//! needs proved the prosecutor has found in the papers, and on which page.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::error::clean;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub item: String,
    #[sqlx(try_from = "i64")]
    pub done: bool,
    pub page: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInput {
    pub file_id: String,
    pub item: String,
    pub done: bool,
    pub page: Option<String>,
}

pub async fn list(pool: &SqlitePool, file_id: &str) -> Result<Vec<Check>, sqlx::Error> {
    sqlx::query_as("SELECT item, done, page FROM proving_checks WHERE prosecution_file_id = ? ORDER BY rowid").bind(file_id).fetch_all(pool).await
}

pub async fn set(pool: &SqlitePool, input: CheckInput, actor: Option<&str>) -> Result<Vec<Check>, sqlx::Error> {
    sqlx::query(
        "INSERT INTO proving_checks (prosecution_file_id, item, done, page, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(prosecution_file_id, item) DO UPDATE SET done = excluded.done, page = excluded.page, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    )
    .bind(&input.file_id)
    .bind(input.item.trim())
    .bind(i64::from(input.done))
    .bind(clean(input.page))
    .bind(actor)
    .bind(chrono::Utc::now().timestamp_millis())
    .execute(pool)
    .await?;
    list(pool, &input.file_id).await
}
