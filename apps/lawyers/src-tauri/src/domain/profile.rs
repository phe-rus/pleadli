use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};

/// The person signed in, as documents and the audit trail see them. It is a
/// view of the active session (migration 0008); `firm` is the practice's name.
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

/// The person acting on the computer this request came from.
pub async fn get(pool: &SqlitePool) -> Result<Option<AdvocateProfile>, sqlx::Error> {
    let Some(actor) = super::request::actor() else { return Ok(None) };
    sqlx::query_as("SELECT s.name, i.office_name AS firm, s.phone, s.email, s.updated_at FROM staff s LEFT JOIN installation i ON i.id = 'this' WHERE s.id = ?")
        .bind(actor.id)
        .fetch_optional(pool)
        .await
}

/// Saves the signed-in person's own details. The practice's name changes only
/// for an administrator; for anyone else it is left as it is.
pub async fn save(pool: &SqlitePool, input: SaveProfileInput) -> Result<AdvocateProfile, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("Your name is needed: what you file is signed with it.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let acting = super::request::actor().map(|a| (a.id, a.is_admin));
    let Some((staff_id, is_admin)) = acting else {
        return Err(DomainError::Forbidden("Nobody is signed in.".to_string()));
    };
    sqlx::query("UPDATE staff SET name = ?, phone = ?, email = ?, updated_at = ? WHERE id = ?")
        .bind(&name)
        .bind(clean(input.phone))
        .bind(clean(input.email))
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(&staff_id)
        .execute(&mut *tx)
        .await?;
    if let (true, Some(firm)) = (is_admin, clean(input.firm)) {
        sqlx::query("UPDATE installation SET office_name = ? WHERE id = 'this'").bind(firm).execute(&mut *tx).await?;
    }
    audit::record(&mut tx, Entry::new("profile_saved").subject("staff", &staff_id)).await?;
    tx.commit().await?;
    Ok(get(pool).await?.ok_or(sqlx::Error::RowNotFound)?)
}
