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
    /// The certificate fingerprint a person confirmed for a local-network address.
    #[serde(default)]
    pub hq_fingerprint: Option<String>,
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
    /// The address is on a local network, so its certificate must be confirmed by
    /// a person and pinned before anything is sent to it.
    Untrusted,
    /// Something answered, but it is not a Pleadli Prisons Head Office.
    NotHeadOffice,
    Db(sqlx::Error),
}

impl From<sqlx::Error> for PairError {
    fn from(e: sqlx::Error) -> Self {
        PairError::Db(e)
    }
}

impl From<super::secrets::SecretError> for PairError {
    fn from(e: super::secrets::SecretError) -> Self {
        PairError::Db(e.into())
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
    let fingerprint = pin_for(&host, input.hq_fingerprint.as_deref())?;

    let client = client_for(fingerprint.as_deref(), 20)?;
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
        .map_err(net_err)?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(PairError::Rejected);
    }
    if !response.status().is_success() {
        return Err(PairError::Unreachable(format!("Head Office responded {}", response.status())));
    }
    let registered: RegisterResponse = response.json().await.map_err(|e| PairError::Unreachable(e.to_string()))?;

    let mut tx = crate::db::begin_write(pool).await?;
    facilities::save_peer_credentials(&mut tx, actor, &host, &registered.facility_id, &registered.sync_token).await?;
    sqlx::query("UPDATE peer_sync_config SET hq_fingerprint = ? WHERE id = 'default'").bind(&fingerprint).execute(&mut *tx).await?;
    tx.commit().await?;

    Ok(PairResult { facility_id: registered.facility_id })
}

/// 100.64.0.0/10: carrier-grade NAT, and the range container hosts, VPN meshes
/// and some ISPs use. Not a public address, so it has no public certificate.
fn is_shared_address_space(host: &str) -> bool {
    let mut parts = host.split('.');
    parts.next() == Some("100") && parts.next().and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (64..=127).contains(&n))
}

/// Whether a host is on this machine.
fn is_loopback_host(host: &str) -> bool {
    host == "localhost" || host.starts_with("127.") || host == "[::1]"
}

/// Whether a host is on a private or local network: an address a facility LAN
/// would use, or a `.local` name. Such a host has no public certificate, so it
/// is reached over a pinned one.
pub fn is_private_host(host: &str) -> bool {
    let host = host.trim_start_matches("https://").trim_start_matches("http://");
    let host = host.split(['/', '?']).next().unwrap_or(host);
    let host = if host.starts_with('[') { host.split(']').next().unwrap_or(host) } else { host.split(':').next().unwrap_or(host) };
    host.ends_with(".local")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || is_shared_address_space(host)
        || (host.split('.').next() == Some("172") && host.split('.').nth(1).and_then(|n| n.parse::<u8>().ok()).is_some_and(|n| (16..=31).contains(&n)))
}

/// Accepts an address as typed (`https://hq.example.org`, `192.168.1.20`,
/// `192.168.1.20:47924`, `127.0.0.1:47923`) or a whole pairing code
/// (`host#secret`), and returns the origin.
///
/// Plain HTTP is accepted only for this machine (development, and the tunnel's
/// own origin). A local-network address is always HTTPS, on the LAN port when
/// none is given.
pub fn parse_hq_address(input: &str) -> Result<String, PairError> {
    let text = input.trim();
    let host = text.rfind('#').map(|i| &text[..i]).unwrap_or(text).trim().trim_end_matches('/');
    if host.is_empty() || host.contains(char::is_whitespace) {
        return Err(PairError::Malformed);
    }
    if let Some(rest) = host.strip_prefix("https://") {
        return if rest.is_empty() || rest.contains('/') { Err(PairError::Malformed) } else { Ok(host.to_string()) };
    }
    if let Some(rest) = host.strip_prefix("http://") {
        let bare = rest.split(':').next().unwrap_or(rest);
        return if is_loopback_host(bare) && !rest.contains('/') { Ok(host.to_string()) } else { Err(PairError::Malformed) };
    }
    if host.contains("://") || host.contains('/') {
        return Err(PairError::Malformed);
    }
    let bare = host.split(':').next().unwrap_or(host);
    if is_loopback_host(bare) {
        return Ok(format!("http://{host}"));
    }
    if is_private_host(bare) && !host.contains(':') {
        return Ok(format!("https://{host}:{}", crate::api::network::LAN_PORT));
    }
    Ok(format!("https://{host}"))
}

/// The pin to use for `host`: the one a person confirmed, and required for a
/// local-network address. `None` for an address checked in the ordinary way.
fn pin_for(host: &str, confirmed: Option<&str>) -> Result<Option<String>, PairError> {
    let needs_pin = host.starts_with("https://") && is_private_host(host);
    match confirmed.map(super::tls::normalise_fingerprint).filter(|f| !f.is_empty()) {
        Some(fingerprint) if fingerprint.len() == 64 => Ok(Some(fingerprint)),
        Some(_) => Err(PairError::Malformed),
        None if needs_pin => Err(PairError::Untrusted),
        None => Ok(None),
    }
}

/// A client for one Head Office: pinned to a confirmed certificate when there is
/// one, otherwise an ordinary verifying client.
/// A transport failure with its whole cause chain, so a refused certificate
/// reads as one and not as "error sending request".
fn net_err(e: reqwest::Error) -> PairError {
    let mut text = e.to_string();
    let mut source = std::error::Error::source(&e);
    while let Some(cause) = source {
        text.push_str(": ");
        text.push_str(&cause.to_string());
        source = cause.source();
    }
    PairError::Unreachable(text)
}

fn client_for(fingerprint: Option<&str>, seconds: u64) -> Result<reqwest::Client, PairError> {
    match fingerprint {
        Some(fingerprint) => super::tls::pinned_client(fingerprint, Duration::from_secs(seconds)).map_err(PairError::Unreachable),
        None => client(seconds),
    }
}

fn client(seconds: u64) -> Result<reqwest::Client, PairError> {
    reqwest::Client::builder().timeout(Duration::from_secs(seconds)).build().map_err(|e| PairError::Unreachable(e.to_string()))
}

/// The client for this installation's own Head Office, from what was saved when
/// it connected. Every call the facility makes to Head Office goes through it,
/// so which transport is in use is decided in one place.
pub(crate) async fn hq_client(pool: &SqlitePool, seconds: u64) -> Result<reqwest::Client, String> {
    let fingerprint: Option<String> = sqlx::query_scalar("SELECT hq_fingerprint FROM peer_sync_config WHERE id = 'default'").fetch_one(pool).await.map_err(|e| e.to_string())?;
    client_for(fingerprint.as_deref(), seconds).map_err(|e| match e {
        PairError::Unreachable(reason) => reason,
        _ => "could not prepare the connection".to_string(),
    })
}

/// What answered at an address, and the certificate it presented.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HqIdentity {
    /// The origin that will be used, with the scheme and port made explicit.
    pub address: String,
    pub name: String,
    /// The SHA-256 fingerprint of the certificate the address presented, for a
    /// person to compare with the one Head Office shows. `None` for an address
    /// checked in the ordinary way (a public host).
    pub fingerprint: Option<String>,
}

#[derive(Deserialize)]
struct IdentityBody {
    product: String,
    role: String,
    name: String,
}

/// Connects to `address` to learn who is there, without trusting it and without
/// sending it anything. For a local-network address this is the moment the
/// certificate is seen; the caller shows the fingerprint to a person, and only a
/// confirmed one is ever pinned.
pub async fn probe_identity(address: &str) -> Result<HqIdentity, PairError> {
    let host = parse_hq_address(address)?;
    let needs_pin = host.starts_with("https://") && is_private_host(&host);
    let (probe_client, seen) = if needs_pin {
        let (client, seen) = super::tls::capture_client(Duration::from_secs(8)).map_err(PairError::Unreachable)?;
        (client, Some(seen))
    } else {
        (client(8)?, None)
    };
    let response = probe_client.get(format!("{host}/api/network/v1/identity")).send().await.map_err(net_err)?;
    if !response.status().is_success() {
        return Err(PairError::NotHeadOffice);
    }
    let body: IdentityBody = response.json().await.map_err(|_| PairError::NotHeadOffice)?;
    if body.product != "pleadli-prisons" || body.role != "head_office" {
        return Err(PairError::NotHeadOffice);
    }
    let fingerprint = seen.and_then(|cell| cell.lock().unwrap().clone());
    if needs_pin && fingerprint.is_none() {
        return Err(PairError::Untrusted);
    }
    let name: String = body.name.chars().filter(|c| !c.is_control()).take(80).collect();
    Ok(HqIdentity { address: host, name, fingerprint })
}

/// Looks a facility up on Head Office by its number, for the confirm card.
/// `None` means Head Office answered but does not know it.
pub async fn lookup_facility(hq_address: &str, fingerprint: Option<&str>, number: &str) -> Result<Option<FacilityLookup>, PairError> {
    let host = parse_hq_address(hq_address)?;
    let pin = pin_for(&host, fingerprint)?;
    let response = client_for(pin.as_deref(), 10)?
        .get(format!("{host}/api/network/v1/facilities/lookup"))
        .query(&[("number", number.trim())])
        .send()
        .await
        .map_err(net_err)?;
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
    /// The certificate fingerprint a person confirmed for a local-network address.
    #[serde(default)]
    pub hq_fingerprint: Option<String>,
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
    let pin = pin_for(&host, input.hq_fingerprint.as_deref())?;
    let badge = input.requester_badge.trim().to_string();
    let name = input.requester_name.trim().to_string();
    if badge.is_empty() || name.is_empty() || input.facility_number.trim().is_empty() {
        return Err(PairError::Malformed);
    }

    let token = random_secret(32);
    let response = client_for(pin.as_deref(), 20)?
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
        .map_err(net_err)?;
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
         SET hq_hostname = ?, hq_fingerprint = ?, sync_token = ?, facility_id = ?, connection_state = ?, connection_request_id = ?,
             requested_by_badge = ?, requested_by_name = ?, facility_display_name = ?,
             last_sync_status = NULL, last_error = NULL
         WHERE id = 'default'",
    )
    .bind(&host)
    .bind(&pin)
    .bind(super::secrets::seal(super::secrets::PEER_SYNC_TOKEN, &token)?)
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
    let token = super::secrets::open(super::secrets::PEER_SYNC_TOKEN, &token)?;
    let response = hq_client(pool, 10).await.map_err(PairError::Unreachable)?
        .post(format!("{host}/api/network/v1/connection/status"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(net_err)?;
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
                        last_sync_status = NULL, last_error = NULL, disconnected_at = NULL WHERE id = 'default'",
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
            super::inbox::notify(
                &mut tx,
                super::inbox::Event {
                    kind: "connection",
                    origin: "head_office",
                    source: "Head Office",
                    subject: "Head Office approved this facility",
                    body: Some("The connection is live. Local work is unchanged."),
                    route: Some("/settings?tab=network"),
                    permission: Some(super::authz::perm::NODE_MANAGE),
                },
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

/// Called when Head Office refused this facility's credential. Asks (with the
/// connection token, which Head Office answers only for a token it issued)
/// where the facility stands: `active`, `pending_verification` or `revoked`. A
/// revocation is recorded, so the facility says "revoked" instead of a vague
/// failure. `None` when Head Office could not say.
pub(crate) async fn check_standing(pool: &SqlitePool) -> Option<String> {
    let Ok((Some(host), Some(token), _, Some(_))) = own_connection(pool).await else { return None };
    let token = super::secrets::open(super::secrets::PEER_SYNC_TOKEN, &token).ok()?;
    let client = hq_client(pool, 10).await.ok()?;
    let response = client.post(format!("{host}/api/network/v1/connection/status")).bearer_auth(&token).json(&serde_json::json!({})).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let status = response.json::<ConnectionStatus>().await.ok()?;
    if status.facility_status == "revoked" {
        let message = "Head Office has revoked this facility's connection. Local work is unchanged; ask Head Office to reconnect it.";
        let mut tx = crate::db::begin_write(pool).await.ok()?;
        let _ = sqlx::query("UPDATE peer_sync_config SET connection_state = 'revoked', last_error = ? WHERE id = 'default'").bind(message).execute(&mut *tx).await;
        let _ = audit::record(&mut tx, &Actor::system("network connection"), AuditEntry::new("peer.revoked", "peer_sync_config", Some("default")).reason(message)).await;
        let _ = tx.commit().await;
    }
    Some(status.facility_status)
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
         SET hq_hostname = NULL, hq_fingerprint = NULL, sync_token = NULL, facility_id = NULL, connection_state = NULL, connection_request_id = NULL,
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
    // Anything that changes after this instant stays pending for the next push.
    let started = super::time::now_ms();
    let rows: Vec<(String, String, String, bool, bool)> =
        sqlx::query_as("SELECT badge_number, name, role, is_admin, active FROM officers ORDER BY name")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;
    let officers: Vec<RosterEntry> = rows
        .into_iter()
        .map(|(badge_number, name, role, is_admin, active)| RosterEntry { badge_number, name, role, is_admin, active })
        .collect();
    let response = hq_client(pool, 30)
        .await?
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
    sqlx::query("DELETE FROM sync_outbox WHERE class = 'roster' AND changed_at <= ?").bind(started).execute(pool).await.map_err(|e| e.to_string())?;
    Ok(officers.len())
}

/// Whether Head Office answers its health check right now.
pub async fn hq_reachable(pool: &SqlitePool) -> bool {
    let Ok((Some(host), _, _, _)) = own_connection(pool).await else {
        return false;
    };
    let Ok(client) = hq_client(pool, 5).await else {
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
    fn a_local_network_address_is_always_https_on_the_lan_port() {
        assert_eq!(parse_hq_address("192.168.1.20").unwrap(), "https://192.168.1.20:47924");
        assert_eq!(parse_hq_address("192.168.1.20:50000").unwrap(), "https://192.168.1.20:50000");
        assert_eq!(parse_hq_address("10.0.0.7").unwrap(), "https://10.0.0.7:47924");
        assert_eq!(parse_hq_address("hq.local").unwrap(), "https://hq.local:47924");
        assert_eq!(parse_hq_address("https://192.168.1.20:47924/").unwrap(), "https://192.168.1.20:47924");
        // Plain HTTP over a network is never accepted; only this machine may use it.
        assert!(parse_hq_address("http://192.168.1.20:47923").is_err());
        assert!(parse_hq_address("http://hq.example.org").is_err());
        assert!(parse_hq_address("http://127.0.0.1:47923").is_ok());
    }

    #[test]
    fn a_local_network_address_cannot_be_used_until_its_certificate_is_confirmed() {
        assert!(matches!(pin_for("https://192.168.1.20:47924", None), Err(PairError::Untrusted)));
        assert!(matches!(pin_for("https://192.168.1.20:47924", Some("abcd")), Err(PairError::Malformed)));
        assert_eq!(pin_for("https://192.168.1.20:47924", Some(&"ab".repeat(32))).unwrap().as_deref(), Some("AB".repeat(32).as_str()));
        // A public host is checked in the ordinary way and needs no pin.
        assert_eq!(pin_for("https://hq.example.org", None).unwrap(), None);
        assert_eq!(pin_for("http://127.0.0.1:47923", None).unwrap(), None);
    }

    #[test]
    fn malformed_codes_are_rejected() {
        for bad in ["", "no-hash-here", "#secretonly", "https://hq.example.org#", "ftp://hq.example.org#s", "hq.example.org#s"] {
            assert!(matches!(parse_pairing_code(bad), Err(PairError::Malformed)), "should reject {bad:?}");
        }
    }
}
