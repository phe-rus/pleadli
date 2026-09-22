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
use crate::domain::exchange::{self, Kind, Taken};
use crate::domain::facilities::{self, hash_secret, RegisterFacilityInput, RegisterPeerResult};
use crate::node::NodeRef;

/// The loopback listener: plain HTTP, the origin the Cloudflare tunnel points at.
pub const PORT: u16 = 47923;
/// The local-network listener: TLS with the node's own pinned certificate, for
/// facilities on the same network as this Head Office.
pub const LAN_PORT: u16 = 47924;
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

/// A domain failure that may be the database rather than the caller.
trait Failure {
    fn database(&self) -> Option<&sqlx::Error>;
}

impl Failure for facilities::RegisterPeerError {
    fn database(&self) -> Option<&sqlx::Error> {
        if let Self::Db(e) = self { Some(e) } else { None }
    }
}

impl Failure for connection::ConnectionError {
    fn database(&self) -> Option<&sqlx::Error> {
        if let Self::Db(e) = self { Some(e) } else { None }
    }
}

impl Failure for exchange::IngestError {
    fn database(&self) -> Option<&sqlx::Error> {
        if let Self::Db(e) = self { Some(e) } else { None }
    }
}

/// The wire answer stays the uniform 401, but a database failure is not a bad
/// credential: log it so a broken node is not invisible behind "invalid".
fn refuse<E: Failure>(route: &'static str) -> impl FnOnce(E) -> NetError {
    move |e| {
        if let Some(db) = e.database() {
            log::error!("network {route}: database failure behind a 401: {db}");
        }
        invalid()
    }
}

#[derive(Clone)]
struct ClientKey(String);

/// Which listener a request came in on. It decides two things: whether the
/// forwarded-address headers can be believed, and how the event is recorded.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum NetIngress {
    /// The loopback listener, reached only through the tunnel process.
    Loopback,
    /// The local-network listener, reached directly by whoever is on the network.
    Lan,
}

impl NetIngress {
    fn via(self) -> &'static str {
        match self {
            NetIngress::Lan => "lan",
            NetIngress::Loopback if cfg!(debug_assertions) => "unknown",
            NetIngress::Loopback => "tunnel",
        }
    }
}

/// The real client. Behind Cloudflare's tunnel the socket address is only the
/// local tunnel process, so the address it forwards is used, and that is only
/// trustworthy because that listener is bound to loopback and reached solely
/// through the tunnel. On the local-network listener anyone can send any header,
/// so only the socket's own address counts.
fn client_ip(headers: &HeaderMap, socket: Option<SocketAddr>, ingress: NetIngress) -> String {
    if ingress == NetIngress::Loopback {
        for key in ["cf-connecting-ip", "x-forwarded-for"] {
            if let Some(value) = headers.get(key).and_then(|v| v.to_str().ok()) {
                if let Ok(ip) = value.split(',').next().unwrap_or("").trim().parse::<IpAddr>() {
                    return ip.to_string();
                }
            }
        }
    }
    socket.map(|s| s.ip().to_string()).unwrap_or_else(|| "unknown".to_string())
}

async fn client_key(mut req: Request, next: Next) -> Response {
    let socket = req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0);
    let ingress = req.extensions().get::<NetIngress>().copied().unwrap_or(NetIngress::Loopback);
    let key = client_ip(req.headers(), socket, ingress);
    req.extensions_mut().insert(ClientKey(key));
    next.run(req).await
}

fn via_of(ingress: &Option<Extension<NetIngress>>) -> &'static str {
    ingress.as_ref().map(|Extension(i)| *i).unwrap_or(NetIngress::Loopback).via()
}

/// Records what a facility did, attributed by its token, whether or not it was
/// taken. A token nobody holds is not attributable and is not recorded.
async fn observe(node: &NodeRef, headers: &HeaderMap, kind: Kind, via: &str, result: Taken, detail: Option<&str>) {
    let Ok(token) = bearer_token(headers) else { return };
    if let Some(facility) = exchange::facility_for_token(&node.pool, &token).await {
        exchange::record_event(&node.pool, &facility, kind, result, detail, via).await;
    }
}

/// How a handler's answer reads as an event: taken, a repeat, or refused.
fn taken_of(answer: &Result<Json<Value>, NetError>) -> (Taken, Option<&'static str>) {
    match answer {
        Err(_) => (Taken::Refused, Some("Head Office did not accept this from the facility.")),
        Ok(Json(body)) if body.get("status").and_then(Value::as_str) == Some("pending_verification") => (Taken::Refused, Some("The facility is not yet verified.")),
        Ok(Json(body)) if body.get("alreadyApplied").and_then(Value::as_bool) == Some(true) => (Taken::Duplicate, Some("Already held.")),
        Ok(_) => (Taken::Accepted, None),
    }
}

pub fn router(node: NodeRef) -> Router {
    Router::new()
        .route("/api/network/v1/health", get(health))
        .route("/api/network/v1/identity", get(identity))
        .route("/api/network/v1/pairing/register", post(register_peer))
        .route("/api/network/v1/facilities/lookup", get(lookup_facility))
        .route("/api/network/v1/connection/request", post(connection_request))
        .route("/api/network/v1/connection/status", post(connection_status))
        .route("/api/network/v1/roster", post(roster))
        .route("/api/network/v1/policy", get(policy))
        .route("/api/network/v1/returns", post(receive_return))
        .route("/api/network/v1/status", post(receive_status))
        .layer(from_fn(client_key))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .with_state(node)
}

async fn health() -> Json<Value> {
    Json(serde_json::json!({ "ok": true }))
}

/// Who this is, for a facility deciding whether it is talking to Head Office.
/// Says nothing that connecting to the port would not: the product, the role and
/// a display name. The certificate a facility pins is read from the handshake,
/// never from this answer.
async fn identity() -> Json<Value> {
    Json(serde_json::json!({ "product": "pleadli-prisons", "role": "head_office", "name": "Head Office", "apiLevel": super::system::API_LEVEL }))
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
    facilities::register_peer(&node.pool, &body.pairing_secret, input).await.map(Json).map_err(refuse("pairing/register"))
}

async fn receive_status(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    ingress: Option<Extension<NetIngress>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, NetError> {
    allowed(&node, &client, "status", RATE_LIMIT_PER_CLIENT)?;
    let token = bearer_token(&headers)?;
    let report: crate::domain::estate::StatusReport = serde_json::from_slice(&body).map_err(|_| invalid())?;
    let answer = crate::domain::estate::receive_status(&node.pool, &token, report).await.map(Json).map_err(refuse("status"));
    let (taken, detail) = taken_of(&answer);
    observe(&node, &headers, Kind::Status, via_of(&ingress), taken, detail).await;
    answer
}

async fn receive_return(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    ingress: Option<Extension<NetIngress>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<Value>, NetError> {
    allowed(&node, &client, "returns", RATE_LIMIT_PER_CLIENT)?;
    let token = bearer_token(&headers)?;
    let package: crate::domain::returns::ReturnPackage = serde_json::from_slice(&body).map_err(|_| invalid())?;
    let answer = crate::domain::returns::receive(&node.pool, &token, package).await.map(Json).map_err(refuse("returns"));
    let (taken, detail) = taken_of(&answer);
    observe(&node, &headers, Kind::Return, via_of(&ingress), taken, detail).await;
    answer
}

async fn policy(
    State(node): State<NodeRef>,
    Extension(client): Extension<ClientKey>,
    ingress: Option<Extension<NetIngress>>,
    headers: HeaderMap,
    Query(report): Query<crate::domain::policy_sync::PolicyReport>,
) -> Result<Json<crate::domain::policy_sync::PolicyPayload>, NetError> {
    if !node.limiter.check(&format!("net:{}", client.0), RATE_LIMIT_PER_CLIENT, RATE_LIMIT_WINDOW) {
        return Err(invalid());
    }
    let token = bearer_token(&headers)?;
    let answer = crate::domain::policy_sync::serve_policy(&node.pool, &token, report).await;
    let (taken, detail) = match &answer {
        Ok(Some(_)) => (Taken::Accepted, None),
        _ => (Taken::Refused, Some("Head Office did not accept this from the facility.")),
    };
    observe(&node, &headers, Kind::Policy, via_of(&ingress), taken, detail).await;
    match answer {
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
    ingress: Option<Extension<NetIngress>>,
    Json(body): Json<ConnectionRequestInput>,
) -> Result<Json<ConnectionOutcome>, NetError> {
    allowed(&node, &client, "request", 10)?;
    let outcome = connection::request_connection(&node.pool, body, &client.0).await.map_err(refuse("connection/request"))?;
    exchange::record_event(&node.pool, &outcome.facility_id, Kind::Connection, Taken::Accepted, Some(&format!("Connection {}.", outcome.status)), via_of(&ingress)).await;
    Ok(Json(outcome))
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
    ingress: Option<Extension<NetIngress>>,
    headers: HeaderMap,
    Json(body): Json<RosterBody>,
) -> Result<Json<Value>, NetError> {
    allowed(&node, &client, "roster", 20)?;
    let token = bearer_token(&headers)?;
    let answer = connection::ingest_roster(&node.pool, &token, body.officers).await.map(|count| Json(serde_json::json!({ "count": count }))).map_err(refuse("roster"));
    let (taken, detail) = taken_of(&answer);
    observe(&node, &headers, Kind::Roster, via_of(&ingress), taken, detail).await;
    answer
}

/// Serves the exchange API over TLS on `addr`, on this node's own certificate,
/// to facilities on the same network. Returns the handle so callers (and tests)
/// can learn the bound address.
pub fn serve_lan(node: NodeRef, cert: crate::domain::tls::NodeCert, addr: SocketAddr) -> (axum_server::Handle<SocketAddr>, tokio::task::JoinHandle<()>) {
    crate::domain::tls::install_crypto_provider();
    let handle = axum_server::Handle::new();
    let for_task = handle.clone();
    let task = tokio::spawn(async move {
        let config = match axum_server::tls_rustls::RustlsConfig::from_pem(cert.cert_pem.into_bytes(), cert.key_pem.into_bytes()).await {
            Ok(config) => config,
            Err(e) => {
                log::error!("network LAN listener: bad certificate: {e}");
                return;
            }
        };
        let app = router(node.clone()).layer(Extension(NetIngress::Lan));
        node.network_lan_listening.store(true, std::sync::atomic::Ordering::Relaxed);
        let result = axum_server::bind_rustls(addr, config).handle(for_task).serve(app.into_make_service_with_connect_info::<SocketAddr>()).await;
        node.network_lan_listening.store(false, std::sync::atomic::Ordering::Relaxed);
        if let Err(e) = result {
            log::warn!("network LAN listener on {addr} stopped: {e}");
        }
    });
    (handle, task)
}

/// Keeps the LAN exchange listener running exactly while this installation is a
/// Head Office that accepts facilities on its local network. A listener that
/// failed to bind is retried, not assumed.
pub async fn supervise_lan(node: NodeRef) {
    let mut running: Option<tokio::task::JoinHandle<()>> = None;
    loop {
        let want = crate::domain::session::is_head_office(&node.pool).await && crate::domain::nodeconfig::network_lan_enabled(&node.pool).await;
        if running.as_ref().is_some_and(|task| task.is_finished()) {
            running = None;
        }
        match (&running, want) {
            (None, true) => match crate::domain::tls::load_or_create(&node.data_dir) {
                Ok(cert) => {
                    let addr = SocketAddr::from(([0, 0, 0, 0], LAN_PORT));
                    let (_, task) = serve_lan(node.clone(), cert, addr);
                    log::info!("network LAN listener starting on {addr}");
                    running = Some(task);
                }
                Err(e) => log::error!("network LAN listener: could not load the node certificate: {e}"),
            },
            (Some(task), false) => {
                task.abort();
                node.network_lan_listening.store(false, std::sync::atomic::Ordering::Relaxed);
                running = None;
            }
            _ => {}
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::authz::Actor;
    use crate::domain::exchange::HqView;
    use crate::domain::{connection, connectivity, facilities, nodeconfig, officers, peer, tls};
    use crate::transport::discovery;

    async fn node(label: &str) -> NodeRef {
        let dir = std::env::temp_dir().join(format!("pleadli-lan-{label}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(4).connect_with(crate::db::connect_options(&dir.join("node.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        crate::node::Node::new(pool, dir.join("vault"), dir)
    }

    /// The Head Office side: a facility row it knows, listening over TLS on every interface.
    async fn head_office() -> (NodeRef, axum_server::Handle<SocketAddr>, tls::NodeCert) {
        let hq = node("hq").await;
        sqlx::query(
            "INSERT INTO facilities (id, name, facility_number, location, region, head_officer_name, status, verification_code_hash, verification_expires_at, verifying_officer_email, sync_token_hash)
             VALUES ('fac-1', 'Luzira Upper', 'F-1', 'Kampala', 'Central', 'OIC', 'pending_verification', 'h', 0, 'a@example.org', 'unset')",
        )
        .execute(&hq.pool)
        .await
        .unwrap();
        let cert = tls::load_or_create(&hq.data_dir).unwrap();
        let (handle, _task) = serve_lan(hq.clone(), cert.clone(), "0.0.0.0:0".parse().unwrap());
        handle.listening().await.expect("the LAN listener binds");
        (hq, handle, cert)
    }

    async fn facility_with_officer() -> NodeRef {
        let f = node("facility").await;
        let mut tx = crate::db::begin_write(&f.pool).await.unwrap();
        officers::create_first_admin(&mut tx, "OIC-1", "Officer in Charge", "correct-horse").await.unwrap();
        tx.commit().await.unwrap();
        f
    }

    fn actor() -> Actor {
        Actor::system("test")
    }

    fn input(address: &str, fingerprint: Option<&str>) -> peer::ConnectFacilityInput {
        peer::ConnectFacilityInput {
            hq_address: address.to_string(),
            facility_number: "F-1".into(),
            requester_badge: "OIC-1".into(),
            requester_name: "Officer in Charge".into(),
            activation_code: None,
            hq_fingerprint: fingerprint.map(str::to_string),
        }
    }

    /// The whole life of a facility's link to Head Office, over TLS on this
    /// machine's real network interface rather than loopback: it is found,
    /// confirmed by fingerprint, approved, exchanges, survives Head Office going
    /// away and coming back, survives a restart, and is refused once revoked.
    #[tokio::test]
    async fn a_facility_pairs_with_head_office_over_the_lan_and_exchanges() {
        let Some(ip) = nodeconfig::private_ipv4_addresses().into_iter().next() else {
            eprintln!("no private network address on this machine: LAN test skipped");
            return;
        };
        let (hq, handle, cert) = head_office().await;
        let port = handle.listening().await.unwrap().port();
        let address = format!("{ip}:{port}");
        let facility = facility_with_officer().await;

        // Discovery only suggests. The responder answers on the LAN interface.
        let (_responder, bound) = discovery::serve_on(hq.clone(), "0.0.0.0:0".parse().unwrap(), port).await.unwrap();
        let found = discovery::probe(&[SocketAddr::new(ip.parse().unwrap(), bound.port())], Duration::from_millis(600)).await;
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].address, address, "the address is where the answer came from");

        // Nothing is sent to an address whose certificate nobody has confirmed.
        assert!(matches!(peer::lookup_facility(&address, None, "F-1").await, Err(peer::PairError::Untrusted)));
        assert!(matches!(peer::connect_facility(&facility.pool, &actor(), input(&address, None)).await, Err(peer::PairError::Untrusted)));

        // The identity probe shows who is there and the certificate it presents.
        let identity = peer::probe_identity(&address).await.unwrap();
        assert_eq!(identity.name, "Head Office");
        assert_eq!(identity.address, format!("https://{address}"));
        let seen = identity.fingerprint.clone().expect("a local address presents a certificate to confirm");
        assert_eq!(tls::normalise_fingerprint(&seen), tls::normalise_fingerprint(&cert.fingerprint), "it is the certificate Head Office itself shows");

        // A different certificate than the one confirmed is never trusted.
        let wrong = "00".repeat(32);
        match peer::lookup_facility(&address, Some(&wrong), "F-1").await {
            Err(peer::PairError::Unreachable(reason)) => assert!(reason.contains("fingerprint"), "{reason}"),
            other => panic!("a certificate that is not the confirmed one must be refused: {other:?}"),
        }
        assert_eq!(peer::lookup_facility(&address, Some(&seen), "F-1").await.unwrap().unwrap().name, "Luzira Upper");

        // The request goes and waits for a Head Office officer.
        let requested = peer::connect_facility(&facility.pool, &actor(), input(&address, Some(&seen))).await.unwrap();
        assert_eq!(requested.state, "pending");
        let waiting = connectivity::status(&facility.pool).await.unwrap();
        assert_eq!((waiting.state.as_str(), waiting.certificate_pinned, waiting.transport.as_str()), ("awaiting_approval", true, "local_network"));

        // Trust is Head Office's to give. Approve, and the facility learns of it.
        let request_id = connection::list_requests(&hq.pool).await.unwrap()[0].id.clone();
        let mut tx = crate::db::begin_write(&hq.pool).await.unwrap();
        connection::decide(&mut tx, &actor(), &request_id, true).await.unwrap();
        tx.commit().await.unwrap();
        peer::refresh_connection(&facility.pool).await.unwrap();
        assert_eq!(connectivity::status(&facility.pool).await.unwrap().state, "paired", "approved, and nothing has been exchanged yet");

        // The first round sends the roster and the status, and Head Office records what it was given.
        let first = connectivity::exchange(&facility.pool, true).await.unwrap();
        assert_eq!(first.status, "ok");
        let linked = connectivity::status(&facility.pool).await.unwrap();
        assert_eq!((linked.state.as_str(), linked.exchange.state.as_str()), ("connected", "completed"));
        assert!(linked.exchange.last_success_at.is_some());
        let events = crate::domain::exchange::list_events(&hq.pool, Some("fac-1"), 20).await.unwrap();
        let kinds: Vec<(&str, &str, &str)> = events.iter().map(|e| (e.kind.as_str(), e.result.as_str(), e.via.as_str())).collect();
        assert!(kinds.contains(&("roster", "accepted", "lan")) && kinds.contains(&("status", "accepted", "lan")), "{kinds:?}");
        let overview = crate::domain::exchange::overview(&hq.pool, 20).await.unwrap();
        assert_eq!(overview.facilities[0].view, HqView::Current);
        assert_eq!(overview.facilities[0].last_via.as_deref(), Some("lan"));
        let roster: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM facility_officers WHERE facility_id = 'fac-1'").fetch_one(&hq.pool).await.unwrap();
        assert_eq!(roster, 1);
        // Head Office holds no prisoner rows for this facility, and was never sent any.
        let prisoners: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners").fetch_one(&hq.pool).await.unwrap();
        assert_eq!(prisoners, 0);

        // Head Office goes away. The facility keeps working, says so honestly, and keeps what is waiting.
        handle.shutdown();
        tokio::time::sleep(Duration::from_millis(400)).await;
        sqlx::query("UPDATE officers SET name = 'Officer in Charge (renamed)' WHERE badge_number = 'OIC-1'").execute(&facility.pool).await.unwrap();
        assert!(connectivity::exchange(&facility.pool, false).await.is_err());
        let offline = connectivity::status(&facility.pool).await.unwrap();
        assert_eq!((offline.state.as_str(), offline.exchange.state.as_str()), ("offline", "offline"));
        assert_eq!(offline.pending.roster, 1, "the change is kept to be sent");
        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at) VALUES ('p1', 'A', 'B', 'warrant', 1)").execute(&facility.pool).await.expect("local work does not need Head Office");

        // A restart forgets nothing: the saved link, the pin and the honest state are all still there.
        let reopened = sqlx::sqlite::SqlitePoolOptions::new().max_connections(2).connect_with(crate::db::connect_options(&facility.data_dir.join("node.db"))).await.unwrap();
        let after_restart = connectivity::status(&reopened).await.unwrap();
        assert_eq!((after_restart.state.as_str(), after_restart.certificate_pinned, after_restart.pending.roster), ("offline", true, 1));
        reopened.close().await;

        // Head Office comes back on the same address. The waiting change goes, and the state recovers.
        let (back, _task) = serve_lan(hq.clone(), cert.clone(), format!("0.0.0.0:{port}").parse().unwrap());
        back.listening().await.expect("the listener binds again");
        let recovered = connectivity::exchange(&facility.pool, false).await.unwrap();
        assert_eq!(recovered.status, "ok");
        let now = connectivity::status(&facility.pool).await.unwrap();
        assert_eq!((now.state.as_str(), now.exchange.state.as_str(), now.pending.roster), ("connected", "completed", 0));
        let name: String = sqlx::query_scalar("SELECT name FROM facility_officers WHERE badge_number = 'OIC-1'").fetch_one(&hq.pool).await.unwrap();
        assert_eq!(name, "Officer in Charge (renamed)");

        // A repeat of the same status is not sent again, so a retry cannot pile up
        // duplicates. (One round first: the facility's own exchange state changed
        // when it recovered, and that change is itself worth reporting once.)
        connectivity::exchange(&facility.pool, false).await.unwrap();
        let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exchange_events WHERE kind = 'status'").fetch_one(&hq.pool).await.unwrap();
        connectivity::exchange(&facility.pool, false).await.unwrap();
        let after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exchange_events WHERE kind = 'status'").fetch_one(&hq.pool).await.unwrap();
        assert_eq!(before, after, "an unchanged status is not resent");

        // Head Office revokes the facility: the link says revoked, and nothing more goes across.
        let mut tx = crate::db::begin_write(&hq.pool).await.unwrap();
        facilities::revoke_facility(&mut tx, &actor(), "fac-1").await.unwrap();
        tx.commit().await.unwrap();
        assert!(connectivity::exchange(&facility.pool, true).await.is_err());
        let revoked = connectivity::status(&facility.pool).await.unwrap();
        assert_eq!(revoked.state, "revoked");
        let refused: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exchange_events WHERE result = 'refused'").fetch_one(&hq.pool).await.unwrap();
        assert!(refused >= 1, "Head Office recorded that it refused a revoked facility");
        assert_eq!(crate::domain::exchange::overview(&hq.pool, 5).await.unwrap().facilities[0].view, HqView::NotActive);
        back.shutdown();
    }

    #[tokio::test]
    async fn the_lan_listener_ignores_forwarded_address_headers() {
        // Behind the tunnel the forwarded address is believed; on the LAN anyone can send it.
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.9".parse().unwrap());
        let socket: SocketAddr = "192.168.1.50:5555".parse().unwrap();
        assert_eq!(client_ip(&headers, Some(socket), NetIngress::Loopback), "203.0.113.9");
        assert_eq!(client_ip(&headers, Some(socket), NetIngress::Lan), "192.168.1.50");
    }

    #[tokio::test]
    async fn the_lan_listener_serves_the_exchange_and_nothing_of_the_domain() {
        let Some(ip) = nodeconfig::private_ipv4_addresses().into_iter().next() else { return };
        let (_hq, handle, cert) = head_office().await;
        let port = handle.listening().await.unwrap().port();
        let client = tls::pinned_client(&cert.fingerprint, Duration::from_secs(5)).unwrap();
        let base = format!("https://{ip}:{port}");
        assert_eq!(client.get(format!("{base}/api/network/v1/health")).send().await.unwrap().status(), 200);
        for path in ["/api/prisons/prisoners", "/api/hq/estate", "/api/auth/session", "/api/system/state"] {
            assert_eq!(client.get(format!("{base}{path}")).send().await.unwrap().status(), 404, "{path} is not on the exchange listener");
        }
        // A wrong pin never completes the handshake.
        let impostor = tls::pinned_client(&"11".repeat(32), Duration::from_secs(5)).unwrap();
        assert!(impostor.get(format!("{base}/api/network/v1/health")).send().await.is_err());
        // Plain HTTP to the TLS port is not answered as HTTP.
        assert!(reqwest::Client::new().get(format!("http://{ip}:{port}/api/network/v1/health")).timeout(Duration::from_secs(3)).send().await.map(|r| r.status().is_success()).unwrap_or(false) == false);
        handle.shutdown();
    }
}
