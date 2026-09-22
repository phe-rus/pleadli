//! What a Command (HQ) answers to stations over the network. Nothing here is a
//! signed-in call: the station number, an activation code and the station's
//! sync token are the credentials, and every refusal says only that the
//! connection was not accepted. The listener runs only while this installation
//! is a Command.

use std::net::SocketAddr;
use std::time::Duration;

use axum::extract::{ConnectInfo, Path, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use sqlx::SqlitePool;

use crate::api::session::domain_error;
use crate::domain::command::{self, ConnectInput, ConnectOutcome, ReportInput, StationLookup};
use crate::domain::installation;

pub const PORT: u16 = 47822;

type ApiError = (StatusCode, String);

#[derive(Deserialize)]
struct LookupQuery {
    number: String,
}

async fn lookup(State(pool): State<SqlitePool>, Query(query): Query<LookupQuery>) -> Result<Json<StationLookup>, ApiError> {
    match command::lookup(&pool, &query.number).await {
        Ok(Some(found)) => Ok(Json(found)),
        Ok(None) => Err((StatusCode::UNAUTHORIZED, command::NOT_ACCEPTED.to_string())),
        Err(e) => Err(domain_error(e.into())),
    }
}

async fn connect(State(pool): State<SqlitePool>, ConnectInfo(from): ConnectInfo<SocketAddr>, Json(input): Json<ConnectInput>) -> Result<Json<ConnectOutcome>, ApiError> {
    command::request_connection(&pool, input, &from.ip().to_string()).await.map(Json).map_err(domain_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatusQuery {
    token_hash: String,
}

async fn status(State(pool): State<SqlitePool>, Path(id): Path<String>, Query(query): Query<StatusQuery>) -> Result<Json<serde_json::Value>, ApiError> {
    let status = command::request_status(&pool, &id, &query.token_hash).await.map_err(domain_error)?;
    Ok(Json(serde_json::json!({ "status": status })))
}

async fn report(State(pool): State<SqlitePool>, headers: HeaderMap, Json(input): Json<ReportInput>) -> Result<StatusCode, ApiError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(str::trim)
        .unwrap_or_default()
        .to_string();
    command::receive_report(&pool, &token, input).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn router(pool: SqlitePool) -> Router {
    Router::new()
        .route("/api/hq/link/lookup", get(lookup))
        .route("/api/hq/link/connect", post(connect))
        .route("/api/hq/link/connect/{id}", get(status))
        .route("/api/hq/link/report", post(report))
        .with_state(pool)
}

/// Waits until this installation is a Command, then serves stations on every
/// interface. Without TLS for now: the security stage adds a pinned key, and
/// until then a command belongs on a network the command controls.
pub async fn run(pool: SqlitePool) {
    loop {
        if matches!(installation::mode(&pool).await, Ok(Some(mode)) if mode == "command") {
            match tokio::net::TcpListener::bind(("0.0.0.0", PORT)).await {
                Ok(listener) => {
                    log::info!("command listener on port {PORT}");
                    let app = router(pool.clone()).into_make_service_with_connect_info::<SocketAddr>();
                    if let Err(e) = axum::serve(listener, app).await {
                        log::warn!("command listener stopped: {e}");
                    }
                    return;
                }
                Err(e) => log::warn!("could not open the command listener on port {PORT}: {e}"),
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
