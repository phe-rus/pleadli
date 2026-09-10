//! A local-only HTTP server, dev builds only. Lets the plain browser dev
//! server (which has no Tauri IPC bridge) exercise the same domain logic
//! the desktop app's Tauri commands use — same functions, same database,
//! different transport. Not a real network-facing service: bound to
//! 127.0.0.1, compiled out of release builds entirely.

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};

use crate::domain::attachments::{self, Attachment, VaultEntry};
use crate::domain::bonds::{self, Bond, CreateBondInput};
use crate::domain::cases::{self, Case, CasePerson, CaseWorkspace, CreateCaseInput};
use crate::domain::charge_sheets::{self, ChargeSheet, CreateChargeSheetInput};
use crate::domain::custody::{self, CreateCustodyRecordInput, CustodyRecord};
use crate::domain::duty::{self, CreateDutyAssignmentInput, DutyAssignment};
use crate::domain::exhibits::{self, CreateExhibitInput, CreateExhibitMovementInput, Exhibit, ExhibitMovement};
use crate::domain::incidents::{self, CreateIncidentInput, Incident};
use crate::domain::people::{self, CreatePersonInput, Person, PersonProfile};
use crate::domain::referrals::{self, CreateReferralInput, Referral};
use crate::domain::station_admin::{
    self, CreateStationEstablishmentMemberInput, SaveStationProfileInput, StationEstablishmentMember, StationProfile,
};
use crate::domain::reports::{self, ReportsSummary};
use crate::domain::search::{self, SearchResult};
use crate::domain::statements::{self, CreateStatementInput, Statement};
use crate::domain::station_assets::{self, CreateStationAssetInput, StationAsset};
use crate::domain::station_diary::{self, CreateStationDiaryEntryInput, StationDiaryEntry};

pub const PORT: u16 = 47821;

#[derive(Clone)]
struct AppState {
    pool: SqlitePool,
    vault_root: PathBuf,
}

type ApiError = (StatusCode, String);

fn internal_error(err: sqlx::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

async fn create_person_handler(
    State(state): State<AppState>,
    Json(input): Json<CreatePersonInput>,
) -> Result<Json<Person>, ApiError> {
    people::create_person(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    query: String,
}

async fn search_people_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Person>>, ApiError> {
    people::search_people(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<Person>>, ApiError> {
    people::get_person(&state.pool, &id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_reports_summary_handler(
    State(state): State<AppState>,
) -> Result<Json<ReportsSummary>, ApiError> {
    reports::get_reports_summary(&state.pool)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn search_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    search::search(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_person_profile_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<PersonProfile>>, ApiError> {
    people::get_person_profile(&state.pool, &id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreatePersonInput>,
) -> Result<Json<Person>, ApiError> {
    people::update_person(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_station_diary_entry_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateStationDiaryEntryInput>,
) -> Result<Json<StationDiaryEntry>, ApiError> {
    station_diary::update_entry(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_station_diary_entry_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateStationDiaryEntryInput>,
) -> Result<Json<StationDiaryEntry>, ApiError> {
    station_diary::create_entry(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_station_diary_entries_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<StationDiaryEntry>>, ApiError> {
    station_diary::list_entries(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_incident_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateIncidentInput>,
) -> Result<Json<Incident>, ApiError> {
    incidents::create_incident(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_incident_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateIncidentInput>,
) -> Result<Json<Incident>, ApiError> {
    incidents::update_incident(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_incidents_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Incident>>, ApiError> {
    incidents::list_incidents(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_duty_assignment_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateDutyAssignmentInput>,
) -> Result<Json<DutyAssignment>, ApiError> {
    duty::create_assignment(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_duty_assignment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateDutyAssignmentInput>,
) -> Result<Json<DutyAssignment>, ApiError> {
    duty::update_assignment(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_duty_assignments_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<DutyAssignment>>, ApiError> {
    duty::list_assignments(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_station_asset_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateStationAssetInput>,
) -> Result<Json<StationAsset>, ApiError> {
    station_assets::create_asset(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_station_asset_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateStationAssetInput>,
) -> Result<Json<StationAsset>, ApiError> {
    station_assets::update_asset(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_station_assets_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<StationAsset>>, ApiError> {
    station_assets::list_assets(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_station_profile_handler(
    State(state): State<AppState>,
) -> Result<Json<Option<StationProfile>>, ApiError> {
    station_admin::get_station_profile(&state.pool)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn save_station_profile_handler(
    State(state): State<AppState>,
    Json(input): Json<SaveStationProfileInput>,
) -> Result<Json<StationProfile>, ApiError> {
    station_admin::save_station_profile(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_station_establishment_member_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateStationEstablishmentMemberInput>,
) -> Result<Json<StationEstablishmentMember>, ApiError> {
    station_admin::create_establishment_member(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_station_establishment_member_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateStationEstablishmentMemberInput>,
) -> Result<Json<StationEstablishmentMember>, ApiError> {
    station_admin::update_establishment_member(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_station_establishment_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<StationEstablishmentMember>>, ApiError> {
    station_admin::list_establishment(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_referral_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateReferralInput>,
) -> Result<Json<Referral>, ApiError> {
    referrals::create_referral(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_referral_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateReferralInput>,
) -> Result<Json<Referral>, ApiError> {
    referrals::update_referral(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_referrals_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Referral>>, ApiError> {
    referrals::list_referrals(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_charge_sheet_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateChargeSheetInput>,
) -> Result<Json<ChargeSheet>, ApiError> {
    charge_sheets::create_charge_sheet(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_charge_sheet_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateChargeSheetInput>,
) -> Result<Json<ChargeSheet>, ApiError> {
    charge_sheets::update_charge_sheet(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_charge_sheets_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<ChargeSheet>>, ApiError> {
    charge_sheets::list_charge_sheets(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_exhibit_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateExhibitInput>,
) -> Result<Json<Exhibit>, ApiError> {
    exhibits::create_exhibit(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_exhibit_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateExhibitInput>,
) -> Result<Json<Exhibit>, ApiError> {
    exhibits::update_exhibit(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_exhibits_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Exhibit>>, ApiError> {
    exhibits::list_exhibits(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_exhibit_movement_handler(
    State(state): State<AppState>,
    Path(exhibit_id): Path<String>,
    Json(input): Json<CreateExhibitMovementInput>,
) -> Result<Json<ExhibitMovement>, ApiError> {
    exhibits::create_movement(&state.pool, &exhibit_id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_exhibit_movements_handler(
    State(state): State<AppState>,
    Path(exhibit_id): Path<String>,
) -> Result<Json<Vec<ExhibitMovement>>, ApiError> {
    exhibits::list_movements(&state.pool, &exhibit_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_case_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateCaseInput>,
) -> Result<Json<Case>, ApiError> {
    cases::create_case(&state.pool, &state.vault_root, input).await.map(Json).map_err(internal_error)
}

async fn update_case_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateCaseInput>,
) -> Result<Json<Case>, ApiError> {
    cases::update_case(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_cases_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Case>>, ApiError> {
    cases::list_cases(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_case_people_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<CasePerson>>, ApiError> {
    cases::list_case_people(&state.pool, &id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_case_workspace_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Option<CaseWorkspace>>, ApiError> {
    cases::get_case_workspace(&state.pool, &id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_statement_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateStatementInput>,
) -> Result<Json<Statement>, ApiError> {
    statements::create_statement(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_statement_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateStatementInput>,
) -> Result<Json<Statement>, ApiError> {
    statements::update_statement(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_statements_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Statement>>, ApiError> {
    statements::list_statements(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_custody_record_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateCustodyRecordInput>,
) -> Result<Json<CustodyRecord>, ApiError> {
    custody::create_record(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_custody_record_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateCustodyRecordInput>,
) -> Result<Json<CustodyRecord>, ApiError> {
    custody::update_record(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_custody_records_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<CustodyRecord>>, ApiError> {
    custody::list_records(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn create_bond_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateBondInput>,
) -> Result<Json<Bond>, ApiError> {
    bonds::create_bond(&state.pool, &state.vault_root, input).await.map(Json).map_err(internal_error)
}

async fn update_bond_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateBondInput>,
) -> Result<Json<Bond>, ApiError> {
    bonds::update_bond(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_bonds_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Bond>>, ApiError> {
    bonds::list_bonds(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

// Tauri's IPC bridge auto-converts JS camelCase args to snake_case Rust
// params, but a raw query string gets no such help — without this, the
// browser-only dev fallback (which sends `entityType=`/`entityId=`, same
// as every other camelCase JSON boundary in this app) silently never
// matched these fields.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityQuery {
    entity_type: String,
    entity_id: String,
}

async fn list_attachments_handler(
    State(state): State<AppState>,
    Query(params): Query<EntityQuery>,
) -> Result<Json<Vec<Attachment>>, ApiError> {
    attachments::list_attachments(&state.pool, &params.entity_type, &params.entity_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_all_attachments_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Attachment>>, ApiError> {
    attachments::list_all(&state.pool, &params.query)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn get_attachment_route_handler(
    State(state): State<AppState>,
    Query(params): Query<EntityQuery>,
) -> Result<Json<String>, ApiError> {
    attachments::resolve_entity_route(&state.pool, &params.entity_type, &params.entity_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VaultDirectoryQuery {
    #[serde(default)]
    relative_path: String,
}

async fn list_vault_directory_handler(
    State(state): State<AppState>,
    Query(params): Query<VaultDirectoryQuery>,
) -> Result<Json<Vec<VaultEntry>>, ApiError> {
    attachments::list_vault_directory(&state.pool, &state.vault_root, &params.relative_path)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn create_attachment_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<Attachment>, ApiError> {
    let mut entity_type = String::new();
    let mut entity_id = String::new();
    let mut file_name = "attachment".to_string();
    let mut bytes = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        match field.name().unwrap_or("").to_string().as_str() {
            "entityType" => entity_type = field.text().await.unwrap_or_default(),
            "entityId" => entity_id = field.text().await.unwrap_or_default(),
            "file" => {
                file_name = field.file_name().unwrap_or("attachment").to_string();
                bytes = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .to_vec();
            }
            _ => {}
        }
    }

    attachments::add_attachment_bytes(&state.pool, &state.vault_root, &entity_type, &entity_id, &file_name, &bytes)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn delete_attachment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    attachments::delete_attachment(&state.pool, &id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_attachment_file_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    let attachment = attachments::get_attachment(&state.pool, &id)
        .await
        .map_err(internal_error)?
        .ok_or((StatusCode::NOT_FOUND, "attachment not found".to_string()))?;

    let bytes = tokio::fs::read(&attachment.stored_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, attachment.mime_type)
        .header(
            header::CONTENT_DISPOSITION,
            format!("inline; filename=\"{}\"", attachment.file_name),
        )
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

pub async fn serve(pool: SqlitePool, vault_root: PathBuf) {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/people", post(create_person_handler).get(search_people_handler))
        .route("/people/{id}", get(get_person_handler).put(update_person_handler))
        .route("/people/{id}/profile", get(get_person_profile_handler))
        .route(
            "/station-diary",
            post(create_station_diary_entry_handler).get(list_station_diary_entries_handler),
        )
        .route("/station-diary/{id}", put(update_station_diary_entry_handler))
        .route("/incidents", post(create_incident_handler).get(list_incidents_handler))
        .route("/incidents/{id}", put(update_incident_handler))
        .route("/duty", post(create_duty_assignment_handler).get(list_duty_assignments_handler))
        .route("/duty/{id}", put(update_duty_assignment_handler))
        .route("/station-assets", post(create_station_asset_handler).get(list_station_assets_handler))
        .route("/station-assets/{id}", put(update_station_asset_handler))
        .route("/cases", post(create_case_handler).get(list_cases_handler))
        .route("/cases/{id}", put(update_case_handler))
        .route("/cases/{id}/people", get(list_case_people_handler))
        .route("/cases/{id}/workspace", get(get_case_workspace_handler))
        .route("/statements", post(create_statement_handler).get(list_statements_handler))
        .route("/statements/{id}", put(update_statement_handler))
        .route("/custody", post(create_custody_record_handler).get(list_custody_records_handler))
        .route("/custody/{id}", put(update_custody_record_handler))
        .route("/bonds", post(create_bond_handler).get(list_bonds_handler))
        .route("/bonds/{id}", put(update_bond_handler))
        .route("/station-profile", get(get_station_profile_handler).put(save_station_profile_handler))
        .route(
            "/station-establishment",
            post(create_station_establishment_member_handler).get(list_station_establishment_handler),
        )
        .route("/station-establishment/{id}", put(update_station_establishment_member_handler))
        .route("/referrals", post(create_referral_handler).get(list_referrals_handler))
        .route("/referrals/{id}", put(update_referral_handler))
        .route("/charge-sheets", post(create_charge_sheet_handler).get(list_charge_sheets_handler))
        .route("/charge-sheets/{id}", put(update_charge_sheet_handler))
        .route("/exhibits", post(create_exhibit_handler).get(list_exhibits_handler))
        .route("/exhibits/{id}", put(update_exhibit_handler))
        .route(
            "/exhibits/{id}/movements",
            post(create_exhibit_movement_handler).get(list_exhibit_movements_handler),
        )
        .route("/attachments", post(create_attachment_handler).get(list_attachments_handler))
        .route("/attachments/all", get(list_all_attachments_handler))
        .route("/attachments/route", get(get_attachment_route_handler))
        .route("/vault", get(list_vault_directory_handler))
        .route("/attachments/{id}", delete(delete_attachment_handler))
        .route("/attachments/{id}/file", get(get_attachment_file_handler))
        .route("/search", get(search_handler))
        .route("/reports/summary", get(get_reports_summary_handler))
        .layer(cors)
        .with_state(AppState { pool, vault_root });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT))
        .await
        .expect("bind local dev server port");

    axum::serve(listener, app)
        .await
        .expect("run local dev server");
}
