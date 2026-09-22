//! The one HTTP surface of the application: every route is under `/api/**`.
//!
//! The desktop webview reaches it through the single `api_request` command,
//! which hands the request to this router in process (no socket). In a browser
//! during development the same router is served on a loopback port, so the same
//! domain code and the same validation run either way. Handlers only translate:
//! rules live in `domain/`.

use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::path::PathBuf;

use crate::domain::audit::{self, AuditEntry, Verification};
use crate::domain::cases::{self, Case, CaseInput, CaseSummary, Party, PartyInput};
use crate::domain::error::DomainError;
use crate::domain::exhibits::{self, Exhibit, MarkInput, UpdateInput as ExhibitUpdate};
use crate::domain::library::{self, ItemInput, LibraryItem, LibrarySummary};
use crate::domain::orders::{self, CreateOrderInput, Order, OrderSummary, UpdateOrderInput};
use crate::domain::overview::{self, Overview};
use crate::domain::profile::{self, BenchProfile, SaveProfileInput};
use crate::domain::recordings::{self, Audio, Check, Chunk, ChunkInput, Recording, StartInput};
use crate::domain::reports::{self, Returns};
use crate::domain::transcripts::{self, AdoptInput, Segment, SegmentInput, TranscribeError};
use crate::domain::rulings::{self, CreateInput as RulingCreate, Ruling, RulingSummary, UpdateInput as RulingUpdate};
use crate::domain::sitting_record::{self, Appearance, AppearanceInput, AttendanceInput, BenchNote, NoteInput, SittingDetail};
use crate::domain::sittings::{self, Adjourned, Adjournment, AdjournInput, CauseListRow, Sitting, SittingInput};

pub const DEV_PORT: u16 = 47923;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    /// Where sealed files live (recorded audio): `<data folder>/vault`.
    pub vault_root: PathBuf,
}

pub struct ApiError(pub StatusCode, pub &'static str, pub String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "code": self.1, "message": self.2 }))).into_response()
    }
}

impl From<DomainError> for ApiError {
    fn from(err: DomainError) -> Self {
        match err {
            DomainError::Invalid(m) => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", m),
            DomainError::NotFound(m) => ApiError(StatusCode::NOT_FOUND, "NOT_FOUND", m),
            DomainError::Db(e) => {
                log::error!("database error: {e}");
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, "DATABASE", "The record could not be read or saved.".to_string())
            }
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        DomainError::from(err).into()
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Deserialize)]
struct CaseListParams {
    #[serde(default)]
    query: String,
    #[serde(default)]
    view: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct RangeParams {
    from: i64,
    to: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrderListParams {
    #[serde(default)]
    status: String,
    #[serde(default)]
    case_id: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditParams {
    case_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RulingListParams {
    #[serde(default)]
    status: String,
    #[serde(default)]
    case_id: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct LibraryParams {
    #[serde(default)]
    query: String,
    #[serde(default)]
    kind: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeliverInput {
    delivered_on: i64,
}

#[derive(Deserialize)]
struct ReturnsParams {
    from: i64,
    to: i64,
}

#[derive(Deserialize)]
struct OutcomeInput {
    outcome: String,
}

#[derive(Deserialize)]
struct CancelInput {
    note: Option<String>,
}

/// Everything on one case, read together so the case's workspace opens in one
/// request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaseDetail {
    case: Case,
    parties: Vec<Party>,
    sittings: Vec<Sitting>,
    adjournments: Vec<Adjournment>,
    orders: Vec<OrderSummary>,
    exhibits: Vec<Exhibit>,
    rulings: Vec<RulingSummary>,
}

async fn system_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "state": "ready", "reason": null }))
}

async fn get_profile(State(s): State<AppState>) -> ApiResult<Option<BenchProfile>> {
    Ok(Json(profile::get(&s.pool).await?))
}

async fn save_profile(State(s): State<AppState>, Json(input): Json<SaveProfileInput>) -> ApiResult<BenchProfile> {
    Ok(Json(profile::save(&s.pool, input).await?))
}

async fn get_overview(State(s): State<AppState>, Query(p): Query<RangeParams>) -> ApiResult<Overview> {
    Ok(Json(overview::overview(&s.pool, p.from, p.to, chrono::Utc::now().timestamp_millis()).await?))
}

async fn list_cases(State(s): State<AppState>, Query(p): Query<CaseListParams>) -> ApiResult<Vec<CaseSummary>> {
    Ok(Json(cases::list(&s.pool, &p.query, &p.view, p.limit.unwrap_or(200)).await?))
}

async fn create_case(State(s): State<AppState>, Json(input): Json<CaseInput>) -> ApiResult<Case> {
    Ok(Json(cases::create(&s.pool, input).await?))
}

async fn get_case(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<CaseDetail> {
    let case = cases::get(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("Case not found.".to_string()))?;
    Ok(Json(CaseDetail {
        parties: cases::list_parties(&s.pool, &id).await?,
        sittings: sittings::list_for_case(&s.pool, &id).await?,
        adjournments: sittings::adjournments_for_case(&s.pool, &id).await?,
        orders: orders::list(&s.pool, "", &id, 200).await?,
        exhibits: exhibits::list(&s.pool, &id).await?,
        rulings: rulings::list(&s.pool, "", &id, 200).await?,
        case,
    }))
}

async fn update_case(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<CaseInput>) -> ApiResult<Case> {
    Ok(Json(cases::update(&s.pool, &id, input).await?))
}

async fn conclude_case(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<OutcomeInput>) -> ApiResult<Case> {
    Ok(Json(cases::conclude(&s.pool, &id, &input.outcome).await?))
}

async fn reopen_case(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Case> {
    Ok(Json(cases::reopen(&s.pool, &id).await?))
}

async fn add_party(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PartyInput>) -> ApiResult<Party> {
    Ok(Json(cases::add_party(&s.pool, &id, input).await?))
}

async fn update_party(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PartyInput>) -> ApiResult<Party> {
    Ok(Json(cases::update_party(&s.pool, &id, input).await?))
}

async fn remove_party(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    cases::remove_party(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn schedule_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SittingInput>) -> ApiResult<Sitting> {
    Ok(Json(sittings::schedule(&s.pool, &id, input).await?))
}

async fn reschedule_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SittingInput>) -> ApiResult<Sitting> {
    Ok(Json(sittings::reschedule(&s.pool, &id, input).await?))
}

async fn hold_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<OutcomeInput>) -> ApiResult<Sitting> {
    Ok(Json(sittings::hold(&s.pool, &id, &input.outcome).await?))
}

async fn cancel_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<CancelInput>) -> ApiResult<Sitting> {
    Ok(Json(sittings::cancel(&s.pool, &id, input.note).await?))
}

async fn adjourn_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AdjournInput>) -> ApiResult<Adjourned> {
    Ok(Json(sittings::adjourn(&s.pool, &id, input).await?))
}

async fn cause_list(State(s): State<AppState>, Query(p): Query<RangeParams>) -> ApiResult<Vec<CauseListRow>> {
    Ok(Json(sittings::cause_list(&s.pool, p.from, p.to).await?))
}

async fn list_orders(State(s): State<AppState>, Query(p): Query<OrderListParams>) -> ApiResult<Vec<OrderSummary>> {
    Ok(Json(orders::list(&s.pool, &p.status, &p.case_id, p.limit.unwrap_or(200)).await?))
}

async fn create_order(State(s): State<AppState>, Json(input): Json<CreateOrderInput>) -> ApiResult<Order> {
    Ok(Json(orders::create(&s.pool, input).await?))
}

async fn get_order(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Order>> {
    Ok(Json(orders::get(&s.pool, &id).await?))
}

async fn update_order(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateOrderInput>) -> ApiResult<Order> {
    Ok(Json(orders::update(&s.pool, &id, input).await?))
}

async fn discard_order(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    orders::discard(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn issue_order(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Order> {
    Ok(Json(orders::issue(&s.pool, &id).await?))
}

async fn get_sitting(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<SittingDetail> {
    Ok(Json(sitting_record::detail(&s.pool, &id).await?))
}

async fn take_appearances(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Appearance>> {
    Ok(Json(sitting_record::take_appearances(&s.pool, &id).await?))
}

async fn add_appearance(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AppearanceInput>) -> ApiResult<Appearance> {
    Ok(Json(sitting_record::add_appearance(&s.pool, &id, input).await?))
}

async fn set_attendance(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AttendanceInput>) -> ApiResult<Appearance> {
    Ok(Json(sitting_record::set_attendance(&s.pool, &id, input).await?))
}

async fn remove_appearance(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    sitting_record::remove_appearance(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn add_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteInput>) -> ApiResult<BenchNote> {
    Ok(Json(sitting_record::add_note(&s.pool, &id, input).await?))
}

async fn update_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteInput>) -> ApiResult<BenchNote> {
    Ok(Json(sitting_record::update_note(&s.pool, &id, input).await?))
}

async fn remove_note(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    sitting_record::remove_note(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn sign_record(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<SittingDetail> {
    Ok(Json(sitting_record::sign(&s.pool, &id).await?))
}

async fn mark_exhibit(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<MarkInput>) -> ApiResult<Exhibit> {
    Ok(Json(exhibits::mark(&s.pool, &id, input).await?))
}

async fn update_exhibit(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ExhibitUpdate>) -> ApiResult<Exhibit> {
    Ok(Json(exhibits::update(&s.pool, &id, input).await?))
}

async fn remove_exhibit(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    exhibits::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_rulings(State(s): State<AppState>, Query(p): Query<RulingListParams>) -> ApiResult<Vec<RulingSummary>> {
    Ok(Json(rulings::list(&s.pool, &p.status, &p.case_id, p.limit.unwrap_or(200)).await?))
}

async fn create_ruling(State(s): State<AppState>, Json(input): Json<RulingCreate>) -> ApiResult<Ruling> {
    Ok(Json(rulings::create(&s.pool, input).await?))
}

async fn get_ruling(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Ruling>> {
    Ok(Json(rulings::get(&s.pool, &id).await?))
}

async fn update_ruling(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<RulingUpdate>) -> ApiResult<Ruling> {
    Ok(Json(rulings::update(&s.pool, &id, input).await?))
}

async fn discard_ruling(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    rulings::discard(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn deliver_ruling(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<DeliverInput>) -> ApiResult<Ruling> {
    Ok(Json(rulings::deliver(&s.pool, &id, input.delivered_on).await?))
}

async fn list_library(State(s): State<AppState>, Query(p): Query<LibraryParams>) -> ApiResult<Vec<LibrarySummary>> {
    Ok(Json(library::list(&s.pool, &p.query, &p.kind, p.limit.unwrap_or(200)).await?))
}

async fn add_library(State(s): State<AppState>, Json(input): Json<ItemInput>) -> ApiResult<LibraryItem> {
    Ok(Json(library::add(&s.pool, input).await?))
}

async fn get_library(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<LibraryItem>> {
    Ok(Json(library::get(&s.pool, &id).await?))
}

async fn update_library(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ItemInput>) -> ApiResult<LibraryItem> {
    Ok(Json(library::update(&s.pool, &id, input).await?))
}

async fn remove_library(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    library::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn start_recording(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<StartInput>) -> ApiResult<Recording> {
    Ok(Json(recordings::start(&s.pool, &id, input).await?))
}

async fn list_recordings(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Recording>> {
    Ok(Json(recordings::list_for_sitting(&s.pool, &id).await?))
}

async fn append_chunk(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ChunkInput>) -> ApiResult<Chunk> {
    Ok(Json(recordings::append_chunk(&s.pool, &s.vault_root, &id, input).await?))
}

async fn stop_recording(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Recording> {
    Ok(Json(recordings::stop(&s.pool, &id).await?))
}

async fn verify_recording(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Check> {
    Ok(Json(recordings::verify(&s.pool, &s.vault_root, &id).await?))
}

async fn recording_audio(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Audio> {
    Ok(Json(recordings::audio(&s.pool, &s.vault_root, &id).await?))
}

async fn transcription_status() -> Json<transcripts::Status> {
    Json(transcripts::status())
}

async fn transcribe_recording(State(s): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Segment>>, ApiError> {
    match transcripts::transcribe(&s.pool, &id).await {
        Ok(segments) => Ok(Json(segments)),
        Err(TranscribeError::Unavailable(reason)) => Err(ApiError(StatusCode::SERVICE_UNAVAILABLE, "TRANSCRIPTION_UNAVAILABLE", reason)),
    }
}

async fn list_segments(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Segment>> {
    Ok(Json(transcripts::list(&s.pool, &id).await?))
}

async fn add_segment(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SegmentInput>) -> ApiResult<Segment> {
    Ok(Json(transcripts::add(&s.pool, &id, input).await?))
}

async fn update_segment(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SegmentInput>) -> ApiResult<Segment> {
    Ok(Json(transcripts::update(&s.pool, &id, input).await?))
}

async fn remove_segment(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    transcripts::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn adopt_segment(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AdoptInput>) -> ApiResult<Segment> {
    Ok(Json(transcripts::adopt(&s.pool, &id, input).await?))
}

async fn get_returns(State(s): State<AppState>, Query(p): Query<ReturnsParams>) -> ApiResult<Returns> {
    Ok(Json(reports::returns(&s.pool, p.from, p.to, chrono::Utc::now().timestamp_millis()).await?))
}

async fn recent_audit(State(s): State<AppState>, Query(p): Query<AuditParams>) -> ApiResult<Vec<AuditEntry>> {
    Ok(Json(audit::recent(&s.pool, p.case_id.as_deref(), p.limit.unwrap_or(100)).await?))
}

async fn verify_audit(State(s): State<AppState>) -> ApiResult<Verification> {
    Ok(Json(audit::verify(&s.pool).await?))
}

async fn not_found() -> ApiError {
    ApiError(StatusCode::NOT_FOUND, "NOT_FOUND", "There is nothing at that address.".to_string())
}

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/system/status", get(system_status))
        .route("/profile", get(get_profile).put(save_profile))
        .route("/overview", get(get_overview))
        .route("/cases", post(create_case).get(list_cases))
        .route("/cases/{id}", get(get_case).put(update_case))
        .route("/cases/{id}/conclude", post(conclude_case))
        .route("/cases/{id}/reopen", post(reopen_case))
        .route("/cases/{id}/parties", post(add_party))
        .route("/cases/{id}/sittings", post(schedule_sitting))
        .route("/parties/{id}", axum::routing::put(update_party).delete(remove_party))
        .route("/sittings/{id}", get(get_sitting).put(reschedule_sitting))
        .route("/sittings/{id}/appearances/take", post(take_appearances))
        .route("/sittings/{id}/appearances", post(add_appearance))
        .route("/sittings/{id}/notes", post(add_note))
        .route("/sittings/{id}/sign", post(sign_record))
        .route("/appearances/{id}", axum::routing::put(set_attendance).delete(remove_appearance))
        .route("/notes/{id}", axum::routing::put(update_note).delete(remove_note))
        .route("/cases/{id}/exhibits", post(mark_exhibit))
        .route("/exhibits/{id}", axum::routing::put(update_exhibit).delete(remove_exhibit))
        .route("/rulings", post(create_ruling).get(list_rulings))
        .route("/rulings/{id}", get(get_ruling).put(update_ruling).delete(discard_ruling))
        .route("/rulings/{id}/deliver", post(deliver_ruling))
        .route("/sittings/{id}/recordings", post(start_recording).get(list_recordings))
        .route("/recordings/{id}/chunks", post(append_chunk))
        .route("/recordings/{id}/stop", post(stop_recording))
        .route("/recordings/{id}/verify", get(verify_recording))
        .route("/recordings/{id}/audio", get(recording_audio))
        .route("/recordings/{id}/transcribe", post(transcribe_recording))
        .route("/recordings/{id}/segments", post(add_segment).get(list_segments))
        .route("/segments/{id}", axum::routing::put(update_segment).delete(remove_segment))
        .route("/segments/{id}/adopt", post(adopt_segment))
        .route("/transcription/status", get(transcription_status))
        .route("/reports/returns", get(get_returns))
        .route("/library", post(add_library).get(list_library))
        .route("/library/{id}", get(get_library).put(update_library).delete(remove_library))
        .route("/sittings/{id}/hold", post(hold_sitting))
        .route("/sittings/{id}/adjourn", post(adjourn_sitting))
        .route("/sittings/{id}/cancel", post(cancel_sitting))
        .route("/cause-list", get(cause_list))
        .route("/orders", post(create_order).get(list_orders))
        .route("/orders/{id}", get(get_order).put(update_order).delete(discard_order))
        .route("/orders/{id}/issue", post(issue_order))
        .route("/audit", get(recent_audit))
        .route("/audit/verify", get(verify_audit));

    Router::new().nest("/api", api).fallback(not_found).layer(DefaultBodyLimit::max(16 * 1024 * 1024)).with_state(state)
}

/// What the app serves when its data could not be opened: a status that says so,
/// and a refusal for everything else. Nothing is guessed and nothing is created.
pub fn recovery_router(reason: String) -> Router {
    async fn status(State(reason): State<String>) -> Json<serde_json::Value> {
        Json(serde_json::json!({ "state": "recovery", "reason": reason }))
    }
    async fn refuse() -> ApiError {
        ApiError(StatusCode::SERVICE_UNAVAILABLE, "RECOVERY", "The data could not be opened.".to_string())
    }
    Router::new().route("/api/system/status", get(status)).fallback(refuse).with_state(reason)
}

/// Development only: the same router on a loopback port, so the real frontend
/// can be driven from a browser.
#[cfg(debug_assertions)]
pub async fn serve_dev(router: Router) {
    use tower_http::cors::{Any, CorsLayer};
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
    // PLEADLI_DEV_PORT lets a second instance (a test run) sit beside the app.
    let port = std::env::var("PLEADLI_DEV_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(DEV_PORT);
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(e) => {
            log::warn!("dev API could not bind to 127.0.0.1:{port}: {e}");
            return;
        }
    };
    if let Err(e) = axum::serve(listener, router.layer(cors)).await {
        log::warn!("dev API stopped: {e}");
    }
}

#[cfg(test)]
mod tests;
