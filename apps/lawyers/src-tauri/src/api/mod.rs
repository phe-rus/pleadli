//! The one HTTP surface of the application: every route is under `/api/**`.
//!
//! The desktop webview reaches it through the single `api_request` command,
//! which hands the request to this router in process (no socket). In a browser
//! during development the same router is served on a loopback port, so the same
//! domain code and the same validation run either way. Handlers only translate:
//! rules live in `domain/`.

use std::sync::Arc;

use axum::{
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post, put},
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::domain::assist::{self, Answer as AssistAnswer, AskInput, AssistSettings, AssistSettingsInput};
use crate::domain::audit::{self, AuditEntry, Verification};
use crate::domain::bills::{self, Bill, BillInput, BillSummary, NewBill};
use crate::domain::compliance::{self, Compliance, ComplianceInput};
use crate::domain::registers::{self, EntryInput as RegisterInput, RegisterEntry};
use crate::domain::statistics::{self, Statistics};
use crate::domain::money::{self, ClientMoney, ClientPosition, EntryInput, FeeNote, FeeNoteInput, FeeNoteSummary, LedgerEntry};
use crate::domain::papers::{self, AddInput as PaperAdd, EditInput as PaperEdit, Paper};
use crate::domain::clients::{self, Client, ClientInput, ClientSummary};
use crate::domain::clocks::{self, EventInput, MatterClocks, MatterEvent, PracticeClock};
use crate::domain::documents::{self, CreateInput as DocumentCreate, Document, DocumentSummary, FileInput, UpdateInput as DocumentUpdate, Verification as DocumentVerification};
use crate::domain::filings::{self, Filing, FilingInput, ServiceInput};
use crate::domain::error::DomainError;
use crate::domain::hearings::{self, Adjourned, AdjournInput, DiaryRow, Hearing, HearingInput};
use crate::domain::installation::{self, Brand, Installation, SetupInput, SetupStatus, UpdateInstallationInput};
use crate::domain::lock::{self, LockError};
use crate::domain::matters::{self, Matter, MatterInput, MatterSummary};
use crate::domain::matter_types;
use crate::domain::notes::{self, MatterNote, NoteInput, TimeEntry, TimeInput};
use crate::domain::parties::{self, ConflictHit, Party, PartyInput};
use crate::domain::overview::{self, Overview};
use crate::domain::plea::{self, Plea, PleaInput};
use crate::domain::profile::{self, AdvocateProfile, SaveProfileInput};
use crate::domain::security::{self as security_domain, Security, SessionStatus, SignInInput, SignInOutcome};
use crate::domain::staff::{self, Actor, PersonInput, Protection, SignInPerson, Staff, UpdateStaffInput};
use crate::domain::tasks::{self, Task, TaskInput};
use crate::domain::totp::{self, Enrolment};
use crate::domain::usages::{self, UsagesInput};

mod network;

pub use network::Lan;

pub const DEV_PORT: u16 = 47924;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    /// Where papers are sealed (node-core `vault`).
    pub vault_root: std::path::PathBuf,
    /// The old PIN lock (spec 0001). Only guards an installation before setup.
    pub lock: Arc<lock::Runtime>,
    /// Who is signed in, after setup, on each computer.
    pub security: Arc<Security>,
    /// Standalone, the office, or a computer joined to one (L6).
    pub network: Arc<crate::domain::network::Runtime>,
    /// The office's listener.
    pub lan: Arc<Lan>,
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
            DomainError::Forbidden(m) => ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", m),
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

impl From<LockError> for ApiError {
    fn from(err: LockError) -> Self {
        let message = err.to_string();
        match err {
            LockError::InvalidLength => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "PIN_INVALID_LENGTH", message),
            LockError::AlreadyEnabled => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "ALREADY_ENABLED", message),
            LockError::NotEnabled => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "NOT_ENABLED", message),
            LockError::InvalidPin => ApiError(StatusCode::UNAUTHORIZED, "INVALID_PIN", message),
            LockError::InvalidRecoveryCode => ApiError(StatusCode::UNAUTHORIZED, "INVALID_RECOVERY_CODE", message),
            LockError::Cooldown(_) => ApiError(StatusCode::TOO_MANY_REQUESTS, "COOLDOWN", message),
            LockError::Db(e) => {
                log::error!("lock error: {e}");
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, "DATABASE", "The record could not be read or saved.".to_string())
            }
        }
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Deserialize)]
struct QueryParams {
    #[serde(default)]
    query: String,
    #[serde(default)]
    view: String,
    #[serde(default, rename = "type")]
    matter_type: String,
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
    parties: Vec<Party>,
    clocks: MatterClocks,
    filings: Vec<Filing>,
}

async fn system_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "state": "ready", "reason": null }))
}

async fn get_profile(State(s): State<AppState>) -> ApiResult<Option<AdvocateProfile>> {
    Ok(Json(profile::get(&s.pool).await?))
}

async fn save_profile(State(s): State<AppState>, Json(input): Json<SaveProfileInput>) -> ApiResult<AdvocateProfile> {
    let saved = profile::save(&s.pool, input).await?;
    // The name the session carries is what the audit trail and filings use.
    s.security.refresh_actor(&s.pool).await?;
    Ok(Json(saved))
}

async fn lock_status(State(s): State<AppState>) -> ApiResult<lock::Status> {
    Ok(Json(lock::status(&s.pool, &s.lock).await?))
}

async fn lock_setup(State(s): State<AppState>, Json(input): Json<lock::SetupInput>) -> ApiResult<lock::RecoveryCode> {
    if s.security.is_installed() {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Sign-in is set by the protection level in Settings.".to_string()));
    }
    Ok(Json(lock::setup(&s.pool, input).await?))
}

async fn lock_unlock(State(s): State<AppState>, Json(input): Json<lock::UnlockInput>) -> Result<StatusCode, ApiError> {
    lock::unlock(&s.pool, &s.lock, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn lock_lock(State(s): State<AppState>) -> Result<StatusCode, ApiError> {
    lock::lock_now(&s.pool, &s.lock).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn lock_disable(State(s): State<AppState>, Json(input): Json<lock::DisableInput>) -> Result<StatusCode, ApiError> {
    lock::disable(&s.pool, &s.lock, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn lock_recover(State(s): State<AppState>, Json(input): Json<lock::RecoverInput>) -> ApiResult<lock::RecoveryCode> {
    Ok(Json(lock::recover(&s.pool, &s.lock, input).await?))
}

/// Who may reach what. `/lock/**`, `/system/status`, `/session/status` and the
/// brand are mounted outside this (see `router`). Before setup only setup
/// itself works, and an installation whose old PIN lock is closed must unlock
/// first. After setup, with nobody signed in, only the sign-in list and signing
/// in work. Every other call counts as use, which postpones the idle sign-out.
/// The check runs before any handler, whether the caller is the visible screen
/// or a direct call to this application's own local API.
async fn gate(State(s): State<AppState>, req: Request, next: Next) -> Response {
    // Inside the nested router the `/api` prefix is already stripped.
    let path = req.uri().path();
    if !s.security.is_installed() {
        if s.lock.is_locked() {
            return ApiError(StatusCode::LOCKED, "LOCKED", "The app is locked.".to_string()).into_response();
        }
        if path.starts_with("/setup/") {
            return next.run(req).await;
        }
        return ApiError(StatusCode::PRECONDITION_REQUIRED, "SETUP_REQUIRED", "The application is not set up yet.".to_string()).into_response();
    }
    if path.starts_with("/setup/") || path == "/session/people" || path == "/session/sign-in" {
        return next.run(req).await;
    }
    if s.security.is_locked() {
        return ApiError(StatusCode::LOCKED, "LOCKED", "Sign in to continue.".to_string()).into_response();
    }
    s.security.touch();
    next.run(req).await
}

// ---- Setup, sign-in, the people of the practice and what it does ----------

fn forbidden(message: &str) -> ApiError {
    ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", message.to_string())
}

fn require_admin(s: &AppState) -> Result<Actor, ApiError> {
    match s.security.actor() {
        Some(actor) if actor.is_admin => Ok(actor),
        _ => Err(forbidden("Only an administrator of the practice can do that.")),
    }
}

fn not_installed(s: &AppState) -> Result<(), ApiError> {
    if s.security.is_installed() {
        return Err(forbidden("This copy is already set up."));
    }
    Ok(())
}

async fn session_status(State(s): State<AppState>) -> Json<SessionStatus> {
    Json(s.security.status(s.lock.is_locked()))
}

async fn setup_status(State(s): State<AppState>) -> ApiResult<SetupStatus> {
    Ok(Json(installation::setup_status(&s.pool).await?))
}

#[derive(Deserialize)]
struct EnrolInput {
    name: String,
}

async fn setup_second_factor(State(s): State<AppState>, Json(input): Json<EnrolInput>) -> ApiResult<Enrolment> {
    not_installed(&s)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err(DomainError::Invalid("A name is required.".to_string()).into());
    }
    Ok(Json(totp::enrol(security_domain::ISSUER, name).map_err(DomainError::Invalid)?))
}

async fn setup_complete(State(s): State<AppState>, Json(input): Json<SetupInput>) -> ApiResult<SessionStatus> {
    not_installed(&s)?;
    installation::complete_setup(&s.pool, input).await?;
    s.security.load(&s.pool).await?;
    s.lock.set_locked(false);
    // Whoever set it up is already signed in: they just proved who they are.
    if let Some(admin) = staff::first_administrator(&s.pool).await? {
        s.security.adopt(&s.pool, admin).await?;
    }
    Ok(Json(s.security.status(false)))
}

async fn get_brand(State(s): State<AppState>) -> ApiResult<Brand> {
    Ok(Json(installation::brand(&s.pool).await?))
}

async fn get_installation(State(s): State<AppState>) -> ApiResult<Option<Installation>> {
    Ok(Json(installation::get(&s.pool).await?))
}

async fn update_installation(State(s): State<AppState>, Json(input): Json<UpdateInstallationInput>) -> ApiResult<Installation> {
    require_admin(&s)?;
    Ok(Json(installation::update(&s.pool, input).await?))
}

#[derive(Deserialize)]
struct JurisdictionInput {
    jurisdiction: String,
    #[serde(default)]
    region: Option<String>,
}

/// Development only: moves the installation to another country so each
/// country's courts and deadlines can be tried without a new setup. A release
/// build refuses it: a real practice's country is fixed at setup.
async fn set_jurisdiction(State(s): State<AppState>, Json(input): Json<JurisdictionInput>) -> ApiResult<Installation> {
    if !cfg!(debug_assertions) {
        return Err(forbidden("The country is chosen at setup."));
    }
    require_admin(&s)?;
    Ok(Json(installation::set_jurisdiction(&s.pool, &input.jurisdiction, input.region).await?))
}

#[derive(Deserialize)]
struct ProtectionInput {
    protection: String,
    #[serde(default)]
    secret: Option<String>,
}

async fn set_protection(State(s): State<AppState>, Json(input): Json<ProtectionInput>) -> ApiResult<SessionStatus> {
    let admin = require_admin(&s)?;
    let level = Protection::parse(&input.protection).ok_or_else(|| DomainError::Invalid("That protection level is not known.".to_string()))?;
    installation::set_protection(&s.pool, &admin.id, level, input.secret.as_deref()).await?;
    s.security.load(&s.pool).await?;
    // The administrator who changed it stays signed in under the new level.
    s.security.adopt(&s.pool, admin).await?;
    Ok(Json(s.security.status(false)))
}

#[derive(Deserialize)]
struct IdleInput {
    minutes: u32,
}

async fn set_idle(State(s): State<AppState>, Json(input): Json<IdleInput>) -> ApiResult<SessionStatus> {
    require_admin(&s)?;
    s.security.set_idle_minutes(&s.pool, input.minutes).await?;
    Ok(Json(s.security.status(false)))
}

async fn session_people(State(s): State<AppState>) -> ApiResult<Vec<SignInPerson>> {
    Ok(Json(staff::sign_in_list(&s.pool, s.security.protection()).await?))
}

async fn sign_in(State(s): State<AppState>, Json(input): Json<SignInInput>) -> ApiResult<SignInOutcome> {
    Ok(Json(s.security.sign_in(&s.pool, input).await?))
}

async fn sign_out(State(s): State<AppState>) -> Json<SessionStatus> {
    s.security.sign_out(&s.pool).await;
    Json(s.security.status(false))
}

async fn list_staff(State(s): State<AppState>) -> ApiResult<Vec<Staff>> {
    Ok(Json(staff::list(&s.pool).await?))
}

async fn create_staff(State(s): State<AppState>, Json(input): Json<PersonInput>) -> ApiResult<Staff> {
    require_admin(&s)?;
    let setting = installation::get(&s.pool).await?.map(|i| i.setting);
    if setting.as_deref() == Some("alone") {
        return Err(DomainError::Invalid("Working alone, you are the only person. Change the practice to a firm in Settings to add people.".to_string()).into());
    }
    let created = staff::create(&s.pool, s.security.protection(), input).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("staff_added").subject("staff", &created.id)).await;
    Ok(Json(created))
}

async fn update_staff(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateStaffInput>) -> ApiResult<Staff> {
    require_admin(&s)?;
    let updated = staff::update(&s.pool, &id, input).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("staff_changed").subject("staff", &id)).await;
    s.security.refresh_actor(&s.pool).await?;
    Ok(Json(updated))
}

#[derive(Deserialize)]
struct SecretInput {
    secret: String,
}

/// An administrator sets anyone's PIN or password; a person may set their own.
async fn set_staff_secret(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SecretInput>) -> Result<StatusCode, ApiError> {
    let actor = s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))?;
    if !actor.is_admin && actor.id != id {
        return Err(forbidden("Only an administrator of the practice can do that."));
    }
    staff::set_secret(&s.pool, s.security.protection(), &id, &input.secret).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("staff_secret_set").subject("staff", &id)).await;
    Ok(StatusCode::NO_CONTENT)
}

/// A lost phone: the person links a new one at their next sign-in.
async fn reset_second_factor(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    staff::set_second_factor(&s.pool, &id, None).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("second_factor_reset").subject("staff", &id)).await;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_usages(State(s): State<AppState>) -> ApiResult<Vec<String>> {
    Ok(Json(usages::list(&s.pool).await?))
}

async fn set_usages(State(s): State<AppState>, Json(input): Json<UsagesInput>) -> ApiResult<Vec<String>> {
    require_admin(&s)?;
    Ok(Json(usages::set(&s.pool, input.usages).await?))
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
    Ok(Json(matters::list(&s.pool, &p.query, &p.view, &p.matter_type, p.limit.unwrap_or(200)).await?))
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
        parties: parties::list(&s.pool, &id).await?,
        clocks: clocks::for_matter(&s.pool, &id, &matter.matter_type).await?,
        filings: filings::list(&s.pool, &id).await?,
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
    let actor = s.security.actor();
    Ok(Json(notes::add_time(&s.pool, &id, input, actor.as_ref().map(|a| a.id.as_str())).await?))
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

#[derive(Deserialize)]
struct StageInput {
    stage: String,
}

async fn set_stage(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<StageInput>) -> ApiResult<Matter> {
    Ok(Json(matters::set_stage(&s.pool, &id, &input.stage).await?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MatterTypeRow {
    id: &'static str,
    usage: &'static str,
    stages: &'static [&'static str],
}

async fn list_matter_types() -> Json<Vec<MatterTypeRow>> {
    Json(matter_types::TYPES.iter().map(|t| MatterTypeRow { id: t.id, usage: t.usage, stages: t.stages }).collect())
}

async fn add_party(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PartyInput>) -> ApiResult<Party> {
    Ok(Json(parties::add(&s.pool, &id, input).await?))
}

async fn update_party(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PartyInput>) -> ApiResult<Party> {
    Ok(Json(parties::update(&s.pool, &id, input).await?))
}

async fn remove_party(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    parties::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConflictParams {
    name: String,
    #[serde(default)]
    except_matter: Option<String>,
}

async fn find_conflicts(State(s): State<AppState>, Query(p): Query<ConflictParams>) -> ApiResult<Vec<ConflictHit>> {
    Ok(Json(parties::conflicts(&s.pool, &p.name, p.except_matter.as_deref()).await?))
}

async fn record_event(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<EventInput>) -> ApiResult<MatterEvent> {
    Ok(Json(clocks::record(&s.pool, &id, input, s.security.actor().map(|a| a.name)).await?))
}

async fn remove_event(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    clocks::remove(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn practice_clocks(State(s): State<AppState>) -> ApiResult<Vec<PracticeClock>> {
    Ok(Json(clocks::open_clocks(&s.pool).await?))
}

async fn create_filing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<FilingInput>) -> ApiResult<Filing> {
    Ok(Json(filings::create(&s.pool, &id, input).await?))
}

async fn get_filing(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Filing> {
    Ok(Json(filings::get(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("Filing not found.".to_string()))?))
}

async fn record_service(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ServiceInput>) -> ApiResult<Filing> {
    Ok(Json(filings::record_service(&s.pool, &id, input).await?))
}

#[derive(Deserialize)]
struct VerifyInput {
    reference: String,
    code: String,
}

async fn verify_document(State(s): State<AppState>, Json(input): Json<VerifyInput>) -> ApiResult<DocumentVerification> {
    Ok(Json(documents::verify(&s.pool, &input.reference, &input.code).await?))
}

// ---- Assist (L3; D12) ------------------------------------------------------

/// Anyone signed in may see whether Assist is ready; the key never leaves.
async fn get_assist_settings(State(s): State<AppState>) -> ApiResult<AssistSettings> {
    s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))?;
    Ok(Json(assist::settings(&s.pool).await?))
}

async fn put_assist_settings(State(s): State<AppState>, Json(input): Json<AssistSettingsInput>) -> ApiResult<AssistSettings> {
    let admin = require_admin(&s)?;
    Ok(Json(assist::save_settings(&s.pool, input, &admin.name).await?))
}

async fn assist_models(State(s): State<AppState>) -> ApiResult<Vec<pleadli_node_core::ai::ModelInfo>> {
    require_admin(&s)?;
    Ok(Json(assist::models(&s.pool).await?))
}

async fn ask_assist(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AskInput>) -> ApiResult<AssistAnswer> {
    let actor = s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))?;
    Ok(Json(assist::ask(&s.pool, &id, input, &actor).await?))
}

// ---- Money (L4) -----------------------------------------------------------

/// Anyone signed in may read the books; only an advocate or the accounts role
/// changes them (a paralegal does not make trust payments).
fn money_keeper(s: &AppState) -> Result<crate::domain::staff::Actor, ApiError> {
    match s.security.actor() {
        Some(a) if a.role == "advocate" || a.role == "accounts" => Ok(a),
        Some(_) => Err(forbidden("Only an advocate or the practice's accounts person keeps the books.")),
        None => Err(forbidden("Nobody is signed in.")),
    }
}

fn signed_in(s: &AppState) -> Result<crate::domain::staff::Actor, ApiError> {
    s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))
}

async fn money_positions(State(s): State<AppState>) -> ApiResult<Vec<ClientPosition>> {
    signed_in(&s)?;
    Ok(Json(money::positions(&s.pool).await?))
}

async fn client_money(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<ClientMoney> {
    signed_in(&s)?;
    Ok(Json(money::client_money(&s.pool, &id).await?))
}

async fn record_ledger(State(s): State<AppState>, Json(input): Json<EntryInput>) -> ApiResult<LedgerEntry> {
    let actor = money_keeper(&s)?;
    Ok(Json(money::record(&s.pool, input, &actor.name).await?))
}

#[derive(Deserialize)]
struct ReasonInput {
    reason: String,
}

async fn reverse_ledger(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> ApiResult<LedgerEntry> {
    let actor = money_keeper(&s)?;
    Ok(Json(money::reverse(&s.pool, &id, &input.reason, &actor.name).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeeNoteParams {
    #[serde(default)]
    matter_id: String,
    #[serde(default)]
    client_id: String,
}

async fn list_fee_notes(State(s): State<AppState>, Query(p): Query<FeeNoteParams>) -> ApiResult<Vec<FeeNoteSummary>> {
    signed_in(&s)?;
    Ok(Json(money::list_notes(&s.pool, &p.matter_id, &p.client_id).await?))
}

async fn get_fee_note(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<FeeNote> {
    signed_in(&s)?;
    Ok(Json(money::get_note(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("No such fee note.".into()))?))
}

async fn create_fee_note(State(s): State<AppState>, Json(input): Json<FeeNoteInput>) -> ApiResult<FeeNote> {
    money_keeper(&s)?;
    Ok(Json(money::create_note(&s.pool, input).await?))
}

async fn update_fee_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<FeeNoteInput>) -> ApiResult<FeeNote> {
    money_keeper(&s)?;
    Ok(Json(money::update_note(&s.pool, &id, input).await?))
}

async fn delete_fee_note(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    money_keeper(&s)?;
    money::delete_draft(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IssueInput {
    issued_on: i64,
    due_on: Option<i64>,
}

async fn issue_fee_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<IssueInput>) -> ApiResult<FeeNote> {
    let actor = money_keeper(&s)?;
    Ok(Json(money::issue(&s.pool, &id, input.issued_on, input.due_on, &actor.name).await?))
}

async fn cancel_fee_note(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> ApiResult<FeeNote> {
    money_keeper(&s)?;
    Ok(Json(money::cancel(&s.pool, &id, &input.reason).await?))
}

async fn unbilled_time(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<TimeEntry>> {
    signed_in(&s)?;
    Ok(Json(money::unbilled_time(&s.pool, &id).await?))
}

#[derive(Deserialize)]
struct RateInput {
    rate: Option<i64>,
}

async fn set_hourly_rate(State(s): State<AppState>, Json(input): Json<RateInput>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    if input.rate.is_some_and(|r| r <= 0) {
        return Err(DomainError::Invalid("Give a rate in shillings an hour, or none.".into()).into());
    }
    sqlx::query("UPDATE installation SET hourly_rate = ? WHERE id = 'this'").bind(input.rate).execute(&s.pool).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("hourly_rate_set")).await;
    Ok(StatusCode::NO_CONTENT)
}

// ---- Bills of costs (L4) --------------------------------------------------

async fn list_bills(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<BillSummary>> {
    signed_in(&s)?;
    Ok(Json(bills::list(&s.pool, &id).await?))
}

async fn create_bill(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<NewBill>) -> ApiResult<Bill> {
    let actor = money_keeper(&s)?;
    Ok(Json(bills::create(&s.pool, &id, input, &actor.name).await?))
}

async fn get_bill(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Bill> {
    signed_in(&s)?;
    Ok(Json(bills::get(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("No such bill of costs.".into()))?))
}

async fn update_bill(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<BillInput>) -> ApiResult<Bill> {
    money_keeper(&s)?;
    Ok(Json(bills::update(&s.pool, &id, input).await?))
}

async fn delete_bill(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    money_keeper(&s)?;
    bills::delete_draft(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
struct CostsScale {
    fixed: &'static [crate::domain::costs_scale::Fixed],
    floors: &'static [crate::domain::costs_scale::Floor],
    source: &'static str,
}

/// The Sixth Schedule's fixed items and floors, for the bill editor.
async fn costs_scale(State(s): State<AppState>) -> ApiResult<CostsScale> {
    signed_in(&s)?;
    use crate::domain::costs_scale::{FIXED, FLOORS};
    Ok(Json(CostsScale { fixed: &FIXED, floors: &FLOORS, source: "Advocates (Remuneration and Taxation of Costs) Regulations, Sixth Schedule (SI 7 of 2018)" }))
}

// ---- Registers, compliance, statistics (L5) -------------------------------

#[derive(Deserialize)]
struct YearParams {
    year: Option<i32>,
}

#[derive(Deserialize)]
struct RegisterParams {
    register: String,
    year: Option<i32>,
}

fn this_year() -> i32 {
    crate::domain::registers::year_of(chrono::Utc::now().timestamp_millis())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterPage {
    entries: Vec<RegisterEntry>,
    /// Why the person signed in may not add to this register, if they may not.
    refusal: Option<&'static str>,
}

async fn oaths_on(s: &AppState) -> Result<(), ApiError> {
    if !usages::list(&s.pool).await?.iter().any(|u| u == "oaths") {
        return Err(DomainError::Invalid("The registers are part of the commissioner for oaths and notary work. Switch it on in Settings, Practice.".into()).into());
    }
    Ok(())
}

async fn list_register(State(s): State<AppState>, Query(p): Query<RegisterParams>) -> ApiResult<RegisterPage> {
    let actor = signed_in(&s)?;
    let entries = registers::list(&s.pool, &p.register, p.year.unwrap_or_else(this_year)).await?;
    let refusal = registers::refusal(&s.pool, &actor, &p.register, chrono::Utc::now().timestamp_millis()).await?;
    Ok(Json(RegisterPage { entries, refusal }))
}

async fn add_register_entry(State(s): State<AppState>, Json(input): Json<RegisterInput>) -> ApiResult<RegisterEntry> {
    let actor = signed_in(&s)?;
    oaths_on(&s).await?;
    Ok(Json(registers::add(&s.pool, &actor, input).await?))
}

async fn void_register_entry(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> ApiResult<RegisterEntry> {
    let actor = signed_in(&s)?;
    Ok(Json(registers::void(&s.pool, &actor, &id, &input.reason).await?))
}

async fn get_compliance(State(s): State<AppState>, Query(p): Query<YearParams>) -> ApiResult<Compliance> {
    signed_in(&s)?;
    Ok(Json(compliance::get(&s.pool, p.year.unwrap_or_else(this_year)).await?))
}

/// An advocate keeps their own practising details; an administrator anyone's.
async fn put_compliance(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ComplianceInput>) -> ApiResult<Compliance> {
    let actor = signed_in(&s)?;
    if actor.id != id && !actor.is_admin {
        return Err(forbidden("You keep your own practising details; an administrator keeps everyone's."));
    }
    Ok(Json(compliance::update(&s.pool, &id, input).await?))
}

async fn get_statistics(State(s): State<AppState>, Query(p): Query<YearParams>) -> ApiResult<Statistics> {
    signed_in(&s)?;
    Ok(Json(statistics::get(&s.pool, p.year.unwrap_or_else(this_year)).await?))
}

// ---- Taking the records out -----------------------------------------------

/// Everything recorded, for the practice to keep or move elsewhere. An
/// administrator's act, and recorded as one.
async fn export_all(State(s): State<AppState>) -> ApiResult<serde_json::Value> {
    let actor = require_admin(&s)?;
    let data = crate::domain::export::all(&s.pool, &actor.name).await?;
    audit::log(&s.pool, audit::Entry::new("records_exported")).await?;
    Ok(Json(data))
}

// ---- Papers (L3) ----------------------------------------------------------

/// Papers are matter work: anyone signed in except the accounts role.
fn matter_worker(s: &AppState) -> Result<crate::domain::staff::Actor, ApiError> {
    match s.security.actor() {
        Some(a) if a.role != "accounts" => Ok(a),
        Some(_) => Err(forbidden("Papers belong to matter work: ask an advocate or a paralegal.")),
        None => Err(forbidden("Nobody is signed in.")),
    }
}

async fn list_papers(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Paper>> {
    matter_worker(&s)?;
    Ok(Json(papers::list(&s.pool, &id).await?))
}

async fn add_paper(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PaperAdd>) -> ApiResult<Paper> {
    let actor = matter_worker(&s)?;
    Ok(Json(papers::add(&s.pool, &s.vault_root, &id, input, Some(actor.name)).await?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperWithText {
    #[serde(flatten)]
    paper: Paper,
    transcript: Option<String>,
}

async fn get_paper(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<PaperWithText> {
    matter_worker(&s)?;
    let paper = papers::get(&s.pool, &id).await?.ok_or_else(|| DomainError::NotFound("No such paper.".into()))?;
    let transcript = paper.transcript.clone();
    Ok(Json(PaperWithText { paper, transcript }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperFile {
    file_name: String,
    mime_type: String,
    /// Base64: the desktop app's API carries JSON only.
    data: String,
}

async fn paper_file(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<PaperFile> {
    use base64::Engine as _;
    matter_worker(&s)?;
    let (paper, bytes) = papers::open(&s.pool, &s.vault_root, &id).await?;
    Ok(Json(PaperFile { file_name: paper.file_name, mime_type: paper.mime_type, data: base64::engine::general_purpose::STANDARD.encode(bytes) }))
}

async fn edit_paper(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<PaperEdit>) -> ApiResult<Paper> {
    matter_worker(&s)?;
    Ok(Json(papers::edit(&s.pool, &id, input).await?))
}

async fn remove_paper(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    matter_worker(&s)?;
    papers::remove(&s.pool, &s.vault_root, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadPapersInput {
    paper_ids: Vec<String>,
    language: Option<String>,
}

async fn read_papers(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReadPapersInput>) -> ApiResult<assist::PapersRead> {
    let actor = matter_worker(&s)?;
    Ok(Json(assist::read_papers(&s.pool, &s.vault_root, &id, &input.paper_ids, input.language.as_deref(), &actor).await?))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Seals {
    signature: Option<String>,
    stamp: Option<String>,
}

async fn get_seals(State(s): State<AppState>) -> ApiResult<Seals> {
    let actor = s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))?;
    let signature: Option<String> = sqlx::query_scalar("SELECT signature FROM staff WHERE id = ?").bind(&actor.id).fetch_optional(&s.pool).await?.flatten();
    let stamp: Option<String> = sqlx::query_scalar("SELECT stamp FROM installation WHERE id = 'this'").fetch_optional(&s.pool).await?.flatten();
    Ok(Json(Seals { signature, stamp }))
}

#[derive(Deserialize)]
struct SealInput {
    image: Option<String>,
}

/// Each person sets their own signature, and only for themselves.
async fn set_signature(State(s): State<AppState>, Json(input): Json<SealInput>) -> Result<StatusCode, ApiError> {
    let actor = s.security.actor().ok_or_else(|| forbidden("Nobody is signed in."))?;
    installation::check_seal(&input.image)?;
    sqlx::query("UPDATE staff SET signature = ? WHERE id = ?").bind(&input.image).bind(&actor.id).execute(&s.pool).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("signature_set").subject("staff", &actor.id)).await;
    Ok(StatusCode::NO_CONTENT)
}

async fn set_stamp(State(s): State<AppState>, Json(input): Json<SealInput>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    installation::check_seal(&input.image)?;
    sqlx::query("UPDATE installation SET stamp = ? WHERE id = 'this'").bind(&input.image).execute(&s.pool).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("stamp_set")).await;
    Ok(StatusCode::NO_CONTENT)
}

async fn set_contacts(State(s): State<AppState>, Json(input): Json<installation::ContactsInput>) -> ApiResult<Installation> {
    require_admin(&s)?;
    Ok(Json(installation::set_contacts(&s.pool, input).await?))
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

pub fn core(state: AppState) -> Router {
    // Reachable regardless of lock state: checking or changing the lock
    // itself can never be refused because the app is locked, and the app's
    // own liveness check has never needed authority either.
    let open = Router::new()
        .route("/system/status", get(system_status))
        .route("/lock/status", get(lock_status))
        .route("/lock/setup", post(lock_setup))
        .route("/lock/unlock", post(lock_unlock))
        .route("/lock/lock", post(lock_lock))
        .route("/lock/disable", post(lock_disable))
        .route("/lock/recover", post(lock_recover))
        .route("/session/status", get(session_status))
        .route("/installation/brand", get(get_brand))
        .route("/network", get(network::get_network))
        .route("/network/hello", get(network::hello))
        .route("/network/pair", post(network::pair))
        .route("/network/probe", post(network::probe))
        .route("/network/join", post(network::join))
        .route("/network/leave", post(network::leave));

    let api = Router::new()
        .route("/setup/status", get(setup_status))
        .route("/setup/second-factor", post(setup_second_factor))
        .route("/setup/complete", post(setup_complete))
        .route("/installation", get(get_installation).put(update_installation))
        .route("/installation/protection", put(set_protection))
        .route("/installation/jurisdiction", put(set_jurisdiction))
        .route("/installation/idle", put(set_idle))
        .route("/session/people", get(session_people))
        .route("/session/sign-in", post(sign_in))
        .route("/session/sign-out", post(sign_out))
        .route("/staff", get(list_staff).post(create_staff))
        .route("/staff/{id}", put(update_staff))
        .route("/staff/{id}/secret", put(set_staff_secret))
        .route("/staff/{id}/second-factor", delete(reset_second_factor))
        .route("/usages", get(list_usages).put(set_usages))
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
        .route("/matters/{id}/stage", put(set_stage))
        .route("/matters/{id}/parties", post(add_party))
        .route("/parties/{id}", put(update_party).delete(remove_party))
        .route("/matter-types", get(list_matter_types))
        .route("/conflicts", get(find_conflicts))
        .route("/matters/{id}/events", post(record_event))
        .route("/events/{id}", delete(remove_event))
        .route("/clocks", get(practice_clocks))
        .route("/matters/{id}/filings", post(create_filing))
        .route("/filings/{id}", get(get_filing))
        .route("/filings/{id}/service", put(record_service))
        .route("/documents/verify", post(verify_document))
        .route("/assist/settings", get(get_assist_settings).put(put_assist_settings))
        .route("/assist/models", get(assist_models))
        .route("/matters/{id}/assist", post(ask_assist))
        .route("/matters/{id}/papers", get(list_papers).post(add_paper).layer(DefaultBodyLimit::max(40 * 1024 * 1024)))
        .route("/matters/{id}/papers/read", post(read_papers))
        .route("/papers/{id}", get(get_paper).put(edit_paper).delete(remove_paper))
        .route("/papers/{id}/file", get(paper_file))
        .route("/matters/{id}/bills", get(list_bills).post(create_bill))
        .route("/bills/{id}", get(get_bill).put(update_bill).delete(delete_bill))
        .route("/costs/scale", get(costs_scale))
        .route("/registers", get(list_register).post(add_register_entry))
        .route("/registers/{id}/void", post(void_register_entry))
        .route("/compliance", get(get_compliance))
        .route("/compliance/{id}", put(put_compliance))
        .route("/statistics", get(get_statistics))
        .route("/export", get(export_all))
        .route("/network/office", put(network::set_office))
        .route("/network/pairing-code", post(network::pairing_code))
        .route("/network/devices/{id}", delete(network::remove_device))
        .route("/money/positions", get(money_positions))
        .route("/clients/{id}/money", get(client_money))
        .route("/ledger", post(record_ledger))
        .route("/ledger/{id}/reverse", post(reverse_ledger))
        .route("/fee-notes", get(list_fee_notes).post(create_fee_note))
        .route("/fee-notes/{id}", get(get_fee_note).put(update_fee_note).delete(delete_fee_note))
        .route("/fee-notes/{id}/issue", post(issue_fee_note))
        .route("/fee-notes/{id}/cancel", post(cancel_fee_note))
        .route("/matters/{id}/unbilled-time", get(unbilled_time))
        .route("/installation/hourly-rate", put(set_hourly_rate))
        .route("/seals", get(get_seals))
        .route("/seals/signature", put(set_signature))
        .route("/seals/stamp", put(set_stamp))
        .route("/installation/contacts", put(set_contacts))
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
        .route("/audit/verify", get(verify_audit))
        .layer(middleware::from_fn_with_state(state.clone(), gate));

    Router::new()
        .nest("/api", open.merge(api).layer(middleware::from_fn_with_state(state.clone(), network::context)))
        .fallback(not_found)
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .with_state(state)
}

/// The routes as this computer's window and development port reach them: on a
/// computer joined to an office, passed to the office.
pub fn router(state: AppState) -> Router {
    core(state.clone()).layer(middleware::from_fn_with_state(state, network::forward))
}

/// Serves `core` to joined computers while this computer is the office.
pub async fn supervise_office(state: AppState) {
    network::supervise(state.clone(), core(state)).await
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
