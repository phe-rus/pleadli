//! The prosecutor acting: the signed-in person (or, with no sign-in, the
//! administrator), read through the `prosecutor_profile` view (migration
//! 0020). It is the identity a decision, a document and the audit trail are
//! attributed to.

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

/// Saves the signed-in person's own details. Whether someone is the Director
/// decides the non-delegable decisions, so only an administrator may change it.
pub async fn save_prosecutor_profile(pool: &SqlitePool, input: SaveProsecutorProfileInput) -> Result<ProsecutorProfile, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("The prosecutor's name is required.");
    }
    let current: Option<(String, String, bool)> =
        sqlx::query_as("SELECT staff_id, role, is_dpp FROM prosecutor_profile WHERE id = 'default'").fetch_optional(pool).await?;
    let Some((id, role, is_dpp)) = current else {
        return Err(DomainError::Forbidden("Nobody is signed in.".to_string()));
    };
    if input.is_dpp != is_dpp && role != "administrator" {
        return Err(DomainError::Forbidden("Only an administrator can mark someone as the head of the prosecution service.".to_string()));
    }
    sqlx::query("UPDATE staff SET name = ?, rank = ?, is_dpp = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(clean(input.rank))
        .bind(input.is_dpp)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&id)
        .execute(pool)
        .await?;

    Ok(get_prosecutor_profile(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}
