use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::fmt;
use uuid::Uuid;

const SESSION_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Debug)]
pub enum OfficerError {
    Db(sqlx::Error),
    Hash(String),
}

impl fmt::Display for OfficerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OfficerError::Db(e) => write!(f, "{e}"),
            OfficerError::Hash(e) => write!(f, "{e}"),
        }
    }
}

impl From<sqlx::Error> for OfficerError {
    fn from(e: sqlx::Error) -> Self {
        OfficerError::Db(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Officer {
    pub id: String,
    pub badge_number: String,
    pub name: String,
    pub role: String,
    pub active: bool,
    /// An officer's own Person record — where their phone/address/
    /// national ID actually live, rather than duplicating those fields
    /// here. Nullable: an officer account can exist unlinked.
    pub person_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerInput {
    pub badge_number: String,
    pub name: String,
    pub password: String,
    pub role: String,
    pub person_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerInput {
    pub name: String,
    pub role: String,
    pub active: bool,
    pub person_id: Option<String>,
    /// Only set on an actual password change — the update form otherwise
    /// just edits name/role/active without touching credentials.
    pub password: Option<String>,
}

fn hash_password(password: &str) -> Result<String, OfficerError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| OfficerError::Hash(e.to_string()))
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

pub async fn create_officer(pool: &SqlitePool, input: CreateOfficerInput) -> Result<Officer, OfficerError> {
    let id = Uuid::new_v4().to_string();
    let password_hash = hash_password(&input.password)?;

    sqlx::query(
        "INSERT INTO officers (id, badge_number, name, password_hash, role, person_id) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.badge_number)
    .bind(&input.name)
    .bind(&password_hash)
    .bind(&input.role)
    .bind(&input.person_id)
    .execute(pool)
    .await?;

    get_officer(pool, &id).await?.ok_or_else(|| OfficerError::Db(sqlx::Error::RowNotFound))
}

pub async fn update_officer(pool: &SqlitePool, id: &str, input: UpdateOfficerInput) -> Result<Officer, OfficerError> {
    match &input.password {
        Some(password) => {
            let password_hash = hash_password(password)?;
            sqlx::query("UPDATE officers SET name = ?, role = ?, active = ?, person_id = ?, password_hash = ? WHERE id = ?")
                .bind(&input.name)
                .bind(&input.role)
                .bind(input.active)
                .bind(&input.person_id)
                .bind(&password_hash)
                .bind(id)
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query("UPDATE officers SET name = ?, role = ?, active = ?, person_id = ? WHERE id = ?")
                .bind(&input.name)
                .bind(&input.role)
                .bind(input.active)
                .bind(&input.person_id)
                .bind(id)
                .execute(pool)
                .await?;
        }
    }

    get_officer(pool, id).await?.ok_or_else(|| OfficerError::Db(sqlx::Error::RowNotFound))
}

pub async fn get_officer(pool: &SqlitePool, id: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(
        "SELECT id, badge_number, name, role, active, person_id, created_at FROM officers WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Officer lookup by badge number, not password — used by badge-entry
/// check-in, where whoever's at the desk is identifying who just arrived,
/// not authenticating them (that already happened when they were hired).
pub async fn get_officer_by_badge(pool: &SqlitePool, badge_number: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(
        "SELECT id, badge_number, name, role, active, person_id, created_at FROM officers WHERE badge_number = ?",
    )
    .bind(badge_number)
    .fetch_optional(pool)
    .await
}

pub async fn list_officers(pool: &SqlitePool) -> Result<Vec<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(
        "SELECT id, badge_number, name, role, active, person_id, created_at FROM officers ORDER BY name",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, FromRow)]
struct OfficerWithHash {
    id: String,
    password_hash: String,
    active: bool,
}

/// Checks the badge number + password against the stored Argon2 hash and,
/// on success, issues a fresh bearer token — a random, server-looked-up
/// string, not a JWT, since nothing outside this app ever needs to
/// inspect the token's contents, and a DB row is trivially revocable.
pub async fn login(pool: &SqlitePool, badge_number: &str, password: &str) -> Result<Option<String>, OfficerError> {
    let row = sqlx::query_as::<_, OfficerWithHash>(
        "SELECT id, password_hash, active FROM officers WHERE badge_number = ?",
    )
    .bind(badge_number)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    if !row.active || !verify_password(password, &row.password_hash) {
        return Ok(None);
    }

    let token = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO remote_sessions (id, officer_id, token, expires_at) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&row.id)
        .bind(&token)
        .bind(now + SESSION_TTL_MS)
        .execute(pool)
        .await?;

    Ok(Some(token))
}

pub async fn validate_session(pool: &SqlitePool, token: &str) -> Result<Option<Officer>, sqlx::Error> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query_as::<_, Officer>(
        "SELECT o.id, o.badge_number, o.name, o.role, o.active, o.person_id, o.created_at
         FROM officers o
         JOIN remote_sessions s ON s.officer_id = o.id
         WHERE s.token = ? AND s.expires_at > ? AND o.active = 1",
    )
    .bind(token)
    .bind(now)
    .fetch_optional(pool)
    .await
}

pub async fn logout(pool: &SqlitePool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM remote_sessions WHERE token = ?")
        .bind(token)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn log_remote_access(
    pool: &SqlitePool,
    officer_id: &str,
    action: &str,
    detail: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO remote_access_log (id, officer_id, action, detail) VALUES (?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(officer_id)
        .bind(action)
        .bind(detail)
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessLogEntry {
    pub id: String,
    pub officer_id: String,
    pub officer_name: String,
    pub action: String,
    pub detail: Option<String>,
    pub occurred_at: i64,
}

pub async fn list_remote_access_log(pool: &SqlitePool) -> Result<Vec<RemoteAccessLogEntry>, sqlx::Error> {
    sqlx::query_as::<_, RemoteAccessLogEntry>(
        "SELECT l.id, l.officer_id, o.name as officer_name, l.action, l.detail, l.occurred_at
         FROM remote_access_log l
         JOIN officers o ON o.id = l.officer_id
         ORDER BY l.occurred_at DESC
         LIMIT 500",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessSettings {
    pub enabled: bool,
}

pub async fn get_remote_access_settings(pool: &SqlitePool) -> Result<RemoteAccessSettings, sqlx::Error> {
    let enabled: Option<bool> = sqlx::query_scalar("SELECT enabled FROM remote_access_settings WHERE id = 'default'")
        .fetch_optional(pool)
        .await?;
    Ok(RemoteAccessSettings { enabled: enabled.unwrap_or(false) })
}

pub async fn set_remote_access_enabled(pool: &SqlitePool, enabled: bool) -> Result<RemoteAccessSettings, sqlx::Error> {
    sqlx::query(
        "INSERT INTO remote_access_settings (id, enabled) VALUES ('default', ?)
         ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled",
    )
    .bind(enabled)
    .execute(pool)
    .await?;
    get_remote_access_settings(pool).await
}

/// A call for backup's real lifecycle: created (active, unresponded) ->
/// responded (one officer at the station marks themselves as handling
/// it) -> ended (explicit, terminal — nothing here ever auto-expires an
/// active dispatch). `acknowledged` is kept in sync with `responded_at`
/// being set rather than being a second, independent flag.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BackupAlert {
    pub id: String,
    pub officer_id: String,
    pub officer_name: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub acknowledged: bool,
    pub responder_officer_id: Option<String>,
    pub responder_name: Option<String>,
    pub responded_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub created_at: i64,
}

// Every query here joins `officers` twice (the calling officer, and
// whoever responded, if anyone) — a plain `&'static str` literal per
// function, matching every other domain module's convention, rather
// than a shared `format!`-composed constant: sqlx 0.9's `SqlSafeStr`
// bound only accepts `&'static str`, not a string built at runtime.

pub async fn get_backup_alert(pool: &SqlitePool, id: &str) -> Result<Option<BackupAlert>, sqlx::Error> {
    sqlx::query_as::<_, BackupAlert>(
        "SELECT
            b.id, b.officer_id, o.name AS officer_name, b.latitude, b.longitude, b.acknowledged,
            b.responder_officer_id, r.name AS responder_name, b.responded_at, b.ended_at, b.created_at
         FROM backup_alerts b
         JOIN officers o ON o.id = b.officer_id
         LEFT JOIN officers r ON r.id = b.responder_officer_id
         WHERE b.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Returns the created alert (not just `Ok(())`) so callers — the remote
/// endpoint a phone hits — can push it straight to the desktop app via a
/// Tauri event, not just leave it for the next page load to discover.
pub async fn create_backup_alert(
    pool: &SqlitePool,
    officer_id: &str,
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<BackupAlert, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO backup_alerts (id, officer_id, latitude, longitude) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(officer_id)
        .bind(latitude)
        .bind(longitude)
        .execute(pool)
        .await?;
    get_backup_alert(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// Active (unended) alerts first, unresponded-and-active before
/// responded-and-active, most recent first within each group — the
/// desktop app's job is to make sure the newest, still-open call for
/// backup is what an officer sees first.
pub async fn list_backup_alerts(pool: &SqlitePool) -> Result<Vec<BackupAlert>, sqlx::Error> {
    sqlx::query_as::<_, BackupAlert>(
        "SELECT
            b.id, b.officer_id, o.name AS officer_name, b.latitude, b.longitude, b.acknowledged,
            b.responder_officer_id, r.name AS responder_name, b.responded_at, b.ended_at, b.created_at
         FROM backup_alerts b
         JOIN officers o ON o.id = b.officer_id
         LEFT JOIN officers r ON r.id = b.responder_officer_id
         ORDER BY (b.ended_at IS NOT NULL) ASC, (b.responded_at IS NOT NULL) ASC, b.created_at DESC
         LIMIT 100",
    )
    .fetch_all(pool)
    .await
}

/// Every alert that's still open — created and not yet ended, regardless
/// of whether anyone has responded. What the toolbar's live indicator
/// and the app-shell listener actually care about.
pub async fn list_active_backup_alerts(pool: &SqlitePool) -> Result<Vec<BackupAlert>, sqlx::Error> {
    sqlx::query_as::<_, BackupAlert>(
        "SELECT
            b.id, b.officer_id, o.name AS officer_name, b.latitude, b.longitude, b.acknowledged,
            b.responder_officer_id, r.name AS responder_name, b.responded_at, b.ended_at, b.created_at
         FROM backup_alerts b
         JOIN officers o ON o.id = b.officer_id
         LEFT JOIN officers r ON r.id = b.responder_officer_id
         WHERE b.ended_at IS NULL
         ORDER BY b.created_at DESC",
    )
    .fetch_all(pool)
    .await
}

pub async fn respond_to_backup_alert(pool: &SqlitePool, id: &str, officer_id: &str) -> Result<BackupAlert, sqlx::Error> {
    sqlx::query("UPDATE backup_alerts SET responder_officer_id = ?, responded_at = ?, acknowledged = 1 WHERE id = ?")
        .bind(officer_id)
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(id)
        .execute(pool)
        .await?;
    get_backup_alert(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn end_backup_alert(pool: &SqlitePool, id: &str) -> Result<BackupAlert, sqlx::Error> {
    sqlx::query("UPDATE backup_alerts SET ended_at = ? WHERE id = ?")
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(id)
        .execute(pool)
        .await?;
    get_backup_alert(pool, id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn acknowledge_backup_alert(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE backup_alerts SET acknowledged = 1 WHERE id = ?").bind(id).execute(pool).await?;
    Ok(())
}
