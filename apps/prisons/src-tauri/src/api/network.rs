//! `/api/network/v1/**`: the inter-installation surface, on its own router
//! and its own listener. It is the only API that is ever pointed at a tunnel,
//! VPN ingress or wider network, and it exposes none of the facility or
//! Head Office domain (docs/prisons/product-map/04 I.3, "Two listeners").
//!
//! Uniform failure contract (spec 0001 AC-4): every failure is HTTP 401 with
//! `{"error":"invalid"}`, whether the problem is a wrong secret, an unknown
//! facility, a revoked one, or a rate limit. The acting facility is always
//! resolved server side from the credential, never from the request body.

use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

use axum::extract::{ConnectInfo, DefaultBodyLimit, Query, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::middleware::{from_fn, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::domain::connection::{self, ConnectionOutcome, ConnectionRequestInput, ConnectionStatus, FacilityLookup, RosterEntry};
use crate::domain::facilities::{self, hash_secret, RegisterFacilityInput, RegisterPeerResult};
use crate::domain::prisoners::Prisoner;
use crate::domain::sync;
use crate::node::NodeRef;

pub const PORT: u16 = 47923;
const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;
const RATE_LIMIT_PER_CLIENT: usize = 10;
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(60);

#[derive(Serialize)]
struct Invalid {
    error: &'static str,
}

type NetError = (StatusCode, Json<Invalid>);

fn invalid() -> NetError {
    (StatusCode::UNAUTHORIZED, Json(Invalid { error: "invalid" }))
}

#[derive(Clone)]
struct ClientKey(String);

/// The real client behind Cloudflare's tunnel: it forwards the connecting
/// peer in `CF-Connecting-IP` (or `X-Forwarded-For`); the socket address is
/// only the local tunnel process. Only trustworthy because this listener is
/// bound to loopback and reached solely through that tunnel.
fn client_ip(headers: &HeaderMap, socket: Option<SocketAddr>) -> String {
    for key in ["cf-connecting-ip", "x-forwarded-for"] {
        if let Some(value) = headers.get(key).and_then(|v| v.to_str().ok()) {
            if let Ok(ip) = value.split(',').next().unwrap_or("").trim().parse::<IpAddr>() {
                return ip.to_string();
            }
        }
    }
    socket.map(|s| s.ip().to_string()).unwrap_or_else(|| "unknown".to_string())
}

async fn client_key(mut req: Request, next: Next) -> Response {
    let socket = req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0);
    let key = client_ip(req.headers(), socket);
    req.extensions_mut().insert(ClientKey(key));
    next.run(req).await
}

pub fn router(node: NodeRef) -> Router {
    Router::new()
        .route("/api/network/v1/health", get(health))
        .route("/api/network/v1/pairing/register", post(register_peer))
        .route("/api/network/v1/legacy/snapshot", post(legacy_snapshot))
        .route("/api/network/v1/facilities/lookup", get(lookup_facility))
        .route("/api/network/v1/connection/request", post(connection_request))
        .route("/api/network/v1/connection/status", post(connection_status))
        .route("/api/network/v1/roster", post(roster))
        .route("/api/network/v1/policy", get(policy))
        .layer(from_fn(client_key))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .with_state(node)
}

async fn health() -> Json<Value> {
    Json(serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPeerBody {
    pairing_secret: String,
    name: String,
    facility_number: String,
    location: String,
    region: String,
    head_officer_name: String,
}

async fn register_peer(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    Json(body): Json<RegisterPeerBody>,
) -> Result<Json<RegisterPeerResult>, NetError> {
    if !node.limiter.check(&format!("net:{}", client.0), RATE_LIMIT_PER_CLIENT, RATE_LIMIT_WINDOW) {
        return Err(invalid());
    }
    let input = RegisterFacilityInput {
        name: body.name,
        facility_number: body.facility_number,
        location: body.location,
        region: body.region,
        head_officer_name: body.head_officer_name,
    };
    facilities::register_peer(&node.pool, &body.pairing_secret, input).await.map(Json).map_err(|_| invalid())
}

async fn legacy_snapshot(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, NetError> {
    if !node.limiter.check(&format!("net:{}", client.0), RATE_LIMIT_PER_CLIENT, RATE_LIMIT_WINDOW) {
        return Err(invalid());
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|v| v.to_string())
        .ok_or_else(invalid)?;
    let roster: Vec<Prisoner> = serde_json::from_slice(&body).map_err(|_| invalid())?;
    sync::resolve_facility_and_ingest(&node.pool, &token, roster).await.map(Json).map_err(|_| invalid())
}

async fn policy(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    headers: HeaderMap,
    Query(report): Query<crate::domain::policy_sync::PolicyReport>,
) -> Result<Json<crate::domain::policy_sync::PolicyPayload>, NetError> {
    if !node.limiter.check(&format!("net:{}", client.0), RATE_LIMIT_PER_CLIENT, RATE_LIMIT_WINDOW) {
        return Err(invalid());
    }
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .ok_or_else(invalid)?;
    match crate::domain::policy_sync::serve_policy(&node.pool, token, report).await {
        Ok(Some(payload)) => Ok(Json(payload)),
        _ => Err(invalid()),
    }
}

fn bearer_token(headers: &HeaderMap) -> Result<String, NetError> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|v| v.to_string())
        .ok_or_else(invalid)
}

/// Polling and lookups are chattier than registration, so they get their own
/// allowance rather than sharing the registration one.
fn allowed(node: &NodeRef, client: &ClientKey, bucket: &str, limit: usize) -> Result<(), NetError> {
    if node.limiter.check(&format!("net-{bucket}:{}", client.0), limit, RATE_LIMIT_WINDOW) {
        Ok(())
    } else {
        Err(invalid())
    }
}

#[derive(Deserialize)]
struct LookupQuery {
    number: String,
}

async fn lookup_facility(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    Query(query): Query<LookupQuery>,
) -> Result<Json<FacilityLookup>, NetError> {
    allowed(&node, &client, "lookup", 30)?;
    connection::lookup(&node.pool, &query.number).await.ok().flatten().map(Json).ok_or_else(invalid)
}

async fn connection_request(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    Json(body): Json<ConnectionRequestInput>,
) -> Result<Json<ConnectionOutcome>, NetError> {
    allowed(&node, &client, "request", 10)?;
    connection::request_connection(&node.pool, body, &client.0).await.map(Json).map_err(|_| invalid())
}

async fn connection_status(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    headers: HeaderMap,
) -> Result<Json<ConnectionStatus>, NetError> {
    allowed(&node, &client, "status", 60)?;
    let token = bearer_token(&headers)?;
    connection::request_status(&node.pool, &hash_secret(&token)).await.ok().flatten().map(Json).ok_or_else(invalid)
}

#[derive(Deserialize)]
struct RosterBody {
    officers: Vec<RosterEntry>,
}

async fn roster(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    headers: HeaderMap,
    Json(body): Json<RosterBody>,
) -> Result<Json<Value>, NetError> {
    allowed(&node, &client, "roster", 20)?;
    let token = bearer_token(&headers)?;
    let count = connection::ingest_roster(&node.pool, &token, body.officers).await.map_err(|_| invalid())?;
    Ok(Json(serde_json::json!({ "count": count })))
}

/// Whether something is accepting connections on the network listener's port
/// right now. Used by Head Office's own status panel.
pub async fn is_listening() -> bool {
    tokio::time::timeout(Duration::from_millis(400), tokio::net::TcpStream::connect(("127.0.0.1", PORT))).await.map(|r| r.is_ok()).unwrap_or(false)
}

/// Supervises the network listener. A facility never listens; only a Head
/// Office does, and it starts listening the moment the installation becomes
/// Head Office, without needing a restart. Debug builds always listen so the
/// single-machine development loop can exercise the real protocol.
pub async fn supervise(node: NodeRef) {
    let mut running = false;
    loop {
        let should_listen = cfg!(debug_assertions) || crate::domain::session::is_head_office(&node.pool).await;
        if should_listen && !running {
            match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
                Ok(listener) => {
                    running = true;
                    let app = router(node.clone());
                    tokio::spawn(async move {
                        if let Err(e) = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await {
                            log::warn!("network listener stopped: {e}");
                        }
                    });
                    log::info!("network listener on 127.0.0.1:{PORT}");
                }
                Err(e) => log::warn!("network listener could not bind 127.0.0.1:{PORT}: {e}"),
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
