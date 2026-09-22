use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};

/// The advocate whose installation this is (one row).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdvocateProfile {
    pub name: String,
    pub firm: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProfileInput {
    pub name: String,
    pub firm: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
}

pub async fn get(pool: &SqlitePool) -> Result<Option<AdvocateProfile>, sqlx::Error> {
    sqlx::query_as("SELECT name, firm, phone, email, updated_at FROM advocate_profile WHERE id = 'default'").fetch_optional(pool).await
}

pub async fn save(pool: &SqlitePool, input: SaveProfileInput) -> Result<AdvocateProfile, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("Your name is needed: what you file is signed with it.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "INSERT INTO advocate_profile (id, name, firm, phone, email) VALUES ('default', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, firm = excluded.firm, phone = excluded.phone, email = excluded.email,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
    )
    .bind(&name)
    .bind(clean(input.firm))
    .bind(clean(input.phone))
    .bind(clean(input.email))
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("profile_saved").subject("advocate_profile", "default")).await?;
    tx.commit().await?;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}
