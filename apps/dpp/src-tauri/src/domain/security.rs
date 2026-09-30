//! Who may use the application right now.
//!
//! The installation's protection level (chosen at setup, `installation.rs`)
//! decides it:
//! - none: nobody signs in; the administrator is always the person acting;
//! - basic: each person signs in with a 6-digit PIN;
//! - full: a password and a code from the person's authenticator app.
//! With basic or full the app signs the person out after the idle time, and
//! while nobody is signed in the API refuses everything but signing in.
//!
//! Before setup exists (an older installation), the old optional passphrase
//! lock still applies so a locked install stays locked until it is set up.
//!
//! None of this is what protects the data on disk: the database and the vault
//! are encrypted under a key the operating system's keystore holds
//! (`keys.rs`) at every level. Wrong attempts are slowed down, and every
//! sign-in event goes to the audit trail.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};
use super::installation;
use super::staff::{self, Actor, Protection};
use super::totp::{self, Enrolment};

const HASH_KEY: &str = "lock_hash";
const IDLE_KEY: &str = "lock_idle_minutes";
pub const DEFAULT_IDLE_MINUTES: u32 = 15;
pub const MIN_PASSPHRASE: usize = 8;
const FREE_ATTEMPTS: u32 = 5;
pub const ISSUER: &str = "Pleadli DPP";

struct State {
    installed: bool,
    protection: Protection,
    /// The pre-setup passphrase lock.
    legacy_configured: bool,
    legacy_locked: bool,
    actor: Option<Actor>,
    idle_minutes: u32,
    last_activity: Instant,
    failures: u32,
    blocked_until: Option<Instant>,
}

pub struct Security {
    state: Mutex<State>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    /// `ready`, or `recovery` when the data could not be opened.
    pub state: &'static str,
    /// Whether first-launch setup has been completed.
    pub installed: bool,
    /// `none`, `basic` or `full`; null before setup.
    pub level: Option<&'static str>,
    /// Someone has to sign in (or unlock) before anything else works.
    pub configured: bool,
    pub locked: bool,
    /// The person acting, when there is one.
    pub actor: Option<Actor>,
    /// Minutes of inactivity before it locks itself; 0 means never.
    pub idle_minutes: u32,
    pub retry_after_seconds: u64,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInInput {
    pub staff_id: String,
    pub secret: String,
    #[serde(default)]
    pub code: Option<String>,
    /// The key shown during a first sign-in under full protection.
    #[serde(default)]
    pub enrol_secret: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SignInOutcome {
    SignedIn,
    /// Right password; now the code from the phone.
    Code,
    /// Right password, no phone linked yet: link it, then give its code.
    Enrol { enrolment: Enrolment },
}

async fn get(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar("SELECT value FROM security_settings WHERE key = ?").bind(key).fetch_optional(pool).await
}

async fn put(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO security_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
    Ok(())
}

fn hash_passphrase(passphrase: &str) -> Result<String, DomainError> {
    Argon2::default()
        .hash_password(passphrase.as_bytes(), &SaltString::generate(&mut OsRng))
        .map(|h| h.to_string())
        .map_err(|_| DomainError::Invalid("That passphrase could not be used.".to_string()))
}

fn matches(hash: &str, passphrase: &str) -> bool {
    PasswordHash::new(hash).map(|parsed| Argon2::default().verify_password(passphrase.as_bytes(), &parsed).is_ok()).unwrap_or(false)
}

impl Security {
    pub fn new() -> Self {
        Security {
            state: Mutex::new(State {
                installed: false,
                protection: Protection::None,
                legacy_configured: false,
                legacy_locked: false,
                actor: None,
                idle_minutes: DEFAULT_IDLE_MINUTES,
                last_activity: Instant::now(),
                failures: 0,
                blocked_until: None,
            }),
        }
    }

    /// Reads the installation and the old lock. Under basic or full protection
    /// the app always starts with nobody signed in.
    pub async fn load(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let install = installation::get(pool).await?;
        let legacy_configured = get(pool, HASH_KEY).await?.is_some();
        let idle = get(pool, IDLE_KEY).await?.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_IDLE_MINUTES);
        let protection = install.as_ref().map(|i| i.protection_level()).unwrap_or(Protection::None);
        let actor = match (&install, protection) {
            (Some(_), Protection::None) => staff::first_administrator(pool).await?,
            _ => None,
        };
        match &actor {
            Some(a) => {
                let mut conn = pool.acquire().await?;
                staff::set_active_session(&mut conn, &a.id).await?;
            }
            None => staff::clear_active_session(pool).await?,
        }
        let mut s = self.state.lock().unwrap();
        s.installed = install.is_some();
        s.protection = protection;
        s.legacy_configured = legacy_configured && install.is_none();
        s.legacy_locked = s.legacy_configured;
        s.actor = actor;
        s.idle_minutes = idle;
        s.last_activity = Instant::now();
        Ok(())
    }

    pub fn is_installed(&self) -> bool {
        self.state.lock().unwrap().installed
    }

    pub fn protection(&self) -> Protection {
        self.state.lock().unwrap().protection
    }

    pub fn actor(&self) -> Option<Actor> {
        self.state.lock().unwrap().actor.clone()
    }

    /// Whether the API is closed right now. An idle session ends here.
    pub fn is_locked(&self) -> bool {
        let mut s = self.state.lock().unwrap();
        if !s.installed {
            return s.legacy_configured && s.legacy_locked;
        }
        if s.protection == Protection::None {
            return false;
        }
        if s.actor.is_some() && s.idle_minutes > 0 && s.last_activity.elapsed() >= Duration::from_secs(s.idle_minutes as u64 * 60) {
            s.actor = None;
        }
        s.actor.is_none()
    }

    /// Marks the app as in use, which is what postpones the idle lock.
    pub fn touch(&self) {
        self.state.lock().unwrap().last_activity = Instant::now();
    }

    pub fn status(&self) -> LockStatus {
        let locked = self.is_locked();
        let s = self.state.lock().unwrap();
        LockStatus {
            state: "ready",
            installed: s.installed,
            level: s.installed.then(|| s.protection.as_str()),
            configured: if s.installed { s.protection != Protection::None } else { s.legacy_configured },
            locked,
            actor: s.actor.clone(),
            idle_minutes: s.idle_minutes,
            retry_after_seconds: s.blocked_until.map(|t| t.saturating_duration_since(Instant::now()).as_secs()).unwrap_or(0),
            reason: None,
        }
    }

    /// For the commands that reach data without going through the API.
    pub fn ensure_unlocked(&self) -> Result<(), String> {
        if !self.is_installed() {
            return Err("The application is not set up yet.".to_string());
        }
        if self.is_locked() {
            Err("The application is locked.".to_string())
        } else {
            Ok(())
        }
    }

    /// Locks now: signs the person out (basic, full) or closes the old lock.
    pub async fn lock_now(&self, pool: &SqlitePool) {
        let (signed_out, legacy) = {
            let mut s = self.state.lock().unwrap();
            if s.installed && s.protection != Protection::None {
                (s.actor.take().is_some(), false)
            } else if !s.installed && s.legacy_configured {
                s.legacy_locked = true;
                (false, true)
            } else {
                (false, false)
            }
        };
        if signed_out {
            let _ = staff::clear_active_session(pool).await;
            let _ = audit::log(pool, Entry::new("signed_out")).await;
        }
        if legacy {
            let _ = audit::log(pool, Entry::new("app_locked")).await;
        }
    }

    fn check_not_blocked(&self) -> Result<(), DomainError> {
        let s = self.state.lock().unwrap();
        match s.blocked_until.filter(|t| *t > Instant::now()) {
            Some(until) => Err(DomainError::Forbidden(format!("Too many wrong attempts. Try again in {} seconds.", until.saturating_duration_since(Instant::now()).as_secs() + 1))),
            None => Ok(()),
        }
    }

    fn record_success(&self) {
        let mut s = self.state.lock().unwrap();
        s.failures = 0;
        s.blocked_until = None;
        s.last_activity = Instant::now();
    }

    /// Counts a wrong attempt and, past the free ones, slows the next.
    fn record_failure(&self) -> u32 {
        let mut s = self.state.lock().unwrap();
        s.failures += 1;
        if s.failures >= FREE_ATTEMPTS {
            let wait = (1u64 << (s.failures - FREE_ATTEMPTS).min(8)) * 5;
            s.blocked_until = Some(Instant::now() + Duration::from_secs(wait.min(300)));
        }
        s.failures
    }

    async fn refuse(&self, pool: &SqlitePool, who: &str, message: &str) -> DomainError {
        let failures = self.record_failure();
        let _ = audit::log(pool, Entry::new("sign_in_failed").subject("staff", who).detail(format!("attempt {failures}"))).await;
        DomainError::Forbidden(message.to_string())
    }

    pub async fn sign_in(&self, pool: &SqlitePool, input: SignInInput) -> Result<SignInOutcome, DomainError> {
        self.check_not_blocked()?;
        let protection = {
            let s = self.state.lock().unwrap();
            if !s.installed || s.protection == Protection::None {
                return invalid("Nobody signs in on this installation.");
            }
            s.protection
        };
        let wrong = "That PIN or password is not right.";
        let Some(creds) = staff::credentials(pool, &input.staff_id).await? else {
            return Err(self.refuse(pool, &input.staff_id, wrong).await);
        };
        let right_kind = creds.secret_kind.as_deref() == protection.secret_kind();
        if !right_kind || !creds.secret_hash.as_deref().is_some_and(|h| staff::secret_matches(h, &input.secret)) {
            return Err(self.refuse(pool, &input.staff_id, wrong).await);
        }

        if protection == Protection::Full {
            match (&creds.totp_secret, &input.enrol_secret, &input.code) {
                // First sign-in: show a key to link, then check a code for it.
                (None, None, _) => {
                    let name = staff::get(pool, &input.staff_id).await?.map(|p| p.name).unwrap_or_default();
                    let enrolment = totp::enrol(ISSUER, &name).map_err(DomainError::Invalid)?;
                    return Ok(SignInOutcome::Enrol { enrolment });
                }
                (None, Some(key), Some(code)) => {
                    if !totp::verify(key, code) {
                        return Err(self.refuse(pool, &input.staff_id, "The code from the phone is not right.").await);
                    }
                    staff::set_second_factor(pool, &input.staff_id, Some(key)).await?;
                    let _ = audit::log(pool, Entry::new("second_factor_linked").subject("staff", &input.staff_id)).await;
                }
                (None, Some(_), None) | (Some(_), _, None) => return Ok(SignInOutcome::Code),
                (Some(key), _, Some(code)) => {
                    if !totp::verify(key, code) {
                        return Err(self.refuse(pool, &input.staff_id, "The code from the phone is not right.").await);
                    }
                }
            }
        }

        let actor = staff::actor(pool, &input.staff_id).await?.ok_or_else(|| DomainError::Forbidden(wrong.to_string()))?;
        {
            let mut conn = pool.acquire().await?;
            staff::set_active_session(&mut conn, &actor.id).await?;
        }
        self.record_success();
        self.state.lock().unwrap().actor = Some(actor);
        let _ = audit::log(pool, Entry::new("signed_in")).await;
        Ok(SignInOutcome::SignedIn)
    }

    /// Makes `actor` the person acting, when they have just proved who they are
    /// another way (finishing setup, changing the protection level).
    pub async fn adopt(&self, pool: &SqlitePool, actor: Actor) -> Result<(), sqlx::Error> {
        {
            let mut conn = pool.acquire().await?;
            staff::set_active_session(&mut conn, &actor.id).await?;
        }
        self.record_success();
        self.state.lock().unwrap().actor = Some(actor);
        Ok(())
    }

    /// Keeps the cached person in step after their record changes.
    pub async fn refresh_actor(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let id = self.actor().map(|a| a.id);
        if let Some(id) = id {
            let fresh = staff::actor(pool, &id).await?;
            if fresh.is_none() {
                staff::clear_active_session(pool).await?;
            }
            self.state.lock().unwrap().actor = fresh;
        }
        Ok(())
    }

    // ---- The pre-setup passphrase lock -------------------------------------

    pub async fn unlock(&self, pool: &SqlitePool, passphrase: &str) -> Result<(), DomainError> {
        self.check_not_blocked()?;
        let Some(hash) = get(pool, HASH_KEY).await? else { return Ok(()) };
        if matches(&hash, passphrase) {
            self.record_success();
            self.state.lock().unwrap().legacy_locked = false;
            let _ = audit::log(pool, Entry::new("app_unlocked")).await;
            Ok(())
        } else {
            let failures = self.record_failure();
            let _ = audit::log(pool, Entry::new("unlock_failed").detail(format!("attempt {failures}"))).await;
            Err(DomainError::Forbidden("That is not the passphrase.".to_string()))
        }
    }

    /// Sets the old lock, or changes it. Only before setup; after it the
    /// protection level replaces the lock.
    pub async fn set_passphrase(&self, pool: &SqlitePool, current: Option<&str>, new: &str) -> Result<(), DomainError> {
        if self.is_installed() {
            return invalid("Sign-in is set by the protection level in Settings.");
        }
        if new.chars().count() < MIN_PASSPHRASE {
            return invalid(&format!("A passphrase needs at least {MIN_PASSPHRASE} characters."));
        }
        let existing = get(pool, HASH_KEY).await?;
        if let Some(hash) = &existing {
            if !current.is_some_and(|c| matches(hash, c)) {
                return Err(DomainError::Forbidden("The current passphrase is not right.".to_string()));
            }
        }
        put(pool, HASH_KEY, &hash_passphrase(new)?).await?;
        {
            let mut s = self.state.lock().unwrap();
            s.legacy_configured = true;
            s.legacy_locked = false;
            s.last_activity = Instant::now();
        }
        let _ = audit::log(pool, Entry::new(if existing.is_some() { "lock_passphrase_changed" } else { "lock_enabled" })).await;
        Ok(())
    }

    pub async fn remove_passphrase(&self, pool: &SqlitePool, current: &str) -> Result<(), DomainError> {
        let Some(hash) = get(pool, HASH_KEY).await? else { return Ok(()) };
        if !matches(&hash, current) {
            return Err(DomainError::Forbidden("The current passphrase is not right.".to_string()));
        }
        sqlx::query("DELETE FROM security_settings WHERE key = ?").bind(HASH_KEY).execute(pool).await?;
        {
            let mut s = self.state.lock().unwrap();
            s.legacy_configured = false;
            s.legacy_locked = false;
        }
        let _ = audit::log(pool, Entry::new("lock_removed")).await;
        Ok(())
    }

    pub async fn set_idle_minutes(&self, pool: &SqlitePool, minutes: u32) -> Result<(), DomainError> {
        if ![0, 5, 15, 30, 60].contains(&minutes) {
            return invalid("Choose 5, 15, 30 or 60 minutes, or never.");
        }
        put(pool, IDLE_KEY, &minutes.to_string()).await?;
        self.state.lock().unwrap().idle_minutes = minutes;
        Ok(())
    }
}

impl Default for Security {
    fn default() -> Self {
        Self::new()
    }
}
