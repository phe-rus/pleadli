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
    self, CreateStationEstablishmentMemberInput, SaveStationProfileInput, StationEstablishmentMember, StationProfile,
};
use crate::domain::reports::{self, ReportsSummary};
use crate::domain::search::{self, SearchResult};
use crate::domain::statements::{self, CreateStatementInput, Statement};
use crate::domain::station_assets::{self, CreateStationAssetInput, StationAsset};
use crate::domain::station_diary::{self, CreateStationDiaryEntryInput, StationDiaryEntry};
use crate::domain::vehicles::{self, CreateVehicleInput, Vehicle};

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
        documents::export_person_document(&state.pool, &id, parsed, &path).await
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
    people::clear_photo(&state.pool, &id, &angle)
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

async fn create_officer_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    officers::create_officer(&state.pool, input)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn update_officer_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    officers::update_officer(&state.pool, &id, input)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
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
        .layer(cors)
        .with_state(AppState { pool, vault_root });

    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT))
        .await
        .expect("bind local dev server port");

    axum::serve(listener, app)
        .await
        .expect("run local dev server");
}
