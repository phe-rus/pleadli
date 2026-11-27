//! The station's exchange with a DPP office, over the local API: set up the
//! station's identity, answer an invitation, import what the office sends back,
//! and seal a referral. Files travel as base64 so the same calls serve saving a
//! file by hand and handing it to the postbox.

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use base64::Engine;
use serde::{Deserialize, Serialize};

use super::session::domain_error;
use super::{ApiError, AppState};
use crate::domain::exchange::{self, Connection, Imported, Incoming, StationIdentity};
use crate::domain::sessions::Actor;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;

fn admin(actor: &Actor) -> Result<(), ApiError> {
    if actor.role != "admin" {
        return Err((StatusCode::FORBIDDEN, "Only an administrator can change who this station exchanges with.".to_string()));
    }
    Ok(())
}

fn decode(file: &str) -> Result<Vec<u8>, ApiError> {
    B64.decode(file).map_err(|_| (StatusCode::UNPROCESSABLE_ENTITY, "That file could not be read.".to_string()))
}

pub async fn get_identity(State(state): State<AppState>) -> Result<Json<Option<StationIdentity>>, ApiError> {
    exchange::ensure_identity(&state.pool).await.map(Json).map_err(domain_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInput {
    station_name: String,
    jurisdiction: Option<String>,
}

pub async fn create_identity(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(input): Json<IdentityInput>) -> Result<Json<StationIdentity>, ApiError> {
    admin(&actor)?;
    exchange::create_identity(&state.pool, &input.station_name, input.jurisdiction.as_deref()).await.map(Json).map_err(domain_error)
}

pub async fn list_connections(State(state): State<AppState>) -> Result<Json<Vec<Connection>>, ApiError> {
    exchange::list_connections(&state.pool).await.map(Json).map_err(domain_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInput {
    file: String,
    officer_in_charge: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answered {
    connection: Connection,
    file: String,
    name: String,
}

pub async fn accept_invite(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(input): Json<FileInput>) -> Result<Json<Answered>, ApiError> {
    admin(&actor)?;
    let (connection, response) = exchange::accept_invite(&state.pool, &decode(&input.file)?, input.officer_in_charge.as_deref()).await.map_err(domain_error)?;
    Ok(Json(Answered { name: "station-answer.pxpkg".to_string(), file: B64.encode(response), connection }))
}

pub async fn import_package(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(input): Json<FileInput>) -> Result<Json<Imported>, ApiError> {
    admin(&actor)?;
    exchange::import_package(&state.pool, &decode(&input.file)?).await.map(Json).map_err(domain_error)
}

pub async fn list_outgoing(State(state): State<AppState>) -> Result<Json<Vec<exchange::Outgoing>>, ApiError> {
    exchange::list_outgoing(&state.pool).await.map(Json).map_err(domain_error)
}

pub async fn list_incoming(State(state): State<AppState>) -> Result<Json<Vec<Incoming>>, ApiError> {
    exchange::list_incoming(&state.pool).await.map(Json).map_err(domain_error)
}

#[derive(Deserialize)]
pub struct RouteInput {
    #[serde(default)]
    route: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sealed {
    file: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceReportInput {
    pub results: Vec<pleadli_interchange::messages::ServiceResult>,
    pub reported_by: Option<String>,
}

/// Seals the station's report on serving the witnesses a hearing minute named, for the office that sent the minute.
pub async fn export_service_report(State(state): State<AppState>, Path(minute_id): Path<String>, Json(input): Json<ServiceReportInput>) -> Result<Json<Sealed>, ApiError> {
    let (bytes, name) = exchange::export_service_report(&state.pool, &minute_id, input.results, input.reported_by, "file").await.map_err(domain_error)?;
    Ok(Json(Sealed { file: B64.encode(bytes), name }))
}

/// Seals a referral for the office. A referral of a case this officer may not
/// open is refused.
pub async fn export_referral(State(state): State<AppState>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(input): Json<RouteInput>) -> Result<Json<Sealed>, ApiError> {
    let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM referrals WHERE id = ?").bind(&id).fetch_optional(&state.pool).await.map_err(super::internal_error)?;
    if let Some(case_id) = case_id {
        let hidden = crate::domain::cases::hidden_case_ids(&state.pool, &actor).await.map_err(super::internal_error)?;
        if hidden.iter().any(|h| *h == case_id) {
            return Err((StatusCode::FORBIDDEN, "You may not open that case, so you may not send it.".to_string()));
        }
    }
    let route = if input.route == "postbox" { "postbox" } else { "file" };
    let (bytes, name) = exchange::export_referral(&state.pool, &state.vault_root, &id, route).await.map_err(domain_error)?;
    Ok(Json(Sealed { file: B64.encode(bytes), name }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchInput {
    case_id: String,
}

/// Matches a held hearing minute to its case. Any officer who may open that case can do it; a restricted case stays closed.
pub async fn match_incoming(State(state): State<AppState>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(input): Json<MatchInput>) -> Result<StatusCode, ApiError> {
    if !crate::domain::cases::can_open(&state.pool, &input.case_id, &actor).await.map_err(|e| domain_error(e.into()))? {
        return Err((StatusCode::FORBIDDEN, "You may not open that case.".to_string()));
    }
    let who = [actor.rank.clone(), Some(actor.name.clone())].into_iter().flatten().collect::<Vec<_>>().join(" ");
    exchange::match_incoming_to_case(&state.pool, &id, &input.case_id, &who).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}
