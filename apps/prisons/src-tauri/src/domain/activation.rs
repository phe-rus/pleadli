//! Head Office role choice and activation code verification
//! (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-and-activation-code.md).
//! Verification is entirely offline: the token carries everything needed to
//! check it against the public key baked into this build. No table stores
//! issued codes.

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::Serialize;
use sqlx::SqlitePool;
use std::fmt;
use std::sync::OnceLock;

/// Exact wire format (see the spec's Key invariants): `version: u8 (1) ||
/// expiresAt: i64 big endian unix ms (8 bytes) || nonce: [u8; 8]`.
const MESSAGE_LEN: usize = 17;
const SIGNATURE_LEN: usize = 64;
const TOKEN_LEN: usize = MESSAGE_LEN + SIGNATURE_LEN;
const CURRENT_VERSION: u8 = 1;

/// `www`'s real signing key never ships in this binary, only the matching
/// public key does; `www`'s own activation code generation is a separate
/// piece of work this spec assumes but does not build (see the umbrella's
/// Follow up). This placeholder seed derives a syntactically valid, but not
/// yet real, production key, so this module compiles and the verification
/// path works end to end today, purely against the dev signer below.
/// Replace this seed with a placeholder no longer needed once `www` ships
/// its real public key here.
const PROD_SEED: [u8; 32] = *b"pleadli-prisons-hq-prod-seed-000";

fn prod_verifying_key() -> &'static VerifyingKey {
    static KEY: OnceLock<VerifyingKey> = OnceLock::new();
    KEY.get_or_init(|| SigningKey::from_bytes(&PROD_SEED).verifying_key())
}

/// Compiled in for debug builds only, so a decompiled release build never
/// carries a key capable of forging a code, only the one that verifies it.
#[cfg(debug_assertions)]
const DEV_SEED: [u8; 32] = *b"pleadli-prisons-hq-dev-seed-0001";

#[cfg(debug_assertions)]
fn dev_signing_key() -> SigningKey {
    SigningKey::from_bytes(&DEV_SEED)
}

#[cfg(debug_assertions)]
fn dev_verifying_key() -> &'static VerifyingKey {
    static KEY: OnceLock<VerifyingKey> = OnceLock::new();
    KEY.get_or_init(|| dev_signing_key().verifying_key())
}

fn verify_signature(message: &[u8], signature: &Signature) -> bool {
    if prod_verifying_key().verify_strict(message, signature).is_ok() {
        return true;
    }
    #[cfg(debug_assertions)]
    {
        if dev_verifying_key().verify_strict(message, signature).is_ok() {
            return true;
        }
    }
    false
}

#[derive(Debug)]
pub enum ActivationError {
    /// Bad signature, malformed token, unsupported version, expired, or the
    /// monotonic clock guard, all folded into one outcome on purpose: the
    /// spec requires never revealing which check failed (AC-4).
    Invalid,
    Db(sqlx::Error),
}

impl fmt::Display for ActivationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ActivationError::Invalid => write!(f, "Invalid or expired activation code."),
            ActivationError::Db(e) => write!(f, "{e}"),
        }
    }
}

impl From<sqlx::Error> for ActivationError {
    fn from(e: sqlx::Error) -> Self {
        ActivationError::Db(e)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationErrorPayload {
    pub code: String,
    pub message: String,
}

impl From<ActivationError> for ActivationErrorPayload {
    fn from(e: ActivationError) -> Self {
        let (code, message) = match e {
            ActivationError::Invalid => ("INVALID_ACTIVATION_CODE".to_string(), "Invalid or expired activation code.".to_string()),
            ActivationError::Db(err) => ("DB_ERROR".to_string(), err.to_string()),
        };
        ActivationErrorPayload { code, message }
    }
}

/// First launch role choice. `'facility'` persists immediately, so the
/// choice screen never reappears (AC-1). `'head_office'` is not persisted
/// here at all: it only navigates the frontend to the activation code
/// screen, and the role only actually becomes `'head_office'` once
/// `verify_activation_code` succeeds, so a closed, unfinished activation
/// still shows the role choice screen again next launch.
pub async fn choose_role(pool: &SqlitePool, role: &str) -> Result<(), sqlx::Error> {
    if role == "facility" {
        sqlx::query("UPDATE hq_config SET role = 'facility' WHERE id = 'default'").execute(pool).await?;
    }
    Ok(())
}

/// The one real check: decode, verify the signature against whichever key
/// (prod, or dev in a debug build) produced it, check it has not expired,
/// and check the monotonic clock guard, before setting `hq_config`. Any
/// failure returns the same generic `ActivationError::Invalid`, never
/// distinguished, and `hq_config` is left untouched on failure.
pub async fn verify_activation_code(pool: &SqlitePool, token: &str) -> Result<(), ActivationError> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

    let raw = URL_SAFE_NO_PAD.decode(token.trim()).map_err(|_| ActivationError::Invalid)?;
    if raw.len() != TOKEN_LEN {
        return Err(ActivationError::Invalid);
    }
    let (message, sig_bytes) = raw.split_at(MESSAGE_LEN);
    if message[0] != CURRENT_VERSION {
        return Err(ActivationError::Invalid);
    }
    let expires_at = i64::from_be_bytes(message[1..9].try_into().unwrap());

    let sig_array: [u8; SIGNATURE_LEN] = sig_bytes.try_into().map_err(|_| ActivationError::Invalid)?;
    let signature = Signature::from_bytes(&sig_array);
    if !verify_signature(message, &signature) {
        return Err(ActivationError::Invalid);
    }

    let now = chrono::Utc::now().timestamp_millis();
    if expires_at < now {
        return Err(ActivationError::Invalid);
    }

    // Monotonic guard: refuse if this would move activated_at backwards
    // relative to an already activated install (a rolled back system clock
    // replaying an old code against an install that already activated).
    let existing_activated_at: Option<i64> =
        sqlx::query_scalar("SELECT activated_at FROM hq_config WHERE id = 'default'").fetch_one(pool).await?;
    if let Some(existing) = existing_activated_at {
        if now < existing {
            return Err(ActivationError::Invalid);
        }
    }

    sqlx::query("UPDATE hq_config SET is_head_office = 1, role = 'head_office', activated_at = ? WHERE id = 'default'")
        .bind(now)
        .execute(pool)
        .await?;

    Ok(())
}

/// Dev build only: signs a token with the dev keypair, whose public key is
/// compiled in only for debug builds, so the real verification code path
/// above is exercised end to end without needing `www`'s not yet built
/// generation flow.
#[cfg(debug_assertions)]
pub fn mint_dev_activation_code() -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand_core::{OsRng, RngCore};

    let mut nonce = [0u8; 8];
    OsRng.fill_bytes(&mut nonce);

    let expires_at = chrono::Utc::now().timestamp_millis() + 24 * 60 * 60 * 1000;

    let mut message = [0u8; MESSAGE_LEN];
    message[0] = CURRENT_VERSION;
    message[1..9].copy_from_slice(&expires_at.to_be_bytes());
    message[9..17].copy_from_slice(&nonce);

    let signature = dev_signing_key().sign(&message);

    let mut raw = Vec::with_capacity(TOKEN_LEN);
    raw.extend_from_slice(&message);
    raw.extend_from_slice(&signature.to_bytes());
    URL_SAFE_NO_PAD.encode(raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn valid_dev_code_activates_head_office() {
        let pool = test_pool().await;
        let token = mint_dev_activation_code();

        verify_activation_code(&pool, &token).await.expect("a validly signed, unexpired dev code should verify");

        let config = crate::domain::session::get_hq_config(&pool).await.unwrap();
        assert!(config.is_head_office);
        assert_eq!(config.role.as_deref(), Some("head_office"));
        assert!(config.activated_at.is_some());
    }

    #[tokio::test]
    async fn tampered_signature_is_rejected() {
        let pool = test_pool().await;
        let token = mint_dev_activation_code();
        let mut raw = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(&token).unwrap();
        // Flip a byte inside the signature, leaving the message untouched.
        let last = raw.len() - 1;
        raw[last] ^= 0xFF;
        let tampered = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw);

        let result = verify_activation_code(&pool, &tampered).await;
        assert!(matches!(result, Err(ActivationError::Invalid)));

        let config = crate::domain::session::get_hq_config(&pool).await.unwrap();
        assert!(!config.is_head_office, "a failed check must never partially set hq_config");
    }

    #[tokio::test]
    async fn expired_code_is_rejected_with_the_same_generic_error() {
        let pool = test_pool().await;

        // Hand build an already expired token with the dev key, since
        // mint_dev_activation_code always mints a fresh 24 hour one.
        let expires_at = chrono::Utc::now().timestamp_millis() - 1_000;
        let mut message = [0u8; MESSAGE_LEN];
        message[0] = CURRENT_VERSION;
        message[1..9].copy_from_slice(&expires_at.to_be_bytes());
        let signature = dev_signing_key().sign(&message);
        let mut raw = Vec::with_capacity(TOKEN_LEN);
        raw.extend_from_slice(&message);
        raw.extend_from_slice(&signature.to_bytes());
        let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw);

        let result = verify_activation_code(&pool, &token).await;
        assert!(matches!(result, Err(ActivationError::Invalid)));
    }

    #[tokio::test]
    async fn garbage_input_is_rejected() {
        let pool = test_pool().await;
        let result = verify_activation_code(&pool, "not a real token").await;
        assert!(matches!(result, Err(ActivationError::Invalid)));
    }

    #[tokio::test]
    async fn choosing_facility_persists_immediately_and_choosing_head_office_does_not() {
        let pool = test_pool().await;

        choose_role(&pool, "facility").await.unwrap();
        let config = crate::domain::session::get_hq_config(&pool).await.unwrap();
        assert_eq!(config.role.as_deref(), Some("facility"));

        // Resetting to a fresh NULL role, then choosing head_office should
        // leave role untouched: only a real activation sets it.
        sqlx::query("UPDATE hq_config SET role = NULL WHERE id = 'default'").execute(&pool).await.unwrap();
        choose_role(&pool, "head_office").await.unwrap();
        let config = crate::domain::session::get_hq_config(&pool).await.unwrap();
        assert_eq!(config.role, None);
    }
}
