//! The signed-in side of the command and of the station's link to it: the
//! Stations page of a Command (register, activation codes, approvals, what
//! stations reported) and, on a station, the connection settings. Everything
//! that changes something needs an administrator (see `session::admin_only`).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use serde_json::Value;

use super::session::domain_error;
use super::{ApiError, AppState};
use crate::domain::command::{self, ActivationCode, Overview, PendingRequest, RegisterStationInput, Station, StationView};
use crate::domain::command_link::{self, ConnectInput, Link};
use crate::domain::sessions::Actor;

fn db(e: sqlx::Error) -> ApiError {
    domain_error(e.into())
}

pub async fn list_stations(State(state): State<AppState>) -> Result<Json<Vec<StationView>>, ApiError> {
    command::list_stations(&state.pool).await.map(Json).map_err(db)
}

pub async fn register_station(State(state): State<AppState>, Json(input): Json<RegisterStationInput>) -> Result<Json<Station>, ApiError> {
    command::register_station(&state.pool, input).await.map(Json).map_err(domain_error)
}

pub async fn issue_code(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<ActivationCode>, ApiError> {
    command::issue_activation_code(&state.pool, &id).await.map(Json).map_err(domain_error)
}

pub async fn revoke(State(state): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    command::revoke_station(&state.pool, &id).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn roster(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Value>>, ApiError> {
    command::station_roster(&state.pool, &id).await.map(Json).map_err(db)
}

pub async fn pending_requests(State(state): State<AppState>) -> Result<Json<Vec<PendingRequest>>, ApiError> {
    command::pending_requests(&state.pool).await.map(Json).map_err(db)
}

pub async fn approve(State(state): State<AppState>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    command::decide(&state.pool, &actor, &id, true).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn reject(State(state): State<AppState>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    command::decide(&state.pool, &actor, &id, false).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn overview(State(state): State<AppState>) -> Result<Json<Overview>, ApiError> {
    command::overview(&state.pool).await.map(Json).map_err(db)
}

// ---- A station's own link to its command.

pub async fn get_link(State(state): State<AppState>) -> Result<Json<Option<Link>>, ApiError> {
    command_link::get(&state.pool).await.map(Json).map_err(db)
}

pub async fn connect(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(input): Json<ConnectInput>) -> Result<Json<Link>, ApiError> {
    command_link::connect(&state.pool, &actor, input).await.map(Json).map_err(domain_error)
}

pub async fn disconnect(State(state): State<AppState>) -> Result<StatusCode, ApiError> {
    command_link::disconnect(&state.pool).await.map_err(db)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Serialize)]
pub struct Listener {
    pub address: Option<String>,
    pub port: u16,
}

/// Where stations reach this command: this machine's address on the network and
/// the command's port, for the station's Settings.
pub async fn listener() -> Json<Listener> {
    Json(Listener { address: local_ip_address::local_ip().ok().map(|ip| ip.to_string()), port: crate::transport::command_server::PORT })
}
