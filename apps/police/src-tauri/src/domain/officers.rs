use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use sqlx::{AssertSqlSafe, FromRow, SqlitePool};
use std::fmt;
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

const SESSION_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000;

#[derive(Debug)]
pub enum OfficerError {
    Db(sqlx::Error),
    Hash(String),
    /// The request itself is wrong (a sign-in without a badge number).
    Invalid(String),
}

impl fmt::Display for OfficerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OfficerError::Db(e) => write!(f, "{e}"),
            OfficerError::Hash(e) => write!(f, "{e}"),
            OfficerError::Invalid(e) => write!(f, "{e}"),
        }
    }
}

impl From<sqlx::Error> for OfficerError {
    fn from(e: sqlx::Error) -> Self {
        OfficerError::Db(e)
    }
}

/// The one officer record: someone who works at this station. A badge number
/// and a way to sign in over remote access are both optional; most officers
/// have neither and are simply on the station's books.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Officer {
    pub id: String,
    pub badge_number: Option<String>,
    pub name: String,
    pub rank: Option<String>,
    /// A standing post at the station (OC Station, OC CID). Free text: the
    /// verified roles are suggestions in the UI, never enforced.
    pub post: Option<String>,
    pub role: String,
    pub active: bool,
    /// An officer's own Person record, where their phone, address and
    /// national ID live rather than being copied here. Nullable.
    pub person_id: Option<String>,
    pub notes: Option<String>,
    /// Whether this officer can sign in over remote access. The password
    /// itself is never read back out.
    pub has_sign_in: bool,
    pub created_at: i64,
}

const OFFICER_COLUMNS: &str =
    "id, badge_number, name, rank, post, role, active, person_id, notes, password_hash IS NOT NULL AS has_sign_in, created_at";

/// Not `Debug`: the password must never reach a log line.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerInput {
    pub badge_number: Option<String>,
    pub name: String,
    pub rank: Option<String>,
    pub post: Option<String>,
    pub role: String,
    pub notes: Option<String>,
    pub person_id: Option<String>,
    /// Gives the officer a remote sign-in (which needs a badge number).
    pub password: Option<String>,
}

/// Not `Debug`, for the same reason.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerInput {
    pub badge_number: Option<String>,
    pub name: String,
    pub rank: Option<String>,
    pub post: Option<String>,
    pub role: String,
    pub active: bool,
    pub notes: Option<String>,
    pub person_id: Option<String>,
    /// Only set on an actual password change: the form otherwise edits the
    /// officer without touching credentials.
    pub password: Option<String>,
}

fn blank_to_none(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// OWASP's own third listed configuration for Argon2id (the Password Storage
/// Cheat Sheet lists four; this one trades the default's 19 MiB of memory for
/// more iterations, same defensive strength, lower peak memory), chosen
/// because this app runs on officers' own station machines, some of them low
/// on memory, not a provisioned server. A hash a caller already holds keeps
/// verifying under whatever cost it was created with (the params are encoded
/// in the hash string itself); only a password hashed from here on uses this.
fn argon2() -> Argon2<'static> {
    let params = Params::new(9_216, 4, 1, None).expect("these Argon2 params are valid");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

fn hash_password(password: &str) -> Result<String, OfficerError> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| OfficerError::Hash(e.to_string()))
}

pub(crate) fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    // verify_password reads the cost params encoded in `parsed`, not argon2()'s
    // own; this instance's params only take effect for a hash created fresh.
    argon2().verify_password(password.as_bytes(), &parsed).is_ok()
}

/// An administrator can change everything, so is never badge-only.
const ADMIN_NEEDS_PASSWORD: &str = "An administrator needs a password of their own.";

pub async fn create_officer(pool: &SqlitePool, input: CreateOfficerInput) -> Result<Officer, OfficerError> {
    let id = Uuid::new_v4().to_string();
    let badge = blank_to_none(&input.badge_number);
    let password = blank_to_none(&input.password);
    if password.is_some() && badge.is_none() {
        return Err(OfficerError::Invalid("An officer needs a badge number to sign in.".to_string()));
    }
    if input.role == "admin" && password.is_none() {
        return Err(OfficerError::Invalid(ADMIN_NEEDS_PASSWORD.to_string()));
    }
    let password_hash = password.as_deref().map(hash_password).transpose()?;

    sqlx::query(
        "INSERT INTO officers (id, badge_number, name, rank, post, role, person_id, notes, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&badge)
    .bind(input.name.trim())
    .bind(blank_to_none(&input.rank))
    .bind(blank_to_none(&input.post))
    .bind(&input.role)
    .bind(&input.person_id)
    .bind(blank_to_none(&input.notes))
    .bind(&password_hash)
    .execute(pool)
    .await?;

    get_officer(pool, &id).await?.ok_or_else(|| OfficerError::Db(sqlx::Error::RowNotFound))
}

pub async fn update_officer(pool: &SqlitePool, id: &str, input: UpdateOfficerInput) -> Result<Officer, OfficerError> {
    let badge = blank_to_none(&input.badge_number);
    let password = blank_to_none(&input.password);
    if input.role == "admin" && password.is_none() && !has_password(pool, id).await? {
        return Err(OfficerError::Invalid(ADMIN_NEEDS_PASSWORD.to_string()));
    }
    if let Some(password) = &password {
        if badge.is_none() {
            return Err(OfficerError::Invalid("An officer needs a badge number to sign in.".to_string()));
        }
        let password_hash = hash_password(password)?;
        sqlx::query("UPDATE officers SET password_hash = ? WHERE id = ?").bind(&password_hash).bind(id).execute(pool).await?;
    }

    sqlx::query(
        "UPDATE officers SET badge_number = ?, name = ?, rank = ?, post = ?, role = ?, active = ?, person_id = ?, notes = ? WHERE id = ?",
    )
    .bind(&badge)
    .bind(input.name.trim())
    .bind(blank_to_none(&input.rank))
    .bind(blank_to_none(&input.post))
    .bind(&input.role)
    .bind(input.active)
    .bind(&input.person_id)
    .bind(blank_to_none(&input.notes))
    .bind(id)
    .execute(pool)
    .await?;

    // Someone who has left, or whose password was just changed, is signed out
    // everywhere.
    if !input.active || password.is_some() {
        super::sessions::end_all_for(pool, id).await?;
    }

    get_officer(pool, id).await?.ok_or_else(|| OfficerError::Db(sqlx::Error::RowNotFound))
}

/// Records that name an officer (statements, bonds, charge sheets, referrals).
/// With an officer chosen, the record's name (and rank, where the record has
/// one) is taken from the officer's record; with none, the record keeps the
/// name that was typed and is not linked. `table` is one of a fixed set.
pub(crate) async fn link_record(
    pool: &SqlitePool,
    table: &'static str,
    id: &str,
    officer_id: &Option<String>,
    with_rank: bool,
) -> Result<(), sqlx::Error> {
    debug_assert!(matches!(table, "statements" | "bonds" | "charge_sheets" | "referrals"));
    let Some(officer_id) = officer_id else {
        sqlx::query(AssertSqlSafe(format!("UPDATE {table} SET officer_id = NULL WHERE id = ?"))).bind(id).execute(pool).await?;
        return Ok(());
    };
    let rank = if with_rank { ", officer_rank = (SELECT rank FROM officers WHERE id = ?1)" } else { "" };
    let result = sqlx::query(AssertSqlSafe(format!(
        "UPDATE {table} SET officer_id = ?1, officer_name = (SELECT name FROM officers WHERE id = ?1){rank} WHERE id = ?2"
    )))
    .bind(officer_id)
    .bind(id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        return Err(sqlx::Error::RowNotFound);
    }
    Ok(())
}

pub(crate) async fn write_officer_markdown(pool: &SqlitePool, vault_root: &Path, record: &Officer) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "officer", &record.id).await {
        let title = format!("Officer: {}", record.name);
        if let Err(e) = markdown::write_record(&dir, &format!("officer-{}", record.id), &title, record) {
            log::warn!("failed to write officer markdown: {e}");
        }
    }
}

/// Sets an officer's password (the caller has checked who may).
pub async fn set_password(pool: &SqlitePool, officer_id: &str, password: &str) -> Result<(), OfficerError> {
    let hash = hash_password(password)?;
    sqlx::query("UPDATE officers SET password_hash = ? WHERE id = ?").bind(&hash).bind(officer_id).execute(pool).await?;
    Ok(())
}

/// Whether an officer has a password at all.
pub async fn has_password(pool: &SqlitePool, officer_id: &str) -> Result<bool, sqlx::Error> {
    let hash: Option<Option<String>> = sqlx::query_scalar("SELECT password_hash FROM officers WHERE id = ?").bind(officer_id).fetch_optional(pool).await?;
    Ok(hash.flatten().is_some())
}

/// Whether a password is the officer's. False when they have none.
pub async fn password_matches(pool: &SqlitePool, officer_id: &str, password: &str) -> Result<bool, sqlx::Error> {
    let hash: Option<Option<String>> = sqlx::query_scalar("SELECT password_hash FROM officers WHERE id = ?").bind(officer_id).fetch_optional(pool).await?;
    Ok(hash.flatten().is_some_and(|h| verify_password(password, &h)))
}

pub async fn get_officer(pool: &SqlitePool, id: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(AssertSqlSafe(format!("SELECT {OFFICER_COLUMNS} FROM officers WHERE id = ?")))
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Officer lookup by badge number, not password — used by badge-entry
/// check-in, where whoever's at the desk is identifying who just arrived,
/// not authenticating them (that already happened when they were hired).
pub async fn get_officer_by_badge(pool: &SqlitePool, badge_number: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(AssertSqlSafe(format!("SELECT {OFFICER_COLUMNS} FROM officers WHERE lower(badge_number) = lower(?)")))
    .bind(badge_number)
    .fetch_optional(pool)
    .await
}

pub async fn list_officers(pool: &SqlitePool) -> Result<Vec<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(AssertSqlSafe(format!("SELECT {OFFICER_COLUMNS} FROM officers ORDER BY active DESC, name")))
    .fetch_all(pool)
    .await
}

#[derive(Debug, FromRow)]
struct OfficerWithHash {
    id: String,
    password_hash: Option<String>,
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
    // No stored hash means this officer has no sign-in at all.
    let Some(hash) = &row.password_hash else { return Ok(None) };
    if !row.active || !verify_password(password, hash) {
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
        "SELECT o.id, o.badge_number, o.name, o.rank, o.post, o.role, o.active, o.person_id, o.notes,
                o.password_hash IS NOT NULL AS has_sign_in, o.created_at
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
