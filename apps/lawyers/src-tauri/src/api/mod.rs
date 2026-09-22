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
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::domain::audit::{self, AuditEntry, Verification};
use crate::domain::clients::{self, Client, ClientInput, ClientSummary};
use crate::domain::documents::{self, CreateInput as DocumentCreate, Document, DocumentSummary, FileInput, UpdateInput as DocumentUpdate};
use crate::domain::error::DomainError;
use crate::domain::hearings::{self, Adjourned, AdjournInput, DiaryRow, Hearing, HearingInput};
use crate::domain::matters::{self, Matter, MatterInput, MatterSummary};
use crate::domain::notes::{self, MatterNote, NoteInput, TimeEntry, TimeInput};
use crate::domain::overview::{self, Overview};
use crate::domain::plea::{self, Plea, PleaInput};
use crate::domain::profile::{self, AdvocateProfile, SaveProfileInput};
use crate::domain::tasks::{self, Task, TaskInput};

pub const DEV_PORT: u16 = 47924;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
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
struct QueryParams {
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
struct TaskListParams {
    #[serde(default)]
    view: String,
    #[serde(default)]
    matter_id: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TimeListParams {
    #[serde(default)]
    matter_id: String,
    from: i64,
    to: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentListParams {
    #[serde(default)]
    status: String,
    #[serde(default)]
    matter_id: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditParams {
    matter_id: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct OutcomeInput {
    outcome: String,
}

#[derive(Deserialize)]
struct NoteOnly {
    note: Option<String>,
}

#[derive(Deserialize)]
struct DoneInput {
    done: bool,
}

/// Everything on one matter, read together so its workspace opens in one request.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MatterDetail {
    matter: Matter,
    client: Client,
    hearings: Vec<Hearing>,
    tasks: Vec<Task>,
    notes: Vec<MatterNote>,
    time: Vec<TimeEntry>,
    documents: Vec<DocumentSummary>,
    plea: Option<Plea>,
}

async fn system_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "state": "ready", "reason": null }))
}

async fn get_profile(State(s): State<AppState>) -> ApiResult<Option<AdvocateProfile>> {
    Ok(Json(profile::get(&s.pool).await?))
}

async fn save_profile(State(s): State<AppState>, Json(input): Json<SaveProfileInput>) -> ApiResult<AdvocateProfile> {
    Ok(Json(profile::save(&s.pool, input).await?))
}

async fn get_overview(State(s): State<AppState>, Query(p): Query<RangeParams>) -> ApiResult<Overview> {
    Ok(Json(overview::overview(&s.pool, p.from, p.to, chrono::Utc::now().timestamp_millis()).await?))
}

async fn list_clients(State(s): State<AppState>, Query(p): Query<QueryParams>) -> ApiResult<Vec<ClientSummary>> {
    Ok(Json(clients::list(&s.pool, &p.query, p.limit.unwrap_or(200)).await?))
}

async fn create_client(State(s): State<AppState>, Json(input): Json<ClientInput>) -> ApiResult<Client> {
    Ok(Json(clients::create(&s.pool, input).await?))
}

async fn get_client(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Client>> {
    Ok(Json(clients::get(&s.pool, &id).await?))
}

async fn update_client(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ClientInput>) -> ApiResult<Client> {
    Ok(Json(clients::update(&s.pool, &id, input).await?))
}

async fn list_matters(State(s): State<AppState>, Query(p): Query<QueryParams>) -> ApiResult<Vec<MatterSummary>> {
    Ok(Json(matters::list(&s.pool, &p.query, &p.view, p.limit.unwrap_or(200)).await?))
}

async fn create_matter(State(s): State<AppState>, Json(input): Json<MatterInput>) -> ApiResult<Matter> {
    Ok(Json(matters::create(&s.pool, input).await?))
}

async fn get_matter(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<MatterDetail> {
    let matter = matters::get(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("Matter not found.".to_string()))?;
    let client = clients::get(&s.pool, &matter.client_id).await?.ok_or_else(|| DomainError::NotFound("Client not found.".to_string()))?;
    Ok(Json(MatterDetail {
        hearings: hearings::list_for_matter(&s.pool, &id).await?,
        tasks: tasks::list(&s.pool, "", &id, 200).await?,
        notes: notes::list_notes(&s.pool, &id).await?,
        time: notes::list_time(&s.pool, &id, 0, i64::MAX / 2).await?,
        documents: documents::list(&s.pool, "", &id, 200).await?,
        plea: plea::get(&s.pool, &id).await?,
        client,
        matter,
    }))
}

async fn update_matter(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<MatterInput>) -> ApiResult<Matter> {
    Ok(Json(matters::update(&s.pool, &id, input).await?))
}

async fn close_matter(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<OutcomeInput>) -> ApiResult<Matter> {
    Ok(Json(matters::close(&s.pool, &id, &input.outcome).await?))
}

async fn reopen_matter(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Matter> {
    Ok(Json(matters::reopen(&s.pool, &id).await?))
}

async fn schedule_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<HearingInput>) -> ApiResult<Hearing> {
    Ok(Json(hearings::schedule(&s.pool, &id, input).await?))
}

async fn reschedule_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<HearingInput>) -> ApiResult<Hearing> {
    Ok(Json(hearings::reschedule(&s.pool, &id, input).await?))
}

async fn attend_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<OutcomeInput>) -> ApiResult<Hearing> {
    Ok(Json(hearings::attend(&s.pool, &id, &input.outcome).await?))
}

async fn miss_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteOnly>) -> ApiResult<Hearing> {
    Ok(Json(hearings::miss(&s.pool, &id, input.note).await?))
}

async fn cancel_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteOnly>) -> ApiResult<Hearing> {
    Ok(Json(hearings::cancel(&s.pool, &id, input.note).await?))
}

async fn adjourn_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AdjournInput>) -> ApiResult<Adjourned> {
    Ok(Json(hearings::adjourn(&s.pool, &id, input).await?))
}

async fn get_diary(State(s): State<AppState>, Query(p): Query<RangeParams>) -> ApiResult<Vec<DiaryRow>> {
    Ok(Json(hearings::diary(&s.pool, p.from, p.to).await?))
}

async fn list_tasks(State(s): State<AppState>, Query(p): Query<TaskListParams>) -> ApiResult<Vec<Task>> {
    Ok(Json(tasks::list(&s.pool, &p.view, &p.matter_id, p.limit.unwrap_or(200)).await?))
}

async fn create_task(State(s): State<AppState>, Json(input): Json<TaskInput>) -> ApiResult<Task> {
    Ok(Json(tasks::create(&s.pool, input).await?))
}

async fn update_task(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<TaskInput>) -> ApiResult<Task> {
    Ok(Json(tasks::update(&s.pool, &id, input).await?))
}

async fn set_task_done(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<DoneInput>) -> ApiResult<Task> {
    Ok(Json(tasks::set_done(&s.pool, &id, input.done).await?))
}

async fn remove_task(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    tasks::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn add_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteInput>) -> ApiResult<MatterNote> {
    Ok(Json(notes::add_note(&s.pool, &id, input).await?))
}

async fn update_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NoteInput>) -> ApiResult<MatterNote> {
    Ok(Json(notes::update_note(&s.pool, &id, input).await?))
}

async fn remove_note(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    notes::remove_note(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn add_time(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<TimeInput>) -> ApiResult<TimeEntry> {
    Ok(Json(notes::add_time(&s.pool, &id, input).await?))
}

async fn list_time(State(s): State<AppState>, Query(p): Query<TimeListParams>) -> ApiResult<Vec<TimeEntry>> {
    Ok(Json(notes::list_time(&s.pool, &p.matter_id, p.from, p.to).await?))
}

async fn remove_time(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    notes::remove_time(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_documents(State(s): State<AppState>, Query(p): Query<DocumentListParams>) -> ApiResult<Vec<DocumentSummary>> {
    Ok(Json(documents::list(&s.pool, &p.status, &p.matter_id, p.limit.unwrap_or(200)).await?))
}

async fn create_document(State(s): State<AppState>, Json(input): Json<DocumentCreate>) -> ApiResult<Document> {
    Ok(Json(documents::create(&s.pool, input).await?))
}

async fn get_document(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Document>> {
    Ok(Json(documents::get(&s.pool, &id).await?))
}

async fn update_document(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<DocumentUpdate>) -> ApiResult<Document> {
    Ok(Json(documents::update(&s.pool, &id, input).await?))
}

async fn discard_document(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    documents::discard(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn file_document(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<FileInput>) -> ApiResult<Document> {
    Ok(Json(documents::file(&s.pool, &id, input).await?))
}

async fn get_plea(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Plea>> {
    Ok(Json(plea::get(&s.pool, &id).await?))
}

async fn save_plea(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PleaInput>) -> ApiResult<Plea> {
    Ok(Json(plea::save(&s.pool, &id, input).await?))
}

async fn recent_audit(State(s): State<AppState>, Query(p): Query<AuditParams>) -> ApiResult<Vec<AuditEntry>> {
    Ok(Json(audit::recent(&s.pool, p.matter_id.as_deref(), p.limit.unwrap_or(100)).await?))
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
        .route("/clients", post(create_client).get(list_clients))
        .route("/clients/{id}", get(get_client).put(update_client))
        .route("/matters", post(create_matter).get(list_matters))
        .route("/matters/{id}", get(get_matter).put(update_matter))
        .route("/matters/{id}/close", post(close_matter))
        .route("/matters/{id}/reopen", post(reopen_matter))
        .route("/matters/{id}/hearings", post(schedule_hearing))
        .route("/matters/{id}/notes", post(add_note))
        .route("/matters/{id}/time", post(add_time))
        .route("/matters/{id}/plea", get(get_plea).put(save_plea))
        .route("/hearings/{id}", put(reschedule_hearing))
        .route("/hearings/{id}/attend", post(attend_hearing))
        .route("/hearings/{id}/adjourn", post(adjourn_hearing))
        .route("/hearings/{id}/miss", post(miss_hearing))
        .route("/hearings/{id}/cancel", post(cancel_hearing))
        .route("/diary", get(get_diary))
        .route("/tasks", post(create_task).get(list_tasks))
        .route("/tasks/{id}", put(update_task).delete(remove_task))
        .route("/tasks/{id}/done", post(set_task_done))
        .route("/notes/{id}", put(update_note).delete(remove_note))
        .route("/time", get(list_time))
        .route("/time/{id}", delete(remove_time))
        .route("/documents", post(create_document).get(list_documents))
        .route("/documents/{id}", get(get_document).put(update_document).delete(discard_document))
        .route("/documents/{id}/file", post(file_document))
        .route("/audit", get(recent_audit))
        .route("/audit/verify", get(verify_audit));

    Router::new().nest("/api", api).fallback(not_found).layer(DefaultBodyLimit::max(8 * 1024 * 1024)).with_state(state)
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
