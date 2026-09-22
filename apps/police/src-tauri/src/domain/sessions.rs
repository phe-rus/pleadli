//! Sign-ins on this machine: an opaque token whose SHA-256 is what the
//! database keeps, ended by sign-out or by inactivity. The token is the only
//! credential a request carries; who the officer is and whether they are an
//! administrator is read from the database on every request, so removing an
//! officer's access takes effect at once.

use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::time::now_ms;

/// Who is making a request, read fresh from the officer's record.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Actor {
    pub officer_id: String,
    pub name: String,
    pub rank: Option<String>,
    pub badge_number: Option<String>,
    pub role: String,
}

impl Actor {
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
}

pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn new_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// Starts a session for an officer and returns its token, shown once.
pub async fn create(pool: &SqlitePool, officer_id: &str) -> Result<String, sqlx::Error> {
    let token = new_token();
    let now = now_ms();
    sqlx::query("INSERT INTO app_sessions (id, officer_id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(officer_id)
        .bind(hash_token(&token))
        .bind(now)
        .bind(now)
        .execute(pool)
        .await?;
    Ok(token)
}

/// The officer behind a token, if the session is open, the officer is still at
/// the station, and the session has not been idle for longer than the policy
/// allows. A valid request keeps the session alive.
pub async fn resolve(pool: &SqlitePool, token: &str) -> Result<Option<Actor>, sqlx::Error> {
    let hash = hash_token(token);
    let row: Option<(String, i64)> = sqlx::query_as(
        "SELECT s.id, s.last_seen_at FROM app_sessions s JOIN officers o ON o.id = s.officer_id
          WHERE s.token_hash = ? AND s.ended_at IS NULL AND o.active = 1",
    )
    .bind(&hash)
    .fetch_optional(pool)
    .await?;
    let Some((session_id, last_seen)) = row else { return Ok(None) };

    let idle_minutes: i64 = sqlx::query_scalar("SELECT idle_timeout_minutes FROM auth_policy WHERE id = 'default'").fetch_one(pool).await?;
    let now = now_ms();
    if now - last_seen > idle_minutes * 60_000 {
        sqlx::query("UPDATE app_sessions SET ended_at = ? WHERE id = ?").bind(now).bind(&session_id).execute(pool).await?;
        return Ok(None);
    }
    // Recorded at most once a minute, so a busy window is not a write per call.
    if now - last_seen > 60_000 {
        sqlx::query("UPDATE app_sessions SET last_seen_at = ? WHERE id = ?").bind(now).bind(&session_id).execute(pool).await?;
    }

    sqlx::query_as::<_, Actor>(
        "SELECT o.id AS officer_id, o.name, o.rank, o.badge_number, o.role
           FROM app_sessions s JOIN officers o ON o.id = s.officer_id WHERE s.id = ?",
    )
    .bind(&session_id)
    .fetch_optional(pool)
    .await
}

pub async fn end(pool: &SqlitePool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE app_sessions SET ended_at = ? WHERE token_hash = ? AND ended_at IS NULL")
        .bind(now_ms())
        .bind(hash_token(token))
        .execute(pool)
        .await?;
    Ok(())
}

/// Ends every open session of an officer (they were disabled, or given a new
/// password).
pub async fn end_all_for(pool: &SqlitePool, officer_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE app_sessions SET ended_at = ? WHERE officer_id = ? AND ended_at IS NULL")
        .bind(now_ms())
        .bind(officer_id)
        .execute(pool)
        .await?;
    Ok(())
}
