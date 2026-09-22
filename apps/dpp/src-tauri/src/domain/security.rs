//! The optional application lock.
//!
//! No sign-in exists in DPP: one prosecutor owns the installation. The lock is
//! a passphrase the prosecutor can choose to put in front of the application, so
//! that someone at an unattended, unlocked screen cannot read files, decisions
//! or documents. While it is locked the API refuses everything except unlocking.
//!
//! What it is not: it is not what protects the data on disk. The database and
//! the vault are encrypted under a key the operating system's keystore holds
//! (`keys.rs`), whether or not a lock is set. The lock stops a person at the
//! screen. It does not stop someone who can already run code as this user.
//!
//! The passphrase is stored only as an Argon2id hash. Wrong attempts are slowed
//! down, and every lock event goes to the audit trail.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use serde::Serialize;
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};

const HASH_KEY: &str = "lock_hash";
const IDLE_KEY: &str = "lock_idle_minutes";
pub const DEFAULT_IDLE_MINUTES: u32 = 15;
pub const MIN_PASSPHRASE: usize = 8;
const FREE_ATTEMPTS: u32 = 5;

struct State {
    configured: bool,
    locked: bool,
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
    pub configured: bool,
    pub locked: bool,
    /// Minutes of inactivity before it locks itself; 0 means never.
    pub idle_minutes: u32,
    pub retry_after_seconds: u64,
    pub reason: Option<String>,
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
            state: Mutex::new(State { configured: false, locked: false, idle_minutes: DEFAULT_IDLE_MINUTES, last_activity: Instant::now(), failures: 0, blocked_until: None }),
        }
    }

    /// Reads the saved lock. A lock that is set starts locked.
    pub async fn load(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let configured = get(pool, HASH_KEY).await?.is_some();
        let idle = get(pool, IDLE_KEY).await?.and_then(|v| v.parse().ok()).unwrap_or(DEFAULT_IDLE_MINUTES);
        let mut s = self.state.lock().unwrap();
        s.configured = configured;
        s.locked = configured;
        s.idle_minutes = idle;
        s.last_activity = Instant::now();
        Ok(())
    }

    /// Whether the API is closed right now. An idle app locks itself here.
    pub fn is_locked(&self) -> bool {
        let mut s = self.state.lock().unwrap();
        if s.configured && !s.locked && s.idle_minutes > 0 && s.last_activity.elapsed() >= Duration::from_secs(s.idle_minutes as u64 * 60) {
            s.locked = true;
        }
        s.locked
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
            configured: s.configured,
            locked,
            idle_minutes: s.idle_minutes,
            retry_after_seconds: s.blocked_until.map(|t| t.saturating_duration_since(Instant::now()).as_secs()).unwrap_or(0),
            reason: None,
        }
    }

    /// For the commands that reach data without going through the API.
    pub fn ensure_unlocked(&self) -> Result<(), String> {
        if self.is_locked() {
            Err("The application is locked.".to_string())
        } else {
            Ok(())
        }
    }

    pub async fn lock_now(&self, pool: &SqlitePool) {
        let configured = {
            let mut s = self.state.lock().unwrap();
            if s.configured {
                s.locked = true;
            }
            s.configured
        };
        if configured {
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
        s.locked = false;
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

    pub async fn unlock(&self, pool: &SqlitePool, passphrase: &str) -> Result<(), DomainError> {
        self.check_not_blocked()?;
        let Some(hash) = get(pool, HASH_KEY).await? else { return Ok(()) };
        if matches(&hash, passphrase) {
            self.record_success();
            let _ = audit::log(pool, Entry::new("app_unlocked")).await;
            Ok(())
        } else {
            let failures = self.record_failure();
            let _ = audit::log(pool, Entry::new("unlock_failed").detail(format!("attempt {failures}"))).await;
            Err(DomainError::Forbidden("That is not the passphrase.".to_string()))
        }
    }

    /// Sets the lock, or changes it. Changing needs the current passphrase.
    pub async fn set_passphrase(&self, pool: &SqlitePool, current: Option<&str>, new: &str) -> Result<(), DomainError> {
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
            s.configured = true;
            s.locked = false;
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
            s.configured = false;
            s.locked = false;
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
