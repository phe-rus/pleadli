//! The station side of the connection to a command (HQ). The station makes its
//! own sync token and sends only its hash; a command that approves it (or that
//! it presents an activation code to) accepts the token, and from then on the
//! station reports figures and its roster every minute it has something new,
//! and at least every five minutes so the command can tell a quiet station from
//! a silent one. No record and no password is ever sent.
//!
//! See docs/police/HQ-FACILITY.md section 5.

use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::command::hash_secret;
use super::error::DomainError;
use super::sessions::Actor;
use super::time::now_ms;

const HEARTBEAT_MS: i64 = 5 * 60_000;
const NEAR_LIMIT_HOURS: f64 = 6.0;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub address: String,
    pub station_number: String,
    pub station_name: Option<String>,
    /// pending (waiting for the command to approve), connected, or rejected.
    pub state: String,
    pub requested_by: Option<String>,
    pub connected_at: Option<i64>,
    pub last_report_at: Option<i64>,
    pub last_error: Option<String>,
}

const LINK_COLUMNS: &str = "address, station_number, station_name, state, requested_by, connected_at, last_report_at, last_error";

pub async fn get(pool: &SqlitePool) -> Result<Option<Link>, sqlx::Error> {
    sqlx::query_as::<_, Link>(sqlx::AssertSqlSafe(format!("SELECT {LINK_COLUMNS} FROM command_link WHERE id = 'default'"))).fetch_optional(pool).await
}

fn client() -> Result<reqwest::Client, DomainError> {
    reqwest::Client::builder().timeout(Duration::from_secs(10)).build().map_err(|e| DomainError::Db(sqlx::Error::Protocol(e.to_string())))
}

fn normalise_address(address: &str) -> Result<String, DomainError> {
    let trimmed = address.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(DomainError::rejected("Enter the address of the command."));
    }
    Ok(if trimmed.starts_with("http://") || trimmed.starts_with("https://") { trimmed.to_string() } else { format!("http://{trimmed}") })
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectInput {
    pub address: String,
    pub station_number: String,
    pub activation_code: Option<String>,
}

/// Asks a command to connect this station. The token is made here and kept
/// here; the command is sent its hash.
pub async fn connect(pool: &SqlitePool, actor: &Actor, input: ConnectInput) -> Result<Link, DomainError> {
    let address = normalise_address(&input.address)?;
    let number = input.station_number.trim();
    if number.is_empty() {
        return Err(DomainError::rejected("Enter the station number the command gave this station."));
    }
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let body = json!({
        "stationNumber": number,
        "requesterBadge": actor.badge_number.clone().unwrap_or_default(),
        "requesterName": actor.name,
        "tokenHash": hash_secret(&token),
        "activationCode": input.activation_code.as_deref().map(str::trim).filter(|c| !c.is_empty()),
    });

    let response = client()?
        .post(format!("{address}/api/hq/link/connect"))
        .json(&body)
        .send()
        .await
        .map_err(|_| DomainError::rejected("Could not reach the command at that address."))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(DomainError::rejected("The command did not accept that station number or activation code."));
    }
    if !response.status().is_success() {
        return Err(DomainError::rejected("The command could not take that request."));
    }
    let outcome: Value = response.json().await.map_err(|_| DomainError::rejected("The command sent an answer this station cannot read."))?;
    let request_id = outcome.get("requestId").and_then(Value::as_str).unwrap_or_default().to_string();
    let station_name = outcome.get("stationName").and_then(Value::as_str).map(str::to_string);
    let connected = outcome.get("status").and_then(Value::as_str) == Some("approved");
    let now = now_ms();

    sqlx::query(
        "INSERT INTO command_link (id, address, station_number, station_name, token, request_id, state, requested_by, connected_at)
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET address = excluded.address, station_number = excluded.station_number, station_name = excluded.station_name,
            token = excluded.token, request_id = excluded.request_id, state = excluded.state, requested_by = excluded.requested_by,
            connected_at = excluded.connected_at, last_report_at = NULL, last_error = NULL",
    )
    .bind(&address)
    .bind(number)
    .bind(&station_name)
    .bind(&token)
    .bind(&request_id)
    .bind(if connected { "connected" } else { "pending" })
    .bind(&actor.name)
    .bind(connected.then_some(now))
    .execute(pool)
    .await?;
    if connected {
        let _ = send_report(pool, true).await;
    }
    Ok(get(pool).await?.expect("the link was just saved"))
}

pub async fn disconnect(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM command_link WHERE id = 'default'").execute(pool).await?;
    Ok(())
}

/// While a request waits for approval, asks the command where it stands.
async fn poll_pending(pool: &SqlitePool) -> Result<(), DomainError> {
    let row: Option<(String, String, String)> = sqlx::query_as("SELECT address, request_id, token FROM command_link WHERE id = 'default' AND state = 'pending'")
        .fetch_optional(pool)
        .await?;
    let Some((address, request_id, token)) = row else { return Ok(()) };
    let response = client()?
        .get(format!("{address}/api/hq/link/connect/{request_id}"))
        .query(&[("tokenHash", hash_secret(&token))])
        .send()
        .await;
    let Ok(response) = response else {
        sqlx::query("UPDATE command_link SET last_error = 'The command could not be reached.' WHERE id = 'default'").execute(pool).await?;
        return Ok(());
    };
    if !response.status().is_success() {
        return Ok(());
    }
    let answer: Value = response.json().await.unwrap_or(Value::Null);
    match answer.get("status").and_then(Value::as_str) {
        Some("approved") => {
            sqlx::query("UPDATE command_link SET state = 'connected', connected_at = ?, last_error = NULL WHERE id = 'default'").bind(now_ms()).execute(pool).await?;
        }
        Some("rejected") | Some("superseded") => {
            sqlx::query("UPDATE command_link SET state = 'rejected', last_error = 'The command did not approve this station.' WHERE id = 'default'").execute(pool).await?;
        }
        _ => {}
    }
    Ok(())
}

/// Hours until a person in custody reaches the limit that binds them: 48 hours
/// from the arrest, the 7 day transfer window for a cross-jurisdiction case not
/// yet transferred, or 48 hours from the transfer. The same rule the custody
/// board shows, worked out from the timestamps and stored nowhere.
fn hours_remaining(arrested_at: i64, cross_jurisdiction: bool, transferred_at: Option<i64>, now: i64) -> f64 {
    const HOUR: i64 = 3_600_000;
    let deadline = match (cross_jurisdiction, transferred_at) {
        (false, _) => arrested_at + 48 * HOUR,
        (true, None) => arrested_at + 7 * 24 * HOUR,
        (true, Some(at)) => at + 48 * HOUR,
    };
    (deadline - now) as f64 / HOUR as f64
}

/// What this station tells its command: counts and a roster, nothing else.
pub async fn build_report(pool: &SqlitePool) -> Result<Value, sqlx::Error> {
    let now = now_ms();
    let custody: Vec<(i64, bool, Option<i64>)> = sqlx::query_as("SELECT arrested_at, cross_jurisdiction_transfer, transferred_at FROM custody_records WHERE status = 'in_custody'")
        .fetch_all(pool)
        .await?;
    let remaining: Vec<f64> = custody.iter().map(|(arrested, cross, transferred)| hours_remaining(*arrested, *cross, *transferred, now)).collect();
    let past = remaining.iter().filter(|h| **h < 0.0).count();
    let near = remaining.iter().filter(|h| **h >= 0.0 && **h <= NEAR_LIMIT_HOURS).count();

    let open_cases: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE status = 'open'").fetch_one(pool).await?;
    let referrals: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM referrals WHERE status = 'pending'").fetch_one(pool).await?;
    let on_duty: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM duty_assignments WHERE shift_start <= ?1 AND shift_end >= ?1").bind(now).fetch_one(pool).await?;
    let roster: Vec<(String, Option<String>, Option<String>, Option<String>, String, bool)> =
        sqlx::query_as("SELECT name, rank, post, badge_number, role, active FROM officers ORDER BY name").fetch_all(pool).await?;
    let officers_active = roster.iter().filter(|o| o.5).count();

    Ok(json!({
        "figures": {
            "inCustody": custody.len(),
            "nearLimit": near,
            "pastLimit": past,
            "openCases": open_cases,
            "referralsPending": referrals,
            "onDutyNow": on_duty,
            "officersActive": officers_active,
        },
        "roster": roster.iter().map(|(name, rank, post, badge, role, active)| json!({
            "name": name, "rank": rank, "post": post, "badgeNumber": badge, "role": role, "active": active,
        })).collect::<Vec<_>>(),
    }))
}

/// What was last sent, so an unchanged report is not sent again until the
/// heartbeat is due.
fn last_sent() -> &'static Mutex<Option<(String, i64)>> {
    static LAST: OnceLock<Mutex<Option<(String, i64)>>> = OnceLock::new();
    LAST.get_or_init(|| Mutex::new(None))
}

/// Sends a report if connected and something changed (or the heartbeat is due,
/// or `force`). A command that no longer accepts the token ends the link.
pub async fn send_report(pool: &SqlitePool, force: bool) -> Result<(), DomainError> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT address, token FROM command_link WHERE id = 'default' AND state = 'connected'").fetch_optional(pool).await?;
    let Some((address, token)) = row else { return Ok(()) };

    let content = build_report(pool).await?;
    let fingerprint = content.to_string();
    let now = now_ms();
    if !force {
        if let Ok(last) = last_sent().lock() {
            if let Some((previous, at)) = last.as_ref() {
                if *previous == fingerprint && now - at < HEARTBEAT_MS {
                    return Ok(());
                }
            }
        }
    }

    let mut body = content;
    body["reportedAt"] = json!(now);
    let response = client()?.post(format!("{address}/api/hq/link/report")).bearer_auth(&token).json(&body).send().await;
    match response {
        Ok(response) if response.status().is_success() => {
            if let Ok(mut last) = last_sent().lock() {
                *last = Some((fingerprint, now));
            }
            sqlx::query("UPDATE command_link SET last_report_at = ?, last_error = NULL WHERE id = 'default'").bind(now).execute(pool).await?;
        }
        Ok(response) if response.status() == reqwest::StatusCode::UNAUTHORIZED => {
            sqlx::query("UPDATE command_link SET state = 'rejected', last_error = 'The command no longer accepts this station.' WHERE id = 'default'").execute(pool).await?;
        }
        Ok(response) => {
            let message = format!("The command answered {}.", response.status());
            sqlx::query("UPDATE command_link SET last_error = ? WHERE id = 'default'").bind(message).execute(pool).await?;
        }
        Err(_) => {
            sqlx::query("UPDATE command_link SET last_error = 'The command could not be reached.' WHERE id = 'default'").execute(pool).await?;
        }
    }
    Ok(())
}

/// The background loop of a station: every minute, ask about a waiting request
/// and report if there is anything to say. Runs for the life of the application.
pub async fn run(pool: SqlitePool) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        let station = matches!(super::installation::mode(&pool).await, Ok(Some(mode)) if mode == "station");
        if !station {
            continue;
        }
        if let Err(e) = poll_pending(&pool).await {
            log::warn!("could not check the connection request: {e}");
        }
        if let Err(e) = send_report(&pool, false).await {
            log::warn!("could not report to the command: {e}");
        }
    }
}
