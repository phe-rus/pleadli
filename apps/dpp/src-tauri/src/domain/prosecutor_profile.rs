//! Prosecutor profile (spec: docs/specs/_root/0001-officer-identity-sign-in).
//! DPP is a single prosecutor installation by deliberate product decision
//! (docs/dpp/PRODUCT.md), so this is a plain, editable singleton, not a
//! login or roster. It is the identity a decision, a document and the audit
//! trail are attributed to.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::error::{clean, invalid, DomainError};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ProsecutorProfile {
    pub name: String,
    pub rank: Option<String>,
    /// This installation is operated by the Director of Public Prosecutions
    /// personally, so the non-delegable decisions may be recorded on it.
    pub is_dpp: bool,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProsecutorProfileInput {
    pub name: String,
    pub rank: Option<String>,
    #[serde(default)]
    pub is_dpp: bool,
}

pub async fn get_prosecutor_profile(pool: &SqlitePool) -> Result<Option<ProsecutorProfile>, sqlx::Error> {
    sqlx::query_as::<_, ProsecutorProfile>(
        "SELECT name, rank, is_dpp, updated_at FROM prosecutor_profile WHERE id = 'default'",
    )
    .fetch_optional(pool)
    .await
}

pub async fn save_prosecutor_profile(pool: &SqlitePool, input: SaveProsecutorProfileInput) -> Result<ProsecutorProfile, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("The prosecutor's name is required.");
    }
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO prosecutor_profile (id, name, rank, is_dpp, updated_at) VALUES ('default', ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, rank = excluded.rank,
                                        is_dpp = excluded.is_dpp, updated_at = excluded.updated_at",
    )
    .bind(&name)
    .bind(clean(input.rank))
    .bind(input.is_dpp)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(get_prosecutor_profile(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}
