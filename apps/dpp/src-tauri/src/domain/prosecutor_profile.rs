//! Prosecutor profile (spec: docs/specs/_root/0001-officer-identity-sign-in).
//! DPP is a single prosecutor installation by deliberate product decision
//! (docs/dpp/PRODUCT.md), so this is a plain, editable singleton, not a
//! login or roster.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProsecutorProfile {
    pub name: String,
    pub rank: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProsecutorProfileInput {
    pub name: String,
    pub rank: Option<String>,
}

pub async fn get_prosecutor_profile(pool: &SqlitePool) -> Result<Option<ProsecutorProfile>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutorProfile>("SELECT name, rank, updated_at FROM prosecutor_profile WHERE id = 'default'")
        .fetch_optional(pool)
        .await
}

pub async fn save_prosecutor_profile(pool: &SqlitePool, input: SaveProsecutorProfileInput) -> Result<ProsecutorProfile, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO prosecutor_profile (id, name, rank, updated_at) VALUES ('default', ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, rank = excluded.rank, updated_at = excluded.updated_at",
    )
    .bind(&input.name)
    .bind(&input.rank)
    .bind(now)
    .execute(pool)
    .await?;

    get_prosecutor_profile(pool).await?.ok_or(sqlx::Error::RowNotFound)
}
