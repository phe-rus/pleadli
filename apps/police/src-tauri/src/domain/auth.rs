//! Signing in, and the policy that says what signing in takes.
//!
//! * A **Station** starts on **badge only**: the badge identifies who is at the
//!   keyboard, and is not a secret. An administrator may require passwords.
//! * A **Command** always needs badge **and** password.
//! * An **administrator** always needs a password, on a Station on badges too:
//!   the badge is not a secret, and an administrator can change everything.
//!   One who has none yet (a station set up before this rule) chooses it at
//!   their next sign-in, once; after that it is asked every time.
//!
//! Wrong passwords slow that badge down. Every sign-in, refusal, sign-out and
//! change of policy is written to `auth_events`.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::DomainError;
use super::installation;
use super::officers::{self, Officer};
use super::sessions::{self, Actor};
use super::time::now_ms;

const MAX_WRONG: u32 = 5;
const SLOW_MS: i64 = 30_000;

/// Wrong-password counts per badge: (count, last wrong at). In memory on
/// purpose: a restart clears it, which is the same as waiting.
fn wrong_attempts() -> &'static Mutex<HashMap<String, (u32, i64)>> {
    static WRONG: OnceLock<Mutex<HashMap<String, (u32, i64)>>> = OnceLock::new();
    WRONG.get_or_init(|| Mutex::new(HashMap::new()))
}

fn slowed(badge: &str) -> Option<i64> {
    let map = wrong_attempts().lock().ok()?;
    let (count, at) = *map.get(&badge.to_lowercase())?;
    let wait = at + SLOW_MS - now_ms();
    (count >= MAX_WRONG && wait > 0).then_some(wait)
}

fn note_wrong(badge: &str) {
    if let Ok(mut map) = wrong_attempts().lock() {
        let entry = map.entry(badge.to_lowercase()).or_insert((0, 0));
        entry.0 += 1;
        entry.1 = now_ms();
    }
}

fn clear_wrong(badge: &str) {
    if let Ok(mut map) = wrong_attempts().lock() {
        map.remove(&badge.to_lowercase());
    }
}

pub async fn record_event(pool: &SqlitePool, officer: Option<&Officer>, badge: Option<&str>, action: &str, detail: Option<&str>) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO auth_events (id, officer_id, badge, name, action, detail, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(officer.map(|o| o.id.as_str()))
        .bind(badge)
        .bind(officer.map(|o| o.name.as_str()))
        .bind(action)
        .bind(detail)
        .bind(now_ms())
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInInput {
    pub badge_number: String,
    pub password: Option<String>,
}

/// One message for every reason a sign-in is refused, so the screen does not
/// say which part was wrong.
const REFUSED: &str = "That sign-in was not accepted.";

pub async fn sign_in(pool: &SqlitePool, input: SignInInput) -> Result<(String, Officer), DomainError> {
    if installation::mode(pool).await?.is_none() {
        return Err(DomainError::rejected("This installation has not been set up yet."));
    }
    let badge = input.badge_number.trim();
    if badge.is_empty() {
        return Err(DomainError::rejected("Enter a badge number."));
    }
    if let Some(wait) = slowed(badge) {
        return Err(DomainError::Slow(format!("Too many wrong passwords. Try again in {} seconds.", wait / 1000 + 1)));
    }

    let officer = officers::get_officer_by_badge(pool, badge).await?;
    let Some(officer) = officer.filter(|o| o.active) else {
        record_event(pool, None, Some(badge), "sign_in_refused", Some("Unknown or disabled badge")).await?;
        return Err(DomainError::Unauthorized(REFUSED.to_string()));
    };
    // Badge numbers are compared without regard to case.
    if officer.badge_number.as_deref().map(str::to_lowercase) != Some(badge.to_lowercase()) {
        return Err(DomainError::Unauthorized(REFUSED.to_string()));
    }

    let mode = installation::effective_auth_mode(pool).await?;
    let is_admin = officer.role == "admin";
    if is_admin && mode != "password" && mode != "pin" && input.password.as_deref().unwrap_or_default().is_empty() {
        let first = !officers::has_password(pool, &officer.id).await?;
        return Err(DomainError::NeedsPassword(if first { "choose_password" } else { "password" }));
    }
    if mode == "full" {
        return Err(DomainError::rejected("This installation asks for an authenticator code. Use the sign-in screen."));
    }
    if mode == "password" || mode == "pin" || is_admin {
        let supplied = input.password.as_deref().unwrap_or_default();
        if !officers::password_matches(pool, &officer.id, supplied).await? {
            note_wrong(badge);
            record_event(pool, Some(&officer), Some(badge), "sign_in_refused", Some("Password missing or wrong")).await?;
            return Err(DomainError::Unauthorized(REFUSED.to_string()));
        }
    }
    clear_wrong(badge);

    let token = sessions::create(pool, &officer.id).await?;
    record_event(pool, Some(&officer), Some(badge), "sign_in", Some(if mode == "password" || is_admin { "Badge and password" } else { "Badge only" })).await?;
    Ok((token, officer))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstPasswordInput {
    pub badge_number: String,
    pub password: String,
}

/// An administrator with no password yet chooses one and is signed in. Only
/// ever for an active administrator who has none: once set, this is refused
/// and the password is asked like any other.
pub async fn choose_first_password(pool: &SqlitePool, input: FirstPasswordInput) -> Result<(String, Officer), DomainError> {
    let badge = input.badge_number.trim();
    let officer = officers::get_officer_by_badge(pool, badge).await?.filter(|o| o.active && o.role == "admin");
    let Some(officer) = officer else {
        return Err(DomainError::Unauthorized(REFUSED.to_string()));
    };
    if officers::has_password(pool, &officer.id).await? {
        return Err(DomainError::Unauthorized(REFUSED.to_string()));
    }
    if input.password.trim().chars().count() < 8 {
        return Err(DomainError::rejected("A password of at least 8 characters is needed."));
    }
    officers::set_password(pool, &officer.id, input.password.trim()).await?;
    let token = sessions::create(pool, &officer.id).await?;
    record_event(pool, Some(&officer), Some(badge), "password_chosen", Some("Administrator chose a first password")).await?;
    record_event(pool, Some(&officer), Some(badge), "sign_in", Some("Badge and password")).await?;
    Ok((token, officer))
}

pub async fn sign_out(pool: &SqlitePool, actor: &Actor, token: &str) -> Result<(), DomainError> {
    sessions::end(pool, token).await?;
    sqlx::query("INSERT INTO auth_events (id, officer_id, badge, name, action, occurred_at) VALUES (?, ?, ?, ?, 'sign_out', ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&actor.officer_id)
        .bind(&actor.badge_number)
        .bind(&actor.name)
        .bind(now_ms())
        .execute(pool)
        .await?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuthPolicy {
    pub mode: String,
    pub idle_timeout_minutes: i64,
    pub updated_at: Option<i64>,
}

pub async fn get_policy(pool: &SqlitePool) -> Result<AuthPolicy, sqlx::Error> {
    sqlx::query_as("SELECT mode, idle_timeout_minutes, updated_at FROM auth_policy WHERE id = 'default'").fetch_one(pool).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyInput {
    pub mode: String,
    pub idle_timeout_minutes: i64,
    /// Moving to or from PINs changes what a secret is: the administrator gives their own new one.
    #[serde(default)]
    pub admin_secret: Option<String>,
}

/// Saves the policy. Turning passwords on is refused unless the administrator
/// making the change already has a password, and is refused on a Command
/// (which has no badge-only mode to leave).
pub async fn save_policy(pool: &SqlitePool, actor: &Actor, input: PolicyInput) -> Result<AuthPolicy, DomainError> {
    if installation::mode(pool).await?.as_deref() == Some("command") {
        return Err(DomainError::rejected("A command always signs in with a badge and a password."));
    }
    if !["badge_only", "password", "pin", "full"].contains(&input.mode.as_str()) {
        return Err(DomainError::rejected("Choose badge only, PIN, password, or password with an authenticator."));
    }
    if !(5..=720).contains(&input.idle_timeout_minutes) {
        return Err(DomainError::rejected("Signing out after inactivity must be between 5 minutes and 12 hours."));
    }
    let before_mode = get_policy(pool).await?.mode;
    let kind_changes = (input.mode == "pin") != (before_mode == "pin");
    if kind_changes {
        let new_secret = input.admin_secret.as_deref().map(str::trim).unwrap_or_default();
        if new_secret.is_empty() {
            return Err(DomainError::rejected("Moving to or from PINs changes everyone's secret. Give your own new one."));
        }
        if input.mode == "pin" && !(new_secret.len() == 6 && new_secret.chars().all(|c| c.is_ascii_digit())) {
            return Err(DomainError::rejected("A PIN is exactly 6 digits."));
        }
        if input.mode != "pin" && new_secret.chars().count() < 8 {
            return Err(DomainError::rejected("A password of at least 8 characters is needed."));
        }
        // Other officers' old secrets are the wrong kind now; the administrator sets theirs again.
        sqlx::query("UPDATE officers SET password_hash = NULL WHERE id <> ?").bind(&actor.officer_id).execute(pool).await?;
        officers::set_password(pool, &actor.officer_id, new_secret).await.map_err(|e| DomainError::rejected(&e.to_string()))?;
    }
    if (input.mode == "password" || input.mode == "full") && !officers::has_password(pool, &actor.officer_id).await? {
        return Err(DomainError::rejected("Set your own password first, on the Officers page, or you would be locked out."));
    }

    let before = get_policy(pool).await?;
    sqlx::query("UPDATE auth_policy SET mode = ?, idle_timeout_minutes = ?, updated_at = ?, updated_by = ? WHERE id = 'default'")
        .bind(&input.mode)
        .bind(input.idle_timeout_minutes)
        .bind(now_ms())
        .bind(&actor.officer_id)
        .execute(pool)
        .await?;
    sqlx::query("INSERT INTO auth_events (id, officer_id, badge, name, action, detail, occurred_at) VALUES (?, ?, ?, ?, 'policy_changed', ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&actor.officer_id)
        .bind(&actor.badge_number)
        .bind(&actor.name)
        .bind(format!("{} to {}, inactivity {} minutes", before.mode, input.mode, input.idle_timeout_minutes))
        .bind(now_ms())
        .execute(pool)
        .await?;
    Ok(get_policy(pool).await?)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuthEvent {
    pub id: String,
    pub badge: Option<String>,
    pub name: Option<String>,
    pub action: String,
    pub detail: Option<String>,
    pub occurred_at: i64,
}

pub async fn list_events(pool: &SqlitePool) -> Result<Vec<AuthEvent>, sqlx::Error> {
    sqlx::query_as("SELECT id, badge, name, action, detail, occurred_at FROM auth_events ORDER BY occurred_at DESC LIMIT 300").fetch_all(pool).await
}

// ---- The shared sign-in: pick yourself, give your PIN or password, then the
// authenticator code when the protection is full.

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedSignInInput {
    pub staff_id: String,
    pub secret: String,
    pub code: Option<String>,
    pub enrol_secret: Option<String>,
}

pub enum SharedOutcome {
    SignedIn(String, Officer),
    Code,
    Enrol(super::totp::Enrolment),
}

const ISSUER: &str = "Pleadli Police";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInPerson {
    pub id: String,
    pub name: String,
    pub rank: Option<String>,
    pub secret_kind: &'static str,
    pub needs_enrolment: bool,
}

/// The officers who can sign in with a secret, for the sign-in screen. Only
/// names and ranks: nothing that helps guess the secret.
pub async fn sign_in_people(pool: &SqlitePool) -> Result<Vec<SignInPerson>, DomainError> {
    let mode = installation::effective_auth_mode(pool).await?;
    let rows: Vec<(String, String, Option<String>, Option<String>, Option<String>)> =
        sqlx::query_as("SELECT id, name, rank, badge_number, totp_secret FROM officers WHERE active = 1 AND password_hash IS NOT NULL ORDER BY name").fetch_all(pool).await?;
    Ok(rows
        .into_iter()
        .map(|(id, name, rank, badge, totp)| SignInPerson {
            id,
            name,
            rank: match (rank, badge) {
                (Some(r), Some(b)) => Some(format!("{r} · {b}")),
                (r, b) => r.or(b),
            },
            secret_kind: if mode == "pin" { "pin" } else { "password" },
            needs_enrolment: mode == "full" && totp.is_none(),
        })
        .collect())
}

async fn refuse(pool: &SqlitePool, officer: Option<&Officer>, key: &str, reason: &str) -> DomainError {
    note_wrong(key);
    let _ = record_event(pool, officer, officer.and_then(|o| o.badge_number.as_deref()), "sign_in_refused", Some(reason)).await;
    DomainError::Unauthorized(REFUSED.to_string())
}

pub async fn shared_sign_in(pool: &SqlitePool, input: SharedSignInInput) -> Result<SharedOutcome, DomainError> {
    if installation::mode(pool).await?.is_none() {
        return Err(DomainError::rejected("This installation has not been set up yet."));
    }
    let mode = installation::effective_auth_mode(pool).await?;
    if mode == "badge_only" {
        return Err(DomainError::rejected("Nobody signs in with a PIN or password on this installation."));
    }
    if let Some(wait) = slowed(&input.staff_id) {
        return Err(DomainError::Slow(format!("Too many wrong attempts. Try again in {} seconds.", wait / 1000 + 1)));
    }
    let officer = officers::get_officer(pool, &input.staff_id).await?.filter(|o| o.active);
    let Some(officer) = officer else { return Err(refuse(pool, None, &input.staff_id, "Unknown or disabled officer").await) };
    if !officers::password_matches(pool, &officer.id, &input.secret).await? {
        return Err(refuse(pool, Some(&officer), &input.staff_id, "PIN or password wrong").await);
    }
    if mode == "full" {
        let key: Option<String> = sqlx::query_scalar("SELECT totp_secret FROM officers WHERE id = ?").bind(&officer.id).fetch_one(pool).await?;
        match (&key, &input.enrol_secret, &input.code) {
            (None, None, _) => return Ok(SharedOutcome::Enrol(super::totp::enrol(ISSUER, &officer.name).map_err(DomainError::Invalid)?)),
            (None, Some(new_key), Some(code)) => {
                if !super::totp::verify(new_key, code) {
                    return Err(refuse(pool, Some(&officer), &input.staff_id, "Authenticator code wrong").await);
                }
                sqlx::query("UPDATE officers SET totp_secret = ? WHERE id = ?").bind(new_key).bind(&officer.id).execute(pool).await?;
                record_event(pool, Some(&officer), officer.badge_number.as_deref(), "second_factor_linked", None).await?;
            }
            (None, Some(_), None) | (Some(_), _, None) => return Ok(SharedOutcome::Code),
            (Some(key), _, Some(code)) => {
                if !super::totp::verify(key, code) {
                    return Err(refuse(pool, Some(&officer), &input.staff_id, "Authenticator code wrong").await);
                }
            }
        }
    }
    clear_wrong(&input.staff_id);
    let token = sessions::create(pool, &officer.id).await?;
    record_event(pool, Some(&officer), officer.badge_number.as_deref(), "sign_in", Some(match mode.as_str() { "pin" => "PIN", "full" => "Password and authenticator code", _ => "Password" })).await?;
    Ok(SharedOutcome::SignedIn(token, officer))
}
