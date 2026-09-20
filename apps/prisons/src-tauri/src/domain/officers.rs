//! Accounts (officers) and credential checking
//! (docs/prisons/product-map/05 M.1, build phase 1).
//!
//! Argon2 hashing is unchanged from the first build. What changed: roles are
//! function templates (see `authz.rs`), `is_admin` is separate, every change
//! is attributed and audited in the same transaction, failed attempts lock an
//! account briefly, and no operation re-asks for an admin's password: the
//! caller's verified session and its permissions are the credential.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::fmt;
use std::sync::OnceLock;
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::auth_policy::{self, AuthPolicy};
use super::authz::{self, Actor};

const MAX_FAILED_ATTEMPTS: i64 = 5;
const LOCK_MS: i64 = 5 * 60 * 1000;
const MIN_PASSWORD_LEN: usize = 8;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

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
    InvalidCredentials,
    InvalidRole,
    WeakPassword,
    LastAdminGuard,
    NotFound,
    AlreadyInitialised,
    HeadOfficeOnly,
    CannotDeleteSelf,
    InvalidPhoto,
    InvalidSecret(String),
    BadgePrefix(String),
    BadgeOnlyNotAllowed,
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
                if err.to_string().contains("UNIQUE constraint failed") {
                    ("BADGE_TAKEN", "That badge number is already in use.".to_string())
                } else {
                    ("DB_ERROR", err.to_string())
                }
            }
            OfficerError::Hash(msg) => ("HASH_ERROR", msg),
            OfficerError::BadgeTaken => ("BADGE_TAKEN", "That badge number is already in use.".to_string()),
            // One message for unknown badge, wrong password and a locked
            // account, so none of them can be told apart from outside.
            OfficerError::InvalidCredentials => (
                "INVALID_CREDENTIALS",
                "Invalid badge number or password, or the account is temporarily locked.".to_string(),
            ),
            OfficerError::InvalidRole => ("INVALID_ROLE", "That role is not available on this installation.".to_string()),
            OfficerError::WeakPassword => {
                ("WEAK_PASSWORD", format!("Password must be at least {MIN_PASSWORD_LEN} characters."))
            }
            OfficerError::LastAdminGuard => (
                "LAST_ADMIN_GUARD",
                "This is the last active administrator. Make another account an administrator first.".to_string(),
            ),
            OfficerError::NotFound => ("NOT_FOUND", "Officer not found.".to_string()),
            OfficerError::AlreadyInitialised => {
                ("ALREADY_INITIALISED", "This installation already has accounts.".to_string())
            }
            OfficerError::HeadOfficeOnly => (
                "DELETE_NOT_ALLOWED",
                "Facility accounts are deactivated, never deleted, so every record still shows who acted. Deactivate this account instead.".to_string(),
            ),
            OfficerError::CannotDeleteSelf => ("CANNOT_DELETE_SELF", "You cannot delete the account you are signed in with.".to_string()),
            OfficerError::InvalidPhoto => ("INVALID_PHOTO", "The photo must be a JPEG image under 200 KB.".to_string()),
            OfficerError::InvalidSecret(message) => ("WEAK_PASSWORD", message),
            OfficerError::BadgePrefix(prefix) => ("BADGE_FORMAT", format!("Badge numbers at this facility start with {prefix}.")),
            OfficerError::BadgeOnlyNotAllowed => (
                "BADGE_ONLY_NOT_ALLOWED",
                "Badge-only sign-in is off, or this account is an administrator. Administrators always use a password.".to_string(),
            ),
        };
        OfficerErrorPayload { code: code.to_string(), message }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Officer {
    pub id: String,
    pub badge_number: String,
    pub name: String,
    pub role: String,
    pub is_admin: bool,
    pub active: bool,
    pub created_at: i64,
    pub rank: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub photo_data: Option<String>,
    pub posted_facility_id: Option<String>,
    pub last_login_at: Option<i64>,
    pub passwordless: bool,
}

macro_rules! officer_select {
    ($tail:literal) => {
        concat!(
            "SELECT id, badge_number, name, role, is_admin, active, created_at, rank, phone, email, photo_data, posted_facility_id, passwordless,
             (SELECT MAX(at) FROM audit_log WHERE action = 'auth.login' AND entity_type = 'officer' AND entity_id = officers.id) AS last_login_at
             FROM officers ",
            $tail
        )
    };
}

const SELECT_OFFICER_BY_ID: &str = officer_select!("WHERE id = ?");
const SELECT_OFFICERS: &str = officer_select!("ORDER BY name");

const MAX_PHOTO_CHARS: usize = 200 * 1024;

/// The audit trail keeps who and what changed, never the photo itself.
fn audit_snapshot(officer: &Officer) -> serde_json::Value {
    let mut value = serde_json::to_value(officer).unwrap_or_default();
    if let Some(object) = value.as_object_mut() {
        let has_photo = object.get("photoData").is_some_and(|v| !v.is_null());
        object.remove("photoData");
        object.insert("hasPhoto".to_string(), serde_json::Value::Bool(has_photo));
    }
    value
}

fn clean(value: Option<String>) -> Option<String> {
    value.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn clean_photo(value: Option<String>) -> Result<Option<String>, OfficerError> {
    match value.filter(|v| !v.is_empty()) {
        None => Ok(None),
        Some(photo) if photo.starts_with("data:image/jpeg;base64,") && photo.len() <= MAX_PHOTO_CHARS => Ok(Some(photo)),
        Some(_) => Err(OfficerError::InvalidPhoto),
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    #[serde(default)]
    pub rank: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub photo_data: Option<String>,
    #[serde(default)]
    pub posted_facility_id: Option<String>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerInput {
    pub badge_number: String,
    pub name: String,
    #[serde(default)]
    pub password: String,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
    /// Sign in with the badge alone (only when the facility policy allows it).
    #[serde(default)]
    pub passwordless: bool,
    #[serde(flatten)]
    pub profile: ProfileInput,
}

impl fmt::Debug for CreateOfficerInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CreateOfficerInput")
            .field("badge_number", &self.badge_number)
            .field("name", &self.name)
            .field("password", &"[redacted]")
            .field("role", &self.role)
            .field("is_admin", &self.is_admin)
            .finish()
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerInput {
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
    pub active: bool,
    pub password: Option<String>,
    /// `Some(true)` switches the account to badge-only sign-in, `Some(false)`
    /// back to a secret (which must then be given in `password`).
    #[serde(default)]
    pub passwordless: Option<bool>,
    #[serde(flatten)]
    pub profile: ProfileInput,
}

impl fmt::Debug for UpdateOfficerInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UpdateOfficerInput")
            .field("name", &self.name)
            .field("role", &self.role)
            .field("is_admin", &self.is_admin)
            .field("active", &self.active)
            .field("password", &self.password.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

fn argon_hash(secret: &str) -> Result<String, OfficerError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| OfficerError::Hash(e.to_string()))
}

/// Applies the facility's sign-in policy to a new secret. Administrators
/// always need a password; under the `pin` mode everyone else may use 4 to 8
/// digits instead.
fn hash_secret(secret: &str, policy: &AuthPolicy, is_admin: bool) -> Result<String, OfficerError> {
    let length = secret.chars().count();
    let is_pin = (4..=8).contains(&length) && secret.chars().all(|c| c.is_ascii_digit());
    if length < MIN_PASSWORD_LEN && !(is_pin && policy.allows_pin(is_admin)) {
        return Err(if policy.allows_pin(is_admin) {
            OfficerError::InvalidSecret("Use a PIN of 4 to 8 digits, or a password of at least 8 characters.".to_string())
        } else {
            OfficerError::WeakPassword
        });
    }
    argon_hash(secret)
}

/// A hash nobody can produce a secret for, for an account that signs in with
/// its badge alone.
fn unusable_hash() -> Result<String, OfficerError> {
    argon_hash(&Uuid::new_v4().to_string())
}

fn verify_password(password: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok()
}

/// A hash to verify against when the badge does not exist, so an unknown
/// badge costs the same time as a wrong password.
fn dummy_hash() -> &'static str {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default().hash_password(b"not-a-real-password", &salt).unwrap().to_string()
    })
}

pub(crate) fn normalize_badge(badge_number: &str) -> String {
    badge_number.trim().to_string()
}

/// Badge numbers must start with the facility's prefix when it has set one.
/// Checked when an account is created, not on sign-in, so accounts that
/// pre-date the prefix keep working.
async fn check_badge_prefix(conn: &mut SqliteConnection, badge: &str) -> Result<(), OfficerError> {
    let prefix: Option<String> = sqlx::query_scalar("SELECT badge_prefix FROM facility_profile WHERE id = 'default'").fetch_one(&mut *conn).await?;
    match prefix.filter(|p| !p.is_empty()) {
        Some(prefix) if !badge.to_uppercase().starts_with(&prefix.to_uppercase()) => Err(OfficerError::BadgePrefix(prefix)),
        _ => Ok(()),
    }
}

/// Administrator role templates always carry the admin flag, so creating a
/// `facility_admin` or `hq_admin` can never yield an account that cannot
/// administer.
fn effective_admin(role: &str, is_admin: bool) -> bool {
    is_admin || role == "facility_admin" || role == "hq_admin"
}

async fn is_head_office(conn: &mut SqliteConnection) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query_scalar::<_, bool>("SELECT is_head_office FROM hq_config WHERE id = 'default'")
        .fetch_optional(&mut *conn)
        .await?
        .unwrap_or(false))
}

pub async fn is_bootstrap(pool: &SqlitePool) -> Result<bool, sqlx::Error> {
    let officer_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(pool).await?;
    Ok(officer_count == 0)
}

pub async fn get_officer(pool: &SqlitePool, id: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(SELECT_OFFICER_BY_ID)
        .bind(id)
        .fetch_optional(pool)
        .await
}

async fn get_officer_conn(conn: &mut SqliteConnection, id: &str) -> Result<Option<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(SELECT_OFFICER_BY_ID)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
}

pub async fn list_officers(pool: &SqlitePool) -> Result<Vec<Officer>, sqlx::Error> {
    sqlx::query_as::<_, Officer>(SELECT_OFFICERS)
        .fetch_all(pool)
        .await
}

/// The one time bootstrap: the first account on a brand new installation.
/// Allowed only while there are zero accounts, checked inside the caller's
/// write transaction so two simultaneous first-launches cannot both win.
pub async fn create_first_admin(
    conn: &mut SqliteConnection,
    badge_number: &str,
    name: &str,
    password: &str,
) -> Result<Officer, OfficerError> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(&mut *conn).await?;
    if count > 0 {
        return Err(OfficerError::AlreadyInitialised);
    }
    let role = if is_head_office(conn).await? { "hq_admin" } else { "oic" };
    let actor = Actor::system("first launch");
    check_badge_prefix(conn, &normalize_badge(badge_number)).await?;
    insert_officer(conn, &actor, badge_number, name, role, true, Secret::Set(password), ProfileInput::default(), "account.bootstrap").await
}

/// What an account signs in with when it is created.
enum Secret<'a> {
    Set(&'a str),
    BadgeOnly,
}

#[allow(clippy::too_many_arguments)]
async fn insert_officer(
    conn: &mut SqliteConnection,
    actor: &Actor,
    badge_number: &str,
    name: &str,
    role: &str,
    is_admin: bool,
    secret: Secret<'_>,
    profile: ProfileInput,
    action: &str,
) -> Result<Officer, OfficerError> {
    if !authz::is_known_role(role, is_head_office(conn).await?) {
        return Err(OfficerError::InvalidRole);
    }
    let id = Uuid::new_v4().to_string();
    let badge_number = normalize_badge(badge_number);
    let is_admin = effective_admin(role, is_admin);
    let policy = auth_policy::get_conn(conn).await?;
    let (password_hash, passwordless) = match secret {
        Secret::Set(secret) => (hash_secret(secret, &policy, is_admin)?, false),
        Secret::BadgeOnly => {
            if !policy.allows_passwordless(is_admin, is_head_office(conn).await?) {
                return Err(OfficerError::BadgeOnlyNotAllowed);
            }
            (unusable_hash()?, true)
        }
    };
    let photo = clean_photo(profile.photo_data)?;

    sqlx::query(
        "INSERT INTO officers (id, badge_number, name, role, is_admin, password_hash, rank, phone, email, photo_data, posted_facility_id, passwordless)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
        .bind(&id)
        .bind(&badge_number)
        .bind(name)
        .bind(role)
        .bind(is_admin)
        .bind(&password_hash)
        .bind(clean(profile.rank))
        .bind(clean(profile.phone))
        .bind(clean(profile.email))
        .bind(&photo)
        .bind(clean(profile.posted_facility_id))
        .bind(passwordless)
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE constraint failed") {
                OfficerError::BadgeTaken
            } else {
                OfficerError::Db(e)
            }
        })?;

    let officer = get_officer_conn(conn, &id).await?.ok_or(OfficerError::NotFound)?;
    audit::record(conn, actor, AuditEntry::new(action, "officer", Some(&id)).after(&audit_snapshot(&officer))).await?;
    Ok(officer)
}

pub async fn create_officer(conn: &mut SqliteConnection, actor: &Actor, input: CreateOfficerInput) -> Result<Officer, OfficerError> {
    check_badge_prefix(conn, &normalize_badge(&input.badge_number)).await?;
    let secret = if input.passwordless { Secret::BadgeOnly } else { Secret::Set(&input.password) };
    insert_officer(conn, actor, &input.badge_number, &input.name, &input.role, input.is_admin, secret, input.profile, "account.create").await
}

pub async fn update_officer(
    conn: &mut SqliteConnection,
    actor: &Actor,
    id: &str,
    input: UpdateOfficerInput,
) -> Result<Officer, OfficerError> {
    if !authz::is_known_role(&input.role, is_head_office(conn).await?) {
        return Err(OfficerError::InvalidRole);
    }
    let existing = get_officer_conn(conn, id).await?.ok_or(OfficerError::NotFound)?;
    let is_admin = effective_admin(&input.role, input.is_admin);

    // Would this leave the installation with no active administrator? The
    // whole update runs inside the caller's IMMEDIATE transaction, so two
    // concurrent demotions cannot both pass this check.
    let removes_admin = existing.is_admin && existing.active && (!input.active || !is_admin);
    if removes_admin {
        let other_admin: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM officers WHERE is_admin = 1 AND active = 1 AND id != ?)",
        )
        .bind(id)
        .fetch_one(&mut *conn)
        .await?;
        if !other_admin {
            return Err(OfficerError::LastAdminGuard);
        }
    }

    let photo = clean_photo(input.profile.photo_data)?;
    let (rank, phone, email, posted) =
        (clean(input.profile.rank), clean(input.profile.phone), clean(input.profile.email), clean(input.profile.posted_facility_id));

    match input.password.as_deref() {
        Some(password) => {
            let password_hash = hash_secret(password, &auth_policy::get_conn(conn).await?, is_admin)?;
            sqlx::query(
                "UPDATE officers SET name = ?, role = ?, is_admin = ?, active = ?, password_hash = ?,
                        failed_attempts = 0, locked_until = NULL,
                        rank = ?, phone = ?, email = ?, photo_data = ?, posted_facility_id = ? WHERE id = ?",
            )
            .bind(&input.name)
            .bind(&input.role)
            .bind(is_admin)
            .bind(input.active)
            .bind(&password_hash)
            .bind(&rank)
            .bind(&phone)
            .bind(&email)
            .bind(&photo)
            .bind(&posted)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        }
        None => {
            sqlx::query(
                "UPDATE officers SET name = ?, role = ?, is_admin = ?, active = ?,
                        rank = ?, phone = ?, email = ?, photo_data = ?, posted_facility_id = ? WHERE id = ?",
            )
            .bind(&input.name)
            .bind(&input.role)
            .bind(is_admin)
            .bind(input.active)
            .bind(&rank)
            .bind(&phone)
            .bind(&email)
            .bind(&photo)
            .bind(&posted)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        }
    }

    // Badge-only sign-in is a property of the account, changed only here.
    // Whether an account keeps it after this update decides what it needs.
    // Giving the account a secret ends badge-only sign-in unless said otherwise.
    let passwordless = input.passwordless.or(input.password.as_ref().map(|_| false));
    let stays_passwordless = passwordless.unwrap_or(existing.passwordless);
    if stays_passwordless {
        let policy = auth_policy::get_conn(conn).await?;
        if !policy.allows_passwordless(is_admin, is_head_office(conn).await?) {
            return Err(OfficerError::BadgeOnlyNotAllowed);
        }
    }
    match passwordless {
        Some(true) => {
            sqlx::query("UPDATE officers SET passwordless = 1, password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?")
                .bind(unusable_hash()?)
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
        Some(false) => {
            if existing.passwordless && input.password.is_none() {
                return Err(OfficerError::InvalidSecret("Give this account a password or PIN to stop it signing in with its badge alone.".to_string()));
            }
            sqlx::query("UPDATE officers SET passwordless = 0 WHERE id = ?").bind(id).execute(&mut *conn).await?;
        }
        None => {}
    }

    // A deactivated account, or one whose secret just changed, loses its
    // sessions immediately: the next request from any device is rejected.
    if !input.active || input.password.is_some() || passwordless.is_some() {
        sqlx::query("UPDATE sessions SET revoked_at = ? WHERE officer_id = ? AND revoked_at IS NULL")
            .bind(now_ms())
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }

    let updated = get_officer_conn(conn, id).await?.ok_or(OfficerError::NotFound)?;
    let action = if input.password.is_some() { "account.update_with_password_change" } else { "account.update" };
    audit::record(conn, actor, AuditEntry::new(action, "officer", Some(id)).before(&audit_snapshot(&existing)).after(&audit_snapshot(&updated))).await?;
    Ok(updated)
}

/// Head Office only: a facility keeps deactivate-only accounts. The account's
/// sessions go with it (`sessions.officer_id` is a foreign key); the audit
/// trail keeps the badge and name it recorded at the time, so attribution of
/// everything the officer ever did survives.
pub async fn delete_officer(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<(), OfficerError> {
    if !is_head_office(conn).await? {
        return Err(OfficerError::HeadOfficeOnly);
    }
    if actor.officer_id.as_deref() == Some(id) {
        return Err(OfficerError::CannotDeleteSelf);
    }
    let existing = get_officer_conn(conn, id).await?.ok_or(OfficerError::NotFound)?;

    if existing.is_admin && existing.active {
        let other_admin: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM officers WHERE is_admin = 1 AND active = 1 AND id != ?)")
            .bind(id)
            .fetch_one(&mut *conn)
            .await?;
        if !other_admin {
            return Err(OfficerError::LastAdminGuard);
        }
    }

    sqlx::query("DELETE FROM sessions WHERE officer_id = ?").bind(id).execute(&mut *conn).await?;
    sqlx::query("DELETE FROM officers WHERE id = ?").bind(id).execute(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("account.delete", "officer", Some(id)).before(&audit_snapshot(&existing))).await?;
    Ok(())
}

#[derive(FromRow)]
struct CredentialRow {
    id: String,
    active: bool,
    is_admin: bool,
    passwordless: bool,
    password_hash: String,
    failed_attempts: i64,
    locked_until: Option<i64>,
}

/// Checks a badge and password. On success returns the officer and resets
/// the failure counter; on failure increments it and, past the limit, locks
/// the account briefly. Success and failure are both audited. Every failure
/// is the same `InvalidCredentials`.
///
/// The Argon2 work happens before the write transaction opens so a login
/// never holds the single SQLite writer while hashing.
pub async fn check_credentials(
    pool: &SqlitePool,
    badge_number: &str,
    password: &str,
    device_id: Option<&str>,
) -> Result<Officer, OfficerError> {
    let badge = normalize_badge(badge_number);
    let row = sqlx::query_as::<_, CredentialRow>(
        "SELECT id, active, is_admin, passwordless, password_hash, failed_attempts, locked_until FROM officers WHERE badge_number = ?",
    )
    .bind(&badge)
    .fetch_optional(pool)
    .await?;

    let now = now_ms();
    let locked = row.as_ref().is_some_and(|r| r.locked_until.is_some_and(|until| until > now));
    let hash_to_check = row.as_ref().map(|r| r.password_hash.clone()).unwrap_or_else(|| dummy_hash().to_string());
    let password_owned = password.to_string();
    let secret_ok = tokio::task::spawn_blocking(move || verify_password(&password_owned, &hash_to_check))
        .await
        .unwrap_or(false);

    // Badge alone: only an account marked for it, only while the policy says
    // so, never an administrator or Head Office, and never from a workstation.
    let policy = auth_policy::get(pool).await?;
    let head_office = sqlx::query_scalar::<_, bool>("SELECT is_head_office FROM hq_config WHERE id = 'default'").fetch_optional(pool).await?.unwrap_or(false);
    let badge_only = password.is_empty()
        && device_id.is_none()
        && row.as_ref().is_some_and(|r| r.passwordless && policy.allows_passwordless(r.is_admin, head_office));
    let password_ok = secret_ok || badge_only;

    let mut actor = Actor::system("sign-in");
    actor.device_id = device_id.map(|d| d.to_string());

    let mut tx = crate::db::begin_write(pool).await?;
    let result = match &row {
        Some(r) if r.active && !locked && password_ok => {
            sqlx::query("UPDATE officers SET failed_attempts = 0, locked_until = NULL WHERE id = ?")
                .bind(&r.id)
                .execute(&mut *tx)
                .await?;
            let officer = get_officer_conn(&mut tx, &r.id).await?.ok_or(OfficerError::InvalidCredentials)?;
            let action = if badge_only && !secret_ok { "auth.login_badge_only" } else { "auth.login" };
            audit::record(&mut tx, &actor, AuditEntry::new(action, "officer", Some(&r.id)).reason(&badge)).await?;
            Ok(officer)
        }
        Some(r) => {
            if !locked {
                let attempts = r.failed_attempts + 1;
                let lock_until = if attempts >= MAX_FAILED_ATTEMPTS { Some(now + LOCK_MS) } else { None };
                let stored = if lock_until.is_some() { 0 } else { attempts };
                sqlx::query("UPDATE officers SET failed_attempts = ?, locked_until = ? WHERE id = ?")
                    .bind(stored)
                    .bind(lock_until)
                    .bind(&r.id)
                    .execute(&mut *tx)
                    .await?;
            }
            audit::record(&mut tx, &actor, AuditEntry::new("auth.login_failed", "officer", Some(&r.id)).reason(&badge)).await?;
            Err(OfficerError::InvalidCredentials)
        }
        None => {
            audit::record(&mut tx, &actor, AuditEntry::new("auth.login_failed", "officer", None).reason(&badge)).await?;
            Err(OfficerError::InvalidCredentials)
        }
    };
    tx.commit().await?;
    result
}

/// Debug builds only: after the dev role switch flips an installation, the
/// existing accounts belong to the other kind of installation, so make sure a
/// known administrator account of the right kind exists to sign in with.
#[cfg(debug_assertions)]
pub async fn ensure_dev_account(pool: &SqlitePool, head_office: bool) -> Result<(String, String), OfficerError> {
    const PASSWORD: &str = "dev-password-1";
    let (badge, name, role) = if head_office {
        ("DEV-HQ", "Development Head Office", "hq_admin")
    } else {
        ("DEV-FAC", "Development Officer in Charge", "oic")
    };
    let existing: Option<(String, String, bool, bool, String)> =
        sqlx::query_as("SELECT id, role, is_admin, active, password_hash FROM officers WHERE badge_number = ?")
            .bind(badge)
            .fetch_optional(pool)
            .await?;
    let actor = Actor::system("development");
    match existing {
        None => {
            let mut tx = crate::db::begin_write(pool).await?;
            insert_officer(&mut tx, &actor, badge, name, role, true, Secret::Set(PASSWORD), ProfileInput::default(), "account.dev_seed").await?;
            tx.commit().await?;
        }
        // The dev account is only useful while it can sign in with the known
        // password and holds the role it is named for. Editing it away (for
        // example to an administrator role with no record access) would
        // otherwise strand the installation, so restore it through the normal
        // audited update.
        Some((id, current_role, is_admin, active, hash)) => {
            if current_role != role || !is_admin || !active || !verify_password(PASSWORD, &hash) {
                let mut tx = crate::db::begin_write(pool).await?;
                let input = UpdateOfficerInput {
                    name: name.to_string(),
                    role: role.to_string(),
                    is_admin: true,
                    active: true,
                    password: Some(PASSWORD.to_string()),
                    passwordless: Some(false),
                    profile: ProfileInput::default(),
                };
                update_officer(&mut tx, &actor, &id, input).await?;
                tx.commit().await?;
            }
        }
    }
    Ok((badge.to_string(), PASSWORD.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn bootstrap(pool: &SqlitePool) -> Officer {
        let mut tx = pool.begin().await.unwrap();
        let officer = create_first_admin(&mut tx, "OIC-1", "Officer In Charge", "correct-horse").await.unwrap();
        tx.commit().await.unwrap();
        officer
    }

    #[tokio::test]
    async fn bootstrap_creates_one_oic_admin_and_only_once() {
        let pool = pool().await;
        let first = bootstrap(&pool).await;
        assert_eq!(first.role, "oic");
        assert!(first.is_admin);

        let mut tx = pool.begin().await.unwrap();
        let second = create_first_admin(&mut tx, "OIC-2", "Someone", "correct-horse").await;
        assert!(matches!(second, Err(OfficerError::AlreadyInitialised)));
    }

    #[tokio::test]
    async fn creating_an_account_is_audited_in_the_same_transaction() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = Actor::officer(admin.id.clone(), admin.badge_number.clone(), admin.name.clone(), admin.role.clone(), true, None);

        let mut tx = pool.begin().await.unwrap();
        let created = create_officer(
            &mut tx,
            &actor,
            CreateOfficerInput {
                badge_number: "R-1".into(),
                name: "Records Clerk".into(),
                password: "another-password".into(),
                role: "records".into(),
                is_admin: false,
                passwordless: false,
                profile: ProfileInput::default(),
            },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let rows = audit::list(&pool, &audit::AuditFilter { entity_id: Some(created.id.clone()), ..Default::default() }).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].action, "account.create");
        assert_eq!(rows[0].actor_badge.as_deref(), Some("OIC-1"));
        let after = rows[0].after_json.as_deref().unwrap_or("");
        assert!(!after.contains("password_hash") && !after.contains("passwordHash") && !after.contains("argon2"), "hashes never enter the audit trail");
    }

    #[tokio::test]
    async fn last_admin_cannot_be_demoted_or_deactivated() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = Actor::officer(admin.id.clone(), admin.badge_number.clone(), admin.name.clone(), admin.role.clone(), true, None);

        let mut tx = pool.begin().await.unwrap();
        let result = update_officer(
            &mut tx,
            &actor,
            &admin.id,
            UpdateOfficerInput { name: admin.name.clone(), role: "oic".into(), is_admin: false, active: true, password: None, passwordless: None, profile: ProfileInput::default() },
        )
        .await;
        assert!(matches!(result, Err(OfficerError::LastAdminGuard)));
    }

    #[tokio::test]
    async fn five_failures_lock_the_account_and_a_locked_account_rejects_the_right_password() {
        let pool = pool().await;
        bootstrap(&pool).await;

        for _ in 0..MAX_FAILED_ATTEMPTS {
            let r = check_credentials(&pool, "OIC-1", "wrong-password", None).await;
            assert!(matches!(r, Err(OfficerError::InvalidCredentials)));
        }
        let locked = check_credentials(&pool, "OIC-1", "correct-horse", None).await;
        assert!(matches!(locked, Err(OfficerError::InvalidCredentials)), "the correct password must not bypass a lock");

        sqlx::query("UPDATE officers SET locked_until = NULL").execute(&pool).await.unwrap();
        let ok = check_credentials(&pool, "OIC-1", "correct-horse", None).await;
        assert!(ok.is_ok());
    }

    #[tokio::test]
    async fn unknown_badge_and_wrong_password_are_indistinguishable() {
        let pool = pool().await;
        bootstrap(&pool).await;
        let unknown = OfficerErrorPayload::from(check_credentials(&pool, "NOPE", "whatever-password", None).await.unwrap_err());
        let wrong = OfficerErrorPayload::from(check_credentials(&pool, "OIC-1", "whatever-password", None).await.unwrap_err());
        assert_eq!(unknown.code, wrong.code);
        assert_eq!(unknown.message, wrong.message);
    }

    fn actor_of(admin: &Officer) -> Actor {
        Actor::officer(admin.id.clone(), admin.badge_number.clone(), admin.name.clone(), admin.role.clone(), true, None)
    }

    async fn set_mode(pool: &SqlitePool, actor: &Actor, mode: &str) -> Result<AuthPolicy, crate::domain::error::DomainError> {
        let mut tx = pool.begin().await.unwrap();
        let saved = auth_policy::save(
            &mut tx,
            actor,
            auth_policy::AuthPolicyInput { mode: mode.into(), idle_timeout_minutes: 240, absolute_lifetime_hours: 12 },
        )
        .await;
        if saved.is_ok() {
            tx.commit().await.unwrap();
        }
        saved
    }

    async fn add(pool: &SqlitePool, actor: &Actor, badge: &str, role: &str, secret: &str, passwordless: bool) -> Result<Officer, OfficerError> {
        let mut tx = pool.begin().await.unwrap();
        let created = create_officer(
            &mut tx,
            actor,
            CreateOfficerInput {
                badge_number: badge.into(),
                name: badge.into(),
                password: secret.into(),
                role: role.into(),
                is_admin: false,
                passwordless,
                profile: ProfileInput::default(),
            },
        )
        .await;
        if created.is_ok() {
            tx.commit().await.unwrap();
        }
        created
    }

    #[tokio::test]
    async fn a_pin_is_accepted_only_in_pin_mode_and_never_for_an_administrator() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = actor_of(&admin);

        assert!(matches!(add(&pool, &actor, "R-1", "records", "4821", false).await, Err(OfficerError::WeakPassword)));
        set_mode(&pool, &actor, "pin").await.unwrap();
        add(&pool, &actor, "R-2", "records", "4821", false).await.unwrap();
        assert!(matches!(add(&pool, &actor, "R-3", "records", "48", false).await, Err(OfficerError::InvalidSecret(_))));
        assert!(matches!(add(&pool, &actor, "R-4", "records", "48ab12", false).await, Err(OfficerError::InvalidSecret(_))));

        let mut tx = pool.begin().await.unwrap();
        let mut input = CreateOfficerInput { badge_number: "A-1".into(), name: "Admin".into(), password: "4821".into(), role: "facility_admin".into(), ..Default::default() };
        input.is_admin = true;
        let refused = create_officer(&mut tx, &actor, input).await;
        assert!(matches!(refused, Err(OfficerError::InvalidSecret(_)) | Err(OfficerError::WeakPassword)), "an administrator needs a real password");
        drop(tx);

        assert!(check_credentials(&pool, "R-2", "4821", None).await.is_ok(), "the PIN signs in like any secret");
    }

    #[tokio::test]
    async fn badge_only_signs_in_without_a_secret_only_when_every_condition_holds() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = actor_of(&admin);

        // Not while the policy is `password`.
        assert!(matches!(add(&pool, &actor, "G-1", "records", "", true).await, Err(OfficerError::BadgeOnlyNotAllowed)));

        set_mode(&pool, &actor, "badge_only").await.unwrap();
        let clerk = add(&pool, &actor, "G-1", "records", "", true).await.unwrap();
        assert!(clerk.passwordless);

        assert!(check_credentials(&pool, "G-1", "", None).await.is_ok(), "badge alone signs in");
        assert!(check_credentials(&pool, "G-1", "anything", None).await.is_err(), "a guess is not the badge-only path");
        assert!(check_credentials(&pool, "G-1", "", Some("workstation-1")).await.is_err(), "never from a workstation");
        assert!(check_credentials(&pool, "OIC-1", "", None).await.is_err(), "an administrator always needs the password");
        assert!(check_credentials(&pool, "NOBODY", "", None).await.is_err());

        // An administrator can never be badge-only.
        let mut tx = pool.begin().await.unwrap();
        let refused = create_officer(
            &mut tx,
            &actor,
            CreateOfficerInput { badge_number: "A-2".into(), name: "A".into(), role: "facility_admin".into(), is_admin: true, passwordless: true, ..Default::default() },
        )
        .await;
        assert!(matches!(refused, Err(OfficerError::BadgeOnlyNotAllowed)));
        drop(tx);
    }

    #[tokio::test]
    async fn leaving_badge_only_takes_the_no_secret_sign_in_away() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = actor_of(&admin);
        set_mode(&pool, &actor, "badge_only").await.unwrap();
        add(&pool, &actor, "G-1", "records", "", true).await.unwrap();
        assert!(check_credentials(&pool, "G-1", "", None).await.is_ok());

        set_mode(&pool, &actor, "password").await.unwrap();
        assert!(check_credentials(&pool, "G-1", "", None).await.is_err(), "the account must be given a secret now");
        let flagged: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers WHERE passwordless = 1").fetch_one(&pool).await.unwrap();
        assert_eq!(flagged, 0);
    }

    #[tokio::test]
    async fn badge_only_is_refused_on_head_office_and_while_serving_workstations() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = actor_of(&admin);

        sqlx::query("UPDATE node_config SET node_mode = 'node' WHERE id = 'default'").execute(&pool).await.unwrap();
        assert!(set_mode(&pool, &actor, "badge_only").await.is_err());
        sqlx::query("UPDATE node_config SET node_mode = 'standalone' WHERE id = 'default'").execute(&pool).await.unwrap();

        sqlx::query("UPDATE hq_config SET is_head_office = 1 WHERE id = 'default'").execute(&pool).await.unwrap();
        assert!(set_mode(&pool, &actor, "badge_only").await.is_err());
    }

    #[tokio::test]
    async fn the_facility_badge_prefix_applies_to_new_accounts_only() {
        let pool = pool().await;
        let admin = bootstrap(&pool).await;
        let actor = actor_of(&admin);
        sqlx::query("UPDATE facility_profile SET badge_prefix = 'UP-' WHERE id = 'default'").execute(&pool).await.unwrap();

        assert!(matches!(add(&pool, &actor, "R-1", "records", "another-password", false).await, Err(OfficerError::BadgePrefix(p)) if p == "UP-"));
        add(&pool, &actor, "up-0142", "records", "another-password", false).await.unwrap();
        assert!(check_credentials(&pool, "OIC-1", "correct-horse", None).await.is_ok(), "an account from before the prefix still signs in");
    }
}
