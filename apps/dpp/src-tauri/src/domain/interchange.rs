//! Police <-> DPP interchange: this office's identity, the stations it has
//! connected to, and the packages that come and go. See
//! `docs/interchange/police-dpp.md` for the model and the reasoning.
//!
//! The rule that everything here serves: **a package is a claim, not a record.**
//! It is accepted into this application only if it is signed by a station this
//! office invited and a person here confirmed, addressed to this office, and
//! not seen before; and even then it only waits, held apart from the records,
//! until a person reads it and accepts it.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{DecisionNoticePayload, DirectionClaim, NoticeDocument, ReceiptPayload, ReferralPayload, KIND_DECISION_NOTICE, KIND_RECEIPT, KIND_REFERRAL};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION, KIND_RESPONSE};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};
use std::path::Path;

use super::audit::{self, Entry};
use super::decisions::Decision;
use super::document_content::rich_text_blocks;
use super::error::{clean, invalid, DomainError};
use super::vault;

const MAX_STRING: usize = 200_000;
/// A package claiming to be sent more than this far in the future is refused.
const CLOCK_SKEW_MS: i64 = 86_400_000;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ---- this office's identity -------------------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OfficeIdentity {
    pub office_id: String,
    pub office_name: String,
    pub jurisdiction: Option<String>,
    pub verifying_key: String,
    pub encryption_key: String,
    #[sqlx(skip)]
    pub fingerprint: String,
    pub created_at: i64,
}

#[derive(FromRow)]
struct IdentityRow {
    office_id: String,
    office_name: String,
    jurisdiction: Option<String>,
    verifying_key: String,
    encryption_key: String,
    signing_secret: String,
    encryption_secret: String,
}

async fn load_identity(pool: &SqlitePool) -> Result<Option<Identity>, DomainError> {
    let row: Option<IdentityRow> = sqlx::query_as("SELECT office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret FROM interchange_identity WHERE id = 'default'")
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else { return Ok(None) };
    let public = PublicIdentity { id: row.office_id, kind: IdentityKind::DppOffice, name: row.office_name, jurisdiction: row.jurisdiction, verifying_key: row.verifying_key, encryption_key: row.encryption_key };
    let signing = unhex32(&row.signing_secret).ok_or_else(|| DomainError::Invalid("This office's identity is damaged.".to_string()))?;
    let encryption = unhex32(&row.encryption_secret).ok_or_else(|| DomainError::Invalid("This office's identity is damaged.".to_string()))?;
    Identity::restore(public, signing, encryption).map(Some).ok_or_else(|| DomainError::Invalid("This office's identity is damaged.".to_string()))
}

async fn require_identity(pool: &SqlitePool) -> Result<Identity, DomainError> {
    load_identity(pool).await?.ok_or_else(|| DomainError::Invalid("Set up this office's identity first.".to_string()))
}

pub async fn get_identity(pool: &SqlitePool) -> Result<Option<OfficeIdentity>, DomainError> {
    let Some(identity) = load_identity(pool).await? else { return Ok(None) };
    let created_at: i64 = sqlx::query_scalar("SELECT created_at FROM interchange_identity WHERE id = 'default'").fetch_one(pool).await?;
    Ok(Some(OfficeIdentity {
        office_id: identity.public.id.clone(),
        office_name: identity.public.name.clone(),
        jurisdiction: identity.public.jurisdiction.clone(),
        verifying_key: identity.public.verifying_key.clone(),
        encryption_key: identity.public.encryption_key.clone(),
        fingerprint: identity.public.fingerprint(),
        created_at,
    }))
}

/// Creates this office's identity, once. It cannot be changed afterwards: the
/// name is part of the fingerprint every station has confirmed.
pub async fn create_identity(pool: &SqlitePool, office_name: &str, jurisdiction: Option<String>) -> Result<OfficeIdentity, DomainError> {
    let name = office_name.trim();
    if name.is_empty() {
        return invalid("Name the office, as the stations that send to it know it.");
    }
    if load_identity(pool).await?.is_some() {
        return invalid("This office already has an identity. It cannot be changed, because every station has confirmed its fingerprint.");
    }
    let identity = Identity::generate(IdentityKind::DppOffice, name, clean(jurisdiction).as_deref());
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO interchange_identity (id, office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret)
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&identity.public.id)
    .bind(&identity.public.name)
    .bind(&identity.public.jurisdiction)
    .bind(&identity.public.verifying_key)
    .bind(&identity.public.encryption_key)
    .bind(pleadli_interchange::identity::hex(&identity.signing_secret()))
    .bind(pleadli_interchange::identity::hex(&identity.encryption_secret()))
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("interchange_identity_created").detail(identity.public.fingerprint())).await?;
    tx.commit().await?;
    Ok(get_identity(pool).await?.expect("just created"))
}

// ---- connections ---------------------------------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub intended_station: String,
    pub status: String,
    pub invite_expires_at: i64,
    pub station_id: Option<String>,
    pub station_name: Option<String>,
    pub station_jurisdiction: Option<String>,
    pub officer_in_charge: Option<String>,
    pub fingerprint: Option<String>,
    pub responded_at: Option<i64>,
    pub confirmed_at: Option<i64>,
    pub confirmed_by: Option<String>,
    pub revoked_at: Option<i64>,
    pub revoked_reason: Option<String>,
    pub last_seq_in: i64,
    pub created_at: i64,
    /// `status`, except an invitation nobody answered in time is `expired`.
    #[sqlx(skip)]
    pub state: String,
    /// Referrals waiting on a person, from this station.
    #[sqlx(skip)]
    pub waiting: i64,
}

const CONNECTION_COLUMNS: &str = "id, intended_station, status, invite_expires_at, station_id, station_name, station_jurisdiction, officer_in_charge, fingerprint, responded_at, confirmed_at, confirmed_by, revoked_at, revoked_reason, last_seq_in, created_at";

fn finish(mut c: Connection) -> Connection {
    c.state = if c.status == "invited" && c.invite_expires_at < now() { "expired".to_string() } else { c.status.clone() };
    c
}

pub async fn list_connections(pool: &SqlitePool) -> Result<Vec<Connection>, DomainError> {
    let rows = sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!("SELECT {CONNECTION_COLUMNS} FROM police_connections ORDER BY created_at DESC, rowid DESC"))).fetch_all(pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let mut c = finish(row);
        c.waiting = sqlx::query_scalar("SELECT COUNT(*) FROM incoming_packages WHERE connection_id = ? AND status = 'received'").bind(&c.id).fetch_one(pool).await?;
        out.push(c);
    }
    Ok(out)
}

pub async fn get_connection(pool: &SqlitePool, id: &str) -> Result<Connection, DomainError> {
    sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!("SELECT {CONNECTION_COLUMNS} FROM police_connections WHERE id = ?")))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(finish)
        .ok_or_else(|| DomainError::NotFound("Connection not found.".to_string()))
}

#[derive(FromRow)]
struct StationRow {
    station_id: Option<String>,
    station_name: Option<String>,
    station_jurisdiction: Option<String>,
    station_verifying_key: Option<String>,
    station_encryption_key: Option<String>,
    fingerprint: Option<String>,
    status: String,
}

/// The identity this office pinned for a connection's station. Refuses when the
/// stored keys no longer produce the fingerprint that was confirmed.
async fn station_public(pool: &SqlitePool, connection_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: StationRow = sqlx::query_as("SELECT station_id, station_name, station_jurisdiction, station_verifying_key, station_encryption_key, fingerprint, status FROM police_connections WHERE id = ?")
        .bind(connection_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| DomainError::NotFound("Connection not found.".to_string()))?;
    let (Some(id), Some(name), Some(vk), Some(ek), Some(fp)) = (row.station_id, row.station_name, row.station_verifying_key, row.station_encryption_key, row.fingerprint) else {
        return invalid("That station has not answered yet.");
    };
    let public = PublicIdentity { id, kind: IdentityKind::PoliceStation, name, jurisdiction: row.station_jurisdiction, verifying_key: vk, encryption_key: ek };
    if public.fingerprint() != fp {
        return Err(DomainError::Invalid("The stored keys for this station no longer match the fingerprint that was confirmed.".to_string()));
    }
    Ok((public, row.status))
}

/// Issues an invitation for one station. This is how a station comes to be able
/// to send here at all: the office chooses it.
pub async fn create_invite(pool: &SqlitePool, intended_station: &str, valid_days: i64) -> Result<(Connection, Vec<u8>), DomainError> {
    let station = intended_station.trim();
    if station.is_empty() {
        return invalid("Name the station this invitation is for.");
    }
    if !(1..=60).contains(&valid_days) {
        return invalid("An invitation stays open for between 1 and 60 days.");
    }
    let office = require_identity(pool).await?;
    let expires_at = now() + valid_days * 86_400_000;
    let (bytes, invite) = pairing::make_invite(&office, station, expires_at).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO police_connections (id, intended_station, status, invite_nonce, invite_expires_at) VALUES (?, ?, 'invited', ?, ?)")
        .bind(&invite.invite_id)
        .bind(station)
        .bind(&invite.nonce)
        .bind(expires_at)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("invitation_issued").subject("connection", &invite.invite_id).detail(station.to_string())).await?;
    tx.commit().await?;
    Ok((get_connection(pool, &invite.invite_id).await?, bytes))
}

/// Re-issues the file for an invitation that is still open.
pub async fn invite_file(pool: &SqlitePool, connection_id: &str) -> Result<Vec<u8>, DomainError> {
    let c = get_connection(pool, connection_id).await?;
    if c.state != "invited" {
        return invalid("Only an invitation that is still open can be sent again.");
    }
    let nonce: String = sqlx::query_scalar("SELECT invite_nonce FROM police_connections WHERE id = ?").bind(connection_id).fetch_one(pool).await?;
    let office = require_identity(pool).await?;
    // The same invitation, signed again: same id, same nonce, same expiry.
    let invite = pairing::PairingInvite { invite_id: c.id.clone(), office: office.public.clone(), intended_station: c.intended_station.clone(), expires_at: c.invite_expires_at, nonce };
    let (bytes, _) = envelope::sign_public(&office, pairing::KIND_INVITE, None, &Body::new(serde_json::to_value(&invite).map_err(|_| DomainError::Invalid("Could not build the invitation.".to_string()))?))
        .map_err(|e| DomainError::Invalid(e.to_string()))?;
    Ok(bytes)
}

/// The person at this office confirms the station's fingerprint, by typing the
/// code the station read out. Typing it, rather than ticking a box, is what
/// makes it a comparison. Only then is the station trusted.
pub async fn trust_connection(pool: &SqlitePool, connection_id: &str, typed_fingerprint: &str) -> Result<Connection, DomainError> {
    let c = get_connection(pool, connection_id).await?;
    if c.state != "awaiting_confirmation" {
        return invalid("Only a station that has answered an invitation, and is not yet trusted, can be confirmed.");
    }
    let (station, _) = station_public(pool, connection_id).await?;
    let norm = |s: &str| s.chars().filter(|c| c.is_ascii_hexdigit()).collect::<String>().to_uppercase();
    if norm(typed_fingerprint) != norm(&station.fingerprint()) {
        let _ = audit::log(pool, Entry::new("fingerprint_mismatch").subject("connection", connection_id).detail(station.name.clone())).await;
        return Err(DomainError::Forbidden("That code does not match this station's fingerprint. Ask the station to read theirs out again, and do not trust it until it matches.".to_string()));
    }
    let by = sqlx::query_scalar::<_, String>("SELECT name FROM prosecutor_profile WHERE id = 'default'").fetch_optional(pool).await?;
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE police_connections SET status = 'trusted', confirmed_at = ?, confirmed_by = ? WHERE id = ?").bind(now()).bind(by).bind(connection_id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("station_trusted").subject("connection", connection_id).detail(format!("{} {}", station.name, station.fingerprint()))).await?;
    prepare_confirmation(&mut tx, connection_id, "trusted", None).await?;
    tx.commit().await?;
    get_connection(pool, connection_id).await
}

pub async fn decline_connection(pool: &SqlitePool, connection_id: &str, reason: Option<String>) -> Result<Connection, DomainError> {
    let c = get_connection(pool, connection_id).await?;
    if c.state != "awaiting_confirmation" {
        return invalid("Only a station that has answered and is not yet trusted can be declined.");
    }
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE police_connections SET status = 'declined', revoked_at = ?, revoked_reason = ? WHERE id = ?").bind(now()).bind(clean(reason.clone())).bind(connection_id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("station_declined").subject("connection", connection_id).detail(c.station_name.clone().unwrap_or_default())).await?;
    prepare_confirmation(&mut tx, connection_id, "declined", reason.as_deref()).await?;
    tx.commit().await?;
    get_connection(pool, connection_id).await
}

/// Ends a trusted connection. From then on the station's packages are refused.
pub async fn revoke_connection(pool: &SqlitePool, connection_id: &str, reason: &str) -> Result<Connection, DomainError> {
    let c = get_connection(pool, connection_id).await?;
    if c.state != "trusted" {
        return invalid("Only a trusted station can be revoked.");
    }
    if reason.trim().is_empty() {
        return invalid("Say why the connection is being ended.");
    }
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE police_connections SET status = 'revoked', revoked_at = ?, revoked_reason = ? WHERE id = ?").bind(now()).bind(reason.trim()).bind(connection_id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("station_revoked").subject("connection", connection_id).detail(format!("{}: {}", c.station_name.clone().unwrap_or_default(), reason.trim()))).await?;
    prepare_confirmation(&mut tx, connection_id, "revoked", Some(reason.trim())).await?;
    tx.commit().await?;
    get_connection(pool, connection_id).await
}

// ---- receiving -------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    /// `pairing_response` or `referral`.
    pub kind: String,
    pub connection_id: String,
    pub package_id: Option<String>,
    pub message: String,
}

async fn refuse(pool: &SqlitePool, reason: &str, claimed: &envelope::Header, error: DomainError) -> DomainError {
    let _ = audit::log(pool, Entry::new("package_refused").detail(format!("{reason}; claimed sender {} ({})", claimed.from.name, claimed.from.fingerprint))).await;
    error
}

/// Takes in a package from any carrier. It either becomes a pending item (a
/// station's answer to an invitation, or a referral waiting for a person) or is
/// refused with the reason. Refusals are audited without their content.
pub async fn import_package(pool: &SqlitePool, vault_root: &Path, bytes: &[u8]) -> Result<ImportOutcome, DomainError> {
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    let office = require_identity(pool).await?;

    if header.created_at > now() + CLOCK_SKEW_MS {
        return Err(refuse(pool, "dated in the future", &header, DomainError::Invalid("This package is dated in the future. Check the clock of the computer that sent it.".to_string())).await);
    }

    match header.kind.as_str() {
        KIND_RESPONSE => import_response(pool, bytes, &header).await,
        KIND_REFERRAL => {
            // Which station claims to have sent it, and is it one this office trusts?
            let station_id = &header.from.id;
            let connection: Option<(String, String)> =
                sqlx::query_as("SELECT id, status FROM police_connections WHERE station_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(station_id).fetch_optional(pool).await?;
            let Some((connection_id, status)) = connection else {
                return Err(refuse(pool, "unknown sender", &header, DomainError::Forbidden("This package is from a station this office has not connected to. Nothing was kept.".to_string())).await);
            };
            if status != "trusted" {
                let why = if status == "revoked" { "This station's connection has been ended. Nothing was kept." } else { "This station has not been confirmed as trusted yet. Nothing was kept." };
                return Err(refuse(pool, "sender not trusted", &header, DomainError::Forbidden(why.to_string())).await);
            }
            let (station, _) = station_public(pool, &connection_id).await?;
            let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM incoming_packages WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
            if seen > 0 {
                return Err(refuse(pool, "already received", &header, DomainError::Invalid("This package has already been received.".to_string())).await);
            }
            let opened = match envelope::open(&office, peeked, &station) {
                Ok(o) => o,
                Err(e) => {
                    let (reason, error) = match e {
                        envelope::PackageError::NotForThisRecipient => ("addressed to another office", DomainError::Forbidden("This package is addressed to a different DPP office.".to_string())),
                        envelope::PackageError::BadSignature => ("signature does not match the pinned station", DomainError::Forbidden("The signature does not match the station this office trusts. Nothing was kept.".to_string())),
                        other => ("damaged or altered", DomainError::Invalid(other.to_string())),
                    };
                    return Err(refuse(pool, reason, &header, error).await);
                }
            };
            let payload: ReferralPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The referral inside the package could not be read.".to_string()))?;
            validate_referral(&payload)?;

            let sha = envelope::sha256_hex(bytes);
            let mut files = Vec::new();
            let mut tx = pool.begin().await?;
            for file in &opened.body.files {
                if file.id.is_empty() || !file.id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                    return invalid("A file in the package has an invalid id.");
                }
                vault::write_at(vault_root, &format!("incoming/{}/{}.enc", opened.header.id, file.id), &format!("{}/{}", opened.header.id, file.id), &file.bytes).map_err(|_| DomainError::Invalid("A file in the package could not be stored.".to_string()))?;
                files.push(serde_json::json!({ "id": file.id, "name": file.name, "mime": file.mime, "sha256": file.sha256, "size": file.bytes.len() }));
            }
            sqlx::query(
                "INSERT INTO incoming_packages (id, connection_id, kind, seq, sent_at, received_at, sender_fingerprint, package_sha256, payload, files)
                 VALUES (?, ?, 'referral', ?, ?, ?, ?, ?, ?, ?)",
            )
            .bind(&opened.header.id)
            .bind(&connection_id)
            .bind(opened.header.seq as i64)
            .bind(opened.header.created_at)
            .bind(now())
            .bind(station.fingerprint())
            .bind(&sha)
            .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
            .bind(serde_json::to_string(&files).unwrap_or_default())
            .execute(&mut *tx)
            .await?;
            sqlx::query("UPDATE police_connections SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&connection_id).execute(&mut *tx).await?;
            audit::record(&mut tx, Entry::new("referral_received").subject("incoming_package", &opened.header.id).detail(format!("{} from {}", payload.police_reference, station.name))).await?;
            tx.commit().await?;
            Ok(ImportOutcome { kind: KIND_REFERRAL.to_string(), connection_id, package_id: Some(opened.header.id), message: format!("A referral from {} is waiting for you to read.", station.name) })
        }
        KIND_CONFIRMATION | KIND_RECEIPT | KIND_DECISION_NOTICE => Err(refuse(pool, "a message this office sends, not receives", &header, DomainError::Invalid("That is a package this office sends. It is not one it can receive.".to_string())).await),
        other => Err(refuse(pool, "unknown kind", &header, DomainError::Invalid(format!("This office does not receive packages of kind '{other}'."))).await),
    }
}

async fn import_response(pool: &SqlitePool, bytes: &[u8], header: &envelope::Header) -> Result<ImportOutcome, DomainError> {
    let response = pairing::read_response(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let row: Option<(String, i64, String)> = sqlx::query_as("SELECT status, invite_expires_at, invite_nonce FROM police_connections WHERE id = ?").bind(&response.invite_id).fetch_optional(pool).await?;
    let Some((status, expires, nonce)) = row else {
        return Err(refuse(pool, "answer to an invitation this office did not issue", header, DomainError::Forbidden("This is an answer to an invitation this office did not issue.".to_string())).await);
    };
    if status != "invited" {
        return Err(refuse(pool, "invitation already used", header, DomainError::Invalid("That invitation has already been answered.".to_string())).await);
    }
    if expires < now() {
        return Err(refuse(pool, "invitation expired", header, DomainError::Invalid("That invitation has expired. Issue a new one.".to_string())).await);
    }
    if nonce != response.invite_nonce {
        return Err(refuse(pool, "answer does not carry the invitation's nonce", header, DomainError::Forbidden("This answer is not to that invitation.".to_string())).await);
    }
    let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM police_connections WHERE station_id = ? AND status IN ('awaiting_confirmation', 'trusted')").bind(&response.station.id).fetch_one(pool).await?;
    if in_use > 0 {
        return Err(refuse(pool, "station already connected", header, DomainError::Invalid("That station already has a connection to this office.".to_string())).await);
    }
    let station = &response.station;
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE police_connections SET status = 'awaiting_confirmation', station_id = ?, station_name = ?, station_jurisdiction = ?, station_verifying_key = ?,
                station_encryption_key = ?, officer_in_charge = ?, fingerprint = ?, responded_at = ? WHERE id = ?",
    )
    .bind(&station.id)
    .bind(&station.name)
    .bind(&station.jurisdiction)
    .bind(&station.verifying_key)
    .bind(&station.encryption_key)
    .bind(&response.officer_in_charge)
    .bind(station.fingerprint())
    .bind(now())
    .bind(&response.invite_id)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("station_answered").subject("connection", &response.invite_id).detail(format!("{} {}", station.name, station.fingerprint()))).await?;
    tx.commit().await?;
    Ok(ImportOutcome {
        kind: KIND_RESPONSE.to_string(),
        connection_id: response.invite_id,
        package_id: None,
        message: format!("{} has answered. Confirm its fingerprint with the station before trusting it.", station.name),
    })
}

fn validate_referral(p: &ReferralPayload) -> Result<(), DomainError> {
    if p.police_reference.trim().is_empty() {
        return invalid("The referral does not carry the station's reference for the case.");
    }
    let too_long = |s: &str| s.len() > MAX_STRING;
    if too_long(&p.summary) || p.statements.iter().any(|s| too_long(&s.content)) {
        return invalid("The referral contains text that is too long.");
    }
    for person in &p.people {
        if !["accused", "complainant", "witness"].contains(&person.role.as_str()) {
            return invalid("The referral gives a person a role this office does not use.");
        }
    }
    for s in &p.statements {
        if !["witness", "accused", "arresting_officer", "investigating_officer", "complainant"].contains(&s.role.as_str()) || !p.people.iter().any(|x| x.key == s.person_key) {
            return invalid("A statement in the referral is not tied to a person on it, or has a kind this office does not use.");
        }
    }
    if p.charges.iter().any(|c| c.offence.trim().is_empty() || c.accused_person_key.as_ref().is_some_and(|k| !p.people.iter().any(|x| &x.key == k))) {
        return invalid("A charge in the referral is missing its offence or names a person who is not on it.");
    }
    Ok(())
}

// ---- sending ---------------------------------------------------------------

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingPackage {
    pub id: String,
    pub connection_id: String,
    pub kind: String,
    pub seq: i64,
    pub in_reply_to: Option<String>,
    pub prosecution_file_id: Option<String>,
    pub decision_id: Option<String>,
    pub prepared_at: i64,
    pub exported_at: Option<i64>,
    pub station_name: Option<String>,
    pub file_title: Option<String>,
    pub police_reference: Option<String>,
    pub summary: String,
}

async fn next_seq(conn: &mut sqlx::SqliteConnection, connection_id: &str) -> Result<i64, sqlx::Error> {
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM police_connections WHERE id = ?").bind(connection_id).fetch_one(&mut *conn).await?;
    sqlx::query("UPDATE police_connections SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(connection_id).execute(&mut *conn).await?;
    Ok(seq)
}

pub(crate) async fn prepare_outgoing(
    conn: &mut sqlx::SqliteConnection,
    connection_id: &str,
    kind: &str,
    in_reply_to: Option<&str>,
    file_id: Option<&str>,
    decision_id: Option<&str>,
    payload: serde_json::Value,
) -> Result<String, sqlx::Error> {
    let id = uuid::Uuid::new_v4().to_string();
    let seq = next_seq(conn, connection_id).await?;
    sqlx::query("INSERT INTO outgoing_packages (id, connection_id, kind, seq, in_reply_to, prosecution_file_id, decision_id, payload, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(connection_id)
        .bind(kind)
        .bind(seq)
        .bind(in_reply_to)
        .bind(file_id)
        .bind(decision_id)
        .bind(serde_json::to_string(&payload).unwrap_or_default())
        .bind(now())
        .execute(&mut *conn)
        .await?;
    Ok(id)
}

async fn prepare_confirmation(conn: &mut sqlx::SqliteConnection, connection_id: &str, outcome: &str, reason: Option<&str>) -> Result<(), sqlx::Error> {
    prepare_outgoing(conn, connection_id, KIND_CONFIRMATION, Some(connection_id), None, None, serde_json::json!({ "outcome": outcome, "reason": reason })).await?;
    Ok(())
}

pub async fn list_outgoing(pool: &SqlitePool) -> Result<Vec<OutgoingPackage>, DomainError> {
    let rows: Vec<(String, String, String, i64, Option<String>, Option<String>, Option<String>, i64, Option<i64>, Option<String>, Option<String>, Option<String>, String)> = sqlx::query_as(
        "SELECT o.id, o.connection_id, o.kind, o.seq, o.in_reply_to, o.prosecution_file_id, o.decision_id, o.prepared_at, o.exported_at,
                c.station_name, f.title, f.police_reference, o.payload
           FROM outgoing_packages o JOIN police_connections c ON c.id = o.connection_id LEFT JOIN prosecution_files f ON f.id = o.prosecution_file_id
          ORDER BY o.prepared_at DESC, o.rowid DESC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, connection_id, kind, seq, in_reply_to, prosecution_file_id, decision_id, prepared_at, exported_at, station_name, file_title, police_reference, payload)| {
            let p: serde_json::Value = serde_json::from_str(&payload).unwrap_or_default();
            let summary = match kind.as_str() {
                KIND_RECEIPT => format!("Receipt: {}", p["outcome"].as_str().unwrap_or("")),
                KIND_DECISION_NOTICE => format!("Decision: {}", p["decisionType"].as_str().unwrap_or("").replace('_', " ")),
                _ => format!("Connection {}", p["outcome"].as_str().unwrap_or("")),
            };
            OutgoingPackage { id, connection_id, kind, seq, in_reply_to, prosecution_file_id, decision_id, prepared_at, exported_at, station_name, file_title, police_reference, summary }
        })
        .collect())
}

/// Builds the package for an outgoing item, signed by this office and sealed to
/// the station, and marks it exported. The carrier is not this office's
/// concern: the bytes are the same whether they go on a stick or over a network.
pub async fn export_outgoing(pool: &SqlitePool, id: &str) -> Result<(Vec<u8>, String), DomainError> {
    let row: Option<(String, String, i64, Option<String>, String)> = sqlx::query_as("SELECT connection_id, kind, seq, in_reply_to, payload FROM outgoing_packages WHERE id = ?").bind(id).fetch_optional(pool).await?;
    let Some((connection_id, kind, seq, in_reply_to, payload)) = row else { return Err(DomainError::NotFound("Nothing to send with that id.".to_string())) };
    let (station, status) = station_public(pool, &connection_id).await?;
    // A confirmation of revocation or refusal still goes to a station that is no longer trusted.
    if status != "trusted" && kind != KIND_CONFIRMATION {
        return invalid("This station is no longer trusted, so nothing more is sent to it.");
    }
    let office = require_identity(pool).await?;
    let json: serde_json::Value = serde_json::from_str(&payload).map_err(|_| DomainError::Invalid("The stored message could not be read.".to_string()))?;
    let body = if kind == KIND_CONFIRMATION {
        let confirmation = pairing::PairingConfirmation { invite_id: connection_id.clone(), station_id: station.id.clone(), outcome: json["outcome"].as_str().unwrap_or("declined").to_string(), reason: json["reason"].as_str().map(str::to_string) };
        Body::new(serde_json::to_value(&confirmation).unwrap_or_default())
    } else {
        Body::new(json)
    };
    let (bytes, _) = envelope::seal(&office, &station, &kind, seq as u64, in_reply_to.as_deref(), &body).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE outgoing_packages SET exported_at = ? WHERE id = ?").bind(now()).bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("package_exported").subject("outgoing_package", id).detail(format!("{kind} to {}", station.name))).await?;
    tx.commit().await?;
    let safe: String = station.name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("dpp-to-{}-{}-{}.pxpkg", safe.trim_matches('-').to_lowercase(), kind.replace('_', "-"), seq)))
}

/// A decision notice for the station that referred the file. Only documents that
/// have been issued go into it; a draft is not sent.
pub async fn prepare_decision_notice(pool: &SqlitePool, decision_id: &str) -> Result<(String, usize), DomainError> {
    let decision: Decision = sqlx::query_as("SELECT * FROM decisions WHERE id = ?").bind(decision_id).fetch_optional(pool).await?.ok_or_else(|| DomainError::NotFound("Decision not found.".to_string()))?;
    let file = super::prosecution_files::get_prosecution_file(pool, &decision.prosecution_file_id).await?.ok_or_else(|| DomainError::NotFound("File not found.".to_string()))?;
    let connection_id: Option<String> = sqlx::query_scalar("SELECT police_connection_id FROM prosecution_files WHERE id = ?").bind(&file.id).fetch_one(pool).await?;
    let Some(connection_id) = connection_id else {
        return invalid("This file did not arrive through a connection to a station, so there is no one to send a notice to.");
    };
    let (_, status) = station_public(pool, &connection_id).await?;
    if status != "trusted" {
        return invalid("The station that referred this file is no longer trusted, so nothing is sent to it.");
    }

    // The counts decided together with this one.
    let act: Vec<Decision> = match &decision.review_id {
        Some(review) => sqlx::query_as("SELECT * FROM decisions WHERE prosecution_file_id = ? AND decision_type = ? AND review_id = ? ORDER BY rowid").bind(&file.id).bind(&decision.decision_type).bind(review).fetch_all(pool).await?,
        None => vec![decision.clone()],
    };
    let mut counts = Vec::new();
    for d in &act {
        if let Some(charge) = &d.charge_id {
            if let Some(offence) = sqlx::query_scalar::<_, String>("SELECT offence FROM charges WHERE id = ?").bind(charge).fetch_optional(pool).await? {
                counts.push(offence);
            }
        }
    }
    let directions: Vec<DirectionClaim> = if decision.decision_type == "return_for_investigation" {
        let rows: Vec<(String, String, Option<String>)> = sqlx::query_as(
            "SELECT dr.kind, dr.instruction, (SELECT p.last_name || ', ' || p.first_name FROM people p WHERE p.id = dr.person_id)
               FROM directions dr WHERE dr.decision_id = ? ORDER BY dr.sort_order, dr.rowid",
        )
        .bind(&act[0].id)
        .fetch_all(pool)
        .await?;
        rows.into_iter().map(|(kind, instruction, person_name)| DirectionClaim { kind, instruction, person_name }).collect()
    } else {
        Vec::new()
    };
    let reasons = {
        let blocks = rich_text_blocks(decision.reasons.as_deref());
        let text = blocks
            .iter()
            .filter_map(|b| match b {
                super::document_content::Block::Paragraph { text } | super::document_content::Block::Heading { text } => Some(text.clone()),
                super::document_content::Block::List { items, .. } => Some(items.iter().map(|i| format!("- {}", i.text)).collect::<Vec<_>>().join("\n")),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        (!text.is_empty()).then_some(text)
    };

    let act_ids: Vec<&str> = act.iter().map(|d| d.id.as_str()).collect();
    let issued: Vec<(String, String, Option<String>, Option<i64>, Option<String>, String)> = sqlx::query_as("SELECT kind, title, reference, issued_at, author, content FROM documents WHERE prosecution_file_id = ? AND status = 'issued' ORDER BY issued_at")
        .bind(&file.id)
        .fetch_all(pool)
        .await?;
    let source_ids: Vec<(String, String)> = sqlx::query_as("SELECT source_decision_id, reference FROM documents WHERE prosecution_file_id = ? AND status = 'issued'").bind(&file.id).fetch_all(pool).await.unwrap_or_default().into_iter().map(|(a, b): (String, Option<String>)| (a, b.unwrap_or_default())).collect();
    let documents: Vec<NoticeDocument> = issued
        .into_iter()
        .filter(|(_, _, reference, ..)| source_ids.iter().any(|(src, r)| act_ids.contains(&src.as_str()) && Some(r.as_str()) == reference.as_deref()))
        .map(|(kind, title, reference, issued_at, author, content)| NoticeDocument {
            kind,
            title,
            reference,
            issued_at,
            author,
            blocks: serde_json::from_str::<serde_json::Value>(&content).map(|c| c["blocks"].clone()).unwrap_or_default(),
        })
        .collect();
    let pending_documents: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents WHERE prosecution_file_id = ? AND status = 'draft'").bind(&file.id).fetch_one(pool).await?;

    let notice = DecisionNoticePayload {
        police_reference: file.police_reference.clone().unwrap_or_default(),
        dpp_file_key: file.id.clone(),
        dpp_reference: file.odpp_registration_number.clone(),
        decision_type: decision.decision_type.clone(),
        decided_at: decision.decided_at,
        decided_by: decision.decided_by.clone(),
        counts,
        reasons,
        directions,
        documents,
        court_case_number: file.court_case_number.clone(),
    };
    let mut tx = pool.begin().await?;
    let id = prepare_outgoing(&mut tx, &connection_id, KIND_DECISION_NOTICE, None, Some(&file.id), Some(&decision.id), serde_json::to_value(&notice).unwrap_or_default()).await?;
    audit::record(&mut tx, Entry::new("notice_prepared").subject("outgoing_package", &id).file(&file.id).detail(decision.decision_type.clone())).await?;
    tx.commit().await?;
    Ok((id, pending_documents as usize))
}

pub(crate) async fn record_receipt(
    conn: &mut sqlx::SqliteConnection,
    connection_id: &str,
    referral_package_id: &str,
    payload: &ReferralPayload,
    outcome: &str,
    file: Option<(&str, Option<&str>)>,
    reason: Option<&str>,
    received_at: i64,
    decided_by: Option<String>,
) -> Result<(), sqlx::Error> {
    let receipt = ReceiptPayload {
        referral_package_id: referral_package_id.to_string(),
        police_reference: payload.police_reference.clone(),
        outcome: outcome.to_string(),
        dpp_file_key: file.map(|(id, _)| id.to_string()),
        dpp_reference: file.and_then(|(_, reference)| reference.map(str::to_string)),
        reason: reason.map(str::to_string),
        received_at,
        decided_at: now(),
        decided_by,
    };
    prepare_outgoing(conn, connection_id, KIND_RECEIPT, Some(referral_package_id), file.map(|(id, _)| id), None, serde_json::to_value(&receipt).unwrap_or_default()).await?;
    Ok(())
}
