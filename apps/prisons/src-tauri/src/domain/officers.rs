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
}

const SELECT_OFFICER_BY_ID: &str =
    "SELECT id, badge_number, name, role, is_admin, active, created_at FROM officers WHERE id = ?";
const SELECT_OFFICERS: &str =
    "SELECT id, badge_number, name, role, is_admin, active, created_at FROM officers ORDER BY name";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOfficerInput {
    pub badge_number: String,
    pub name: String,
    pub password: String,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOfficerInput {
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub is_admin: bool,
    pub active: bool,
    pub password: Option<String>,
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

fn hash_password(password: &str) -> Result<String, OfficerError> {
    if password.chars().count() < MIN_PASSWORD_LEN {
        return Err(OfficerError::WeakPassword);
    }
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
    insert_officer(conn, &actor, badge_number, name, role, true, password, "account.bootstrap").await
}

#[allow(clippy::too_many_arguments)]
async fn insert_officer(
    conn: &mut SqliteConnection,
    actor: &Actor,
    badge_number: &str,
    name: &str,
    role: &str,
    is_admin: bool,
    password: &str,
    action: &str,
) -> Result<Officer, OfficerError> {
    if !authz::is_known_role(role, is_head_office(conn).await?) {
        return Err(OfficerError::InvalidRole);
    }
    let id = Uuid::new_v4().to_string();
    let badge_number = normalize_badge(badge_number);
    let password_hash = hash_password(password)?;
    let is_admin = effective_admin(role, is_admin);

    sqlx::query("INSERT INTO officers (id, badge_number, name, role, is_admin, password_hash) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&badge_number)
        .bind(name)
        .bind(role)
        .bind(is_admin)
        .bind(&password_hash)
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
    audit::record(conn, actor, AuditEntry::new(action, "officer", Some(&id)).after(&officer)).await?;
    Ok(officer)
}

pub async fn create_officer(conn: &mut SqliteConnection, actor: &Actor, input: CreateOfficerInput) -> Result<Officer, OfficerError> {
    insert_officer(conn, actor, &input.badge_number, &input.name, &input.role, input.is_admin, &input.password, "account.create").await
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

    match input.password.as_deref() {
        Some(password) => {
            let password_hash = hash_password(password)?;
            sqlx::query(
                "UPDATE officers SET name = ?, role = ?, is_admin = ?, active = ?, password_hash = ?,
                        failed_attempts = 0, locked_until = NULL WHERE id = ?",
            )
            .bind(&input.name)
            .bind(&input.role)
            .bind(is_admin)
            .bind(input.active)
            .bind(&password_hash)
            .bind(id)
            .execute(&mut *conn)
            .await?;
        }
        None => {
            sqlx::query("UPDATE officers SET name = ?, role = ?, is_admin = ?, active = ? WHERE id = ?")
                .bind(&input.name)
                .bind(&input.role)
                .bind(is_admin)
                .bind(input.active)
                .bind(id)
                .execute(&mut *conn)
                .await?;
        }
    }

    // A deactivated account, or one whose password just changed, loses its
    // sessions immediately: the next request from any device is rejected.
    if !input.active || input.password.is_some() {
        sqlx::query("UPDATE sessions SET revoked_at = ? WHERE officer_id = ? AND revoked_at IS NULL")
            .bind(now_ms())
            .bind(id)
            .execute(&mut *conn)
            .await?;
    }

    let updated = get_officer_conn(conn, id).await?.ok_or(OfficerError::NotFound)?;
    let action = if input.password.is_some() { "account.update_with_password_change" } else { "account.update" };
    audit::record(conn, actor, AuditEntry::new(action, "officer", Some(id)).before(&existing).after(&updated)).await?;
    Ok(updated)
}

#[derive(FromRow)]
struct CredentialRow {
    id: String,
    active: bool,
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
        "SELECT id, active, password_hash, failed_attempts, locked_until FROM officers WHERE badge_number = ?",
    )
    .bind(&badge)
    .fetch_optional(pool)
    .await?;

    let now = now_ms();
    let locked = row.as_ref().is_some_and(|r| r.locked_until.is_some_and(|until| until > now));
    let hash_to_check = row.as_ref().map(|r| r.password_hash.clone()).unwrap_or_else(|| dummy_hash().to_string());
    let password_owned = password.to_string();
    let password_ok = tokio::task::spawn_blocking(move || verify_password(&password_owned, &hash_to_check))
        .await
        .unwrap_or(false);

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
            audit::record(&mut tx, &actor, AuditEntry::new("auth.login", "officer", Some(&r.id)).reason(&badge)).await?;
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
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM officers WHERE badge_number = ?)")
        .bind(badge)
        .fetch_one(pool)
        .await?;
    if !exists {
        let mut tx = crate::db::begin_write(pool).await?;
        insert_officer(&mut tx, &Actor::system("development"), badge, name, role, true, PASSWORD, "account.dev_seed").await?;
        tx.commit().await?;
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
            },
        )
        .await
        .unwrap();
        tx.commit().await.unwrap();

        let rows = audit::list(&pool, &audit::AuditFilter { entity_id: Some(created.id.clone()), ..Default::default() }).await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].action, "account.create");
        assert_eq!(rows[0].actor_badge.as_deref(), Some("OIC-1"));
        assert!(!rows[0].after_json.as_deref().unwrap_or("").contains("password"), "hashes never enter the audit trail");
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
            UpdateOfficerInput { name: admin.name.clone(), role: "oic".into(), is_admin: false, active: true, password: None },
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
}
