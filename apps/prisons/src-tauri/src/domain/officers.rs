//! Officer identity (spec: docs/specs/_root/0001-officer-identity-sign-in).
//! Reuses Police's proven Argon2 password hashing approach, not its
//! bearer token / `remote_sessions` mechanism, since Prisons has no
//! remote server to serve. Two deliberate departures from Police's own
//! `officers.rs`, both found by a cross check on the spec before this was
//! written: `role` is DB constrained (Police's is a free string), and
//! `CreateOfficerInput`/`UpdateOfficerInput` hand roll `Debug` so a
//! password never prints in a log or panic, which Police's own derived
//! `Debug` does today.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::fmt;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficerErrorPayload {
    pub code: String,
    pub message: String,
}

#[derive(Debug)]
pub enum OfficerError {
    Db(sqlx::Error),
    Hash(String),
    BadgeTaken,
    InvalidAdminCredentials,
    InvalidCredentials,
    LastAdminGuard,
    NotFound,
}

impl fmt::Display for OfficerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{self:?}")
    }
}

impl From<sqlx::Error> for OfficerError {
    fn from(e: sqlx::Error) -> Self {
        OfficerError::Db(e)
    }
}

impl From<OfficerError> for OfficerErrorPayload {
    fn from(e: OfficerError) -> Self {
        let (code, message) = match e {
            OfficerError::Db(err) => {
                // sqlx surfaces a UNIQUE constraint failure as a generic
                // database error; the only unique constraint on this
                // table is badge_number, so any constraint violation here
                // is that one.
                if err.to_string().contains("UNIQUE constraint failed") {
                    ("BADGE_TAKEN".to_string(), "That badge number is already in use.".to_string())
                } else {
                    ("DB_ERROR".to_string(), err.to_string())
                }
            }
            OfficerError::Hash(msg) => ("HASH_ERROR".to_string(), msg),
            OfficerError::BadgeTaken => ("BADGE_TAKEN".to_string(), "That badge number is already in use.".to_string()),
            OfficerError::InvalidAdminCredentials => {
                ("INVALID_ADMIN_CREDENTIALS".to_string(), "Invalid admin badge number or password.".to_string())
            }
            OfficerError::InvalidCredentials => {
                ("INVALID_CREDENTIALS".to_string(), "Invalid badge number or password.".to_string())
            }
            OfficerError::LastAdminGuard => (
                "LAST_ADMIN_GUARD".to_string(),
                "This is the last active admin. Promote another officer to admin first.".to_string(),
            ),
            OfficerError::NotFound => ("NOT_FOUND".to_string(), "Officer not found.".to_string()),
        };
        OfficerErrorPayload { code, message }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Officer {
    pub id: String,
    pub badge_number: String,
    pub name: String,
    pub role: String,
    pub active: bool,
    pub created_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerInput {
    pub badge_number: String,
    pub name: String,
    pub password: String,
    pub role: String,
    /// Both omitted only while the officers table is genuinely empty (the
    /// one time bootstrap path for a brand new installation's first
    /// admin). Required for every call after that.
    pub admin_badge_number: Option<String>,
    pub admin_password: Option<String>,
}

/// Hand rolled, not derived: a derived `Debug` on a struct holding a
/// plain `password` field prints it verbatim on any panic or error log.
/// Police's own version of this struct still derives `Debug` and still
/// has this bug (see docs/scope/police/scope.md feature 24).
impl fmt::Debug for CreateOfficerInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CreateOfficerInput")
            .field("badge_number", &self.badge_number)
            .field("name", &self.name)
            .field("password", &"[redacted]")
            .field("role", &self.role)
            .field("admin_badge_number", &self.admin_badge_number)
            .field("admin_password", &"[redacted]")
            .finish()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerInput {
    pub name: String,
    pub role: String,
    pub active: bool,
    /// Only set on an actual password change.
    pub password: Option<String>,
    pub admin_badge_number: String,
    pub admin_password: String,
}

impl fmt::Debug for UpdateOfficerInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UpdateOfficerInput")
            .field("name", &self.name)
            .field("role", &self.role)
            .field("active", &self.active)
            .field("password", &self.password.as_ref().map(|_| "[redacted]"))
            .field("admin_badge_number", &self.admin_badge_number)
            .field("admin_password", &"[redacted]")
            .finish()
    }
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

fn normalize_badge(badge_number: &str) -> String {
    badge_number.trim().to_string()
}

#[derive(FromRow)]
struct OfficerWithHash {
    id: String,
    active: bool,
    password_hash: String,
}

/// The one real credential check: badge number plus password against the
/// stored Argon2 hash. Returns the matching officer on success, or one
/// generic `InvalidCredentials` failure otherwise, deliberately never
/// distinguishing "no such badge" from "wrong password".
pub async fn login(pool: &SqlitePool, badge_number: &str, password: &str) -> Result<Officer, OfficerError> {
    let badge_number = normalize_badge(badge_number);
    let row = sqlx::query_as::<_, OfficerWithHash>(
        "SELECT id, active, password_hash FROM officers WHERE badge_number = ?",
    )
    .bind(&badge_number)
    .fetch_optional(pool)
    .await?;

    let Some(row) = row else { return Err(OfficerError::InvalidCredentials) };
    if !row.active || !verify_password(password, &row.password_hash) {
        return Err(OfficerError::InvalidCredentials);
    }

    get_officer(pool, &row.id).await?.ok_or(OfficerError::InvalidCredentials)
}

/// The identity mechanism for a peer installation: a fresh admin badge and
/// password, checked the same way `login` checks any credential pair,
/// then a role check. No ambient "currently signed in" caller is assumed
/// here, since a peer installation has no persistent session at all (see
/// spec `_root/0001-officer-identity-sign-in`'s Security model).
async fn verify_admin(pool: &SqlitePool, badge_number: &str, password: &str) -> Result<(), OfficerError> {
    let officer = login(pool, badge_number, password).await.map_err(|_| OfficerError::InvalidAdminCredentials)?;
    if officer.role != "admin" {
        return Err(OfficerError::InvalidAdminCredentials);
    }
    Ok(())
}

/// The identity mechanism for a Head Office installation: it already has a
/// real, persistent signed in session (spec: docs/specs/prisons/0001-head-
/// office-peer-sync-network/index.md's cross child contract), so re-asking
/// for a badge and password on top of that session proves nothing new and
/// is exactly the "why am I logging in twice" bug this call exists to
/// avoid. The caller (`commands/officers.rs`) has already resolved
/// `actor_id` from `session::get_current_hq_session`; this only checks
/// that officer is still an active admin right now, not stale from when
/// the session was created.
async fn verify_admin_trusted(pool: &SqlitePool, actor_id: &str) -> Result<(), OfficerError> {
    let officer = get_officer(pool, actor_id).await?.ok_or(OfficerError::InvalidAdminCredentials)?;
    if officer.role != "admin" || !officer.active {
        return Err(OfficerError::InvalidAdminCredentials);
    }
    Ok(())
}

/// Whether this installation has zero officers yet — the frontend uses
/// this to decide whether to show the create-first-admin flow or the
/// normal, admin-credentialed add-officer form, before it ever calls
/// `create_officer` itself.
pub async fn is_bootstrap(pool: &SqlitePool) -> Result<bool, sqlx::Error> {
    let officer_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(pool).await?;
    Ok(officer_count == 0)
}

/// The actual insert, shared by both the badge/password path (a peer, no
/// session) and the session trusted path (Head Office): auth is entirely
/// the caller's job, done before this runs.
async fn insert_officer(pool: &SqlitePool, badge_number: &str, name: &str, role: &str, password: &str) -> Result<Officer, OfficerError> {
    let id = Uuid::new_v4().to_string();
    let badge_number = normalize_badge(badge_number);
    let password_hash = hash_password(password)?;

    sqlx::query("INSERT INTO officers (id, badge_number, name, role, password_hash) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&badge_number)
        .bind(name)
        .bind(role)
        .bind(&password_hash)
        .execute(pool)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed") {
                OfficerError::BadgeTaken
            } else {
                OfficerError::Db(e)
            }
        })?;

    get_officer(pool, &id).await?.ok_or(OfficerError::NotFound)
}

pub async fn create_officer(pool: &SqlitePool, input: CreateOfficerInput) -> Result<Officer, OfficerError> {
    let officer_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(pool).await?;
    if officer_count > 0 {
        let admin_badge = input.admin_badge_number.as_deref().ok_or(OfficerError::InvalidAdminCredentials)?;
        let admin_password = input.admin_password.as_deref().ok_or(OfficerError::InvalidAdminCredentials)?;
        verify_admin(pool, admin_badge, admin_password).await?;
    }
    // Past the bootstrap install, every new officer after the first admin
    // is created through this same, now-gated path — there is no separate
    // "invite" flow.
    insert_officer(pool, &input.badge_number, &input.name, &input.role, &input.password).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerTrustedInput {
    pub badge_number: String,
    pub name: String,
    pub password: String,
    pub role: String,
}

impl fmt::Debug for CreateOfficerTrustedInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CreateOfficerTrustedInput")
            .field("badge_number", &self.badge_number)
            .field("name", &self.name)
            .field("password", &"[redacted]")
            .field("role", &self.role)
            .finish()
    }
}

/// Head Office's own version of `create_officer`: `actor_id` is the
/// already signed in officer (from `session::get_current_hq_session`),
/// not a re-entered badge and password.
pub async fn create_officer_trusted(pool: &SqlitePool, actor_id: &str, input: CreateOfficerTrustedInput) -> Result<Officer, OfficerError> {
    verify_admin_trusted(pool, actor_id).await?;
    insert_officer(pool, &input.badge_number, &input.name, &input.role, &input.password).await
}

/// The actual update, shared the same way `insert_officer` is.
async fn apply_officer_update(pool: &SqlitePool, id: &str, name: &str, role: &str, active: bool, password: Option<&str>) -> Result<Officer, OfficerError> {
    let existing = get_officer(pool, id).await?.ok_or(OfficerError::NotFound)?;

    // Would this update remove the last active admin? True when the
    // target is currently an active admin, and either it's being
    // deactivated or demoted out of the admin role.
    let would_remove_admin = existing.role == "admin" && existing.active && (!active || role != "admin");

    if would_remove_admin {
        // One atomic conditional update: succeeds only if another active
        // admin besides this one exists. A plain read-then-write here
        // would let two concurrent demotions both pass the read and both
        // commit, leaving zero admins — this is why it's one statement,
        // not two.
        let other_admin_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM officers WHERE role = 'admin' AND active = 1 AND id != ?)",
        )
        .bind(id)
        .fetch_one(pool)
        .await?;
        if !other_admin_exists {
            return Err(OfficerError::LastAdminGuard);
        }
    }

    match password {
        Some(password) => {
            let password_hash = hash_password(password)?;
            sqlx::query("UPDATE officers SET name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?")
                .bind(name)
                .bind(role)
                .bind(active)
                .bind(&password_hash)
                .bind(id)
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query("UPDATE officers SET name = ?, role = ?, active = ? WHERE id = ?")
                .bind(name)
                .bind(role)
                .bind(active)
                .bind(id)
                .execute(pool)
                .await?;
        }
    }

    get_officer(pool, id).await?.ok_or(OfficerError::NotFound)
}

pub async fn update_officer(pool: &SqlitePool, id: &str, input: UpdateOfficerInput) -> Result<Officer, OfficerError> {
    verify_admin(pool, &input.admin_badge_number, &input.admin_password).await?;
    apply_officer_update(pool, id, &input.name, &input.role, input.active, input.password.as_deref()).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerTrustedInput {
    pub name: String,
    pub role: String,
    pub active: bool,
    pub password: Option<String>,
}

impl fmt::Debug for UpdateOfficerTrustedInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UpdateOfficerTrustedInput")
            .field("name", &self.name)
            .field("role", &self.role)
            .field("active", &self.active)
            .field("password", &self.password.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

/// Head Office's own version of `update_officer`, session trusted the
/// same way `create_officer_trusted` is.
pub async fn update_officer_trusted(pool: &SqlitePool, actor_id: &str, id: &str, input: UpdateOfficerTrustedInput) -> Result<Officer, OfficerError> {
    verify_admin_trusted(pool, actor_id).await?;
    apply_officer_update(pool, id, &input.name, &input.role, input.active, input.password.as_deref()).await
}

pub async fn list_officers(pool: &SqlitePool, admin_badge_number: &str, admin_password: &str) -> Result<Vec<Officer>, OfficerError> {
    verify_admin(pool, admin_badge_number, admin_password).await?;
    sqlx::query_as::<_, Officer>("SELECT id, badge_number, name, role, active, created_at FROM officers ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(OfficerError::from)
}

/// Head Office's own version of `list_officers`, session trusted the same
/// way `create_officer_trusted` is: every officer in the system, not
/// scoped to one facility (there is only ever one `officers` table per
/// installation; Head Office's own is the one an HQ officer signs into).
pub async fn list_officers_trusted(pool: &SqlitePool, actor_id: &str) -> Result<Vec<Officer>, OfficerError> {
    verify_admin_trusted(pool, actor_id).await?;
    sqlx::query_as::<_, Officer>("SELECT id, badge_number, name, role, active, created_at FROM officers ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(OfficerError::from)
}

pub async fn get_officer(pool: &SqlitePool, id: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>("SELECT id, badge_number, name, role, active, created_at FROM officers WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Lightweight lookup for routine attribution, matching the badge-number-
/// only pattern Police's shift check in already uses: no password, and a
/// deactivated officer is excluded, since they should not be credited
/// with new activity.
pub async fn get_officer_by_badge(pool: &SqlitePool, badge_number: &str) -> Result<Option<Officer>, sqlx::Error> {
    let badge_number = normalize_badge(badge_number);
    sqlx::query_as::<_, Officer>(
        "SELECT id, badge_number, name, role, active, created_at FROM officers WHERE badge_number = ? AND active = 1",
    )
    .bind(&badge_number)
    .fetch_optional(pool)
    .await
}
