//! Server-side sessions (docs/prisons/product-map/05 M.1, M.4).
//!
//! The bearer token is random and shown once; only its SHA-256 is stored, so
//! a copy of the database contains no usable credential. A session ends by
//! sign-out, deactivation or password change of the account, an idle
//! timeout, or an absolute lifetime, whichever comes first, and the account's
//! current state is re-read on every request.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::officers::{self, Officer, OfficerError};

pub const IDLE_TIMEOUT_MS: i64 = 4 * 60 * 60 * 1000;
pub const ABSOLUTE_LIFETIME_MS: i64 = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS: i64 = 60 * 1000;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

pub fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub token: String,
    pub expires_at: i64,
    pub officer: Officer,
    pub permissions: Vec<String>,
}

/// Verifies credentials and opens a session in one operation. The token is
/// returned once and never stored.
pub async fn sign_in(
    pool: &SqlitePool,
    badge_number: &str,
    password: &str,
    device_id: Option<&str>,
) -> Result<SessionInfo, OfficerError> {
    let officer = officers::check_credentials(pool, badge_number, password, device_id).await?;

    let token = new_token();
    let now = now_ms();
    let expires_at = now + ABSOLUTE_LIFETIME_MS;

    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO sessions (id, officer_id, device_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(hash_token(&token))
        .bind(&officer.id)
        .bind(device_id)
        .bind(now)
        .bind(now)
        .bind(expires_at)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let permissions = super::authz::role_permissions(&officer.role, officer.is_admin).into_iter().map(String::from).collect();
    Ok(SessionInfo { token, expires_at, officer, permissions })
}

#[derive(FromRow)]
struct SessionRow {
    id: String,
    officer_id: String,
    device_id: Option<String>,
    last_seen_at: i64,
    expires_at: i64,
    revoked_at: Option<i64>,
    badge_number: String,
    name: String,
    role: String,
    is_admin: bool,
    active: bool,
}

/// Resolves a bearer token to an `Actor`, or `None` for any reason it is not
/// valid. The caller cannot tell which reason applied.
pub async fn resolve(pool: &SqlitePool, token: &str) -> Result<Option<Actor>, sqlx::Error> {
    let id = hash_token(token);
    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT s.id, s.officer_id, s.device_id, s.last_seen_at, s.expires_at, s.revoked_at,
                o.badge_number, o.name, o.role, o.is_admin, o.active
         FROM sessions s JOIN officers o ON o.id = s.officer_id
         WHERE s.id = ?",
    )
    .bind(&id)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    let now = now_ms();
    if row.revoked_at.is_some() || !row.active || row.expires_at <= now || row.last_seen_at + IDLE_TIMEOUT_MS <= now {
        return Ok(None);
    }

    if now - row.last_seen_at > TOUCH_INTERVAL_MS {
        sqlx::query("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(now).bind(&row.id).execute(pool).await?;
    }

    Ok(Some(Actor::officer(row.officer_id, row.badge_number, row.name, row.role, row.is_admin, row.device_id)))
}

/// Signs the caller out. Audited.
pub async fn sign_out(conn: &mut SqliteConnection, actor: &Actor, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
        .bind(now_ms())
        .bind(hash_token(token))
        .execute(&mut *conn)
        .await?;
    audit::record(conn, actor, AuditEntry::new("auth.logout", "officer", actor.officer_id.as_deref())).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool_with_admin() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        officers::create_first_admin(&mut tx, "OIC-1", "OIC", "correct-horse").await.unwrap();
        tx.commit().await.unwrap();
        pool
    }

    #[tokio::test]
    async fn token_is_never_stored_and_resolves_until_revoked() {
        let pool = pool_with_admin().await;
        let session = sign_in(&pool, "OIC-1", "correct-horse", None).await.unwrap();

        let stored: String = sqlx::query_scalar("SELECT id FROM sessions").fetch_one(&pool).await.unwrap();
        assert_ne!(stored, session.token);
        assert_eq!(stored, hash_token(&session.token));

        let actor = resolve(&pool, &session.token).await.unwrap().expect("a fresh session resolves");
        assert_eq!(actor.badge_number.as_deref(), Some("OIC-1"));
        assert!(resolve(&pool, "not-a-token").await.unwrap().is_none());

        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        sign_out(&mut tx, &actor, &session.token).await.unwrap();
        tx.commit().await.unwrap();
        assert!(resolve(&pool, &session.token).await.unwrap().is_none(), "a signed-out token is dead");
    }

    #[tokio::test]
    async fn deactivating_an_account_ends_its_sessions_immediately() {
        let pool = pool_with_admin().await;

        // A second admin so the first can be deactivated.
        let admin = officers::list_officers(&pool).await.unwrap().remove(0);
        let actor = Actor::officer(admin.id.clone(), admin.badge_number.clone(), admin.name.clone(), admin.role.clone(), true, None);
        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        let second = officers::create_officer(
            &mut tx,
            &actor,
            officers::CreateOfficerInput {
                badge_number: "OIC-2".into(),
                name: "Second".into(),
                password: "second-password".into(),
                role: "oic".into(),
                is_admin: true,
                profile: officers::ProfileInput::default(),
            },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let session = sign_in(&pool, "OIC-2", "second-password", None).await.unwrap();
        assert!(resolve(&pool, &session.token).await.unwrap().is_some());

        let mut tx = crate::db::begin_write(&pool).await.unwrap();
        officers::update_officer(
            &mut tx,
            &actor,
            &second.id,
            officers::UpdateOfficerInput { name: "Second".into(), role: "oic".into(), is_admin: true, active: false, password: None, profile: officers::ProfileInput::default() },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        assert!(resolve(&pool, &session.token).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn idle_timeout_ends_a_session() {
        let pool = pool_with_admin().await;
        let session = sign_in(&pool, "OIC-1", "correct-horse", None).await.unwrap();
        sqlx::query("UPDATE sessions SET last_seen_at = ?").bind(now_ms() - IDLE_TIMEOUT_MS - 1).execute(&pool).await.unwrap();
        assert!(resolve(&pool, &session.token).await.unwrap().is_none());
    }
}
