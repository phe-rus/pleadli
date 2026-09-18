//! Peer registration and pairing (spec: docs/specs/prisons/0001-head-office-
//! peer-sync-network/0002-peer-registration-and-pairing.md). The real design
//! is a pairing code Head Office generates, handed to the facility, then a
//! verification code emailed to a named Head Office officer. Email isn't
//! wired up yet, so `register_facility_self` and `verify_facility` below are
//! a deliberately manual, single-installation-testable stand-in: a facility
//! registers itself directly (no pairing code), and the verification code
//! is shown in plaintext on the Head Office side (`verification_code_
//! plaintext`, migration 0018) instead of emailed. `verification_code_hash`
//! is still the real check `verify_facility` runs, so swapping in real email
//! later only changes how the code reaches Head Office, not how it's
//! checked.

use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

const VERIFICATION_CODE_TTL_MS: i64 = 24 * 60 * 60 * 1000;

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

fn hash_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Never includes `verification_code_hash` or `sync_token_hash`; those never
/// reach the frontend, by construction of this struct's own field list.
/// `verification_code_plaintext` is the one deliberate exception, and only
/// because email isn't built yet — see this module's own doc comment.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Facility {
    pub id: String,
    pub name: String,
    pub facility_number: String,
    pub location: String,
    pub region: String,
    pub head_officer_name: String,
    pub status: String,
    pub verifying_officer_email: String,
    pub verification_code_plaintext: Option<String>,
    pub last_synced_at: Option<i64>,
    pub created_at: i64,
}

pub async fn list_facilities(pool: &SqlitePool) -> Result<Vec<Facility>, sqlx::Error> {
    sqlx::query_as::<_, Facility>(
        "SELECT id, name, facility_number, location, region, head_officer_name, status,
                verifying_officer_email, verification_code_plaintext, last_synced_at, created_at
         FROM facilities
         ORDER BY created_at DESC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterFacilityInput {
    pub name: String,
    pub facility_number: String,
    pub location: String,
    pub region: String,
    pub head_officer_name: String,
}

/// Called once, by the facility itself, at first-launch onboarding — no
/// pairing code and no Head Office session, since neither exists yet at
/// that point (spec: this app's own onboarding gate). Creates the
/// `facilities` row Head Office will eventually see (in the real network
/// design this row is created server side by `/peers/register`; here,
/// since there's one shared local database for manual testing, the
/// facility creates it directly) and points this installation's own
/// `peer_sync_config` at it.
pub async fn register_facility_self(pool: &SqlitePool, input: RegisterFacilityInput) -> Result<Facility, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    let mut token_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut token_bytes);
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let sync_token = URL_SAFE_NO_PAD.encode(token_bytes);
    let sync_token_hash = hash_hex(&sync_token);

    let verification_code = format!("{:08}", OsRng.next_u32() % 100_000_000);
    let verification_code_hash = hash_hex(&verification_code);
    let expires_at = now_ms() + VERIFICATION_CODE_TTL_MS;

    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO facilities
            (id, name, facility_number, location, region, head_officer_name, status,
             verification_code_hash, verification_expires_at, verification_code_plaintext,
             verifying_officer_email, sync_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', ?, ?, ?, '', ?)",
    )
    .bind(&id)
    .bind(&input.name)
    .bind(&input.facility_number)
    .bind(&input.location)
    .bind(&input.region)
    .bind(&input.head_officer_name)
    .bind(&verification_code_hash)
    .bind(expires_at)
    .bind(&verification_code)
    .bind(&sync_token_hash)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE peer_sync_config SET facility_id = ?, sync_token = ? WHERE id = 'default'")
        .bind(&id)
        .bind(&sync_token)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    get_facility(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)
}

async fn get_facility(pool: &SqlitePool, id: &str) -> Result<Option<Facility>, sqlx::Error> {
    sqlx::query_as::<_, Facility>(
        "SELECT id, name, facility_number, location, region, head_officer_name, status,
                verifying_officer_email, verification_code_plaintext, last_synced_at, created_at
         FROM facilities WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// This installation's own facility, resolved through its own
/// `peer_sync_config.facility_id` — what the facility side's Settings >
/// Network & Sync tab shows, not the Head Office roster (`list_facilities`).
pub async fn get_own_facility(pool: &SqlitePool) -> Result<Option<Facility>, sqlx::Error> {
    let facility_id: Option<String> = sqlx::query_scalar::<_, Option<String>>("SELECT facility_id FROM peer_sync_config WHERE id = 'default'")
        .fetch_optional(pool)
        .await?
        .flatten();
    match facility_id {
        Some(id) => get_facility(pool, &id).await,
        None => Ok(None),
    }
}

#[derive(Debug)]
pub enum VerifyFacilityError {
    Db(sqlx::Error),
    NotFound,
    InvalidOrExpired,
}

impl From<sqlx::Error> for VerifyFacilityError {
    fn from(e: sqlx::Error) -> Self {
        VerifyFacilityError::Db(e)
    }
}

/// Head Office confirming a facility's identity (spec: docs/specs/prisons/
/// 0001-head-office-peer-sync-network/0002-peer-registration-and-pairing.md,
/// AC-4) — this is the real, permanent check (hash comparison, expiry),
/// unaffected by how the plaintext code reached the officer running it.
pub async fn verify_facility(pool: &SqlitePool, facility_id: &str, code: &str) -> Result<Facility, VerifyFacilityError> {
    let facility = get_facility(pool, facility_id).await?.ok_or(VerifyFacilityError::NotFound)?;
    if facility.status != "pending_verification" {
        return Err(VerifyFacilityError::InvalidOrExpired);
    }

    let row: (String, i64) = sqlx::query_as("SELECT verification_code_hash, verification_expires_at FROM facilities WHERE id = ?")
        .bind(facility_id)
        .fetch_one(pool)
        .await?;
    let (code_hash, expires_at) = row;

    if expires_at < now_ms() || hash_hex(code) != code_hash {
        return Err(VerifyFacilityError::InvalidOrExpired);
    }

    sqlx::query("UPDATE facilities SET status = 'active', verification_code_plaintext = NULL WHERE id = ?")
        .bind(facility_id)
        .execute(pool)
        .await?;

    get_facility(pool, facility_id).await?.ok_or(VerifyFacilityError::NotFound)
}

/// A peer's own record of what it needs to sync (`peer_sync_config`, the
/// singleton table child 2 of the sync-network spec adds). Meaningless on
/// a Head Office installation, which never registers with anyone. Never
/// includes the plaintext `sync_token` — Settings only needs to show
/// connection status, not the credential itself.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PeerSyncConfig {
    pub hq_hostname: Option<String>,
    pub facility_id: Option<String>,
    pub last_synced_at: Option<i64>,
    pub last_sync_status: Option<String>,
    pub last_error: Option<String>,
}

pub async fn get_peer_sync_config(pool: &SqlitePool) -> Result<PeerSyncConfig, sqlx::Error> {
    sqlx::query_as::<_, PeerSyncConfig>(
        "SELECT hq_hostname, facility_id, last_synced_at, last_sync_status, last_error
         FROM peer_sync_config WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await
}
