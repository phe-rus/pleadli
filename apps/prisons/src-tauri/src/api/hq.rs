//! `/api/hq/**`: the Head Office domain. Head Office holds no prisoners of
//! its own, so nothing here operates a facility's records.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::audit::{self, AuditEntry};
use crate::domain::authz::{perm, Actor};
use crate::domain::cloudflare_tunnel::{self, CloudflareConfig, SaveCloudflareConfigInput};
use crate::domain::connection::{self, ConnectionRequest, FacilityOfficer};
use crate::domain::tunnel_connector::ConnectorState;
use crate::domain::facilities::{self, Facility, PairingPayload, RegisterFacilityInput, FACILITY_REGIONS};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/hq/facilities", Need::Perm(HQ_ESTATE_READ), list_facilities)
        .get("/api/hq/estate", Need::Perm(HQ_ESTATE_READ), estate_view)
        .post("/api/hq/facilities", Need::Perm(HQ_NETWORK_MANAGE), create_facility)
        .get("/api/hq/connection-requests", Need::Perm(HQ_NETWORK_MANAGE), list_requests)
        .post("/api/hq/connection-requests/{id}/approve", Need::Perm(HQ_NETWORK_MANAGE), approve_request)
        .post("/api/hq/connection-requests/{id}/reject", Need::Perm(HQ_NETWORK_MANAGE), reject_request)
        .get("/api/hq/facility-officers", Need::Perm(HQ_ESTATE_READ), list_facility_officers)
        .get("/api/hq/network/status", Need::Perm(HQ_NETWORK_MANAGE), network_status)
        .put("/api/hq/network/lan", Need::Perm(HQ_NETWORK_MANAGE), set_lan)
        .get("/api/hq/network/exchanges", Need::Perm(HQ_NETWORK_MANAGE), exchange_overview)
        .post("/api/hq/facilities/pairing-code", Need::Perm(HQ_NETWORK_MANAGE), generate_pairing_code)
        .post("/api/hq/facilities/{id}/verify", Need::Perm(HQ_NETWORK_MANAGE), verify_facility)
        .post("/api/hq/facilities/{id}/resend-code", Need::Perm(HQ_NETWORK_MANAGE), resend_code)
        .post("/api/hq/facilities/{id}/revoke", Need::Perm(HQ_NETWORK_MANAGE), revoke_facility)
        .get("/api/hq/network/cloudflare", Need::Perm(HQ_NETWORK_MANAGE), get_cloudflare)
        .put("/api/hq/network/cloudflare", Need::Perm(HQ_NETWORK_MANAGE), save_cloudflare)
        .post("/api/hq/network/cloudflare/provision", Need::Perm(HQ_NETWORK_MANAGE), provision_tunnel)
}

type Api<T> = Result<Json<T>, ApiError>;

async fn estate_view(State(node): State<NodeRef>) -> Api<crate::domain::estate::Estate> {
    Ok(Json(crate::domain::estate::estate(&node.pool, crate::domain::time::now_ms()).await?))
}

async fn list_facilities(State(node): State<NodeRef>) -> Api<Vec<Facility>> {
    Ok(Json(facilities::list_facilities(&node.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingCodeBody {
    officer_email: String,
}

async fn generate_pairing_code(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(body): Json<PairingCodeBody>,
) -> Api<PairingPayload> {
    if !body.officer_email.contains('@') {
        return Err(ApiError::bad_request("Enter the email address of the officer who will verify this facility."));
    }
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::generate_pairing_code(c, &actor, body.officer_email.trim()).await?) })).await?))
}

#[derive(Deserialize)]
struct VerifyBody {
    code: String,
}

async fn verify_facility(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<VerifyBody>,
) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::verify_facility(c, &actor, &id, body.code.trim()).await?) })).await?))
}

async fn resend_code(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::resend_verification_code(c, &actor, &id).await?) })).await?))
}

async fn revoke_facility(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Facility> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facilities::revoke_facility(c, &actor, &id).await?) })).await?))
}

async fn get_cloudflare(State(node): State<NodeRef>) -> Api<Option<CloudflareConfig>> {
    Ok(Json(cloudflare_tunnel::get_config(&node.pool).await?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TunnelProvisioned {
    hostname: String,
    connector: ConnectorState,
}

/// Creates (or reuses) this Head Office's tunnel from the saved Cloudflare
/// details and points its hostname at the network listener. Safe to run again.
/// The Cloudflare calls happen first and outside any database transaction, so
/// a slow answer never holds the write lock; only the audit entry is written
/// afterwards. Nothing secret is returned.
async fn provision_tunnel(State(node): State<NodeRef>, Extension(actor): Extension<Actor>) -> Api<TunnelProvisioned> {
    let provisioned = cloudflare_tunnel::provision(&node.pool, super::network::PORT).await?;
    let hostname = provisioned.hostname.clone();
    write(&node, |c| {
        Box::pin(async move {
            audit::record(
                c,
                &actor,
                AuditEntry::new("network.cloudflare_tunnel_provisioned", "cloudflare_tunnel", Some("default")).after(&serde_json::json!({ "hostname": hostname })),
            )
            .await?;
            Ok(())
        })
    })
    .await?;
    // Only now does the tunnel carry anything: (re)start the connector with the
    // freshly stored token. A failure here is reported by its state, not as a
    // failed setup, because the tunnel itself exists either way.
    if let Err(e) = node.connector.start_provisioned(&node).await {
        log::warn!("tunnel connector after setup: {e}");
    }
    Ok(Json(TunnelProvisioned { hostname: provisioned.hostname, connector: node.connector.state().await }))
}

async fn save_cloudflare(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<SaveCloudflareConfigInput>,
) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(cloudflare_tunnel::save_config(c, &actor, input).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFacilityBody {
    name: String,
    facility_number: String,
    location: String,
    region: String,
    head_officer_name: String,
}

async fn create_facility(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(body): Json<CreateFacilityBody>,
) -> Api<Facility> {
    if [&body.name, &body.facility_number, &body.location, &body.head_officer_name].iter().any(|v| v.trim().is_empty()) {
        return Err(ApiError::bad_request("Name, facility number, location and head officer are all required."));
    }
    if !FACILITY_REGIONS.contains(&body.region.as_str()) {
        return Err(ApiError::bad_request("Choose one of the Uganda Prisons Service regions."));
    }
    let input = RegisterFacilityInput {
        name: body.name,
        facility_number: body.facility_number,
        location: body.location,
        region: body.region,
        head_officer_name: body.head_officer_name,
    };
    Ok(Json(
        write(&node, |c| {
            Box::pin(async move {
                if facilities::number_taken(c, &input.facility_number).await? {
                    return Err(ApiError::conflict("FACILITY_NUMBER_TAKEN", "A facility with that number is already on the roster."));
                }
                Ok(facilities::create_facility(c, &actor, input).await?)
            })
        })
        .await?,
    ))
}

async fn list_requests(State(node): State<NodeRef>) -> Api<Vec<ConnectionRequest>> {
    Ok(Json(connection::list_requests(&node.pool).await?))
}

async fn approve_request(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<ConnectionRequest> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(connection::decide(c, &actor, &id, true).await?) })).await?))
}

async fn reject_request(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<ConnectionRequest> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(connection::decide(c, &actor, &id, false).await?) })).await?))
}

async fn list_facility_officers(State(node): State<NodeRef>) -> Api<Vec<FacilityOfficer>> {
    Ok(Json(connection::list_facility_officers(&node.pool).await?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalStatus {
    /// The loopback listener the tunnel points at.
    listening: bool,
    address: String,
}

/// Head Office on its own network: what a facility on the same LAN connects to.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LanStatus {
    /// Whether Head Office is set to accept facilities on its local network.
    enabled: bool,
    /// Whether the TLS listener is accepting connections right now.
    listening: bool,
    /// Whether it is answering discovery probes right now.
    discoverable: bool,
    /// The addresses a facility can use, most likely first.
    addresses: Vec<String>,
    /// This Head Office's certificate fingerprint, for a facility's officer to
    /// compare against the one their screen shows before confirming.
    fingerprint: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudflareStatus {
    configured: bool,
    tunnel_provisioned: bool,
    hostname: Option<String>,
    /// Whether the `cloudflared` process that carries the tunnel is running,
    /// stopped, or absent from this build.
    connector: ConnectorState,
    /// `not_configured`, `configured_not_connected` or `connected`. Connected
    /// only when the public hostname answered a health check just now.
    state: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetworkStatus {
    local: LocalStatus,
    lan: LanStatus,
    cloudflare: CloudflareStatus,
    public_base: String,
    pending_requests: i64,
}

async fn network_status(State(node): State<NodeRef>) -> Api<NetworkStatus> {
    let configured = cloudflare_tunnel::get_config(&node.pool).await?.is_some();
    let tunnel = cloudflare_tunnel::get_tunnel_state(&node.pool).await?;
    let hostname = tunnel.map(|t| t.hostname);

    let reachable = match &hostname {
        Some(host) => match reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).build() {
            Ok(client) => client.get(format!("https://{host}/api/network/v1/health")).send().await.map(|r| r.status().is_success()).unwrap_or(false),
            Err(_) => false,
        },
        None => false,
    };
    let state = if reachable {
        "connected"
    } else if configured || hostname.is_some() {
        "configured_not_connected"
    } else {
        "not_configured"
    };

    let public_base = {
        let mut conn = node.pool.acquire().await?;
        facilities::hq_register_base(&mut conn).await
    };
    let lan = LanStatus {
        enabled: crate::domain::nodeconfig::network_lan_enabled(&node.pool).await,
        listening: node.network_lan_listening.load(std::sync::atomic::Ordering::Relaxed),
        discoverable: node.discovery_listening.load(std::sync::atomic::Ordering::Relaxed),
        addresses: crate::domain::nodeconfig::private_ipv4_addresses().into_iter().map(|ip| format!("{ip}:{}", super::network::LAN_PORT)).collect(),
        fingerprint: crate::domain::tls::load_or_create(&node.data_dir).ok().map(|cert| cert.fingerprint),
    };
    Ok(Json(NetworkStatus {
        local: LocalStatus { listening: super::network::is_listening().await, address: format!("127.0.0.1:{}", super::network::PORT) },
        lan,
        cloudflare: CloudflareStatus { configured, tunnel_provisioned: hostname.is_some(), hostname, connector: node.connector.state().await, state },
        public_base,
        pending_requests: connection::pending_count(&node.pool).await?,
    }))
}

#[derive(Deserialize)]
struct LanBody {
    enabled: bool,
}

/// Turns acceptance of facilities on the local network on or off. The listener
/// and the discovery responder follow within a few seconds.
async fn set_lan(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<LanBody>) -> Api<serde_json::Value> {
    write(&node, |c| Box::pin(async move { Ok(crate::domain::nodeconfig::set_network_lan(c, &actor, body.enabled).await?) })).await?;
    Ok(Json(serde_json::json!({ "enabled": body.enabled })))
}

/// What each facility has done to this Head Office and how it reads. Metadata
/// only: which facility, when, what kind, taken or refused.
async fn exchange_overview(State(node): State<NodeRef>) -> Api<crate::domain::exchange::ExchangeOverview> {
    Ok(Json(crate::domain::exchange::overview(&node.pool, 60).await?))
}
