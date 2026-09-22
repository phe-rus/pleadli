use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};

/// The judicial officer whose installation this is (one row).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BenchProfile {
    pub name: String,
    pub title: Option<String>,
    pub court_name: Option<String>,
    pub court_level: String,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProfileInput {
    pub name: String,
    pub title: Option<String>,
    pub court_name: Option<String>,
    pub court_level: String,
}

pub async fn get(pool: &SqlitePool) -> Result<Option<BenchProfile>, sqlx::Error> {
    sqlx::query_as("SELECT name, title, court_name, court_level, updated_at FROM bench_profile WHERE id = 'default'").fetch_optional(pool).await
}

pub async fn save(pool: &SqlitePool, input: SaveProfileInput) -> Result<BenchProfile, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("Your name is needed: an order is signed with it.");
    }
    if !matches!(input.court_level.as_str(), "magistrate" | "high") {
        return invalid("The court level is a magistrates court or the High Court.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "INSERT INTO bench_profile (id, name, title, court_name, court_level) VALUES ('default', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title, court_name = excluded.court_name,
            court_level = excluded.court_level, updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
    )
    .bind(&name)
    .bind(clean(input.title))
    .bind(clean(input.court_name))
    .bind(&input.court_level)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("profile_saved").subject("bench_profile", "default")).await?;
    tx.commit().await?;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}
