//! The sign-in the five apps share: pick your name, give your PIN or
//! password, and (on full protection) the code from the authenticator app.
//! Built on `officers::check_credentials`, so the lockout, the audit trail and
//! the badge rules are the ones the older badge screen already had.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::auth_policy;
use super::officers::{self, OfficerError};
use super::sessions::{self, SessionInfo};
use super::totp::{self, Enrolment};

const ISSUER: &str = "Pleadli Prisons";
const MAX_FAILED_ATTEMPTS: i64 = 5;
const LOCK_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SignInPerson {
    pub id: String,
    pub name: String,
    /// "Rank · badge", for the line under the name.
    pub rank: String,
    pub secret_kind: String,
    pub needs_enrolment: bool,
}

pub async fn sign_in_people(pool: &SqlitePool) -> Result<Vec<SignInPerson>, OfficerError> {
    let policy = auth_policy::get(pool).await?;
    let kind = if policy.mode == "pin" { "pin" } else { "password" };
    let full = policy.mode == "full";
    let rows: Vec<(String, String, Option<String>, String, bool)> =
        sqlx::query_as("SELECT id, name, rank, badge_number, totp_secret IS NULL FROM officers WHERE active = 1 ORDER BY name COLLATE NOCASE").fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, rank, badge, no_key)| SignInPerson {
            id,
            name,
            rank: match rank.filter(|r| !r.trim().is_empty()) { Some(r) => format!("{r} · {badge}"), None => badge },
            secret_kind: kind.to_string(),
            needs_enrolment: full && no_key,
        })
        .collect())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedSignInInput {
    pub staff_id: String,
    pub secret: String,
    #[serde(default)]
    pub code: Option<String>,
    /// The key being linked on this sign-in (first time on full protection).
    #[serde(default)]
    pub enrol_secret: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SharedOutcome {
    SignedIn { session: SessionInfo },
    Enrol { enrolment: Enrolment },
    Code,
}

pub fn new_enrolment(account: &str) -> Result<Enrolment, OfficerError> {
    totp::enrol(ISSUER, account).map_err(OfficerError::Hash)
}

async fn count_wrong_code(pool: &SqlitePool, id: &str, badge: &str) -> Result<(), OfficerError> {
    let current: i64 = sqlx::query_scalar("SELECT failed_attempts FROM officers WHERE id = ?").bind(id).fetch_one(pool).await?;
    let attempts = current + 1;
    let lock = if attempts >= MAX_FAILED_ATTEMPTS { Some(chrono::Utc::now().timestamp_millis() + LOCK_MS) } else { None };
    let stored = if lock.is_some() { 0 } else { attempts };
    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query("UPDATE officers SET failed_attempts = ?, locked_until = ? WHERE id = ?").bind(stored).bind(lock).bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, &Actor::system("sign-in"), AuditEntry::new("auth.login_failed", "officer", Some(id)).reason(badge)).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn shared_sign_in(pool: &SqlitePool, input: SharedSignInInput, device_id: Option<&str>) -> Result<SharedOutcome, OfficerError> {
    let row: Option<(String, Option<String>)> = sqlx::query_as("SELECT badge_number, totp_secret FROM officers WHERE id = ? AND active = 1").bind(&input.staff_id).fetch_optional(pool).await?;
    let Some((badge, key)) = row else { return Err(OfficerError::InvalidCredentials) };
    let full = auth_policy::get(pool).await?.mode == "full";
    // Nothing is learned about the second factor before the first one is right.
    let officer = officers::check_credentials(pool, &badge, &input.secret, device_id).await?;
    if full {
        match (&key, &input.enrol_secret, &input.code) {
            (None, None, _) => return Ok(SharedOutcome::Enrol { enrolment: new_enrolment(&officer.name)? }),
            (None, Some(new_key), Some(code)) => {
                if !totp::verify(new_key, code) {
                    count_wrong_code(pool, &officer.id, &badge).await?;
                    return Err(OfficerError::InvalidCredentials);
                }
                sqlx::query("UPDATE officers SET totp_secret = ? WHERE id = ?").bind(new_key).bind(&officer.id).execute(pool).await?;
            }
            (None, Some(_), None) | (Some(_), _, None) => return Ok(SharedOutcome::Code),
            (Some(k), _, Some(code)) => {
                if !totp::verify(k, code) {
                    count_wrong_code(pool, &officer.id, &badge).await?;
                    return Err(OfficerError::InvalidCredentials);
                }
            }
        }
    }
    Ok(SharedOutcome::SignedIn { session: sessions::open_session(pool, officer, device_id).await? })
}
