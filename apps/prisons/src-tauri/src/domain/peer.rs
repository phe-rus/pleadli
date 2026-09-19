//! The facility side of pairing (docs/specs/prisons/0001-head-office-peer-
//! sync-network/0002, docs/prisons/product-map/04 J.3).
//!
//! The outbound call to Head Office is made here, in the node, not from the
//! browser: a webview never talks to Head Office directly, and every outbound
//! network call lives in one place that a transport abstraction can replace.

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::Duration;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::connection::{ConnectionOutcome, ConnectionStatus, FacilityLookup, RosterEntry};
use super::facilities::{self, hash_secret, random_secret};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairInput {
    pub pairing_code: String,
    pub name: String,
    pub facility_number: String,
    pub location: String,
    pub region: String,
    pub head_officer_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairResult {
    pub facility_id: String,
}

#[derive(Debug)]
pub enum PairError {
    /// The code does not look like a Pleadli pairing code.
    Malformed,
    /// This installation is already paired.
    AlreadyPaired,
    /// Head Office could not be reached at all.
    Unreachable(String),
    /// Head Office answered but refused (bad, used or expired code).
    Rejected,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for PairError {
    fn from(e: sqlx::Error) -> Self {
        PairError::Db(e)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterResponse {
    facility_id: String,
    sync_token: String,
}

/// `<host>#<secret>`: splits on the last `#` so a host can never contain the
/// secret. The host must be an http(s) origin.
pub fn parse_pairing_code(code: &str) -> Result<(String, String), PairError> {
    let code = code.trim();
    let sharp = code.rfind('#').ok_or(PairError::Malformed)?;
    let (host, secret) = (&code[..sharp], &code[sharp + 1..]);
    if host.is_empty() || secret.is_empty() || !(host.starts_with("https://") || host.starts_with("http://")) {
        return Err(PairError::Malformed);
    }
    Ok((host.trim_end_matches('/').to_string(), secret.to_string()))
}

pub async fn pair_with_head_office(pool: &SqlitePool, actor: &Actor, input: PairInput) -> Result<PairResult, PairError> {
    let already: Option<String> = sqlx::query_scalar("SELECT facility_id FROM peer_sync_config WHERE id = 'default'")
        .fetch_one(pool)
        .await?;
    if already.is_some() {
        return Err(PairError::AlreadyPaired);
    }

    let (host, secret) = parse_pairing_code(&input.pairing_code)?;

    let client = reqwest::Client::builder().timeout(Duration::from_secs(20)).build().map_err(|e| PairError::Unreachable(e.to_string()))?;
    let response = client
        .post(format!("{host}/api/network/v1/pairing/register"))
        .json(&serde_json::json!({
            "pairingSecret": secret,
            "name": input.name,
            "facilityNumber": input.facility_number,
            "location": input.location,
            "region": input.region,
            "headOfficerName": input.head_officer_name,
        }))
        .send()
        .await
        .map_err(|e| PairError::Unreachable(e.to_string()))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(PairError::Rejected);
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    let registered: RegisterResponse = response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?;

    let mut tx = crate::db::begin_write(pool).await?;
    facilities::save_peer_credentials(&mut tx, actor, &host, &registered.facility_id, &registered.sync_token).await?;
    tx.commit().await?;

    Ok(PairResult { facility_id: registered.facility_id })
}

/// Accepts an address as typed (`https://hq.example.org`, `127.0.0.1:47923`)
/// or a whole pairing code (`host#secret`), and returns the origin.
pub fn parse_hq_address(input: &str) -> Result<String, PairError> {
    let text = input.trim();
    let host = text.rfind('#').map(|i| &text[..i]).unwrap_or(text).trim().trim_end_matches('/');
    if host.is_empty() || host.contains(char::is_whitespace) {
        return Err(PairError::Malformed);
    }
    if host.starts_with("https://") || host.starts_with("http://") {
        return Ok(host.to_string());
    }
    if host.contains("://") {
        return Err(PairError::Malformed);
    }
    let bare = host.split(':').next().unwrap_or(host);
    let local = bare == "localhost" || bare.starts_with("127.") || bare.starts_with("10.") || bare.starts_with("192.168.");
    Ok(format!("{}://{host}", if local { "http" } else { "https" }))
}

fn client(seconds: u64) -> Result<reqwest::Client, PairError> {
    reqwest::Client::builder().timeout(Duration::from_secs(seconds)).build().map_err(|e| PairError::Unreachable(e.to_string()))
}

/// Looks a facility up on Head Office by its number, for the confirm card.
/// `None` means Head Office answered but does not know it.
pub async fn lookup_facility(hq_address: &str, number: &str) -> Result<Option<FacilityLookup>, PairError> {
    let host = parse_hq_address(hq_address)?;
    let response = client(10)?
        .get(format!("{host}/api/network/v1/facilities/lookup"))
        .query(&[("number", number.trim())])
        .send()
        .await
        .map_err(|e| PairError::Unreachable(e.to_string()))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    Ok(Some(response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectFacilityInput {
    pub hq_address: String,
    pub facility_number: String,
    pub requester_badge: String,
    pub requester_name: String,
    pub activation_code: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    /// `connected` (an activation code was accepted) or `pending`.
    pub state: String,
    pub facility_id: String,
    pub facility_name: String,
}

async fn own_connection(pool: &SqlitePool) -> Result<(Option<String>, Option<String>, Option<String>, Option<String>), sqlx::Error> {
    sqlx::query_as(
        "SELECT hq_hostname, sync_token, facility_id,
                COALESCE(connection_state, CASE WHEN facility_id IS NOT NULL THEN 'connected' ELSE 'none' END)
         FROM peer_sync_config WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await
}

/// Asks Head Office to connect this installation to a facility it already
/// knows. The token is made here and only its hash leaves the machine.
pub async fn connect_facility(pool: &SqlitePool, actor: &Actor, input: ConnectFacilityInput) -> Result<ConnectResult, PairError> {
    let (_, _, _, state) = own_connection(pool).await?;
    if state.as_deref() == Some("connected") {
        return Err(PairError::AlreadyPaired);
    }
    let host = parse_hq_address(&input.hq_address)?;
    let badge = input.requester_badge.trim().to_string();
    let name = input.requester_name.trim().to_string();
    if badge.is_empty() || name.is_empty() || input.facility_number.trim().is_empty() {
        return Err(PairError::Malformed);
    }

    let token = random_secret(32);
    let response = client(20)?
        .post(format!("{host}/api/network/v1/connection/request"))
        .json(&serde_json::json!({
            "facilityNumber": input.facility_number.trim(),
            "requesterBadge": badge,
            "requesterName": name,
            "tokenHash": hash_secret(&token),
            "activationCode": input.activation_code.as_deref().map(str::trim).filter(|c| !c.is_empty()),
        }))
        .send()
        .await
        .map_err(|e| PairError::Unreachable(e.to_string()))?;
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(PairError::Rejected);
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    let outcome: ConnectionOutcome = response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?;
    let connected = outcome.status == "approved";

    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE peer_sync_config
         SET hq_hostname = ?, sync_token = ?, facility_id = ?, connection_state = ?, connection_request_id = ?,
             requested_by_badge = ?, requested_by_name = ?, facility_display_name = ?,
             last_sync_status = NULL, last_error = NULL
         WHERE id = 'default'",
    )
    .bind(&host)
    .bind(&token)
    .bind(if connected { Some(outcome.facility_id.clone()) } else { None })
    .bind(if connected { "connected" } else { "pending" })
    .bind(&outcome.request_id)
    .bind(&badge)
    .bind(&name)
    .bind(&outcome.facility_name)
    .execute(&mut *tx)
    .await?;
    audit::record(
        &mut tx,
        actor,
        AuditEntry::new(if connected { "peer.paired" } else { "peer.connection_requested" }, "peer_sync_config", Some("default"))
            .after(&serde_json::json!({ "hqHostname": host, "facilityName": outcome.facility_name, "requestedByBadge": badge })),
    )
    .await?;
    tx.commit().await?;

    if connected {
        if let Err(e) = push_roster(pool).await {
            log::info!("roster push after connecting: {e}");
        }
    }
    Ok(ConnectResult { state: if connected { "connected" } else { "pending" }.to_string(), facility_id: outcome.facility_id, facility_name: outcome.facility_name })
}

/// Asks Head Office what became of a waiting request and records the answer.
/// Does nothing unless a request is waiting; an unreachable Head Office
/// leaves the request waiting rather than failing it.
pub async fn refresh_connection(pool: &SqlitePool) -> Result<(), PairError> {
    let (host, token, _, state) = own_connection(pool).await?;
    let (Some(host), Some(token), Some("pending")) = (host, token, state.as_deref()) else {
        return Ok(());
    };
    let response = client(10)?
        .post(format!("{host}/api/network/v1/connection/status"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| PairError::Unreachable(e.to_string()))?;
    let actor = Actor::system("network connection");

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return set_rejected(pool, &actor, "Head Office does not recognise this connection request.").await;
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    let status: ConnectionStatus = response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?;
    match status.status.as_str() {
        "approved" => {
            let mut tx = crate::db::begin_write(pool).await?;
            sqlx::query(
                "UPDATE peer_sync_config SET facility_id = ?, facility_display_name = ?, connection_state = 'connected',
                        last_sync_status = NULL, last_error = NULL WHERE id = 'default'",
            )
            .bind(&status.facility_id)
            .bind(&status.facility_name)
            .execute(&mut *tx)
            .await?;
            audit::record(
                &mut tx,
                &actor,
                AuditEntry::new("peer.paired", "peer_sync_config", Some("default"))
                    .after(&serde_json::json!({ "hqHostname": host, "facilityName": status.facility_name })),
            )
            .await?;
            tx.commit().await?;
            if let Err(e) = push_roster(pool).await {
                log::info!("roster push after approval: {e}");
            }
            Ok(())
        }
        "rejected" | "superseded" => set_rejected(pool, &actor, "Head Office did not approve this connection request.").await,
        _ => Ok(()),
    }
}

async fn set_rejected(pool: &SqlitePool, actor: &Actor, message: &str) -> Result<(), PairError> {
    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query("UPDATE peer_sync_config SET connection_state = 'rejected', sync_token = NULL, last_error = ? WHERE id = 'default'")
        .bind(message)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, actor, AuditEntry::new("peer.connection_rejected", "peer_sync_config", Some("default")).reason(message)).await?;
    tx.commit().await?;
    Ok(())
}

/// Drops a waiting or rejected request so the facility can start again.
pub async fn cancel_connection(pool: &SqlitePool, actor: &Actor) -> Result<(), PairError> {
    let (_, _, _, state) = own_connection(pool).await?;
    if state.as_deref() == Some("connected") {
        return Err(PairError::AlreadyPaired);
    }
    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE peer_sync_config
         SET hq_hostname = NULL, sync_token = NULL, facility_id = NULL, connection_state = NULL, connection_request_id = NULL,
             requested_by_badge = NULL, requested_by_name = NULL, facility_display_name = NULL,
             last_sync_status = NULL, last_error = NULL
         WHERE id = 'default'",
    )
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, actor, AuditEntry::new("peer.connection_cancelled", "peer_sync_config", Some("default"))).await?;
    tx.commit().await?;
    Ok(())
}

/// Sends this facility's accounts (never a credential) to Head Office.
pub async fn push_roster(pool: &SqlitePool) -> Result<usize, String> {
    let ctx = facilities::get_peer_sync_context(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "This installation is not connected to a Head Office yet.".to_string())?;
    let rows: Vec<(String, String, String, bool, bool)> =
        sqlx::query_as("SELECT badge_number, name, role, is_admin, active FROM officers ORDER BY name")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    let officers: Vec<RosterEntry> = rows
        .into_iter()
        .map(|(badge_number, name, role, is_admin, active)| RosterEntry { badge_number, name, role, is_admin, active })
        .collect();
    let response = client(30)
        .map_err(|_| "Could not start the request.".to_string())?
        .post(format!("{}/api/network/v1/roster", ctx.hostname.trim_end_matches('/')))
        .bearer_auth(&ctx.sync_token)
        .json(&serde_json::json!({ "officers": officers }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Head Office responded {}", response.status()));
    }
    sqlx::query("UPDATE peer_sync_config SET roster_pushed_at = ?, roster_count = ? WHERE id = 'default'")
        .bind(super::time::now_ms())
        .bind(officers.len() as i64)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(officers.len())
}

/// Whether Head Office answers its health check right now.
pub async fn hq_reachable(pool: &SqlitePool) -> bool {
    let Ok((Some(host), _, _, _)) = own_connection(pool).await else {
        return false;
    };
    let Ok(client) = client(5) else {
        return false;
    };
    client.get(format!("{host}/api/network/v1/health")).send().await.map(|r| r.status().is_success()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairing_code_parses_host_and_secret() {
        let (host, secret) = parse_pairing_code("https://hq.example.org#abc-DEF_123").unwrap();
        assert_eq!(host, "https://hq.example.org");
        assert_eq!(secret, "abc-DEF_123");
    }

    #[test]
    fn hq_address_takes_a_bare_host_or_a_whole_pairing_code() {
        assert_eq!(parse_hq_address("https://hq.example.org/").unwrap(), "https://hq.example.org");
        assert_eq!(parse_hq_address("http://127.0.0.1:47923#secret").unwrap(), "http://127.0.0.1:47923");
        assert_eq!(parse_hq_address("127.0.0.1:47923").unwrap(), "http://127.0.0.1:47923");
        assert_eq!(parse_hq_address("hq.example.org").unwrap(), "https://hq.example.org");
        assert!(parse_hq_address("ftp://x").is_err());
    }

    #[test]
    fn malformed_codes_are_rejected() {
        for bad in ["", "no-hash-here", "#secretonly", "https://hq.example.org#", "ftp://hq.example.org#s", "hq.example.org#s"] {
            assert!(matches!(parse_pairing_code(bad), Err(PairError::Malformed)), "should reject {bad:?}");
        }
    }
}
