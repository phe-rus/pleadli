//! A firm on one network (L6): the office's listener, the device check on it,
//! the forwarding a joined computer does, and the Settings > Network calls.
//!
//! Three routers are built from the one set of routes:
//! - `core`: the routes, each request run in its computer's context
//!   (`domain::request`), so sessions and the audit trail are per computer;
//! - local (`super::router`): `core` behind the terminal forwarder. This is
//!   what the window and the development port use. On a standalone or office
//!   computer the forwarder does nothing;
//! - LAN (`lan_router`): `core` behind the device check, served over TLS by
//!   the office to the computers that have joined it.

use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::{
    body::Body,
    extract::{ConnectInfo, Path, Request, State},
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
    Router,
};
use serde::Deserialize;

use super::{forbidden, require_admin, ApiError, ApiResult, AppState};
use crate::domain::error::DomainError;
use crate::domain::network::{self, JoinInput, NetworkStatus, PairInput, Paired, PairingCode, Probe, LAN_PORT};
use crate::domain::request::{self, Context};
use crate::domain::staff::Protection;
use pleadli_node_core::lan;

pub const DEVICE_HEADER: &str = "x-pleadli-device";

/// The joined computer a LAN request was proven to come from.
#[derive(Clone)]
pub struct DeviceId(pub String);

/// The office's listener and what it needs to refuse guessing.
pub struct Lan {
    pub data_dir: std::path::PathBuf,
    pub fingerprint: Mutex<Option<String>>,
    pub listening: AtomicBool,
    /// Where the office listens: LAN_PORT, or PLEADLI_LAN_PORT for a second
    /// copy on one computer during development, or any port in a test.
    pub port: u16,
    failures: Mutex<(u32, Option<Instant>)>,
}

impl Lan {
    pub fn new(data_dir: std::path::PathBuf) -> Self {
        let fingerprint = lan::load_or_create(&data_dir, network::CERT_NAME).ok().map(|c| c.fingerprint);
        let port = std::env::var("PLEADLI_LAN_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(LAN_PORT);
        Lan { data_dir, fingerprint: Mutex::new(fingerprint), listening: AtomicBool::new(false), port, failures: Mutex::new((0, None)) }
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn with_port(mut self, port: u16) -> Self {
        self.port = port;
        self
    }
}

// ---- Context, device check, forwarding ----------------------------------------

/// Opens the request's context: which computer, and who is acting there.
pub async fn context(State(s): State<AppState>, req: Request, next: Next) -> Response {
    let device = req.extensions().get::<DeviceId>().map(|d| d.0.clone()).unwrap_or_else(|| request::LOCAL.to_string());
    request::scope(Context::new(device, None), async move {
        request::set_actor(s.security.actor());
        next.run(req).await
    })
    .await
}

fn lan_open(path: &str) -> bool {
    path == "/api/network/hello" || path == "/api/network/pair"
}

/// On the office's listener: every request but saying hello and joining must
/// carry the key of a computer that joined and was not removed.
pub async fn device_check(State(s): State<AppState>, mut req: Request, next: Next) -> Response {
    let from = req.extensions().get::<ConnectInfo<SocketAddr>>().map(|c| c.0.ip().to_string());
    if !s.network.is_office() {
        return ApiError(StatusCode::SERVICE_UNAVAILABLE, "NOT_OFFICE", "This computer is not the office computer any more.".into()).into_response();
    }
    let path = req.uri().path().to_string();
    if lan_open(&path) {
        // Over the network with no key: never this computer, nobody acting.
        req.extensions_mut().insert(DeviceId(request::UNPAIRED.to_string()));
        return next.run(req).await;
    }
    let key = req.headers().get(DEVICE_HEADER).and_then(|v| v.to_str().ok()).map(str::to_string);
    let device = match key {
        Some(key) => network::device_for_key(&s.pool, &key, from).await.ok().flatten(),
        None => None,
    };
    let Some(device) = device else {
        return ApiError(StatusCode::UNAUTHORIZED, "DEVICE_UNKNOWN", "This computer is not joined to the office, or was removed. Join it again from Settings.".into()).into_response();
    };
    // What only the office computer itself may do stays there.
    if path.starts_with("/api/network") {
        return forbidden("The office network is managed on the office computer.").into_response();
    }
    req.extensions_mut().insert(DeviceId(device));
    next.run(req).await
}

/// The window's calls on a joined computer, passed to the office. Only this
/// computer's own network settings and status are answered here.
pub async fn forward(State(s): State<AppState>, req: Request, next: Next) -> Response {
    let path = req.uri().path();
    let Some(link) = s.network.link() else { return next.run(req).await };
    if path.starts_with("/api/network") || path == "/api/system/status" {
        return next.run(req).await;
    }
    match pass(&link, req).await {
        Ok(response) => response,
        Err(message) => ApiError(StatusCode::SERVICE_UNAVAILABLE, "OFFICE_UNREACHABLE", message).into_response(),
    }
}

/// One client per office fingerprint, so connections are reused.
static CLIENT: Mutex<Option<(String, reqwest::Client)>> = Mutex::new(None);

fn client_for(fingerprint: &str) -> Result<reqwest::Client, String> {
    let mut cached = CLIENT.lock().unwrap();
    if let Some((fp, client)) = cached.as_ref() {
        if fp == fingerprint {
            return Ok(client.clone());
        }
    }
    let client = lan::pinned_client(fingerprint, Duration::from_secs(60))?;
    *cached = Some((fingerprint.to_string(), client.clone()));
    Ok(client)
}

const UNREACHABLE: &str = "The office computer cannot be reached. Check that it is on, that Pleadli Lawyers is open on it, and that this computer is on the office network.";

async fn pass(link: &network::Link, req: Request) -> Result<Response, String> {
    let client = client_for(&link.fingerprint)?;
    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes()).map_err(|e| e.to_string())?;
    let path = req.uri().path_and_query().map(|p| p.as_str().to_string()).unwrap_or_default();
    let content_type = req.headers().get("content-type").cloned();
    let body = axum::body::to_bytes(req.into_body(), 64 * 1024 * 1024).await.map_err(|e| e.to_string())?;
    let mut outgoing = client.request(method, format!("https://{}{}", link.address, path)).header(DEVICE_HEADER, &link.device_key).body(body);
    if let Some(ct) = content_type.as_ref().and_then(|v| v.to_str().ok()) {
        outgoing = outgoing.header("content-type", ct);
    }
    let answer = outgoing.send().await.map_err(|e| {
        log::warn!("office unreachable: {e:?}");
        if format!("{e:?}").contains("does not match") {
            "The office computer's certificate has changed. Do not continue: ask whoever looks after the office computer.".to_string()
        } else {
            UNREACHABLE.to_string()
        }
    })?;
    let status = StatusCode::from_u16(answer.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let answer_type = answer.headers().get("content-type").and_then(|v| v.to_str().ok()).and_then(|v| HeaderValue::from_str(v).ok());
    let bytes = answer.bytes().await.map_err(|_| UNREACHABLE.to_string())?;
    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = status;
    if let Some(v) = answer_type {
        response.headers_mut().insert("content-type", v);
    }
    Ok(response)
}

// ---- The office's listener -----------------------------------------------------

/// Keeps the LAN listener running exactly while this computer is the office.
pub async fn supervise(state: AppState, core: Router) {
    lan::install_crypto_provider();
    let mut running: Option<(axum_server::Handle<SocketAddr>, tokio::task::JoinHandle<()>)> = None;
    loop {
        let want = state.network.is_office();
        if running.as_ref().is_some_and(|(_, task)| task.is_finished()) {
            running = None;
            state.lan.listening.store(false, Ordering::Relaxed);
        }
        match (running.is_some(), want) {
            (false, true) => match lan::load_or_create(&state.lan.data_dir, network::CERT_NAME) {
                Ok(cert) => {
                    *state.lan.fingerprint.lock().unwrap() = Some(cert.fingerprint.clone());
                    let addr = SocketAddr::from(([0, 0, 0, 0], state.lan.port));
                    let handle = axum_server::Handle::new();
                    let app = core.clone().layer(axum::middleware::from_fn_with_state(state.clone(), device_check));
                    let for_task = handle.clone();
                    let lan_state = state.lan.clone();
                    let task = tokio::spawn(async move {
                        let config = match axum_server::tls_rustls::RustlsConfig::from_pem(cert.cert_pem.into_bytes(), cert.key_pem.into_bytes()).await {
                            Ok(config) => config,
                            Err(e) => {
                                log::error!("office listener: bad certificate: {e}");
                                return;
                            }
                        };
                        lan_state.listening.store(true, Ordering::Relaxed);
                        log::info!("office listener on {addr}");
                        if let Err(e) = axum_server::bind_rustls(addr, config).handle(for_task).serve(app.into_make_service_with_connect_info::<SocketAddr>()).await {
                            log::warn!("office listener on {addr} stopped: {e}");
                        }
                        lan_state.listening.store(false, Ordering::Relaxed);
                    });
                    running = Some((handle, task));
                }
                Err(e) => log::error!("office certificate could not be made: {e}"),
            },
            (true, false) => {
                if let Some((handle, _)) = running.take() {
                    handle.graceful_shutdown(Some(Duration::from_secs(2)));
                }
                state.lan.listening.store(false, Ordering::Relaxed);
            }
            _ => {}
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

// ---- Settings > Network --------------------------------------------------------

fn here_only() -> Result<(), ApiError> {
    if request::device() != request::LOCAL {
        return Err(forbidden("The office network is managed on the office computer."));
    }
    Ok(())
}

pub async fn get_network(State(s): State<AppState>) -> ApiResult<NetworkStatus> {
    here_only()?;
    let fingerprint = s.lan.fingerprint.lock().unwrap().clone();
    let mut status = network::status(&s.pool, fingerprint, s.lan.listening.load(Ordering::Relaxed)).await?;
    if let Some(link) = s.network.link() {
        let reachable = match client_for(&link.fingerprint) {
            Ok(client) => client.get(format!("https://{}/api/network/hello", link.address)).timeout(Duration::from_secs(3)).send().await.is_ok_and(|r| r.status().is_success()),
            Err(_) => false,
        };
        status.reachable = Some(reachable);
    }
    Ok(Json(status))
}

#[derive(Deserialize)]
pub struct OfficeInput {
    on: bool,
}

pub async fn set_office(State(s): State<AppState>, Json(input): Json<OfficeInput>) -> ApiResult<NetworkStatus> {
    here_only()?;
    require_admin(&s)?;
    if input.on && s.security.protection() == Protection::None {
        return Err(DomainError::Invalid("Other computers can join only when everyone signs in. Choose a PIN or a password for each person first (Settings, Security).".into()).into());
    }
    network::set_office(&s.pool, &s.network, input.on).await?;
    get_network(State(s)).await
}

pub async fn pairing_code(State(s): State<AppState>) -> ApiResult<PairingCode> {
    here_only()?;
    let actor = require_admin(&s)?;
    if !s.network.is_office() {
        return Err(DomainError::Invalid("Make this the office computer first.".into()).into());
    }
    Ok(Json(network::new_pairing_code(&s.pool, &actor.name).await?))
}

pub async fn remove_device(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<NetworkStatus> {
    here_only()?;
    let actor = require_admin(&s)?;
    network::revoke(&s.pool, &id, &actor.name).await?;
    s.security.forget_device(&id);
    get_network(State(s)).await
}

/// Open on the office's listener: who answers here.
pub async fn hello(State(s): State<AppState>) -> ApiResult<network::Hello> {
    let office_name: Option<String> = sqlx::query_scalar("SELECT office_name FROM installation WHERE id = 'this'").fetch_optional(&s.pool).await?;
    Ok(Json(network::Hello { product: "pleadli-lawyers".into(), office_name }))
}

/// Open on the office's listener: joining with a code. Wrong codes are slowed
/// down, as wrong PINs are.
pub async fn pair(State(s): State<AppState>, connect: Option<axum::Extension<ConnectInfo<SocketAddr>>>, Json(input): Json<PairInput>) -> ApiResult<Paired> {
    if request::device() != request::UNPAIRED {
        return Err(forbidden("A computer joins the office over the network."));
    }
    {
        let f = s.lan.failures.lock().unwrap();
        if let Some(until) = f.1.filter(|t| *t > Instant::now()) {
            return Err(forbidden(&format!("Too many wrong codes. Try again in {} seconds.", until.saturating_duration_since(Instant::now()).as_secs() + 1)));
        }
    }
    match network::pair(&s.pool, input, connect.map(|c| c.0 .0.ip().to_string())).await {
        Ok(paired) => {
            *s.lan.failures.lock().unwrap() = (0, None);
            Ok(Json(paired))
        }
        Err(e) => {
            let mut f = s.lan.failures.lock().unwrap();
            f.0 += 1;
            if f.0 >= 5 {
                f.1 = Some(Instant::now() + Duration::from_secs(60 * (1 << (f.0 - 5).min(4))));
            }
            Err(e.into())
        }
    }
}

#[derive(Deserialize)]
pub struct ProbeInput {
    address: String,
}

/// On a computer about to join: what answers at the address typed.
pub async fn probe(State(s): State<AppState>, Json(input): Json<ProbeInput>) -> ApiResult<Probe> {
    here_only()?;
    if s.security.is_installed() {
        return Err(DomainError::Invalid("This computer already holds its own practice. A computer that joins an office must be a new installation.".into()).into());
    }
    Ok(Json(network::probe(&input.address).await?))
}

pub async fn join(State(s): State<AppState>, Json(input): Json<JoinInput>) -> ApiResult<NetworkStatus> {
    here_only()?;
    network::join(&s.pool, &s.network, s.security.is_installed(), input).await?;
    get_network(State(s)).await
}

/// A joined computer leaves the office. Whoever is signed in there is signed
/// out on the office first, if it can still be reached.
pub async fn leave(State(s): State<AppState>) -> ApiResult<NetworkStatus> {
    here_only()?;
    if let Some(link) = s.network.link() {
        if let Ok(client) = client_for(&link.fingerprint) {
            let _ = client.post(format!("https://{}/api/session/sign-out", link.address)).header(DEVICE_HEADER, &link.device_key).timeout(Duration::from_secs(3)).send().await;
        }
    }
    network::leave(&s.pool, &s.network).await?;
    get_network(State(s)).await
}
