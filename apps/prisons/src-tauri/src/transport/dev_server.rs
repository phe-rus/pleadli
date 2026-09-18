//! A local-only HTTP server, dev builds only — same pattern as Police's and
//! DPP's own transport/dev_server.rs. Not a real network-facing service:
//! bound to 127.0.0.1, compiled out of release builds entirely.

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};

use crate::domain::attachments::{self, Attachment};
use crate::domain::court_productions::{self, CourtProduction, CreateCourtProductionInput, RemandListEntry};
use crate::domain::prisoners::{self, CreatePrisonerInput, Prisoner, UpdatePrisonerInput};
use crate::domain::releases::{self, CreateReleaseInput, Release};
use crate::domain::search::{self, SearchResult};
use crate::domain::health_events::{self, CreateHealthEventInput, HealthEvent, HospitalisedEntry};
use crate::domain::reports::{self, ReportsSummary};
use crate::domain::programmes::{self, CertifyProgrammeParticipationInput, CreateProgrammeParticipationInput, ProgrammeParticipation};
use crate::domain::property_records::{self, CreatePropertyRecordInput, PropertyRecord, ReturnPropertyRecordInput};
use crate::domain::requests::{self, CreateRequestInput, Request as PrisonRequest, ResolveRequestInput};
use crate::domain::transfers::{self, CreateTransferInput, Transfer};
use crate::domain::visits::{self, CreateVisitInput, Visit};

pub const PORT: u16 = 47922;

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    vault_root: PathBuf,
}

type ApiError = (StatusCode, String);

fn internal_error(err: sqlx::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[derive(Deserialize)]
struct QueryParam {
    #[serde(default)]
    query: String,
}

async fn create_prisoner_handler(State(state): State<AppState>, Json(input): Json<CreatePrisonerInput>) -> Result<Json<Prisoner>, ApiError> {
    prisoners::create_prisoner(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn update_prisoner_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdatePrisonerInput>,
) -> Result<Json<Prisoner>, ApiError> {
    prisoners::update_prisoner(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn list_prisoners_handler(State(state): State<AppState>, Query(params): Query<QueryParam>) -> Result<Json<Vec<Prisoner>>, ApiError> {
    prisoners::list_prisoners(&state.pool, &params.query).await.map(Json).map_err(internal_error)
}

async fn list_in_custody_handler(State(state): State<AppState>) -> Result<Json<Vec<Prisoner>>, ApiError> {
    prisoners::list_in_custody(&state.pool).await.map(Json).map_err(internal_error)
}

async fn get_prisoner_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Option<Prisoner>>, ApiError> {
    prisoners::get_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_release_handler(State(state): State<AppState>, Json(input): Json<CreateReleaseInput>) -> Result<Json<Release>, ApiError> {
    releases::create_release(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_releases_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Release>>, ApiError> {
    releases::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_court_production_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateCourtProductionInput>,
) -> Result<Json<CourtProduction>, ApiError> {
    court_productions::create_court_production(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_court_productions_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<CourtProduction>>, ApiError> {
    court_productions::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn list_remand_handler(State(state): State<AppState>) -> Result<Json<Vec<RemandListEntry>>, ApiError> {
    court_productions::list_remand(&state.pool).await.map(Json).map_err(internal_error)
}

async fn search_handler(State(state): State<AppState>, Query(params): Query<QueryParam>) -> Result<Json<Vec<SearchResult>>, ApiError> {
    search::search(&state.pool, &params.query).await.map(Json).map_err(internal_error)
}

async fn create_visit_handler(State(state): State<AppState>, Json(input): Json<CreateVisitInput>) -> Result<Json<Visit>, ApiError> {
    visits::create_visit(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_visits_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Visit>>, ApiError> {
    visits::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_health_event_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateHealthEventInput>,
) -> Result<Json<HealthEvent>, ApiError> {
    health_events::create_health_event(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_health_events_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<HealthEvent>>, ApiError> {
    health_events::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn list_hospitalised_handler(State(state): State<AppState>) -> Result<Json<Vec<HospitalisedEntry>>, ApiError> {
    health_events::list_hospitalised(&state.pool).await.map(Json).map_err(internal_error)
}

async fn create_transfer_handler(State(state): State<AppState>, Json(input): Json<CreateTransferInput>) -> Result<Json<Transfer>, ApiError> {
    transfers::create_transfer(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_transfers_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Transfer>>, ApiError> {
    transfers::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_programme_participation_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateProgrammeParticipationInput>,
) -> Result<Json<ProgrammeParticipation>, ApiError> {
    programmes::create_participation(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_programme_participations_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<ProgrammeParticipation>>, ApiError> {
    programmes::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn certify_programme_participation_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CertifyProgrammeParticipationInput>,
) -> Result<Json<ProgrammeParticipation>, ApiError> {
    programmes::certify_participation(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn create_property_record_handler(
    State(state): State<AppState>,
    Json(input): Json<CreatePropertyRecordInput>,
) -> Result<Json<PropertyRecord>, ApiError> {
    property_records::create_property_record(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn return_property_record_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ReturnPropertyRecordInput>,
) -> Result<Json<PropertyRecord>, ApiError> {
    property_records::mark_returned(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn list_property_records_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<PropertyRecord>>, ApiError> {
    property_records::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_request_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateRequestInput>,
) -> Result<Json<PrisonRequest>, ApiError> {
    requests::create_request(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn resolve_request_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<ResolveRequestInput>,
) -> Result<Json<PrisonRequest>, ApiError> {
    requests::resolve_request(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn list_requests_handler(State(state): State<AppState>) -> Result<Json<Vec<PrisonRequest>>, ApiError> {
    requests::list_all(&state.pool).await.map(Json).map_err(internal_error)
}

async fn list_requests_for_prisoner_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<PrisonRequest>>, ApiError> {
    requests::list_for_prisoner(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn reports_summary_handler(State(state): State<AppState>) -> Result<Json<ReportsSummary>, ApiError> {
    reports::get_reports_summary(&state.pool).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityQuery {
    entity_type: String,
    entity_id: String,
}

async fn list_attachments_handler(State(state): State<AppState>, Query(params): Query<EntityQuery>) -> Result<Json<Vec<Attachment>>, ApiError> {
    attachments::list_attachments(&state.pool, &params.entity_type, &params.entity_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_attachment_handler(State(state): State<AppState>, mut multipart: Multipart) -> Result<Json<Attachment>, ApiError> {
    let mut entity_type = String::new();
    let mut entity_id = String::new();
    let mut file_name = "attachment".to_string();
    let mut bytes = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
        match field.name().unwrap_or("").to_string().as_str() {
            "entityType" => entity_type = field.text().await.unwrap_or_default(),
            "entityId" => entity_id = field.text().await.unwrap_or_default(),
            "file" => {
                file_name = field.file_name().unwrap_or("attachment").to_string();
                bytes = field.bytes().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?.to_vec();
            }
            _ => {}
        }
    }

    attachments::add_attachment_bytes(&state.pool, &state.vault_root, &entity_type, &entity_id, &file_name, &bytes)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn delete_attachment_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    attachments::delete_attachment(&state.pool, &id).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_attachment_file_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Response, ApiError> {
    let attachment = attachments::get_attachment(&state.pool, &id)
        .await
        .map_err(internal_error)?
        .ok_or((StatusCode::NOT_FOUND, "attachment not found".to_string()))?;

    let bytes = tokio::fs::read(&attachment.stored_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, attachment.mime_type)
        .header(header::CONTENT_DISPOSITION, format!("inline; filename=\"{}\"", attachment.file_name))
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

pub async fn serve(pool: SqlitePool, vault_root: PathBuf) {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/prisoners", post(create_prisoner_handler).get(list_prisoners_handler))
        .route("/prisoners/in-custody", get(list_in_custody_handler))
        .route("/prisoners/{id}", get(get_prisoner_handler).put(update_prisoner_handler))
        .route("/prisoners/{id}/releases", get(list_releases_handler))
        .route("/releases", post(create_release_handler))
        .route("/prisoners/{id}/court-productions", get(list_court_productions_handler))
        .route("/court-productions", post(create_court_production_handler))
        .route("/remand", get(list_remand_handler))
        .route("/search", get(search_handler))
        .route("/visits", post(create_visit_handler))
        .route("/prisoners/{id}/visits", get(list_visits_handler))
        .route("/health-events", post(create_health_event_handler))
        .route("/prisoners/{id}/health-events", get(list_health_events_handler))
        .route("/hospitalised", get(list_hospitalised_handler))
        .route("/transfers", post(create_transfer_handler))
        .route("/prisoners/{id}/transfers", get(list_transfers_handler))
        .route("/programme-participations", post(create_programme_participation_handler))
        .route("/programme-participations/{id}/certify", axum::routing::put(certify_programme_participation_handler))
        .route("/prisoners/{id}/programme-participations", get(list_programme_participations_handler))
        .route("/property-records", post(create_property_record_handler))
        .route("/property-records/{id}/return", axum::routing::put(return_property_record_handler))
        .route("/prisoners/{id}/property-records", get(list_property_records_handler))
        .route("/requests", post(create_request_handler).get(list_requests_handler))
        .route("/requests/{id}/resolve", axum::routing::put(resolve_request_handler))
        .route("/prisoners/{id}/requests", get(list_requests_for_prisoner_handler))
        .route("/reports/summary", get(reports_summary_handler))
        .route("/attachments", post(create_attachment_handler).get(list_attachments_handler))
        .route("/attachments/{id}", axum::routing::delete(delete_attachment_handler))
        .route("/attachments/{id}/file", get(get_attachment_file_handler))
        .layer(cors)
        .with_state(AppState { pool, vault_root });

    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::warn!("dev server could not bind to 127.0.0.1:{PORT}: {e}");
            return;
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        log::warn!("dev server stopped: {e}");
    }
}
