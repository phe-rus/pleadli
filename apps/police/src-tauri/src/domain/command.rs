//! The Command (HQ) side of the connection. A station is registered here,
//! asks to connect with a token it made itself (only the hash comes here),
//! is approved or connects with an activation code, then reports figures and
//! its roster. Nothing about a person or a case is ever received.
//!
//! See docs/police/HQ-FACILITY.md section 5.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::DomainError;
use super::sessions::Actor;
use super::time::now_ms;

/// A connected station that has not reported for this long is called silent.
pub const SILENT_AFTER_MS: i64 = 15 * 60_000;
const CODE_LIFETIME_MS: i64 = 24 * 60 * 60_000;
const MAX_ROSTER: usize = 2000;

pub fn hash_secret(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Station {
    pub id: String,
    pub station_number: String,
    pub name: String,
    pub region: Option<String>,
    pub district: Option<String>,
    pub status: String,
    pub connected_at: Option<i64>,
    pub last_report_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PendingRequest {
    pub id: String,
    pub station_id: String,
    pub requested_by_badge: String,
    pub requested_by_name: String,
    pub requested_from: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StationView {
    #[serde(flatten)]
    pub station: Station,
    /// registered (no connection asked), requested (waiting for approval),
    /// reporting, quiet (connected, no report yet), silent (no report for a
    /// while) or revoked.
    pub state: String,
    pub figures: Option<Value>,
    pub reported_at: Option<i64>,
    pub officers: usize,
}

fn state_of(station: &Station, requested: bool, now: i64) -> &'static str {
    if station.status == "revoked" {
        return "revoked";
    }
    if station.status == "registered" {
        return if requested { "requested" } else { "registered" };
    }
    match station.last_report_at {
        None => "quiet",
        Some(at) if now - at > SILENT_AFTER_MS => "silent",
        Some(_) => "reporting",
    }
}

pub async fn list_stations(pool: &SqlitePool) -> Result<Vec<StationView>, sqlx::Error> {
    let stations = sqlx::query_as::<_, Station>(
        "SELECT id, station_number, name, region, district, status, connected_at, last_report_at, created_at FROM command_stations ORDER BY name",
    )
    .fetch_all(pool)
    .await?;
    let now = now_ms();
    let mut views = Vec::with_capacity(stations.len());
    for station in stations {
        let requested: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM connection_requests WHERE station_id = ? AND status = 'pending')")
            .bind(&station.id)
            .fetch_one(pool)
            .await?;
        let report: Option<(String, String, i64)> = sqlx::query_as("SELECT figures, roster, reported_at FROM station_reports WHERE station_id = ?")
            .bind(&station.id)
            .fetch_optional(pool)
            .await?;
        let (figures, reported_at, officers) = match report {
            Some((figures, roster, at)) => (
                serde_json::from_str(&figures).ok(),
                Some(at),
                serde_json::from_str::<Vec<Value>>(&roster).map(|r| r.len()).unwrap_or(0),
            ),
            None => (None, None, 0),
        };
        views.push(StationView { state: state_of(&station, requested, now).to_string(), station, figures, reported_at, officers });
    }
    Ok(views)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterStationInput {
    pub name: String,
    pub region: Option<String>,
    pub district: Option<String>,
}

fn clean(value: &Option<String>) -> Option<String> {
    value.as_ref().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

pub async fn register_station(pool: &SqlitePool, input: RegisterStationInput) -> Result<Station, DomainError> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(DomainError::rejected("The station needs a name."));
    }
    // Numbers are given by this command in the order stations are registered:
    // ST-0001, ST-0002. Provisional: the force's own station numbering has not
    // been verified.
    let next: i64 = sqlx::query_scalar("SELECT COUNT(*) + 1 FROM command_stations").fetch_one(pool).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO command_stations (id, station_number, name, region, district) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(format!("ST-{next:04}"))
        .bind(name)
        .bind(clean(&input.region))
        .bind(clean(&input.district))
        .execute(pool)
        .await?;
    Ok(get_station(pool, &id).await?)
}

async fn get_station(pool: &SqlitePool, id: &str) -> Result<Station, sqlx::Error> {
    sqlx::query_as::<_, Station>("SELECT id, station_number, name, region, district, status, connected_at, last_report_at, created_at FROM command_stations WHERE id = ?")
        .bind(id)
        .fetch_one(pool)
        .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivationCode {
    pub code: String,
    pub expires_at: i64,
}

/// Issues an activation code for a station. Shown once: only its hash is kept.
pub async fn issue_activation_code(pool: &SqlitePool, station_id: &str) -> Result<ActivationCode, DomainError> {
    let station = get_station(pool, station_id).await?;
    if station.status == "revoked" {
        return Err(DomainError::rejected("This station has been revoked."));
    }
    let code = Uuid::new_v4().simple().to_string()[..10].to_uppercase();
    let expires_at = now_ms() + CODE_LIFETIME_MS;
    sqlx::query("UPDATE command_stations SET activation_code_hash = ?, activation_expires_at = ? WHERE id = ?")
        .bind(hash_secret(&code))
        .bind(expires_at)
        .bind(station_id)
        .execute(pool)
        .await?;
    Ok(ActivationCode { code, expires_at })
}

pub async fn revoke_station(pool: &SqlitePool, station_id: &str) -> Result<(), DomainError> {
    sqlx::query("UPDATE command_stations SET status = 'revoked', token_hash = NULL, activation_code_hash = NULL WHERE id = ?")
        .bind(station_id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE connection_requests SET status = 'superseded' WHERE station_id = ? AND status IN ('pending', 'approved')")
        .bind(station_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn pending_requests(pool: &SqlitePool) -> Result<Vec<PendingRequest>, sqlx::Error> {
    sqlx::query_as("SELECT id, station_id, requested_by_badge, requested_by_name, requested_from, created_at FROM connection_requests WHERE status = 'pending' ORDER BY created_at")
        .fetch_all(pool)
        .await
}

/// Approves or rejects a request. Approving connects the station with the token
/// it presented and replaces any earlier connection, which is how a reinstalled
/// machine reconnects.
pub async fn decide(pool: &SqlitePool, actor: &Actor, request_id: &str, approve: bool) -> Result<(), DomainError> {
    let row: Option<(String, String, String)> = sqlx::query_as("SELECT station_id, token_hash, status FROM connection_requests WHERE id = ?")
        .bind(request_id)
        .fetch_optional(pool)
        .await?;
    let Some((station_id, token_hash, status)) = row else { return Err(DomainError::NotFound("That request no longer exists.".to_string())) };
    if status != "pending" {
        return Err(DomainError::rejected("That request has already been decided."));
    }
    let station = get_station(pool, &station_id).await?;
    if station.status == "revoked" {
        return Err(DomainError::rejected("This station has been revoked."));
    }
    let now = now_ms();
    let mut tx = pool.begin().await?;
    if approve {
        sqlx::query("UPDATE connection_requests SET status = 'superseded' WHERE station_id = ? AND id != ? AND status IN ('pending', 'approved')")
            .bind(&station_id)
            .bind(request_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("UPDATE command_stations SET status = 'active', token_hash = ?, connected_at = ?, activation_code_hash = NULL WHERE id = ?")
            .bind(&token_hash)
            .bind(now)
            .bind(&station_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("UPDATE connection_requests SET status = ?, decided_by_badge = ?, decided_by_name = ?, decided_at = ? WHERE id = ?")
        .bind(if approve { "approved" } else { "rejected" })
        .bind(&actor.badge_number)
        .bind(&actor.name)
        .bind(now)
        .bind(request_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

// ---- What a station may ask, over the network. None of these are signed-in
// calls: the number, the code and the token are the credentials.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StationLookup {
    pub name: String,
    pub region: Option<String>,
    pub district: Option<String>,
}

pub async fn lookup(pool: &SqlitePool, number: &str) -> Result<Option<StationLookup>, sqlx::Error> {
    let station: Option<Station> = sqlx::query_as::<_, Station>(
        "SELECT id, station_number, name, region, district, status, connected_at, last_report_at, created_at FROM command_stations WHERE station_number = ?",
    )
    .bind(number.trim())
    .fetch_optional(pool)
    .await?;
    Ok(station.filter(|s| s.status != "revoked").map(|s| StationLookup { name: s.name, region: s.region, district: s.district }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInput {
    pub station_number: String,
    pub requester_badge: String,
    pub requester_name: String,
    pub token_hash: String,
    pub activation_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectOutcome {
    pub request_id: String,
    /// `approved` (a valid activation code connected it at once) or `pending`.
    pub status: String,
    pub station_name: String,
}

/// One answer for every reason a connection is refused: an unknown number, a
/// wrong or expired code, a revoked station.
pub const NOT_ACCEPTED: &str = "The connection was not accepted.";

pub async fn request_connection(pool: &SqlitePool, input: ConnectInput, requested_from: &str) -> Result<ConnectOutcome, DomainError> {
    let badge = input.requester_badge.trim();
    let name = input.requester_name.trim();
    let token_hash = input.token_hash.trim().to_lowercase();
    if badge.is_empty() || name.is_empty() || badge.len() > 60 || name.len() > 200 || !is_sha256_hex(&token_hash) {
        return Err(DomainError::Unauthorized(NOT_ACCEPTED.to_string()));
    }
    let station: Option<Station> = sqlx::query_as::<_, Station>(
        "SELECT id, station_number, name, region, district, status, connected_at, last_report_at, created_at FROM command_stations WHERE station_number = ?",
    )
    .bind(input.station_number.trim())
    .fetch_optional(pool)
    .await?;
    let Some(station) = station.filter(|s| s.status != "revoked") else { return Err(DomainError::Unauthorized(NOT_ACCEPTED.to_string())) };

    let now = now_ms();
    let request_id = Uuid::new_v4().to_string();
    let code = input.activation_code.as_deref().map(str::trim).filter(|c| !c.is_empty());
    let mut tx = pool.begin().await?;

    if let Some(code) = code {
        let stored: (Option<String>, Option<i64>) = sqlx::query_as("SELECT activation_code_hash, activation_expires_at FROM command_stations WHERE id = ?")
            .bind(&station.id)
            .fetch_one(&mut *tx)
            .await?;
        let valid = matches!(stored, (Some(hash), Some(expires)) if expires > now && hash == hash_secret(code));
        if !valid {
            return Err(DomainError::Unauthorized(NOT_ACCEPTED.to_string()));
        }
        sqlx::query("UPDATE connection_requests SET status = 'superseded' WHERE station_id = ? AND status IN ('pending', 'approved')")
            .bind(&station.id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO connection_requests (id, station_id, token_hash, requested_by_badge, requested_by_name, requested_from, status, decided_by_name, decided_at) VALUES (?, ?, ?, ?, ?, ?, 'approved', 'Activation code', ?)")
            .bind(&request_id)
            .bind(&station.id)
            .bind(&token_hash)
            .bind(badge)
            .bind(name)
            .bind(requested_from)
            .bind(now)
            .execute(&mut *tx)
            .await?;
        // A code is used once.
        sqlx::query("UPDATE command_stations SET status = 'active', token_hash = ?, connected_at = ?, activation_code_hash = NULL, activation_expires_at = NULL WHERE id = ?")
            .bind(&token_hash)
            .bind(now)
            .bind(&station.id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        return Ok(ConnectOutcome { request_id, status: "approved".to_string(), station_name: station.name });
    }

    // Without a code the request waits for an administrator. A newer request
    // replaces an older one still waiting.
    sqlx::query("UPDATE connection_requests SET status = 'superseded' WHERE station_id = ? AND status = 'pending'").bind(&station.id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO connection_requests (id, station_id, token_hash, requested_by_badge, requested_by_name, requested_from) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&request_id)
        .bind(&station.id)
        .bind(&token_hash)
        .bind(badge)
        .bind(name)
        .bind(requested_from)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(ConnectOutcome { request_id, status: "pending".to_string(), station_name: station.name })
}

/// Where a request stands. The token hash the station made is required, so
/// only that station learns the answer.
pub async fn request_status(pool: &SqlitePool, request_id: &str, token_hash: &str) -> Result<String, DomainError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM connection_requests WHERE id = ? AND token_hash = ?")
        .bind(request_id)
        .bind(token_hash.trim().to_lowercase())
        .fetch_optional(pool)
        .await?;
    status.ok_or_else(|| DomainError::Unauthorized(NOT_ACCEPTED.to_string()))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportInput {
    pub reported_at: i64,
    pub figures: Value,
    pub roster: Vec<Value>,
}

/// Keeps the latest report of the station whose sync token this is. The token
/// is the only credential; a revoked or unknown token is refused.
pub async fn receive_report(pool: &SqlitePool, token: &str, report: ReportInput) -> Result<(), DomainError> {
    let station_id: Option<String> = sqlx::query_scalar("SELECT id FROM command_stations WHERE token_hash = ? AND status = 'active'")
        .bind(hash_secret(token))
        .fetch_optional(pool)
        .await?;
    let Some(station_id) = station_id else { return Err(DomainError::Unauthorized(NOT_ACCEPTED.to_string())) };
    if report.roster.len() > MAX_ROSTER || !report.figures.is_object() {
        return Err(DomainError::rejected("That report is not in the expected shape."));
    }
    // A roster row carries only these fields, whatever else was sent.
    let roster: Vec<Value> = report
        .roster
        .iter()
        .map(|officer| {
            let pick = |key: &str| officer.get(key).and_then(Value::as_str).map(|v| Value::String(v.chars().take(200).collect()));
            serde_json::json!({
                "name": pick("name"),
                "rank": pick("rank"),
                "post": pick("post"),
                "badgeNumber": pick("badgeNumber"),
                "role": pick("role"),
                "active": officer.get("active").and_then(Value::as_bool).unwrap_or(true),
            })
        })
        .collect();
    let now = now_ms();
    sqlx::query(
        "INSERT INTO station_reports (station_id, figures, roster, reported_at, received_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(station_id) DO UPDATE SET figures = excluded.figures, roster = excluded.roster, reported_at = excluded.reported_at, received_at = excluded.received_at",
    )
    .bind(&station_id)
    .bind(report.figures.to_string())
    .bind(serde_json::to_string(&roster).unwrap_or_else(|_| "[]".to_string()))
    .bind(report.reported_at)
    .bind(now)
    .execute(pool)
    .await?;
    sqlx::query("UPDATE command_stations SET last_report_at = ? WHERE id = ?").bind(now).bind(&station_id).execute(pool).await?;
    Ok(())
}

pub async fn station_roster(pool: &SqlitePool, station_id: &str) -> Result<Vec<Value>, sqlx::Error> {
    let roster: Option<String> = sqlx::query_scalar("SELECT roster FROM station_reports WHERE station_id = ?").bind(station_id).fetch_optional(pool).await?;
    Ok(roster.and_then(|r| serde_json::from_str(&r).ok()).unwrap_or_default())
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub stations: usize,
    pub reporting: usize,
    pub silent: usize,
    pub requested: usize,
    pub in_custody: i64,
    pub near_limit: i64,
    pub past_limit: i64,
    pub open_cases: i64,
    pub referrals_pending: i64,
    pub officers: usize,
    pub silent_stations: Vec<String>,
}

/// Totals across the stations that are connected and have reported, and the
/// stations that need attention. A station that has gone quiet is named, not
/// counted in the totals as if it were current.
pub async fn overview(pool: &SqlitePool) -> Result<Overview, sqlx::Error> {
    let mut overview = Overview::default();
    for view in list_stations(pool).await? {
        overview.stations += 1;
        match view.state.as_str() {
            "requested" => overview.requested += 1,
            "silent" => {
                overview.silent += 1;
                overview.silent_stations.push(view.station.name.clone());
            }
            "reporting" => {
                overview.reporting += 1;
                overview.officers += view.officers;
                if let Some(figures) = &view.figures {
                    let get = |key: &str| figures.get(key).and_then(Value::as_i64).unwrap_or(0);
                    overview.in_custody += get("inCustody");
                    overview.near_limit += get("nearLimit");
                    overview.past_limit += get("pastLimit");
                    overview.open_cases += get("openCases");
                    overview.referrals_pending += get("referralsPending");
                }
            }
            _ => {}
        }
    }
    Ok(overview)
}
