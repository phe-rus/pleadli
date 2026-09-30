//! The app lock (`docs/specs/lawyers/0001-app-lock`): a PIN gate over the
//! whole app, single advocate, no roster. This module owns the one `app_lock`
//! row and the one process wide runtime flag; the actual enforcement (refusing
//! a gated route while locked) lives in `api/mod.rs`'s middleware, which only
//! reads `Runtime::is_locked`.
//!
//! `failed_attempts` and `locked_until` are shared by a wrong PIN and a wrong
//! recovery code on purpose: recovery must not be a way to route around a PIN
//! cooldown.

use std::fmt;
use std::sync::atomic::{AtomicBool, Ordering};

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use rand_core::RngCore;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};

const MIN_PIN: usize = 6;
const MAX_PIN: usize = 64;
/// Digits and uppercase letters, excluding glyphs that are easy to misread
/// (0/O, 1/I/L).
const RECOVERY_ALPHABET: &[u8] = b"23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_LEN: usize = 20;
/// No delay for the first two wrong attempts, then doubling from one second,
/// capped, per the spec's Key invariants.
const COOLDOWN_FREE_ATTEMPTS: i64 = 2;
const COOLDOWN_CAP_SECS: i64 = 60;

#[derive(Debug)]
pub enum LockError {
    InvalidLength,
    AlreadyEnabled,
    NotEnabled,
    /// The check runs the same way either way (see `check`), only the error
    /// code returned to the caller differs, so the response can tell the
    /// frontend which field to point at.
    InvalidPin,
    InvalidRecoveryCode,
    /// Seconds remaining before the next attempt is accepted.
    Cooldown(i64),
    Db(sqlx::Error),
}

impl fmt::Display for LockError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LockError::InvalidLength => write!(f, "A PIN needs to be 6 to 64 characters."),
            LockError::AlreadyEnabled => write!(f, "App lock is already on."),
            LockError::NotEnabled => write!(f, "App lock is not on."),
            LockError::InvalidPin => write!(f, "That PIN did not match."),
            LockError::InvalidRecoveryCode => write!(f, "That recovery code did not match."),
            LockError::Cooldown(secs) => write!(f, "Too many attempts. Wait {secs}s before trying again."),
            LockError::Db(e) => write!(f, "{e}"),
        }
    }
}

impl From<sqlx::Error> for LockError {
    fn from(e: sqlx::Error) -> Self {
        LockError::Db(e)
    }
}

/// The one process wide "is the app currently locked" flag. Re derived from
/// `app_lock.enabled` at every process start; never itself persisted, which is
/// what makes "every launch requires the PIN" true by construction rather than
/// by a check someone could forget to add.
pub struct Runtime(AtomicBool);

impl Runtime {
    pub fn new(locked: bool) -> Self {
        Self(AtomicBool::new(locked))
    }

    pub fn is_locked(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }

    fn set(&self, locked: bool) {
        self.0.store(locked, Ordering::SeqCst);
    }

    /// Setup retires the old lock: nothing is left to unlock after it.
    pub fn set_locked(&self, locked: bool) {
        self.set(locked);
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub locked: bool,
    pub cooldown_remaining: Option<i64>,
}

#[derive(Deserialize)]
pub struct SetupInput {
    pub pin: String,
}
impl fmt::Debug for SetupInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SetupInput").field("pin", &"<redacted>").finish()
    }
}

#[derive(Deserialize)]
pub struct UnlockInput {
    pub pin: String,
}
impl fmt::Debug for UnlockInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("UnlockInput").field("pin", &"<redacted>").finish()
    }
}

#[derive(Deserialize)]
pub struct DisableInput {
    pub pin: String,
}
impl fmt::Debug for DisableInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DisableInput").field("pin", &"<redacted>").finish()
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverInput {
    pub recovery_code: String,
    pub new_pin: String,
}
impl fmt::Debug for RecoverInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("RecoverInput").field("recovery_code", &"<redacted>").field("new_pin", &"<redacted>").finish()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCode {
    pub recovery_code: String,
}

#[derive(FromRow)]
struct Row {
    enabled: bool,
    pin_hash: Option<String>,
    recovery_code_hash: Option<String>,
    failed_attempts: i64,
    locked_until: Option<i64>,
}

enum Secret {
    Pin,
    Recovery,
}

async fn row(pool: &SqlitePool) -> Result<Row, sqlx::Error> {
    sqlx::query_as("SELECT enabled, pin_hash, recovery_code_hash, failed_attempts, locked_until FROM app_lock WHERE id = 'default'")
        .fetch_one(pool)
        .await
}

fn hash(secret: &str) -> String {
    let salt = SaltString::generate(&mut OsRng);
    // Argon2's default params never fail to hash a value this short; the
    // input is already bounded to at most 64 characters by the caller.
    Argon2::default().hash_password(secret.as_bytes(), &salt).expect("hashing a bounded length secret does not fail").to_string()
}

fn verify(secret: &str, stored: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(stored) else { return false };
    Argon2::default().verify_password(secret.as_bytes(), &parsed).is_ok()
}

fn generate_recovery_code() -> String {
    let mut bytes = [0u8; RECOVERY_LEN];
    OsRng.fill_bytes(&mut bytes);
    let raw: String = bytes.iter().map(|b| RECOVERY_ALPHABET[(*b as usize) % RECOVERY_ALPHABET.len()] as char).collect();
    raw.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Seconds to wait before the next attempt is accepted, given how many wrong
/// attempts (including this one) have now happened.
fn cooldown_seconds(failed_attempts: i64) -> i64 {
    if failed_attempts <= COOLDOWN_FREE_ATTEMPTS {
        return 0;
    }
    // The first delayed attempt (failed_attempts = FREE + 1) is 1 second, then
    // doubles each further attempt: exp = 0, 1, 2, … for 1s, 2s, 4s, …
    let exp = (failed_attempts - COOLDOWN_FREE_ATTEMPTS - 1).min(6);
    (1i64 << exp).min(COOLDOWN_CAP_SECS)
}

/// Checks `secret` against the stored PIN or recovery code hash, applying and
/// updating the shared cooldown. A cooldown already in effect refuses the
/// attempt without checking `secret` at all, and without moving the cooldown
/// further out.
async fn check(pool: &SqlitePool, which: Secret, secret: &str) -> Result<(), LockError> {
    let existing = row(pool).await?;
    if let Some(until) = existing.locked_until {
        let remaining_ms = until - now();
        if remaining_ms > 0 {
            return Err(LockError::Cooldown((remaining_ms as f64 / 1000.0).ceil() as i64));
        }
    }
    let stored = match which {
        Secret::Pin => existing.pin_hash.as_deref(),
        Secret::Recovery => existing.recovery_code_hash.as_deref(),
    };
    if stored.is_some_and(|h| verify(secret, h)) {
        sqlx::query(
            "UPDATE app_lock SET failed_attempts = 0, locked_until = NULL, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = 'default'",
        )
        .execute(pool)
        .await?;
        Ok(())
    } else {
        let attempts = existing.failed_attempts + 1;
        let delay = cooldown_seconds(attempts);
        let until = (delay > 0).then(|| now() + delay * 1000);
        sqlx::query(
            "UPDATE app_lock SET failed_attempts = ?, locked_until = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = 'default'",
        )
        .bind(attempts)
        .bind(until)
        .execute(pool)
        .await?;
        Err(match which {
            Secret::Pin => LockError::InvalidPin,
            Secret::Recovery => LockError::InvalidRecoveryCode,
        })
    }
}

/// Whether a PIN is currently set, read straight from the row. Used once, at
/// startup, to seed a fresh process's `Runtime` before any request exists to
/// carry a `Status` read through it.
pub async fn is_enabled(pool: &SqlitePool) -> Result<bool, sqlx::Error> {
    Ok(row(pool).await?.enabled)
}

pub async fn status(pool: &SqlitePool, runtime: &Runtime) -> Result<Status, sqlx::Error> {
    let existing = row(pool).await?;
    let remaining = existing.locked_until.map(|until| ((until - now()) as f64 / 1000.0).ceil() as i64).filter(|s| *s > 0);
    Ok(Status { enabled: existing.enabled, locked: runtime.is_locked(), cooldown_remaining: remaining })
}

pub async fn setup(pool: &SqlitePool, input: SetupInput) -> Result<RecoveryCode, LockError> {
    if input.pin.chars().count() < MIN_PIN || input.pin.chars().count() > MAX_PIN {
        return Err(LockError::InvalidLength);
    }
    if row(pool).await?.enabled {
        return Err(LockError::AlreadyEnabled);
    }
    let pin_hash = hash(&input.pin);
    let recovery_code = generate_recovery_code();
    let recovery_code_hash = hash(&recovery_code);

    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE app_lock SET enabled = 1, pin_hash = ?, recovery_code_hash = ?, failed_attempts = 0, locked_until = NULL,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = 'default'",
    )
    .bind(&pin_hash)
    .bind(&recovery_code_hash)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("lock_enabled").subject("app_lock", "default")).await?;
    tx.commit().await?;
    // The advocate is already using the app right now; setting a PIN does not
    // itself lock them out. The next launch, idle timeout, or focus loss is
    // the first real lock.
    Ok(RecoveryCode { recovery_code })
}

pub async fn unlock(pool: &SqlitePool, runtime: &Runtime, input: UnlockInput) -> Result<(), LockError> {
    check(pool, Secret::Pin, &input.pin).await?;
    runtime.set(false);
    if let Ok(mut conn) = pool.acquire().await {
        let _ = audit::record(&mut conn, Entry::new("unlocked").subject("app_lock", "default")).await;
    }
    Ok(())
}

pub async fn disable(pool: &SqlitePool, runtime: &Runtime, input: DisableInput) -> Result<(), LockError> {
    if !row(pool).await?.enabled {
        return Err(LockError::NotEnabled);
    }
    check(pool, Secret::Pin, &input.pin).await?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE app_lock SET enabled = 0, pin_hash = NULL, recovery_code_hash = NULL, failed_attempts = 0, locked_until = NULL,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = 'default'",
    )
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("lock_disabled").subject("app_lock", "default")).await?;
    tx.commit().await?;
    runtime.set(false);
    Ok(())
}

pub async fn recover(pool: &SqlitePool, runtime: &Runtime, input: RecoverInput) -> Result<RecoveryCode, LockError> {
    if input.new_pin.chars().count() < MIN_PIN || input.new_pin.chars().count() > MAX_PIN {
        return Err(LockError::InvalidLength);
    }
    check(pool, Secret::Recovery, &input.recovery_code).await?;
    let new_pin_hash = hash(&input.new_pin);
    let new_recovery_code = generate_recovery_code();
    let new_recovery_hash = hash(&new_recovery_code);

    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE app_lock SET pin_hash = ?, recovery_code_hash = ?, failed_attempts = 0, locked_until = NULL,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = 'default'",
    )
    .bind(&new_pin_hash)
    .bind(&new_recovery_hash)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("recovery_used").subject("app_lock", "default")).await?;
    tx.commit().await?;
    runtime.set(false);
    Ok(RecoveryCode { recovery_code: new_recovery_code })
}

/// A no op when app lock is not enabled: nothing to lock, and locking with no
/// PIN set would strand the advocate with no way back in.
pub async fn lock_now(pool: &SqlitePool, runtime: &Runtime) -> Result<(), sqlx::Error> {
    if row(pool).await?.enabled {
        runtime.set(true);
    }
    Ok(())
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

    #[test]
    fn cooldown_gives_two_free_attempts_then_doubles_and_caps() {
        assert_eq!(cooldown_seconds(1), 0);
        assert_eq!(cooldown_seconds(2), 0);
        assert_eq!(cooldown_seconds(3), 1);
        assert_eq!(cooldown_seconds(4), 2);
        assert_eq!(cooldown_seconds(5), 4);
        assert_eq!(cooldown_seconds(8), 32);
        assert_eq!(cooldown_seconds(9), 60, "already past the cap");
        assert_eq!(cooldown_seconds(20), 60);
    }

    #[test]
    fn a_recovery_code_avoids_ambiguous_glyphs() {
        let code = generate_recovery_code();
        assert!(!code.contains(['0', 'O', '1', 'I', 'L']));
        assert_eq!(code.replace('-', "").len(), RECOVERY_LEN);
    }

    #[tokio::test]
    async fn setup_then_unlock_with_the_right_pin_succeeds() {
        let pool = pool().await;
        let runtime = Runtime::new(true);
        let setup_result = setup(&pool, SetupInput { pin: "correct horse".into() }).await.unwrap();
        assert!(!setup_result.recovery_code.is_empty());
        assert!(runtime.is_locked(), "setting a pin does not itself lock the app");

        assert!(matches!(unlock(&pool, &runtime, UnlockInput { pin: "wrong".into() }).await, Err(LockError::InvalidPin)));
        unlock(&pool, &runtime, UnlockInput { pin: "correct horse".into() }).await.unwrap();
        assert!(!runtime.is_locked());
    }

    #[tokio::test]
    async fn a_short_pin_is_refused() {
        let pool = pool().await;
        assert!(matches!(setup(&pool, SetupInput { pin: "abc".into() }).await, Err(LockError::InvalidLength)));
    }

    #[tokio::test]
    async fn repeated_wrong_pins_trigger_a_cooldown_that_outlives_a_restart() {
        let pool = pool().await;
        let runtime = Runtime::new(false);
        setup(&pool, SetupInput { pin: "correct horse".into() }).await.unwrap();

        for _ in 0..3 {
            let _ = unlock(&pool, &runtime, UnlockInput { pin: "wrong".into() }).await;
        }
        match unlock(&pool, &runtime, UnlockInput { pin: "wrong".into() }).await {
            Err(LockError::InvalidPin) | Err(LockError::Cooldown(_)) => {}
            other => panic!("expected a refusal, got {other:?}"),
        }

        // A restart never resets the cooldown: a fresh Runtime over the same pool.
        let restarted = Runtime::new(true);
        match unlock(&pool, &restarted, UnlockInput { pin: "correct horse".into() }).await {
            Err(LockError::Cooldown(secs)) => assert!(secs > 0),
            other => panic!("expected the cooldown to still be in effect, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn recovery_resets_the_pin_and_the_old_code_stops_working() {
        let pool = pool().await;
        let runtime = Runtime::new(true);
        let first = setup(&pool, SetupInput { pin: "correct horse".into() }).await.unwrap();

        let second =
            recover(&pool, &runtime, RecoverInput { recovery_code: first.recovery_code.clone(), new_pin: "battery staple".into() }).await.unwrap();
        assert!(!runtime.is_locked());
        assert_ne!(first.recovery_code, second.recovery_code);

        assert!(matches!(
            recover(&pool, &runtime, RecoverInput { recovery_code: first.recovery_code, new_pin: "another pin".into() }).await,
            Err(LockError::InvalidRecoveryCode)
        ));
        unlock(&pool, &runtime, UnlockInput { pin: "battery staple".into() }).await.unwrap();
    }

    #[tokio::test]
    async fn disable_requires_the_current_pin_and_clears_everything() {
        let pool = pool().await;
        let runtime = Runtime::new(true);
        setup(&pool, SetupInput { pin: "correct horse".into() }).await.unwrap();

        assert!(matches!(disable(&pool, &runtime, DisableInput { pin: "wrong".into() }).await, Err(LockError::InvalidPin)));
        disable(&pool, &runtime, DisableInput { pin: "correct horse".into() }).await.unwrap();
        assert!(!runtime.is_locked());

        let after = status(&pool, &runtime).await.unwrap();
        assert!(!after.enabled);
    }

    #[tokio::test]
    async fn locking_with_no_pin_set_is_a_safe_no_op() {
        let pool = pool().await;
        let runtime = Runtime::new(false);
        lock_now(&pool, &runtime).await.unwrap();
        assert!(!runtime.is_locked(), "locking with nothing to unlock with must never strand the advocate");
    }
}
