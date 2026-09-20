//! Head Office side of select-your-facility connection.
//!
//! A facility looks itself up by number, then asks to be connected. It made
//! its own sync token and sends only the SHA-256, so Head Office never holds
//! a usable secret at rest. A valid activation code connects at once; without
//! one the request waits for a Head Office officer, whose badge and name are
//! recorded with the decision. Approving replaces any earlier connection of
//! that facility, which is how a reinstalled or replaced machine reconnects.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::facilities::{self, hash_secret};
use super::time::now_ms;

const MAX_ROSTER: usize = 5000;

#[derive(Debug)]
pub enum ConnectionError {
    Db(sqlx::Error),
    /// Unknown facility, wrong or expired code, bad token, revoked: never told apart.
    Invalid,
}

impl From<sqlx::Error> for ConnectionError {
    fn from(e: sqlx::Error) -> Self {
        ConnectionError::Db(e)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FacilityLookup {
    pub id: String,
    pub name: String,
    pub location: String,
    pub region: String,
    pub status: String,
}

pub async fn lookup(pool: &SqlitePool, key: &str) -> Result<Option<FacilityLookup>, sqlx::Error> {
    Ok(facilities::find_by_number_or_id(pool, key).await?.filter(|f| f.status != "revoked").map(|f| FacilityLookup {
        id: f.id,
        name: f.name,
        location: f.location,
        region: f.region,
        status: f.status,
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRequestInput {
    pub facility_number: String,
    pub requester_badge: String,
    pub requester_name: String,
    pub token_hash: String,
    pub activation_code: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionOutcome {
    pub request_id: String,
    pub status: String,
    pub facility_id: String,
    pub facility_name: String,
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

pub async fn request_connection(pool: &SqlitePool, input: ConnectionRequestInput, requested_from: &str) -> Result<ConnectionOutcome, ConnectionError> {
    let badge = input.requester_badge.trim().to_string();
    let name = input.requester_name.trim().to_string();
    let token_hash = input.token_hash.trim().to_lowercase();
    if badge.is_empty() || name.is_empty() || badge.len() > 60 || name.len() > 200 || !is_sha256_hex(&token_hash) {
        return Err(ConnectionError::Invalid);
    }
    let facility = facilities::find_by_number_or_id(pool, &input.facility_number).await?.ok_or(ConnectionError::Invalid)?;
    if facility.status == "revoked" {
        return Err(ConnectionError::Invalid);
    }

    let now = now_ms();
    let mut tx = crate::db::begin_write(pool).await?;
    let request_id = Uuid::new_v4().to_string();
    let replaces = facility.status == "active";
    let actor = Actor::system("network connection");

    let code = input.activation_code.as_deref().map(str::trim).filter(|c| !c.is_empty());
    if let Some(code) = code {
        let (hash, expires): (String, i64) =
            sqlx::query_as("SELECT verification_code_hash, verification_expires_at FROM facilities WHERE id = ?")
                .bind(&facility.id)
                .fetch_one(&mut *tx)
                .await?;
        if expires <= now || hash_secret(code) != hash {
            return Err(ConnectionError::Invalid);
        }
        sqlx::query("UPDATE facility_connection_requests SET status = 'superseded' WHERE facility_id = ? AND status IN ('approved', 'pending')")
            .bind(&facility.id)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO facility_connection_requests
                (id, facility_id, token_hash, requested_by_badge, requested_by_name, requested_from, status,
                 replaces_existing, decided_by_badge, decided_by_name, decided_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, NULL, 'Activation code', ?, ?)",
        )
        .bind(&request_id)
        .bind(&facility.id)
        .bind(&token_hash)
        .bind(&badge)
        .bind(&name)
        .bind(requested_from)
        .bind(replaces)
        .bind(now)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE facilities SET sync_token_hash = ?, status = 'active', verification_code_plaintext = NULL, verification_expires_at = 0
             WHERE id = ?",
        )
        .bind(&token_hash)
        .bind(&facility.id)
        .execute(&mut *tx)
        .await?;
        audit::record(
            &mut tx,
            &actor,
            AuditEntry::new("facility.connected_with_code", "facility", Some(&facility.id))
                .after(&serde_json::json!({ "requestId": request_id, "requestedByBadge": badge, "requestedByName": name, "replacedExisting": replaces })),
        )
        .await?;
        tx.commit().await?;
        return Ok(ConnectionOutcome { request_id, status: "approved".into(), facility_id: facility.id, facility_name: facility.name });
    }

    sqlx::query("UPDATE facility_connection_requests SET status = 'superseded' WHERE facility_id = ? AND status = 'pending' AND requested_by_badge = ? COLLATE NOCASE")
        .bind(&facility.id)
        .bind(&badge)
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "INSERT INTO facility_connection_requests
            (id, facility_id, token_hash, requested_by_badge, requested_by_name, requested_from, status, replaces_existing, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
    .bind(&request_id)
    .bind(&facility.id)
    .bind(&token_hash)
    .bind(&badge)
    .bind(&name)
    .bind(requested_from)
    .bind(replaces)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    audit::record(
        &mut tx,
        &actor,
        AuditEntry::new("facility.connection_requested", "facility", Some(&facility.id))
            .after(&serde_json::json!({ "requestId": request_id, "requestedByBadge": badge, "requestedByName": name, "replacesExisting": replaces })),
    )
    .await?;
    tx.commit().await?;
    Ok(ConnectionOutcome { request_id, status: "pending".into(), facility_id: facility.id, facility_name: facility.name })
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    pub status: String,
    pub facility_id: String,
    pub facility_name: String,
}

/// What became of the request a facility made, found by the hash of the
/// token it is holding. A request that was approved and later replaced by
/// another installation's approval reads as `superseded`.
pub async fn request_status(pool: &SqlitePool, token_hash: &str) -> Result<Option<ConnectionStatus>, sqlx::Error> {
    sqlx::query_as::<_, ConnectionStatus>(
        "SELECT r.status AS status, f.id AS facility_id, f.name AS facility_name
         FROM facility_connection_requests r JOIN facilities f ON f.id = r.facility_id
         WHERE r.token_hash = ? ORDER BY r.created_at DESC LIMIT 1",
    )
    .bind(token_hash)
    .fetch_optional(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRequest {
    pub id: String,
    pub facility_id: String,
    pub facility_name: String,
    pub facility_number: String,
    pub requested_by_badge: String,
    pub requested_by_name: String,
    pub requested_from: String,
    pub status: String,
    pub replaces_existing: bool,
    pub decided_by_badge: Option<String>,
    pub decided_by_name: Option<String>,
    pub decided_at: Option<i64>,
    pub created_at: i64,
}

macro_rules! select_request {
    ($tail:literal) => {
        concat!(
            "SELECT r.id, r.facility_id, f.name AS facility_name, f.facility_number AS facility_number,
                    r.requested_by_badge, r.requested_by_name, r.requested_from, r.status, r.replaces_existing,
                    r.decided_by_badge, r.decided_by_name, r.decided_at, r.created_at
             FROM facility_connection_requests r JOIN facilities f ON f.id = r.facility_id ",
            $tail
        )
    };
}

pub async fn list_requests(pool: &SqlitePool) -> Result<Vec<ConnectionRequest>, sqlx::Error> {
    sqlx::query_as::<_, ConnectionRequest>(select_request!("ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 200"))
        .fetch_all(pool)
        .await
}

pub async fn pending_count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COUNT(*) FROM facility_connection_requests WHERE status = 'pending'").fetch_one(pool).await
}

async fn get_request(conn: &mut SqliteConnection, id: &str) -> Result<Option<ConnectionRequest>, sqlx::Error> {
    sqlx::query_as::<_, ConnectionRequest>(select_request!("WHERE r.id = ?")).bind(id).fetch_optional(&mut *conn).await
}

/// Head Office's decision on a waiting request, attributed to the deciding
/// officer. Approving makes the request's token the facility's sync
/// credential and retires whichever connection it replaces.
pub async fn decide(conn: &mut SqliteConnection, actor: &Actor, request_id: &str, approve: bool) -> Result<ConnectionRequest, DomainError> {
    let request = get_request(conn, request_id).await?.ok_or(DomainError::NotFound("That connection request"))?;
    if request.status != "pending" {
        return Err(DomainError::conflict("NOT_PENDING", "That request has already been decided or replaced."));
    }
    let now = now_ms();
    if approve {
        let (token_hash, status): (String, String) = sqlx::query_as(
            "SELECT r.token_hash, f.status FROM facility_connection_requests r JOIN facilities f ON f.id = r.facility_id WHERE r.id = ?",
        )
        .bind(request_id)
        .fetch_one(&mut *conn)
        .await?;
        if status == "revoked" {
            return Err(DomainError::conflict("FACILITY_REVOKED", "That facility has been revoked. It cannot be connected."));
        }
        sqlx::query("UPDATE facility_connection_requests SET status = 'superseded' WHERE facility_id = ? AND status = 'approved'")
            .bind(&request.facility_id)
            .execute(&mut *conn)
            .await?;
        sqlx::query("UPDATE facilities SET sync_token_hash = ?, status = 'active', verification_code_plaintext = NULL WHERE id = ?")
            .bind(&token_hash)
            .bind(&request.facility_id)
            .execute(&mut *conn)
            .await?;
    }
    sqlx::query("UPDATE facility_connection_requests SET status = ?, decided_by_badge = ?, decided_by_name = ?, decided_at = ? WHERE id = ?")
        .bind(if approve { "approved" } else { "rejected" })
        .bind(&actor.badge_number)
        .bind(&actor.name)
        .bind(now)
        .bind(request_id)
        .execute(&mut *conn)
        .await?;
    let after = get_request(conn, request_id).await?.ok_or(DomainError::NotFound("That connection request"))?;
    let action = if approve { "facility.connection_approved" } else { "facility.connection_rejected" };
    audit::record(conn, actor, AuditEntry::new(action, "facility", Some(&request.facility_id)).before(&request).after(&after)).await?;
    Ok(after)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterEntry {
    pub badge_number: String,
    pub name: String,
    pub role: String,
    pub is_admin: bool,
    pub active: bool,
}

/// A connected facility's account list, replacing what Head Office held for
/// it. Carries names and roles only, never a credential of any kind.
pub async fn ingest_roster(pool: &SqlitePool, sync_token: &str, entries: Vec<RosterEntry>) -> Result<usize, ConnectionError> {
    if entries.len() > MAX_ROSTER {
        return Err(ConnectionError::Invalid);
    }
    let facility_id: Option<String> = sqlx::query_scalar("SELECT id FROM facilities WHERE sync_token_hash = ? AND status = 'active'")
        .bind(hash_secret(sync_token))
        .fetch_optional(pool)
        .await?;
    let facility_id = facility_id.ok_or(ConnectionError::Invalid)?;
    let now = now_ms();

    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query("DELETE FROM facility_officers WHERE facility_id = ?").bind(&facility_id).execute(&mut *tx).await?;
    let mut stored = 0;
    for entry in &entries {
        let badge = entry.badge_number.trim();
        if badge.is_empty() {
            continue;
        }
        sqlx::query(
            "INSERT OR REPLACE INTO facility_officers (facility_id, badge_number, name, role, is_admin, active, synced_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&facility_id)
        .bind(badge)
        .bind(entry.name.trim())
        .bind(entry.role.trim())
        .bind(entry.is_admin)
        .bind(entry.active)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        stored += 1;
    }
    audit::record(
        &mut tx,
        &Actor::system("network roster"),
        AuditEntry::new("network.roster_ingested", "facility", Some(&facility_id)).after(&serde_json::json!({ "count": stored })),
    )
    .await?;
    super::estate::touch_contact(&mut *tx, &facility_id).await?;
    tx.commit().await?;
    Ok(stored)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FacilityOfficer {
    pub facility_id: String,
    pub facility_name: String,
    pub badge_number: String,
    pub name: String,
    pub role: String,
    pub is_admin: bool,
    pub active: bool,
    pub synced_at: i64,
}

pub async fn list_facility_officers(pool: &SqlitePool) -> Result<Vec<FacilityOfficer>, sqlx::Error> {
    sqlx::query_as::<_, FacilityOfficer>(
        "SELECT o.facility_id, f.name AS facility_name, o.badge_number, o.name, o.role, o.is_admin, o.active, o.synced_at
         FROM facility_officers o JOIN facilities f ON f.id = o.facility_id
         ORDER BY f.name, o.name",
    )
    .fetch_all(pool)
    .await
}
