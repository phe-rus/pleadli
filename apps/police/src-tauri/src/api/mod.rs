//! The one router. Every request the desktop shell makes reaches the domain
//! through here: in the app by way of the single `api_request` command (there
//! is no socket in a release build), and in a development build also over a
//! loopback listener so the plain browser dev server can use the same routes.
//! Every route lives under `/api`. The commands beside `api_request` exist only
//! because they need the operating system (a file dialog, a path, an event).

pub mod hq;
pub mod session;

use axum::{
    body::Body,
    extract::{Extension, Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
#[cfg(debug_assertions)]
use tower_http::cors::{Any, CorsLayer};

use crate::domain::activity::{self, ActivityItem};
use crate::domain::shift_log::{self, CreateShiftHandoverInput, OfficerCheckIn, ShiftHandover};
use crate::domain::attachments::{self, Attachment, VaultEntry};
use crate::domain::bonds::{self, Bond, CreateBondInput};
use crate::domain::cases::{self, Case, CasePerson, CaseWorkspace, CreateCaseInput};
use crate::domain::charge_sheets::{self, ChargeSheet, CreateChargeSheetInput};
use crate::domain::cloudflare_tunnel::{self, CloudflareConfig, SaveCloudflareConfigInput, TunnelState};
use crate::domain::custody::{self, CreateCustodyRecordInput, CustodyRecord};
use crate::domain::documents;
use crate::domain::import;
use crate::domain::duty::{self, CreateDutyAssignmentInput, DutyAssignment};
use crate::domain::exhibits::{self, CreateExhibitInput, CreateExhibitMovementInput, Exhibit, ExhibitMovement};
use crate::domain::incidents::{self, CreateIncidentInput, Incident};
use crate::domain::officers::{
    self, BackupAlert, CreateOfficerInput, Officer, RemoteAccessLogEntry, RemoteAccessSettings, UpdateOfficerInput,
};
use crate::domain::people::{self, CreatePersonInput, Person, PersonProfile};
use crate::domain::referrals::{self, CreateReferralInput, Referral};
use crate::domain::station_admin::{
    self, SaveStationProfileInput, StationProfile,
};
use crate::domain::reports::{self, ReportsSummary};
use crate::domain::search::{self, SearchResult};
use crate::domain::statements::{self, CreateStatementInput, Statement};
use crate::domain::station_assets::{self, CreateStationAssetInput, StationAsset};
use crate::domain::station_diary::{self, CreateStationDiaryEntryInput, StationDiaryEntry};
use crate::domain::registers::{self, RegisterNumber};
use crate::domain::units::{self, Chain, SaveChainInput};
use crate::domain::vehicles::{self, CreateVehicleInput, Vehicle};

/// The loopback port of the development listener (debug builds only).
pub const DEV_PORT: u16 = 47821;

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) pool: SqlitePool,
    pub(crate) vault_root: PathBuf,
}

pub(crate) type ApiError = (StatusCode, String);

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

/// The browser-dev fallback has no OS "save file" dialog to hand a real
/// destination path, unlike the Tauri build (see
/// `commands::documents::export_all_markdown`, which takes a path the
/// frontend's `save()` dialog already resolved), so this writes to a
/// throwaway temp file server-side and streams those bytes back as a
/// normal file download instead.
async fn export_all_markdown_handler(State(state): State<AppState>) -> Result<Response, ApiError> {
    let temp_path = std::env::temp_dir().join(format!("pleadli-police-vault-{}.zip", uuid::Uuid::new_v4()));
    documents::export_all_markdown(&state.pool, &state.vault_root, &temp_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let bytes = tokio::fs::read(&temp_path).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = tokio::fs::remove_file(&temp_path).await;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/zip")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"pleadli-police-vault.zip\"")
        .body(Body::from(bytes))
        .unwrap())
}

async fn export_all_xlsx_handler(State(state): State<AppState>) -> Result<Response, ApiError> {
    let temp_path = std::env::temp_dir().join(format!("pleadli-police-data-{}.xlsx", uuid::Uuid::new_v4()));
    documents::export_all_xlsx(&state.pool, &temp_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let bytes = tokio::fs::read(&temp_path).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = tokio::fs::remove_file(&temp_path).await;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"pleadli-police-data.xlsx\"")
        .body(Body::from(bytes))
        .unwrap())
}

fn document_content_type(format: &str) -> &'static str {
    if format == "pdf" {
        "application/pdf"
    } else {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
}

async fn export_all_document_handler(
    State(state): State<AppState>,
    Path(format): Path<String>,
) -> Result<Response, ApiError> {
    let parsed = documents::DocumentFormat::parse(&format)
        .ok_or((StatusCode::BAD_REQUEST, "Invalid document format.".to_string()))?;
    let temp_path = std::env::temp_dir().join(format!("pleadli-police-data-{}.{format}", uuid::Uuid::new_v4()));

    let result = match parsed {
        documents::DocumentFormat::Pdf => documents::export_all_pdf(&state.pool, &temp_path).await,
        documents::DocumentFormat::Docx => documents::export_all_docx(&state.pool, &temp_path).await,
    };
    result.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let bytes = tokio::fs::read(&temp_path).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = tokio::fs::remove_file(&temp_path).await;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, document_content_type(&format))
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"pleadli-police-data.{format}\""))
        .body(Body::from(bytes))
        .unwrap())
}

/// Shared by the person/case/charge-sheet export routes: runs `build` (one
/// of `documents::export_{person,case,charge_sheet}_document`) against a
/// throwaway temp file and streams the bytes back, or 404s when the
/// underlying record doesn't exist. `build` takes the destination path so
/// each route only needs to supply its own record-specific call.
/// `format` is trusted to already be a valid `DocumentFormat` string; the
/// three routes below parse it themselves first (they need the parsed
/// enum for their own `build` closure anyway), so re-validating it here
/// would only ever re-confirm what they already know.
async fn export_record_document<F, Fut>(format: &str, file_stem: &str, build: F) -> Result<Response, ApiError>
where
    F: FnOnce(std::path::PathBuf) -> Fut,
    Fut: std::future::Future<Output = Result<bool, documents::DocumentError>>,
{
    let temp_path = std::env::temp_dir().join(format!("{file_stem}-{}.{format}", uuid::Uuid::new_v4()));

    let found = build(temp_path.clone()).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if !found {
        return Err((StatusCode::NOT_FOUND, "Record not found.".to_string()));
    }

    let bytes = tokio::fs::read(&temp_path).await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _ = tokio::fs::remove_file(&temp_path).await;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, document_content_type(format))
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{file_stem}.{format}\""))
        .body(Body::from(bytes))
        .unwrap())
}

async fn export_person_document_handler(
    State(state): State<AppState>,
    Path((id, format)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let parsed = documents::DocumentFormat::parse(&format)
        .ok_or((StatusCode::BAD_REQUEST, "Invalid document format.".to_string()))?;
    export_record_document(&format, "person", |path| async move {
        documents::export_person_document(&state.pool, &state.vault_root, &id, parsed, &path).await
    })
    .await
}

async fn export_case_document_handler(
    State(state): State<AppState>,
    Path((id, format)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let parsed = documents::DocumentFormat::parse(&format)
        .ok_or((StatusCode::BAD_REQUEST, "Invalid document format.".to_string()))?;
    export_record_document(&format, "case", |path| async move {
        documents::export_case_document(&state.pool, &id, parsed, &path).await
    })
    .await
}

async fn export_charge_sheet_document_handler(
    State(state): State<AppState>,
    Path((id, format)): Path<(String, String)>,
) -> Result<Response, ApiError> {
    let parsed = documents::DocumentFormat::parse(&format)
        .ok_or((StatusCode::BAD_REQUEST, "Invalid document format.".to_string()))?;
    export_record_document(&format, "charge-sheet", |path| async move {
        documents::export_charge_sheet_document(&state.pool, &id, parsed, &path).await
    })
    .await
}

#[derive(Deserialize)]
struct ImportFieldsParams {
    #[serde(rename = "entityType")]
    entity_type: String,
}

async fn import_fields_handler(Query(params): Query<ImportFieldsParams>) -> Result<Json<Vec<import::ImportField>>, ApiError> {
    import::import_fields(&params.entity_type)
        .map(Json)
        .ok_or((StatusCode::BAD_REQUEST, "Unsupported record type.".to_string()))
}

/// Browser-dev fallback for `parse_import_file`: the browser only ever
/// hands over file bytes, not a real filesystem path, so the upload is
/// written to a throwaway temp file and parsed from there.
async fn parse_import_file_handler(mut multipart: Multipart) -> Result<Json<import::ImportPreview>, ApiError> {
    let mut file_name = "import.csv".to_string();
    let mut bytes = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        if field.name().unwrap_or("") == "file" {
            file_name = field.file_name().unwrap_or("import.csv").to_string();
            bytes = field
                .bytes()
                .await
                .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                .to_vec();
        }
    }

    let extension = std::path::Path::new(&file_name).extension().and_then(|e| e.to_str()).unwrap_or("csv");
    let temp_path = std::env::temp_dir().join(format!("pleadli-import-{}.{extension}", uuid::Uuid::new_v4()));
    tokio::fs::write(&temp_path, &bytes)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let preview = import::parse_import_file(&temp_path).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()));
    let _ = tokio::fs::remove_file(&temp_path).await;
    preview.map(Json)
}

async fn resolve_people_handler(
    State(state): State<AppState>,
    Json(candidates): Json<Vec<import::PersonCandidate>>,
) -> Result<Json<Vec<import::PersonResolution>>, ApiError> {
    import::resolve_people(&state.pool, candidates).await.map(Json).map_err(internal_error)
}

async fn resolve_cases_handler(
    State(state): State<AppState>,
    Json(references): Json<Vec<String>>,
) -> Result<Json<Vec<import::CaseResolution>>, ApiError> {
    import::resolve_cases(&state.pool, references).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulkImportBody {
    entity_type: String,
    rows: Vec<std::collections::HashMap<String, String>>,
}

async fn bulk_import_handler(
    State(state): State<AppState>,
    Json(body): Json<BulkImportBody>,
) -> Result<Json<import::BulkImportResult>, ApiError> {
    Ok(Json(import::bulk_import(&state.pool, &state.vault_root, &body.entity_type, body.rows).await))
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

async fn list_recent_activity_handler(State(state): State<AppState>) -> Result<Json<Vec<ActivityItem>>, ApiError> {
    activity::recent(&state.pool).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckInBody {
    badge_number: String,
}

async fn check_in_handler(
    State(state): State<AppState>,
    Json(body): Json<CheckInBody>,
) -> Result<Json<OfficerCheckIn>, ApiError> {
    shift_log::check_in_by_badge(&state.pool, &state.vault_root, &body.badge_number)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))
}

async fn list_check_ins_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<OfficerCheckIn>>, ApiError> {
    shift_log::list_check_ins(&state.pool, &params.query).await.map(Json).map_err(internal_error)
}

async fn create_shift_handover_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateShiftHandoverInput>,
) -> Result<Json<ShiftHandover>, ApiError> {
    shift_log::create_handover(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_shift_handovers_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<ShiftHandover>>, ApiError> {
    shift_log::list_handovers(&state.pool, &params.query).await.map(Json).map_err(internal_error)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetHeadshotBody {
    attachment_id: String,
}

async fn set_person_headshot_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<SetHeadshotBody>,
) -> Result<Json<Person>, ApiError> {
    people::set_headshot(&state.pool, &id, &body.attachment_id)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn clear_person_headshot_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Person>, ApiError> {
    people::clear_headshot(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn set_person_photo_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<Attachment>, ApiError> {
    let mut angle = String::new();
    let mut file_name = "photo".to_string();
    let mut bytes = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        match field.name().unwrap_or("").to_string().as_str() {
            "angle" => angle = field.text().await.unwrap_or_default(),
            "file" => {
                file_name = field.file_name().unwrap_or("photo").to_string();
                bytes = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .to_vec();
            }
            _ => {}
        }
    }

    if !people::PHOTO_ANGLES.contains(&angle.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "Invalid photo angle.".to_string()));
    }

    people::set_photo(&state.pool, &state.vault_root, &id, &angle, &file_name, &bytes)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn clear_person_photo_handler(
    State(state): State<AppState>,
    Path((id, angle)): Path<(String, String)>,
) -> Result<StatusCode, ApiError> {
    if !people::PHOTO_ANGLES.contains(&angle.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "Invalid photo angle.".to_string()));
    }
    people::clear_photo(&state.pool, &state.vault_root, &id, &angle)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
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

async fn create_vehicle_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateVehicleInput>,
) -> Result<Json<Vehicle>, ApiError> {
    vehicles::create_vehicle(&state.pool, &state.vault_root, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn update_vehicle_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreateVehicleInput>,
) -> Result<Json<Vehicle>, ApiError> {
    vehicles::update_vehicle(&state.pool, &state.vault_root, &id, input)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn list_vehicles_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<Vehicle>>, ApiError> {
    vehicles::list_vehicles(&state.pool, &params.query)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintInput {
    entity_type: String,
    entity_id: String,
    reference: Option<String>,
    title: String,
    body: String,
}

/// A paper is leaving the station: its wording is recorded under the code printed on it.
async fn stamp_paper(State(state): State<AppState>, Extension(actor): Extension<crate::domain::sessions::Actor>, Json(input): Json<PrintInput>) -> Result<Json<pleadli_node_core::paper::Stamp>, ApiError> {
    if input.body.trim().is_empty() || input.body.len() > 2_000_000 {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, "This paper has no wording to record.".into()));
    }
    let who = match &actor.rank {
        Some(rank) => format!("{rank} {}", actor.name),
        None => actor.name.clone(),
    };
    pleadli_node_core::paper::stamp(
        &state.pool,
        pleadli_node_core::paper::PaperInput {
            entity_type: &input.entity_type,
            entity_id: &input.entity_id,
            reference: input.reference.as_deref(),
            title: &input.title,
            body: &input.body,
            printed_by: Some(&who),
        },
    )
    .await
    .map(Json)
    .map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrintEntityQuery {
    entity_type: String,
    entity_id: String,
}

async fn last_paper_print(State(state): State<AppState>, Query(q): Query<PrintEntityQuery>) -> Result<Json<Option<pleadli_node_core::paper::PaperPrint>>, ApiError> {
    pleadli_node_core::paper::last_print(&state.pool, &q.entity_type, &q.entity_id).await.map(Json).map_err(internal_error)
}

async fn paper_history(State(state): State<AppState>, Query(q): Query<PrintEntityQuery>) -> Result<Json<Vec<pleadli_node_core::paper::PaperPrint>>, ApiError> {
    pleadli_node_core::paper::history(&state.pool, &q.entity_type, &q.entity_id).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
struct PrintVerifyQuery {
    code: String,
}

async fn verify_paper(State(state): State<AppState>, Query(q): Query<PrintVerifyQuery>) -> Result<Json<Option<pleadli_node_core::paper::PaperPrint>>, ApiError> {
    pleadli_node_core::paper::verify(&state.pool, &q.code).await.map(Json).map_err(internal_error)
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

async fn bulk_attach_files_handler(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<attachments::BulkAttachResult>, ApiError> {
    let mut entity_type = String::new();
    let mut entity_id = String::new();
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
    {
        match field.name().unwrap_or("").to_string().as_str() {
            "entityType" => entity_type = field.text().await.unwrap_or_default(),
            "entityId" => entity_id = field.text().await.unwrap_or_default(),
            "file" => {
                let file_name = field.file_name().unwrap_or("attachment").to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                    .to_vec();
                files.push((file_name, bytes));
            }
            _ => {}
        }
    }

    Ok(Json(
        attachments::bulk_attach_bytes(&state.pool, &state.vault_root, &entity_type, &entity_id, files).await,
    ))
}

async fn delete_attachment_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    attachments::delete_attachment(&state.pool, &state.vault_root, &id)
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

    let bytes = tokio::fs::read(attachments::absolute_path(&state.vault_root, &attachment.stored_path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?)
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

/// A refused officer request says why: a sign-in without a badge number is a
/// bad request, and a badge number already in use is a conflict.
fn officer_error(err: officers::OfficerError) -> ApiError {
    match err {
        officers::OfficerError::Invalid(message) => (StatusCode::UNPROCESSABLE_ENTITY, message),
        officers::OfficerError::Db(e) if e.to_string().contains("officers.badge_number") => {
            (StatusCode::CONFLICT, "That badge number is already in use.".to_string())
        }
        other => (StatusCode::INTERNAL_SERVER_ERROR, other.to_string()),
    }
}

async fn create_officer_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    officers::create_officer(&state.pool, input)
        .await
        .map(Json)
        .map_err(officer_error)
}

async fn update_officer_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    officers::update_officer(&state.pool, &id, input)
        .await
        .map(Json)
        .map_err(officer_error)
}

async fn list_officers_handler(State(state): State<AppState>) -> Result<Json<Vec<Officer>>, ApiError> {
    officers::list_officers(&state.pool).await.map(Json).map_err(internal_error)
}

async fn list_remote_access_log_handler(
    State(state): State<AppState>,
) -> Result<Json<Vec<RemoteAccessLogEntry>>, ApiError> {
    officers::list_remote_access_log(&state.pool).await.map(Json).map_err(internal_error)
}

async fn get_remote_access_settings_handler(
    State(state): State<AppState>,
) -> Result<Json<RemoteAccessSettings>, ApiError> {
    officers::get_remote_access_settings(&state.pool).await.map(Json).map_err(internal_error)
}

async fn list_backup_alerts_handler(State(state): State<AppState>) -> Result<Json<Vec<BackupAlert>>, ApiError> {
    officers::list_backup_alerts(&state.pool).await.map(Json).map_err(internal_error)
}

async fn acknowledge_backup_alert_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    officers::acknowledge_backup_alert(&state.pool, &id).await.map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_active_backup_alerts_handler(State(state): State<AppState>) -> Result<Json<Vec<BackupAlert>>, ApiError> {
    officers::list_active_backup_alerts(&state.pool).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RespondToBackupAlertBody {
    officer_id: String,
}

/// Browser-dev fallback only — there's no Tauri event bridge outside a
/// real Tauri webview, so this updates the row but can't push a live
/// update the way the desktop app's own command does.
async fn respond_to_backup_alert_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<RespondToBackupAlertBody>,
) -> Result<Json<BackupAlert>, ApiError> {
    officers::respond_to_backup_alert(&state.pool, &id, &body.officer_id).await.map(Json).map_err(internal_error)
}

async fn end_backup_alert_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<BackupAlert>, ApiError> {
    officers::end_backup_alert(&state.pool, &id).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
struct SetRemoteAccessEnabledBody {
    enabled: bool,
}

async fn set_remote_access_enabled_handler(
    State(state): State<AppState>,
    Json(body): Json<SetRemoteAccessEnabledBody>,
) -> Result<Json<RemoteAccessSettings>, ApiError> {
    officers::set_remote_access_enabled(&state.pool, body.enabled)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn save_cloudflare_config_handler(
    State(state): State<AppState>,
    Json(input): Json<SaveCloudflareConfigInput>,
) -> Result<StatusCode, ApiError> {
    cloudflare_tunnel::save_config(&state.pool, input).await.map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_cloudflare_config_handler(
    State(state): State<AppState>,
) -> Result<Json<Option<CloudflareConfig>>, ApiError> {
    cloudflare_tunnel::get_config(&state.pool).await.map(Json).map_err(internal_error)
}

async fn get_cloudflare_tunnel_state_handler(
    State(state): State<AppState>,
) -> Result<Json<Option<TunnelState>>, ApiError> {
    cloudflare_tunnel::get_tunnel_state(&state.pool).await.map(Json).map_err(internal_error)
}

#[derive(serde::Serialize)]
struct LocalNetworkInfo {
    address: Option<String>,
    port: u16,
}

async fn get_local_network_info_handler() -> Json<LocalNetworkInfo> {
    Json(LocalNetworkInfo {
        address: local_ip_address::local_ip().ok().map(|ip| ip.to_string()),
        port: crate::transport::remote_server::DEFAULT_PORT,
    })
}

async fn get_unit_chain_handler(State(state): State<AppState>) -> Result<Json<Chain>, ApiError> {
    units::chain(&state.pool).await.map(Json).map_err(internal_error)
}

async fn save_unit_chain_handler(
    State(state): State<AppState>,
    Json(input): Json<SaveChainInput>,
) -> Result<Json<Chain>, ApiError> {
    units::save_chain(&state.pool, input).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
struct RegisterParams {
    kind: String,
}

/// What the next number of a register would be, for a form to offer. Taking a
/// number happens only when the entry is saved.
async fn next_register_number_handler(
    State(state): State<AppState>,
    Query(params): Query<RegisterParams>,
) -> Result<Json<RegisterNumber>, ApiError> {
    if params.kind != registers::SD && params.kind != registers::CRB {
        return Err((StatusCode::UNPROCESSABLE_ENTITY, "Unknown register.".to_string()));
    }
    registers::peek_next(&state.pool, &params.kind).await.map(Json).map_err(internal_error)
}

/// Every route, nested under `/api`, with no guard in front. The application
/// uses `router`; a test of one route's behaviour may use this.
fn routes(pool: SqlitePool, vault_root: PathBuf) -> Router {
    let state = AppState { pool, vault_root };
    #[cfg(debug_assertions)]
    let dev_state = state.clone();
    let routes = Router::new()
        .route("/system/state", get(session::system_state))
        .route("/system/onboarding/station", post(session::onboard_station))
        .route("/system/onboarding/command", post(session::onboard_command))
        .route("/auth/sign-in", post(session::sign_in))
        .route("/auth/sign-out", post(session::sign_out))
        .route("/auth/me", get(session::me))
        .route("/auth/policy", get(session::get_policy).put(session::save_policy))
        .route("/auth/events", get(session::list_events))
        .route("/hq/stations", get(hq::list_stations).post(hq::register_station))
        .route("/hq/stations/{id}/activation-code", post(hq::issue_code))
        .route("/hq/stations/{id}/revoke", post(hq::revoke))
        .route("/hq/stations/{id}/roster", get(hq::roster))
        .route("/hq/requests", get(hq::pending_requests))
        .route("/hq/requests/{id}/approve", post(hq::approve))
        .route("/hq/requests/{id}/reject", post(hq::reject))
        .route("/hq/overview", get(hq::overview))
        .route("/hq/listener", get(hq::listener))
        .route("/command-link", get(hq::get_link).post(hq::connect).delete(hq::disconnect))
        .route("/people", post(create_person_handler).get(search_people_handler))
        .route("/people/{id}", get(get_person_handler).put(update_person_handler))
        .route("/people/{id}/profile", get(get_person_profile_handler))
        .route(
            "/people/{id}/headshot",
            put(set_person_headshot_handler).delete(clear_person_headshot_handler),
        )
        .route("/people/{id}/photos", post(set_person_photo_handler))
        .route("/people/{id}/photos/{angle}", delete(clear_person_photo_handler))
        .route("/people/{id}/export/{format}", get(export_person_document_handler))
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
        .route("/vehicles", post(create_vehicle_handler).get(list_vehicles_handler))
        .route("/vehicles/{id}", put(update_vehicle_handler))
        .route("/cases", post(create_case_handler).get(list_cases_handler))
        .route("/cases/{id}", put(update_case_handler))
        .route("/cases/{id}/people", get(list_case_people_handler))
        .route("/cases/{id}/workspace", get(get_case_workspace_handler))
        .route("/cases/{id}/export/{format}", get(export_case_document_handler))
        .route("/statements", post(create_statement_handler).get(list_statements_handler))
        .route("/statements/{id}", put(update_statement_handler))
        .route("/prints", post(stamp_paper))
        .route("/prints/last", get(last_paper_print))
        .route("/prints/history", get(paper_history))
        .route("/prints/verify", get(verify_paper))
        .route("/custody", post(create_custody_record_handler).get(list_custody_records_handler))
        .route("/custody/{id}", put(update_custody_record_handler))
        .route("/bonds", post(create_bond_handler).get(list_bonds_handler))
        .route("/bonds/{id}", put(update_bond_handler))
        .route("/station-profile", get(get_station_profile_handler).put(save_station_profile_handler))
        .route("/units/chain", get(get_unit_chain_handler).put(save_unit_chain_handler))
        .route("/registers/next", get(next_register_number_handler))
        .route("/referrals", post(create_referral_handler).get(list_referrals_handler))
        .route("/referrals/{id}", put(update_referral_handler))
        .route("/charge-sheets", post(create_charge_sheet_handler).get(list_charge_sheets_handler))
        .route("/charge-sheets/{id}", put(update_charge_sheet_handler))
        .route("/charge-sheets/{id}/export/{format}", get(export_charge_sheet_document_handler))
        .route("/exhibits", post(create_exhibit_handler).get(list_exhibits_handler))
        .route("/exhibits/{id}", put(update_exhibit_handler))
        .route(
            "/exhibits/{id}/movements",
            post(create_exhibit_movement_handler).get(list_exhibit_movements_handler),
        )
        .route("/attachments", post(create_attachment_handler).get(list_attachments_handler))
        .route("/attachments/bulk", post(bulk_attach_files_handler))
        .route("/attachments/all", get(list_all_attachments_handler))
        .route("/attachments/route", get(get_attachment_route_handler))
        .route("/vault", get(list_vault_directory_handler))
        .route("/attachments/{id}", delete(delete_attachment_handler))
        .route("/attachments/{id}/file", get(get_attachment_file_handler))
        .route("/officers", post(create_officer_handler).get(list_officers_handler))
        .route("/officers/{id}", put(update_officer_handler))
        .route("/remote-access/log", get(list_remote_access_log_handler))
        .route("/backup-alerts", get(list_backup_alerts_handler))
        .route("/backup-alerts/active", get(list_active_backup_alerts_handler))
        .route("/backup-alerts/{id}/acknowledge", post(acknowledge_backup_alert_handler))
        .route("/backup-alerts/{id}/respond", post(respond_to_backup_alert_handler))
        .route("/backup-alerts/{id}/end", post(end_backup_alert_handler))
        .route(
            "/remote-access/settings",
            get(get_remote_access_settings_handler).put(set_remote_access_enabled_handler),
        )
        .route(
            "/cloudflare/config",
            get(get_cloudflare_config_handler).put(save_cloudflare_config_handler),
        )
        .route("/cloudflare/tunnel-state", get(get_cloudflare_tunnel_state_handler))
        .route("/local-network", get(get_local_network_info_handler))
        .route("/search", get(search_handler))
        .route("/activity/recent", get(list_recent_activity_handler))
        .route("/check-ins", post(check_in_handler).get(list_check_ins_handler))
        .route("/shift-handovers", post(create_shift_handover_handler).get(list_shift_handovers_handler))
        .route("/reports/summary", get(get_reports_summary_handler))
        .route("/export/markdown", get(export_all_markdown_handler))
        .route("/export/xlsx", get(export_all_xlsx_handler))
        .route("/export/{format}", get(export_all_document_handler))
        .route("/import/fields", get(import_fields_handler))
        .route("/import/parse", post(parse_import_file_handler))
        .route("/import/resolve-people", post(resolve_people_handler))
        .route("/import/resolve-cases", post(resolve_cases_handler))
        .route("/import/bulk", post(bulk_import_handler))
        .with_state(state);

    // Dev builds only: lets one installation be tried as both a Station and a
    // Command. Not compiled into a release build.
    #[cfg(debug_assertions)]
    let routes = routes.route("/system/dev-mode", post(session::dev_mode).with_state(dev_state));

    Router::new().nest("/api", routes)
}

/// The whole API, nested under `/api`, with the guard in front of every
/// route: no valid session, no answer.
pub fn router(pool: SqlitePool, vault_root: PathBuf) -> Router {
    let state = AppState { pool: pool.clone(), vault_root: vault_root.clone() };
    routes(pool, vault_root).layer(axum::middleware::from_fn_with_state(state, session::guard))
}

/// Serves the router on 127.0.0.1 for the browser dev server. Debug builds
/// only; a release build has no listener at all.
#[cfg(debug_assertions)]
pub async fn serve_dev(app: Router) {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", DEV_PORT))
        .await
        .expect("bind local dev server port");

    axum::serve(listener, app.layer(cors)).await.expect("run local dev server");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{Method, Request};
    use serde_json::{json, Value};
    use tower::ServiceExt;

    async fn call(app: &Router, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header(header::CONTENT_TYPE, "application/json")
            .body(body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty))
            .unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    /// The router as the desktop shell uses it, over a real migrated database:
    /// everything answers under `/api` only, diary entries and blank-reference
    /// cases take consecutive register numbers, and the command structure
    /// replaces cleanly.
    #[tokio::test]
    async fn registers_and_command_structure_through_the_router() {
        let dir = std::env::temp_dir().join(format!("pleadli-api-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        let app = routes(db.pool.clone(), vault_root);

        // Nothing is served outside /api.
        assert_eq!(call(&app, Method::GET, "/custody", None).await.0, StatusCode::NOT_FOUND);
        assert_eq!(call(&app, Method::GET, "/api/custody", None).await.0, StatusCode::OK);

        // Diary entries are numbered one after another, per year.
        let (_, next) = call(&app, Method::GET, "/api/registers/next?kind=sd", None).await;
        let first = next["number"].as_i64().unwrap();
        let entry = json!({ "category": "general", "content": "Test entry", "personId": null });
        let (_, a) = call(&app, Method::POST, "/api/station-diary", Some(entry.clone())).await;
        let (_, b) = call(&app, Method::POST, "/api/station-diary", Some(entry)).await;
        assert_eq!(a["entryNumber"].as_i64().unwrap(), first);
        assert_eq!(b["entryNumber"].as_i64().unwrap(), first + 1);
        assert_eq!(a["entryYear"], b["entryYear"]);

        // A case with no reference is numbered by the CRB; one with a reference keeps it.
        let blank = json!({ "reference": "", "summary": "Numbered", "status": "open", "incidentId": null, "people": [] });
        let (status, c1) = call(&app, Method::POST, "/api/cases", Some(blank.clone())).await;
        assert_eq!(status, StatusCode::OK);
        let (_, c2) = call(&app, Method::POST, "/api/cases", Some(blank)).await;
        let n1: i64 = c1["reference"].as_str().unwrap().rsplit(' ').next().unwrap().split('/').next().unwrap().parse().unwrap();
        let n2: i64 = c2["reference"].as_str().unwrap().rsplit(' ').next().unwrap().split('/').next().unwrap().parse().unwrap();
        assert_eq!(n2, n1 + 1);
        let typed = json!({ "reference": "KIRA ROAD CRB 9/2019", "summary": "Typed", "status": "open", "incidentId": null, "people": [] });
        let (_, c3) = call(&app, Method::POST, "/api/cases", Some(typed)).await;
        assert_eq!(c3["reference"], "KIRA ROAD CRB 9/2019");
        let (_, after) = call(&app, Method::GET, "/api/registers/next?kind=crb", None).await;
        assert_eq!(after["number"].as_i64().unwrap(), n2 + 1);

        // The command structure: set, read back in order, replace.
        let (_, chain) = call(&app, Method::GET, "/api/units/chain", None).await;
        assert_eq!(chain["station"]["kind"], "station");
        assert!(chain["above"].as_array().unwrap().is_empty());
        let (_, set) = call(&app, Method::PUT, "/api/units/chain", Some(json!({ "region": "Region A", "district": "District B", "division": "" }))).await;
        let names: Vec<&str> = set["above"].as_array().unwrap().iter().map(|u| u["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["Region A", "District B"]);
        let (_, replaced) = call(&app, Method::PUT, "/api/units/chain", Some(json!({ "region": "", "district": "District C", "division": "Division D" }))).await;
        let names: Vec<&str> = replaced["above"].as_array().unwrap().iter().map(|u| u["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["District C", "Division D"]);
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM police_units").fetch_one(&db.pool).await.unwrap();
        assert_eq!(count, 3, "the old levels are removed, not left behind");

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    /// One officer record: an officer needs no badge or password, a sign-in
    /// needs a badge, a badge is unique, only an officer with a stored password
    /// can sign in, and a shift for an officer takes the name and rank from the
    /// officer's record.
    #[tokio::test]
    async fn one_officer_record() {
        let dir = std::env::temp_dir().join(format!("pleadli-officer-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        let app = routes(db.pool.clone(), vault_root);

        let plain = json!({ "name": "Ada Okello", "rank": "Inspector", "post": "OC CID", "role": "officer", "badgeNumber": "", "password": "", "personId": null, "notes": null });
        let (status, ada) = call(&app, Method::POST, "/api/officers", Some(plain)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(ada["hasSignIn"], false);
        assert!(ada["badgeNumber"].is_null());

        let no_badge = json!({ "name": "Ben", "role": "officer", "password": "long-enough-1", "badgeNumber": null, "personId": null });
        assert_eq!(call(&app, Method::POST, "/api/officers", Some(no_badge)).await.0, StatusCode::UNPROCESSABLE_ENTITY);

        let with_login = json!({ "name": "Cy Ndege", "role": "officer", "password": "long-enough-1", "badgeNumber": "B-7", "personId": null });
        let (status, cy) = call(&app, Method::POST, "/api/officers", Some(with_login.clone())).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(cy["hasSignIn"], true);
        assert!(cy.get("passwordHash").is_none() && cy.get("password_hash").is_none());
        assert_eq!(call(&app, Method::POST, "/api/officers", Some(with_login)).await.0, StatusCode::CONFLICT);

        assert!(officers::login(&db.pool, "B-7", "long-enough-1").await.unwrap().is_some());
        assert!(officers::login(&db.pool, "B-7", "wrong").await.unwrap().is_none());

        let shift = json!({ "officerId": ada["id"], "officerName": "typed name is ignored", "officerRank": null, "unit": null, "shiftStart": 1000, "shiftEnd": 2000, "notes": null });
        let (status, duty) = call(&app, Method::POST, "/api/duty", Some(shift)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(duty["officerName"], "Ada Okello");
        assert_eq!(duty["officerRank"], "Inspector");
        assert_eq!(duty["officerId"], ada["id"]);

        // A referral naming an officer takes the name from the record; one with
        // only a typed name keeps it and is not linked.
        let case = json!({ "reference": "TEST CRB 1/2026", "summary": "Case", "status": "open", "incidentId": null, "people": [] });
        let (_, case) = call(&app, Method::POST, "/api/cases", Some(case)).await;
        let referral = |officer_id: Value, name: Value| json!({ "caseId": case["id"], "destinationType": "dpp", "destinationName": null, "referredAt": 1, "status": "pending", "officerId": officer_id, "officerName": name, "notes": null });
        let (status, linked) = call(&app, Method::POST, "/api/referrals", Some(referral(ada["id"].clone(), json!("typed")))).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(linked["officerName"], "Ada Okello");
        assert_eq!(linked["officerId"], ada["id"]);
        let (_, typed) = call(&app, Method::POST, "/api/referrals", Some(referral(Value::Null, json!("Sgt Someone")))).await;
        assert_eq!(typed["officerName"], "Sgt Someone");
        assert!(typed["officerId"].is_null());

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    async fn call_as(app: &Router, token: Option<&str>, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
        let mut builder = Request::builder().method(method).uri(path).header(header::CONTENT_TYPE, "application/json");
        if let Some(token) = token {
            builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
        }
        let request = builder.body(body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty)).unwrap();
        let response = app.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    async fn fresh_app() -> (Router, crate::db::Db, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-auth-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::startup(&dir, vault_root.clone()).await.ok().unwrap();
        (router(db.pool.clone(), vault_root), db, dir)
    }

    /// A station: nothing answers before setup or without a session, setup signs
    /// the administrator in, badge only is the default, only an administrator
    /// changes the policy, passwords cannot be turned on by someone without one,
    /// and once on they are required.
    #[tokio::test]
    async fn a_station_signs_in_by_badge_and_an_administrator_can_require_passwords() {
        let (app, _db, dir) = fresh_app().await;

        assert_eq!(call_as(&app, None, Method::GET, "/api/custody", None).await.0, StatusCode::UNAUTHORIZED);
        let (_, state) = call_as(&app, None, Method::GET, "/api/system/state", None).await;
        assert_eq!(state["installed"], false);
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1" }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

        let setup = json!({ "stationName": "Test Station", "region": null, "district": null, "division": null,
            "administrator": { "existingOfficerId": null, "name": "Ada Admin", "rank": "Inspector", "badgeNumber": "A1", "password": null } });
        let (status, signed_in) = call_as(&app, None, Method::POST, "/api/system/onboarding/station", Some(setup.clone())).await;
        assert_eq!(status, StatusCode::OK);
        let admin_token = signed_in["token"].as_str().unwrap().to_string();
        assert_eq!(call_as(&app, None, Method::POST, "/api/system/onboarding/station", Some(setup)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "setup happens once");

        assert_eq!(call_as(&app, Some(&admin_token), Method::GET, "/api/custody", None).await.0, StatusCode::OK);
        let (_, state) = call_as(&app, None, Method::GET, "/api/system/state", None).await;
        assert_eq!(state["mode"], "station");
        assert_eq!(state["authMode"], "badge_only");

        // Badge only: the badge alone signs in, in any case; an unknown badge does not.
        let (status, lower) = call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "a1" }))).await;
        assert_eq!(status, StatusCode::OK);
        assert!(lower["token"].is_string());
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "NOPE" }))).await.0, StatusCode::UNAUTHORIZED);

        // An ordinary officer signs in but cannot change policy or officers.
        let colleague = json!({ "name": "Ben Officer", "role": "officer", "badgeNumber": "B2", "password": null, "personId": null });
        assert_eq!(call_as(&app, Some(&admin_token), Method::POST, "/api/officers", Some(colleague)).await.0, StatusCode::OK);
        let (_, ben) = call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "B2" }))).await;
        let ben_token = ben["token"].as_str().unwrap().to_string();
        let policy = json!({ "mode": "password", "idleTimeoutMinutes": 240 });
        assert_eq!(call_as(&app, Some(&ben_token), Method::PUT, "/api/auth/policy", Some(policy.clone())).await.0, StatusCode::FORBIDDEN);
        assert_eq!(call_as(&app, Some(&ben_token), Method::POST, "/api/officers", Some(json!({ "name": "X", "role": "admin", "badgeNumber": "X1", "password": null, "personId": null }))).await.0, StatusCode::FORBIDDEN);

        // The administrator cannot lock themselves out: they need a password first.
        assert_eq!(call_as(&app, Some(&admin_token), Method::PUT, "/api/auth/policy", Some(policy.clone())).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        let (_, me) = call_as(&app, Some(&admin_token), Method::GET, "/api/auth/me", None).await;
        let set_password = json!({ "name": "Ada Admin", "rank": "Inspector", "post": null, "role": "admin", "active": true, "badgeNumber": "A1", "notes": null, "personId": null, "password": "correct-horse-1" });
        assert_eq!(call_as(&app, Some(&admin_token), Method::PUT, &format!("/api/officers/{}", me["officerId"].as_str().unwrap()), Some(set_password)).await.0, StatusCode::OK);
        // Changing a password ends that officer's sessions everywhere.
        assert_eq!(call_as(&app, Some(&admin_token), Method::GET, "/api/custody", None).await.0, StatusCode::UNAUTHORIZED);
        let (_, again) = call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1" }))).await;
        let admin_token = again["token"].as_str().unwrap().to_string();

        assert_eq!(call_as(&app, Some(&admin_token), Method::PUT, "/api/auth/policy", Some(policy)).await.0, StatusCode::OK);
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1" }))).await.0, StatusCode::UNAUTHORIZED, "the badge alone no longer works");
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1", "password": "wrong" }))).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1", "password": "correct-horse-1" }))).await.0, StatusCode::OK);
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "B2" }))).await.0, StatusCode::UNAUTHORIZED, "an officer with no password cannot sign in");

        // Signing out ends the session; the trail records it all.
        assert_eq!(call_as(&app, Some(&admin_token), Method::POST, "/api/auth/sign-out", None).await.0, StatusCode::NO_CONTENT);
        assert_eq!(call_as(&app, Some(&admin_token), Method::GET, "/api/custody", None).await.0, StatusCode::UNAUTHORIZED);
        let (_, again) = call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "A1", "password": "correct-horse-1" }))).await;
        let (_, events) = call_as(&app, Some(again["token"].as_str().unwrap()), Method::GET, "/api/auth/events", None).await;
        let actions: Vec<&str> = events.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
        for expected in ["installed", "sign_in", "sign_in_refused", "policy_changed", "sign_out"] {
            assert!(actions.contains(&expected), "the trail has {expected}: {actions:?}");
        }

        _db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A command: badge and password from the start, no station records to reach,
    /// a station registered and connected with an activation code or by approval,
    /// a report received only with the station's token, and the totals.
    #[tokio::test]
    async fn a_command_registers_stations_and_receives_their_reports() {
        use crate::domain::command;
        let (app, db, dir) = fresh_app().await;

        let setup = json!({ "commandName": "Test Region", "level": "region",
            "administrator": { "existingOfficerId": null, "name": "Hana HQ", "rank": "ACP", "badgeNumber": "H1", "password": "short" } });
        assert_eq!(call_as(&app, None, Method::POST, "/api/system/onboarding/command", Some(setup.clone())).await.0, StatusCode::UNPROCESSABLE_ENTITY, "a command needs a real password");
        let mut good = setup;
        good["administrator"]["password"] = json!("long-enough-pw-1");
        let (status, signed_in) = call_as(&app, None, Method::POST, "/api/system/onboarding/command", Some(good)).await;
        assert_eq!(status, StatusCode::OK);
        let token = signed_in["token"].as_str().unwrap().to_string();

        let (_, state) = call_as(&app, None, Method::GET, "/api/system/state", None).await;
        assert_eq!(state["authMode"], "password");
        assert_eq!(call_as(&app, None, Method::POST, "/api/auth/sign-in", Some(json!({ "badgeNumber": "H1" }))).await.0, StatusCode::UNAUTHORIZED, "no badge-only sign-in on a command");
        assert_eq!(call_as(&app, Some(&token), Method::PUT, "/api/auth/policy", Some(json!({ "mode": "badge_only", "idleTimeoutMinutes": 240 }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(call_as(&app, Some(&token), Method::GET, "/api/custody", None).await.0, StatusCode::NOT_FOUND, "a command holds no station records");

        let register = |name: &str| json!({ "name": name, "region": "R", "district": "D" });
        let (_, one) = call_as(&app, Some(&token), Method::POST, "/api/hq/stations", Some(register("Alpha Station"))).await;
        let (_, two) = call_as(&app, Some(&token), Method::POST, "/api/hq/stations", Some(register("Bravo Station"))).await;
        assert_eq!(one["stationNumber"], "ST-0001");
        assert_eq!(two["stationNumber"], "ST-0002");

        // Alpha connects with an activation code, at once; the code works once.
        let (_, issued) = call_as(&app, Some(&token), Method::POST, &format!("/api/hq/stations/{}/activation-code", one["id"].as_str().unwrap()), None).await;
        let code = issued["code"].as_str().unwrap().to_string();
        let alpha_token = "alpha-sync-token";
        let connect = |number: &str, code: Option<&str>, token: &str| command::ConnectInput {
            station_number: number.to_string(),
            requester_badge: "S1".into(),
            requester_name: "Sam Station".into(),
            token_hash: command::hash_secret(token),
            activation_code: code.map(str::to_string),
        };
        assert!(command::request_connection(&db.pool, connect("ST-0001", Some("WRONGCODE1"), alpha_token), "10.0.0.5").await.is_err());
        let outcome = command::request_connection(&db.pool, connect("ST-0001", Some(&code), alpha_token), "10.0.0.5").await.unwrap();
        assert_eq!(outcome.status, "approved");
        assert!(command::request_connection(&db.pool, connect("ST-0001", Some(&code), "other"), "10.0.0.5").await.is_err(), "a code is used once");
        assert!(command::request_connection(&db.pool, connect("ST-9999", None, "x"), "10.0.0.5").await.is_err(), "unknown station number");

        // Bravo asks without a code and waits; an administrator approves it.
        let bravo_token = "bravo-sync-token";
        let outcome = command::request_connection(&db.pool, connect("ST-0002", None, bravo_token), "10.0.0.6").await.unwrap();
        assert_eq!(outcome.status, "pending");
        assert_eq!(command::request_status(&db.pool, &outcome.request_id, &command::hash_secret(bravo_token)).await.unwrap(), "pending");
        assert!(command::request_status(&db.pool, &outcome.request_id, &command::hash_secret("someone else")).await.is_err(), "only the asking station learns the answer");
        let (_, waiting) = call_as(&app, Some(&token), Method::GET, "/api/hq/requests", None).await;
        assert_eq!(waiting.as_array().unwrap().len(), 1);
        assert_eq!(call_as(&app, Some(&token), Method::POST, &format!("/api/hq/requests/{}/approve", outcome.request_id), None).await.0, StatusCode::NO_CONTENT);

        // Reports are accepted only with the station's own token; only the roster's own fields are kept.
        let report = |in_custody: i64, past: i64| command::ReportInput {
            reported_at: 1,
            figures: json!({ "inCustody": in_custody, "nearLimit": 1, "pastLimit": past, "openCases": 4, "referralsPending": 2, "onDutyNow": 3, "officersActive": 5 }),
            roster: vec![json!({ "name": "Sam", "rank": "Sgt", "post": "Desk", "badgeNumber": "S1", "role": "officer", "active": true, "passwordHash": "must-not-be-kept" })],
        };
        assert!(command::receive_report(&db.pool, "not-a-token", report(1, 0)).await.is_err());
        command::receive_report(&db.pool, alpha_token, report(3, 1)).await.unwrap();
        command::receive_report(&db.pool, bravo_token, report(2, 0)).await.unwrap();
        let (_, roster) = call_as(&app, Some(&token), Method::GET, &format!("/api/hq/stations/{}/roster", one["id"].as_str().unwrap()), None).await;
        assert_eq!(roster[0]["name"], "Sam");
        assert!(roster[0].get("passwordHash").is_none());

        let (_, overview) = call_as(&app, Some(&token), Method::GET, "/api/hq/overview", None).await;
        assert_eq!(overview["reporting"], 2);
        assert_eq!(overview["inCustody"], 5);
        assert_eq!(overview["pastLimit"], 1);
        assert_eq!(overview["openCases"], 8);

        // Revoking a station ends its reports.
        assert_eq!(call_as(&app, Some(&token), Method::POST, &format!("/api/hq/stations/{}/revoke", one["id"].as_str().unwrap()), None).await.0, StatusCode::NO_CONTENT);
        assert!(command::receive_report(&db.pool, alpha_token, report(1, 0)).await.is_err());

        db.pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
