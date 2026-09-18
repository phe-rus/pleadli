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
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use uuid::Uuid;

const VERIFICATION_CODE_TTL_MS: i64 = 24 * 60 * 60 * 1000;
const PAIRING_CODE_TTL_MS: i64 = 24 * 60 * 60 * 1000;

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64
}

fn hash_hex(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Hashing needs to stay in this module (it hides the choice of algorithm
/// behind one function), but `transport/hq_server.rs` and `domain/sync.rs`
/// also hash credentials on the network boundary, so the primitive is
/// `pub(crate)`. The write path (storing hashes) still stays private.
pub(crate) fn hash_secret(value: &str) -> String {
    hash_hex(value)
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

async fn get_facility_conn(conn: &mut SqliteConnection, id: &str) -> Result<Option<Facility>, sqlx::Error> {
    sqlx::query_as::<_, Facility>(
        "SELECT id, name, facility_number, location, region, head_officer_name, status,
                verifying_officer_email, verification_code_plaintext, last_synced_at, created_at
         FROM facilities WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *conn)
    .await
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
pub async fn verify_facility(conn: &mut SqliteConnection, actor: &Actor, facility_id: &str, code: &str) -> Result<Facility, VerifyFacilityError> {
    let facility = get_facility_conn(conn, facility_id).await?.ok_or(VerifyFacilityError::NotFound)?;
    if facility.status != "pending_verification" {
        return Err(VerifyFacilityError::InvalidOrExpired);
    }

    let row: (String, i64) = sqlx::query_as("SELECT verification_code_hash, verification_expires_at FROM facilities WHERE id = ?")
        .bind(facility_id)
        .fetch_one(&mut *conn)
        .await?;
    let (code_hash, expires_at) = row;

    if expires_at < now_ms() || hash_hex(code) != code_hash {
        return Err(VerifyFacilityError::InvalidOrExpired);
    }

    sqlx::query("UPDATE facilities SET status = 'active', verification_code_plaintext = NULL WHERE id = ?")
        .bind(facility_id)
        .execute(&mut *conn)
        .await?;

    let after = get_facility_conn(conn, facility_id).await?.ok_or(VerifyFacilityError::NotFound)?;
    audit::record(conn, actor, AuditEntry::new("facility.verified", "facility", Some(facility_id)).before(&facility).after(&after)).await?;
    Ok(after)
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

/// A high entropy random value, base64url encoded — the pairing secret and
/// the sync token both come from here (24 and 32 bytes respectively).
fn random_secret(bytes: usize) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    let mut buf = vec![0u8; bytes];
    OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn random_8_digit_code() -> String {
    format!("{:08}", OsRng.next_u32() % 100_000_000)
}

/// The public base a facility calls to reach this Head Office: its
/// Cloudflare Tunnel hostname when configured, otherwise the local
/// `hq_server.rs` port (the dev single-machine loop). Never a value the
/// facility types by hand — it rides inside the pairing code itself.
async fn hq_register_base(conn: &mut SqliteConnection) -> String {
    let cloudflare: Option<(String, String)> = sqlx::query_as(
        "SELECT station_name, domain FROM cloudflare_config WHERE id = 'default'",
    )
    .fetch_optional(&mut *conn)
    .await
    .ok()
    .flatten();
    match cloudflare {
        Some((station, domain)) => format!("https://{station}.{domain}"),
        None => "http://127.0.0.1:47923".to_string(),
    }
}

/// What `generate_pairing_code` hands a Head Office officer to pass out of
/// band to the facility they are onboarding (spec child 2, AC-1/AC-2). The
/// single `pairingCode` string carries Head Office's own hostname plus the
/// one time secret — `<host>#<secret>` — so the facility officer pastes one
/// thing and never types a hostname, port, or certificate.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingPayload {
    pub pairing_code: String,
    pub hostname: String,
    pub expires_at: i64,
}

/// AC-1: a signed in Head Office officer generates a single use, 24 hour
/// pairing code for a specific new facility, entering the email of the
/// officer who should receive that facility's verification code. Nothing is
/// emailed from here — the code is returned to be handed over however the
/// two officers already communicate; the email address is stored and later
/// copied onto the facility's row at registration.
pub async fn generate_pairing_code(conn: &mut SqliteConnection, actor: &Actor, officer_email: &str) -> Result<PairingPayload, sqlx::Error> {
    let secret = random_secret(24);
    let hostname = hq_register_base(conn).await;
    let expires_at = now_ms() + PAIRING_CODE_TTL_MS;
    let code_id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO hq_pairing_codes (id, secret_hash, officer_email, expires_at)
         VALUES (?, ?, ?, ?)",
    )
    .bind(&code_id)
    .bind(hash_hex(&secret))
    .bind(officer_email)
    .bind(expires_at)
    .execute(&mut *conn)
    .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("pairing.code_generated", "pairing_code", Some(&code_id))
            .after(&serde_json::json!({ "verifyingOfficerEmail": officer_email, "expiresAt": expires_at })),
    )
    .await?;

    Ok(PairingPayload { pairing_code: format!("{hostname}#{secret}"), hostname, expires_at })
}

#[derive(Debug)]
pub enum RegisterPeerError {
    Db(sqlx::Error),
    /// Bad, already used, or expired pairing secret — deliberately never
    /// distinguished, per the umbrella's uniform failure contract (AC-4).
    Invalid,
}

impl From<sqlx::Error> for RegisterPeerError {
    fn from(e: sqlx::Error) -> Self {
        RegisterPeerError::Db(e)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPeerResult {
    pub facility_id: String,
    pub sync_token: String,
}

/// The Head Office side of `/peers/register` (spec child 2): a facility
/// presents the pairing secret it was handed, plus its registration form.
/// On success the facility is stored `pending_verification`, the pairing
/// code is consumed atomically (SQLite's single writer serializes two
/// simultaneous uses), the 8 digit verification code is minted (plaintext
/// stored here only because email is not wired yet — the permanent takeaway
/// is the hash, exactly like a password), and the long lived sync token is
/// generated and returned exactly once. The token is inert until the
/// facility is verified, so handing it over now grants nothing.
pub async fn register_peer(
    pool: &SqlitePool,
    pairing_secret: &str,
    input: RegisterFacilityInput,
) -> Result<RegisterPeerResult, RegisterPeerError> {
    let row: Option<(String, String, i64, Option<i64>)> = sqlx::query_as(
        "SELECT id, officer_email, expires_at, used_at
         FROM hq_pairing_codes WHERE secret_hash = ?",
    )
    .bind(hash_hex(pairing_secret))
    .fetch_optional(pool)
    .await?;

    let (code_id, officer_email, expires_at, used_at) = row.ok_or(RegisterPeerError::Invalid)?;
    if used_at.is_some() || expires_at < now_ms() {
        return Err(RegisterPeerError::Invalid);
    }

    let facility_id = Uuid::new_v4().to_string();
    let sync_token = random_secret(32);
    let sync_token_hash = hash_hex(&sync_token);
    let verification_code = random_8_digit_code();
    let verification_code_hash = hash_hex(&verification_code);
    let verification_expires_at = now_ms() + VERIFICATION_CODE_TTL_MS;

    let mut tx = crate::db::begin_write(pool).await?;

    // Conditional, inside the write transaction: of two simultaneous uses of
    // the same pairing code exactly one sees `used_at IS NULL`.
    let consumed = sqlx::query("UPDATE hq_pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL")
        .bind(now_ms())
        .bind(&code_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if consumed != 1 {
        return Err(RegisterPeerError::Invalid);
    }

    sqlx::query(
        "INSERT INTO facilities
            (id, name, facility_number, location, region, head_officer_name, status,
             verification_code_hash, verification_expires_at, verification_code_plaintext,
             verifying_officer_email, sync_token_hash)
         VALUES (?, ?, ?, ?, ?, ?, 'pending_verification', ?, ?, ?, ?, ?)",
    )
    .bind(&facility_id)
    .bind(&input.name)
    .bind(&input.facility_number)
    .bind(&input.location)
    .bind(&input.region)
    .bind(&input.head_officer_name)
    .bind(&verification_code_hash)
    .bind(verification_expires_at)
    .bind(&verification_code)
    .bind(&officer_email)
    .bind(&sync_token_hash)
    .execute(&mut *tx)
    .await?;

    audit::record(
        &mut tx,
        &Actor::system("network pairing"),
        AuditEntry::new("facility.registered", "facility", Some(&facility_id)).after(&serde_json::json!({
            "name": input.name,
            "facilityNumber": input.facility_number,
            "region": input.region,
            "status": "pending_verification",
        })),
    )
    .await?;

    tx.commit().await?;

    Ok(RegisterPeerResult { facility_id, sync_token })
}

/// The peer side of registration: after Head Office's `/peers/register`
/// responds, this installation records the hostname it actually used, the
/// facility id Head Office assigned (never client supplied), and the sync
/// token — the peer's own bearer credential, held in plaintext the way a
/// browser holds its own session cookie, never displayed again (child 2
/// AC-3 / value sourcing).
pub async fn save_peer_credentials(
    conn: &mut SqliteConnection, actor: &Actor,
    hostname: &str,
    facility_id: &str,
    sync_token: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE peer_sync_config
         SET hq_hostname = ?, facility_id = ?, sync_token = ?, last_sync_status = NULL, last_error = NULL
         WHERE id = 'default'",
    )
    .bind(hostname)
    .bind(facility_id)
    .bind(sync_token)
    .execute(&mut *conn)
    .await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("peer.paired", "peer_sync_config", Some("default"))
            .after(&serde_json::json!({ "hqHostname": hostname, "facilityId": facility_id })),
    )
    .await?;
    Ok(())
}

/// Everything this installation needs to push a snapshot (child 3) — read
/// by `sync::push_snapshot`, never exposed to the frontend.
#[derive(Debug, Clone)]
pub struct PeerSyncContext {
    pub hostname: String,
    pub facility_id: String,
    pub sync_token: String,
}

pub async fn get_peer_sync_context(pool: &SqlitePool) -> Result<Option<PeerSyncContext>, sqlx::Error> {
    let (hostname, facility_id, sync_token): (Option<String>, Option<String>, Option<String>) =
        sqlx::query_as("SELECT hq_hostname, facility_id, sync_token FROM peer_sync_config WHERE id = 'default'")
            .fetch_one(pool)
            .await?;
    match (hostname, facility_id, sync_token) {
        (Some(hostname), Some(facility_id), Some(sync_token)) => {
            Ok(Some(PeerSyncContext { hostname, facility_id, sync_token }))
        }
        _ => Ok(None),
    }
}

#[derive(Debug)]
pub enum FacilityError {
    Db(sqlx::Error),
    NotFound,
    /// `resend_verification_code` on a facility that is not waiting for
    /// verification.
    NotPending,
}

impl From<sqlx::Error> for FacilityError {
    fn from(e: sqlx::Error) -> Self {
        FacilityError::Db(e)
    }
}

/// AC-5: an expired, still unverified code can be regenerated and resent
/// without the facility re registering. Overwrites the previous code and
/// expiry rather than allowing two codes to be valid at once.
pub async fn resend_verification_code(conn: &mut SqliteConnection, actor: &Actor, facility_id: &str) -> Result<Facility, FacilityError> {
    let facility = get_facility_conn(conn, facility_id).await?.ok_or(FacilityError::NotFound)?;
    if facility.status != "pending_verification" {
        return Err(FacilityError::NotPending);
    }

    let code = random_8_digit_code();
    let expires_at = now_ms() + VERIFICATION_CODE_TTL_MS;
    sqlx::query(
        "UPDATE facilities
         SET verification_code_hash = ?, verification_expires_at = ?, verification_code_plaintext = ?
         WHERE id = ?",
    )
    .bind(hash_hex(&code))
    .bind(expires_at)
    .bind(&code)
    .bind(facility_id)
    .execute(&mut *conn)
    .await?;

    let after = get_facility_conn(conn, facility_id).await?.ok_or(FacilityError::NotFound)?;
    audit::record(conn, actor, AuditEntry::new("facility.verification_resent", "facility", Some(facility_id))).await?;
    Ok(after)
}

/// AC-6: a Head Office officer can revoke an active (or still pending)
/// facility at any time. The sync token's hash is deliberately NOT cleared
/// — only the status — so revocation keeps its own audit trail without a
/// separate log table, and child 3 resolves a revoked facility to the same
/// generic failure as an unknown one.
pub async fn revoke_facility(conn: &mut SqliteConnection, actor: &Actor, facility_id: &str) -> Result<Facility, FacilityError> {
    let facility = get_facility_conn(conn, facility_id).await?.ok_or(FacilityError::NotFound)?;
    if facility.status == "revoked" {
        return Ok(facility);
    }

    sqlx::query("UPDATE facilities SET status = 'revoked', verification_code_plaintext = NULL WHERE id = ?")
        .bind(facility_id)
        .execute(&mut *conn)
        .await?;

    let after = get_facility_conn(conn, facility_id).await?.ok_or(FacilityError::NotFound)?;
    audit::record(conn, actor, AuditEntry::new("facility.revoked", "facility", Some(facility_id)).before(&facility).after(&after)).await?;
    Ok(after)
}
