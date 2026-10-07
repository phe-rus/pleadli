//! The one HTTP surface of the application: every route is under `/api/**`.
//!
//! The desktop webview reaches it through the single `api_request` command,
//! which hands the request to this router in process (no socket). In a browser
//! during development the same router is served on a loopback port, so the
//! same domain code and the same validation run either way. Handlers only
//! translate: rules live in `domain/`.

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::Deserialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

use crate::domain::attachments::{self, Attachment};
use crate::domain::capacity::{self, Capacity};
use crate::domain::charges::{self, Charge, CreateChargeInput};
use crate::domain::charging_reviews::{self, AssessmentInput, OutcomeInput, ReviewWithAssessments, StartReviewInput};
use crate::domain::comments::{self, Comment, CreateCommentInput};
use crate::domain::assist::{self, AssistSettings, AssistSettingsInput, CountryContext};
use crate::domain::court::{self, CalendarEntry, Filing, FilingInput, Hearing, HearingInput};
use crate::domain::file_items::{self, FileItem, FileItemInput, FileItemUpdate};
use crate::domain::tasks::{self, CreateTaskInput, Task, UpdateTaskInput};
use crate::domain::laws::{self, LawSummary, ManualLaw};
use crate::domain::custody::{self, CustodyEvent, CustodyEventInput};
use crate::domain::pipeline::{self, AnswerInput, Answered, BoardCard, ChatInput, ChatReply, Handover, HandoverInput, Proposal};
use crate::domain::directions::{self, Direction, ResponseInput};
use crate::domain::decisions::{self, CreateDecisionInput, Decision, DecisionRow};
use crate::domain::document_export;
use crate::domain::documents::{self, Document};
use crate::domain::audit::{self, AuditEntry, Verification};
use crate::domain::backup::{self, BackupError, Staged};
use crate::domain::error::DomainError;
use crate::domain::interchange::{self, Connection, ImportOutcome, OfficeIdentity, OutgoingPackage};
use crate::domain::keys;
use crate::domain::referral_intake::{self, AcceptInput, Accepted, IncomingDetail, IncomingSummary};
use crate::domain::installation::{self, Brand, Installation, SetupInput, SetupStatus, UpdateInstallationInput};
use crate::domain::security::{self as security_domain, LockStatus, Security, SignInInput, SignInOutcome};
use crate::domain::staff::{self, Actor, PersonInput, Protection, SignInPerson, Staff, UpdateStaffInput};
use crate::domain::totp::{self, Enrolment};
use crate::domain::evidence::{self, CreateEvidenceItemInput, EvidenceItem};
use crate::domain::people::{self, CreatePersonInput, Person};
use crate::domain::prosecution_files::{
    self, CreateProsecutionFileInput, FileSummary, ProsecutionFile, ProsecutionFilePerson, UpdateProsecutionFileInput,
};
use crate::domain::prosecutor_profile::{self, ProsecutorProfile, SaveProsecutorProfileInput};
use crate::domain::referrals::{self, CreateResubmissionInput, Referral};
use crate::domain::review_notes::{self, CreateReviewNoteInput, ReviewNote};
use crate::domain::search::{self, SearchResult};
use crate::domain::statements::{self, CreateStatementInput, Statement};
use crate::domain::workload::{self, ActivityEvent, MaterialRow, Workload};

pub const DEV_PORT: u16 = 47921;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub vault_root: PathBuf,
    pub data_dir: PathBuf,
    pub security: Arc<Security>,
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
            DomainError::Forbidden(m) => ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", m),
            DomainError::NotFound(m) => ApiError(StatusCode::NOT_FOUND, "NOT_FOUND", m),
            DomainError::Db(e) => {
                log::error!("database error: {e}");
                #[cfg(debug_assertions)]
                eprintln!("database error: {e}");
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

impl From<attachments::AttachmentError> for ApiError {
    fn from(err: attachments::AttachmentError) -> Self {
        match err {
            attachments::AttachmentError::Invalid(m) => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", m.to_string()),
            other => {
                log::error!("attachment error: {other}");
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, "ATTACHMENT", "The document could not be stored or read.".to_string())
            }
        }
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    query: String,
}

#[derive(Deserialize)]
struct FileListParams {
    #[serde(default)]
    query: String,
    #[serde(default)]
    view: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct LimitParams {
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct MaterialParams {
    kind: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EntityQuery {
    entity_type: String,
    entity_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkPersonInput {
    person_id: String,
    role: String,
}

async fn create_person(State(s): State<AppState>, Json(input): Json<CreatePersonInput>) -> ApiResult<Person> {
    Ok(Json(people::create_person(&s.pool, input).await?))
}

async fn update_person(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<CreatePersonInput>) -> ApiResult<Person> {
    Ok(Json(people::update_person(&s.pool, &id, input).await?))
}

async fn search_people(State(s): State<AppState>, Query(p): Query<SearchParams>) -> ApiResult<Vec<Person>> {
    Ok(Json(people::search_people(&s.pool, &p.query).await?))
}

async fn get_person(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<Person>> {
    Ok(Json(people::get_person(&s.pool, &id).await?))
}

async fn create_file(State(s): State<AppState>, Json(input): Json<CreateProsecutionFileInput>) -> ApiResult<ProsecutionFile> {
    Ok(Json(prosecution_files::create_prosecution_file(&s.pool, input).await?))
}

async fn update_file(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateProsecutionFileInput>) -> ApiResult<ProsecutionFile> {
    Ok(Json(prosecution_files::update_prosecution_file(&s.pool, &id, input).await?))
}

async fn list_files(State(s): State<AppState>, Query(p): Query<FileListParams>) -> ApiResult<Vec<FileSummary>> {
    Ok(Json(prosecution_files::list_file_summaries(&s.pool, &p.query, &p.view, p.limit.unwrap_or(200)).await?))
}

async fn get_file(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Option<ProsecutionFile>> {
    Ok(Json(prosecution_files::get_prosecution_file(&s.pool, &id).await?))
}

async fn link_person(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<LinkPersonInput>) -> ApiResult<ProsecutionFilePerson> {
    Ok(Json(prosecution_files::link_person(&s.pool, &id, &input.person_id, &input.role).await?))
}

async fn unlink_person(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    prosecution_files::unlink_person(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_file_people(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<ProsecutionFilePerson>> {
    Ok(Json(prosecution_files::list_file_people(&s.pool, &id).await?))
}

async fn create_resubmission(State(s): State<AppState>, Json(input): Json<CreateResubmissionInput>) -> ApiResult<Referral> {
    Ok(Json(referrals::create_resubmission(&s.pool, input).await?))
}

async fn list_referrals(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Referral>> {
    Ok(Json(referrals::list_for_file(&s.pool, &id).await?))
}

async fn create_decision(State(s): State<AppState>, Json(input): Json<CreateDecisionInput>) -> ApiResult<Vec<Decision>> {
    Ok(Json(decisions::create_decision(&s.pool, input).await?))
}

async fn list_decisions_for_file(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Decision>> {
    Ok(Json(decisions::list_for_file(&s.pool, &id).await?))
}

async fn start_review(State(s): State<AppState>, Json(input): Json<StartReviewInput>) -> ApiResult<ReviewWithAssessments> {
    Ok(Json(charging_reviews::start_review(&s.pool, input).await?))
}

async fn list_reviews(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<ReviewWithAssessments>> {
    Ok(Json(charging_reviews::list_for_file(&s.pool, &id).await?))
}

async fn set_assessment(
    State(s): State<AppState>,
    Path((id, criterion)): Path<(String, String)>,
    Json(input): Json<AssessmentInput>,
) -> ApiResult<ReviewWithAssessments> {
    Ok(Json(charging_reviews::set_assessment(&s.pool, &id, &criterion, input).await?))
}

async fn set_outcome(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<OutcomeInput>) -> ApiResult<ReviewWithAssessments> {
    Ok(Json(charging_reviews::set_outcome(&s.pool, &id, input).await?))
}

async fn list_directions(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Direction>> {
    Ok(Json(directions::list_for_file(&s.pool, &id).await?))
}

async fn respond_to_direction(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ResponseInput>) -> ApiResult<Direction> {
    Ok(Json(directions::set_response(&s.pool, &id, input).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PrepareInput {
    decision_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentListParams {
    file_id: Option<String>,
}

async fn prepare_document(State(s): State<AppState>, Json(input): Json<PrepareInput>) -> ApiResult<Document> {
    Ok(Json(documents::prepare(&s.pool, &input.decision_id).await?))
}

async fn list_documents(State(s): State<AppState>, Query(p): Query<DocumentListParams>) -> ApiResult<Vec<Document>> {
    Ok(Json(documents::list(&s.pool, p.file_id.as_deref()).await?))
}

async fn get_document(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Document> {
    Ok(Json(documents::get(&s.pool, &id).await?))
}

async fn refresh_document(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Document> {
    Ok(Json(documents::refresh(&s.pool, &id).await?))
}

async fn issue_document(State(s): State<AppState>, Path(id): Path<String>, body: axum::body::Bytes) -> ApiResult<Document> {
    // The body is optional: an empty request issues with the default reference prefix.
    let input: documents::IssueInput = if body.is_empty() { Default::default() } else { serde_json::from_slice(&body).unwrap_or_default() };
    let actor = s.security.actor();
    let signer = actor.as_ref().map(|a| (a.id.as_str(), a.name.as_str()));
    Ok(Json(documents::issue(&s.pool, &id, input, signer).await?))
}

async fn draft_document(State(s): State<AppState>, Json(input): Json<documents::DraftInput>) -> ApiResult<Document> {
    Ok(Json(documents::create_draft(&s.pool, input).await?))
}

async fn update_document_content(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<documents::ContentInput>) -> ApiResult<Document> {
    Ok(Json(documents::update_content(&s.pool, &id, input).await?))
}

#[derive(Deserialize)]
struct VerifyQuery {
    reference: String,
    code: String,
}

async fn verify_document(State(s): State<AppState>, Query(q): Query<VerifyQuery>) -> ApiResult<documents::Verification> {
    Ok(Json(documents::verify(&s.pool, &q.reference, &q.code).await?))
}

#[derive(Deserialize)]
struct ImageInput {
    image: Option<String>,
}

/// A signature or stamp: a PNG or JPEG under 400 KB, as a data URL.
fn check_image(image: &Option<String>) -> Result<(), ApiError> {
    if let Some(i) = image {
        let ok = (i.starts_with("data:image/png;base64,") || i.starts_with("data:image/jpeg;base64,")) && i.len() < 550_000;
        if !ok {
            return Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", "Use a PNG or JPEG image under 400 KB.".to_string()));
        }
    }
    Ok(())
}

async fn set_my_signature(State(s): State<AppState>, Json(input): Json<ImageInput>) -> Result<StatusCode, ApiError> {
    let actor = s.security.actor().ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Nobody is signed in.".to_string()))?;
    check_image(&input.image)?;
    sqlx::query("UPDATE staff SET signature = ? WHERE id = ?").bind(&input.image).bind(&actor.id).execute(&s.pool).await.map_err(|e| ApiError::from(crate::domain::error::DomainError::from(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn get_seals(State(s): State<AppState>) -> ApiResult<serde_json::Value> {
    let signature: Option<String> = match s.security.actor() {
        Some(a) => sqlx::query_scalar("SELECT signature FROM staff WHERE id = ?").bind(&a.id).fetch_optional(&s.pool).await.map_err(|e| ApiError::from(crate::domain::error::DomainError::from(e)))?.flatten(),
        None => None,
    };
    let stamp: Option<String> = sqlx::query_scalar("SELECT stamp FROM installation WHERE id = 'this'").fetch_optional(&s.pool).await.map_err(|e| ApiError::from(crate::domain::error::DomainError::from(e)))?.flatten();
    Ok(Json(serde_json::json!({ "signature": signature, "stamp": stamp })))
}

async fn set_stamp(State(s): State<AppState>, Json(input): Json<ImageInput>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    check_image(&input.image)?;
    sqlx::query("UPDATE installation SET stamp = ? WHERE id = 'this'").bind(&input.image).execute(&s.pool).await.map_err(|e| ApiError::from(crate::domain::error::DomainError::from(e)))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn discard_document(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    documents::discard(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// The exported file's bytes, for the browser during development. The desktop
/// app writes the same bytes to a path the prosecutor picks
/// (`commands::documents`).
async fn export_document(State(s): State<AppState>, Path((id, format)): Path<(String, String)>) -> Result<Response, ApiError> {
    let doc = documents::get(&s.pool, &id).await?;
    let (bytes, mime, ext) = export_bytes(&doc, &format)?;
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", document_export::file_name(&doc, ext)))
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

pub fn export_bytes(doc: &Document, format: &str) -> Result<(Vec<u8>, &'static str, &'static str), ApiError> {
    match format {
        "docx" => document_export::docx(doc)
            .map(|b| (b, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"))
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, "EXPORT", e)),
        "md" | "markdown" => Ok((document_export::markdown(doc).into_bytes(), "text/markdown; charset=utf-8", "md")),
        _ => Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", "Documents export as DOCX or Markdown. PDF is saved from the print dialog.".to_string())),
    }
}

async fn list_all_decisions(State(s): State<AppState>, Query(p): Query<LimitParams>) -> ApiResult<Vec<DecisionRow>> {
    Ok(Json(decisions::list_all(&s.pool, p.limit.unwrap_or(200)).await?))
}

async fn create_statement(State(s): State<AppState>, Json(input): Json<CreateStatementInput>) -> ApiResult<Statement> {
    Ok(Json(statements::create_statement(&s.pool, input).await?))
}

async fn list_statements(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Statement>> {
    Ok(Json(statements::list_for_file(&s.pool, &id).await?))
}

async fn create_evidence(State(s): State<AppState>, Json(input): Json<CreateEvidenceItemInput>) -> ApiResult<EvidenceItem> {
    Ok(Json(evidence::create_evidence_item(&s.pool, input).await?))
}

async fn list_evidence(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<EvidenceItem>> {
    Ok(Json(evidence::list_for_file(&s.pool, &id).await?))
}

async fn create_charge(State(s): State<AppState>, Json(input): Json<CreateChargeInput>) -> ApiResult<Charge> {
    Ok(Json(charges::create_charge(&s.pool, input).await?))
}

async fn list_charges(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Charge>> {
    Ok(Json(charges::list_for_file(&s.pool, &id).await?))
}

async fn create_review_note(State(s): State<AppState>, Json(input): Json<CreateReviewNoteInput>) -> ApiResult<ReviewNote> {
    Ok(Json(review_notes::create_review_note(&s.pool, input).await?))
}

async fn list_review_notes(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<ReviewNote>> {
    Ok(Json(review_notes::list_for_file(&s.pool, &id).await?))
}

async fn chronology(State(s): State<AppState>, Path(id): Path<String>, Query(p): Query<LimitParams>) -> ApiResult<Vec<ActivityEvent>> {
    Ok(Json(workload::activity(&s.pool, Some(&id), p.limit.unwrap_or(200)).await?))
}

async fn activity(State(s): State<AppState>, Query(p): Query<LimitParams>) -> ApiResult<Vec<ActivityEvent>> {
    Ok(Json(workload::activity(&s.pool, None, p.limit.unwrap_or(30)).await?))
}

async fn get_workload(State(s): State<AppState>) -> ApiResult<Workload> {
    Ok(Json(workload::workload(&s.pool).await?))
}

#[derive(Deserialize)]
struct CapacityParams {
    months: Option<u32>,
}

async fn get_capacity(State(s): State<AppState>, Query(p): Query<CapacityParams>) -> ApiResult<Capacity> {
    Ok(Json(capacity::capacity(&s.pool, p.months.unwrap_or(6)).await?))
}

async fn material(State(s): State<AppState>, Query(p): Query<MaterialParams>) -> ApiResult<Vec<MaterialRow>> {
    Ok(Json(workload::material(&s.pool, &p.kind, p.limit.unwrap_or(200)).await?))
}

async fn search(State(s): State<AppState>, Query(p): Query<SearchParams>) -> ApiResult<Vec<SearchResult>> {
    Ok(Json(search::search(&s.pool, &p.query).await?))
}

async fn create_comment(State(s): State<AppState>, Json(input): Json<CreateCommentInput>) -> ApiResult<Comment> {
    Ok(Json(comments::create_comment(&s.pool, input).await?))
}

async fn list_comments(State(s): State<AppState>, Query(p): Query<EntityQuery>) -> ApiResult<Vec<Comment>> {
    Ok(Json(comments::list_for_entity(&s.pool, &p.entity_type, &p.entity_id).await?))
}

async fn list_attachments(State(s): State<AppState>, Query(p): Query<EntityQuery>) -> ApiResult<Vec<Attachment>> {
    Ok(Json(attachments::list_attachments(&s.pool, &p.entity_type, &p.entity_id).await?))
}

async fn create_attachment(State(s): State<AppState>, mut multipart: Multipart) -> ApiResult<Attachment> {
    let mut entity_type = String::new();
    let mut entity_id = String::new();
    let mut file_name = "attachment".to_string();
    let mut bytes = Vec::new();

    while let Some(field) = multipart.next_field().await.map_err(|e| ApiError(StatusCode::BAD_REQUEST, "BAD_UPLOAD", e.to_string()))? {
        match field.name().unwrap_or("").to_string().as_str() {
            "entityType" => entity_type = field.text().await.unwrap_or_default(),
            "entityId" => entity_id = field.text().await.unwrap_or_default(),
            "file" => {
                file_name = field.file_name().unwrap_or("attachment").to_string();
                bytes = field.bytes().await.map_err(|e| ApiError(StatusCode::BAD_REQUEST, "BAD_UPLOAD", e.to_string()))?.to_vec();
            }
            _ => {}
        }
    }

    Ok(Json(attachments::add_attachment_bytes(&s.pool, &s.vault_root, &entity_type, &entity_id, &file_name, &bytes).await?))
}

async fn delete_attachment(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    attachments::delete_attachment(&s.pool, &s.vault_root, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn attachment_file(State(s): State<AppState>, Path(id): Path<String>) -> Result<Response, ApiError> {
    let (attachment, bytes) = attachments::read_attachment(&s.pool, &s.vault_root, &id)
        .await?
        .ok_or(ApiError(StatusCode::NOT_FOUND, "NOT_FOUND", "Attachment not found.".to_string()))?;
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, attachment.mime_type)
        .header(header::CONTENT_DISPOSITION, "inline")
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SecurityStatus {
    #[serde(flatten)]
    lock: LockStatus,
    /// `keystore` or `key_file`: where the key that opens the data is held.
    protection: Option<keys::Protection>,
    last_backup_at: Option<i64>,
    restore_pending: bool,
}

async fn security_status(State(s): State<AppState>) -> ApiResult<SecurityStatus> {
    let lock = s.security.status();
    let last_backup_at = if lock.locked {
        None
    } else {
        sqlx::query_scalar::<_, String>("SELECT value FROM security_settings WHERE key = 'last_backup_at'").fetch_optional(&s.pool).await?.and_then(|v| v.parse().ok())
    };
    Ok(Json(SecurityStatus { lock, protection: keys::protection(), last_backup_at, restore_pending: backup::pending(&s.data_dir) }))
}

#[derive(Deserialize)]
struct PassphraseInput {
    passphrase: String,
}

#[derive(Deserialize)]
struct SetPassphraseInput {
    current: Option<String>,
    new: String,
}

#[derive(Deserialize)]
struct IdleInput {
    minutes: u32,
}

async fn unlock(State(s): State<AppState>, Json(input): Json<PassphraseInput>) -> ApiResult<LockStatus> {
    s.security.unlock(&s.pool, &input.passphrase).await?;
    Ok(Json(s.security.status()))
}

async fn lock_now(State(s): State<AppState>) -> ApiResult<LockStatus> {
    s.security.lock_now(&s.pool).await;
    Ok(Json(s.security.status()))
}

fn require_unlocked(s: &AppState) -> Result<(), ApiError> {
    if s.security.is_locked() {
        return Err(ApiError(StatusCode::LOCKED, "LOCKED", "The application is locked.".to_string()));
    }
    Ok(())
}

async fn set_passphrase(State(s): State<AppState>, Json(input): Json<SetPassphraseInput>) -> ApiResult<LockStatus> {
    require_unlocked(&s)?;
    s.security.set_passphrase(&s.pool, input.current.as_deref(), &input.new).await?;
    Ok(Json(s.security.status()))
}

async fn remove_passphrase(State(s): State<AppState>, Json(input): Json<PassphraseInput>) -> ApiResult<LockStatus> {
    require_unlocked(&s)?;
    s.security.remove_passphrase(&s.pool, &input.passphrase).await?;
    Ok(Json(s.security.status()))
}

async fn set_idle(State(s): State<AppState>, Json(input): Json<IdleInput>) -> ApiResult<LockStatus> {
    require_unlocked(&s)?;
    s.security.set_idle_minutes(&s.pool, input.minutes).await?;
    Ok(Json(s.security.status()))
}

async fn audit_recent(State(s): State<AppState>, Query(p): Query<LimitParams>) -> ApiResult<Vec<AuditEntry>> {
    Ok(Json(audit::recent(&s.pool, p.limit.unwrap_or(50)).await?))
}

async fn audit_verify(State(s): State<AppState>) -> ApiResult<Verification> {
    Ok(Json(audit::verify(&s.pool).await?))
}

impl From<BackupError> for ApiError {
    fn from(err: BackupError) -> Self {
        match err {
            BackupError::Refused(m) => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", m),
            BackupError::Unreadable => ApiError(StatusCode::UNPROCESSABLE_ENTITY, "UNREADABLE", err.to_string()),
            other => {
                log::error!("backup error: {other}");
                ApiError(StatusCode::INTERNAL_SERVER_ERROR, "BACKUP", "The backup could not be made or read.".to_string())
            }
        }
    }
}

/// The backup's bytes, for the browser during development. The desktop app
/// writes the same bytes to a path the prosecutor picks (`commands::backup`).
async fn create_backup(State(s): State<AppState>, Json(input): Json<PassphraseInput>) -> Result<Response, ApiError> {
    let mut bytes = Vec::new();
    backup::write_backup(&s.pool, &s.vault_root, &s.data_dir, &input.passphrase, &mut bytes).await?;
    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"pleadli-dpp.dppbk\"")
        .body(Body::from(bytes))
        .unwrap()
        .into_response())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreInput {
    passphrase: String,
    data_base64: String,
}

async fn stage_restore(State(s): State<AppState>, Json(input): Json<RestoreInput>) -> ApiResult<Staged> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, input.data_base64.as_bytes())
        .map_err(|_| ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", "That is not a backup file.".to_string()))?;
    Ok(Json(backup::stage_restore(&s.data_dir, &bytes[..], &input.passphrase).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdentityInput {
    office_name: String,
    jurisdiction: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InviteInput {
    intended_station: String,
    valid_days: i64,
}

#[derive(Deserialize)]
struct FingerprintInput {
    fingerprint: String,
}

#[derive(Deserialize)]
struct ReasonInput {
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportInput {
    data_base64: String,
}

async fn get_office_identity(State(s): State<AppState>) -> ApiResult<Option<OfficeIdentity>> {
    Ok(Json(interchange::get_identity(&s.pool).await?))
}

async fn create_office_identity(State(s): State<AppState>, Json(input): Json<IdentityInput>) -> ApiResult<OfficeIdentity> {
    Ok(Json(interchange::create_identity(&s.pool, &input.office_name, input.jurisdiction).await?))
}

async fn list_connections(State(s): State<AppState>) -> ApiResult<Vec<Connection>> {
    Ok(Json(interchange::list_connections(&s.pool).await?))
}

async fn create_invite(State(s): State<AppState>, Json(input): Json<InviteInput>) -> ApiResult<Connection> {
    Ok(Json(interchange::create_invite(&s.pool, &input.intended_station, input.valid_days).await?.0))
}

fn file_response(bytes: Vec<u8>, name: &str) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/octet-stream")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\""))
        .body(Body::from(bytes))
        .unwrap()
        .into_response()
}

async fn invite_file(State(s): State<AppState>, Path(id): Path<String>) -> Result<Response, ApiError> {
    let bytes = interchange::invite_file(&s.pool, &id).await?;
    Ok(file_response(bytes, "dpp-invitation.pxpkg"))
}

async fn trust_connection(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<FingerprintInput>) -> ApiResult<Connection> {
    Ok(Json(interchange::trust_connection(&s.pool, &id, &input.fingerprint).await?))
}

async fn decline_connection(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> ApiResult<Connection> {
    Ok(Json(interchange::decline_connection(&s.pool, &id, input.reason).await?))
}

async fn revoke_connection(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> ApiResult<Connection> {
    Ok(Json(interchange::revoke_connection(&s.pool, &id, input.reason.as_deref().unwrap_or("")).await?))
}

async fn import_package(State(s): State<AppState>, Json(input): Json<ImportInput>) -> ApiResult<ImportOutcome> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, input.data_base64.as_bytes())
        .map_err(|_| ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", "That is not a package file.".to_string()))?;
    Ok(Json(interchange::import_package(&s.pool, &s.vault_root, &bytes).await?))
}

async fn list_incoming(State(s): State<AppState>) -> ApiResult<Vec<IncomingSummary>> {
    Ok(Json(referral_intake::list_incoming(&s.pool).await?))
}

async fn get_incoming(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<IncomingDetail> {
    Ok(Json(referral_intake::get_incoming(&s.pool, &id).await?))
}

async fn accept_incoming(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AcceptInput>) -> ApiResult<Accepted> {
    Ok(Json(referral_intake::accept_referral(&s.pool, &s.vault_root, &id, input).await?))
}

async fn reject_incoming(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<ReasonInput>) -> Result<StatusCode, ApiError> {
    referral_intake::reject_referral(&s.pool, &s.vault_root, &id, input.reason.as_deref().unwrap_or("")).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_outgoing(State(s): State<AppState>) -> ApiResult<Vec<OutgoingPackage>> {
    Ok(Json(interchange::list_outgoing(&s.pool).await?))
}

async fn outgoing_file(State(s): State<AppState>, Path(id): Path<String>) -> Result<Response, ApiError> {
    let (bytes, name) = interchange::export_outgoing(&s.pool, &id).await?;
    Ok(file_response(bytes, &name))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Prepared {
    id: String,
    /// Documents on the file that are drafts, so are not in the notice.
    draft_documents: usize,
}

async fn prepare_notice(State(s): State<AppState>, Path(decision_id): Path<String>) -> ApiResult<Prepared> {
    let (id, draft_documents) = interchange::prepare_decision_notice(&s.pool, &decision_id).await?;
    Ok(Json(Prepared { id, draft_documents }))
}

async fn get_profile(State(s): State<AppState>) -> ApiResult<Option<ProsecutorProfile>> {
    Ok(Json(prosecutor_profile::get_prosecutor_profile(&s.pool).await?))
}

async fn save_profile(State(s): State<AppState>, Json(input): Json<SaveProsecutorProfileInput>) -> ApiResult<ProsecutorProfile> {
    let saved = prosecutor_profile::save_prosecutor_profile(&s.pool, input).await?;
    s.security.refresh_actor(&s.pool).await?;
    Ok(Json(saved))
}

// ---- Setup, sign-in and the people of the installation ---------------------

fn require_admin(s: &AppState) -> Result<Actor, ApiError> {
    match s.security.actor() {
        Some(actor) if actor.is_administrator() => Ok(actor),
        _ => Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Only an administrator can do that.".to_string())),
    }
}

fn not_installed(s: &AppState) -> Result<(), ApiError> {
    if s.security.is_installed() {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "This installation is already set up.".to_string()));
    }
    Ok(())
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

async fn setup_complete(State(s): State<AppState>, Json(input): Json<SetupInput>) -> ApiResult<LockStatus> {
    not_installed(&s)?;
    installation::complete_setup(&s.pool, input).await?;
    s.security.load(&s.pool).await?;
    // Whoever set it up is already signed in: they just proved who they are.
    if let Some(admin) = staff::first_administrator(&s.pool).await? {
        s.security.adopt(&s.pool, admin).await?;
    }
    Ok(Json(s.security.status()))
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
/// country's numbering, file order and wording can be tried without a new
/// setup. A release build refuses it: a real office's country is fixed at setup.
async fn set_jurisdiction(State(s): State<AppState>, Json(input): Json<JurisdictionInput>) -> ApiResult<Installation> {
    if !cfg!(debug_assertions) {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "The country is chosen at setup.".to_string()));
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

async fn set_protection(State(s): State<AppState>, Json(input): Json<ProtectionInput>) -> ApiResult<LockStatus> {
    let admin = require_admin(&s)?;
    let level = Protection::parse(&input.protection).ok_or_else(|| DomainError::Invalid("That protection level is not known.".to_string()))?;
    installation::set_protection(&s.pool, &admin.id, level, input.secret.as_deref()).await?;
    s.security.load(&s.pool).await?;
    // The administrator who changed it stays signed in under the new level.
    s.security.adopt(&s.pool, admin).await?;
    Ok(Json(s.security.status()))
}

async fn session_people(State(s): State<AppState>) -> ApiResult<Vec<SignInPerson>> {
    Ok(Json(staff::sign_in_list(&s.pool, s.security.protection()).await?))
}

async fn sign_in(State(s): State<AppState>, Json(input): Json<SignInInput>) -> ApiResult<SignInOutcome> {
    Ok(Json(s.security.sign_in(&s.pool, input).await?))
}

async fn sign_out(State(s): State<AppState>) -> ApiResult<LockStatus> {
    s.security.lock_now(&s.pool).await;
    Ok(Json(s.security.status()))
}

async fn list_staff(State(s): State<AppState>) -> ApiResult<Vec<Staff>> {
    Ok(Json(staff::list(&s.pool).await?))
}

async fn create_staff(State(s): State<AppState>, Json(input): Json<PersonInput>) -> ApiResult<Staff> {
    require_admin(&s)?;
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
    let actor = s.security.actor().ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Nobody is signed in.".to_string()))?;
    if !actor.is_administrator() && actor.id != id {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Only an administrator can do that.".to_string()));
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

// ---- Board, court calendar, the file's index, Assist ----------------------

fn actor_name(s: &AppState) -> Option<String> {
    s.security.actor().map(|a| a.name)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileScope {
    file_id: Option<String>,
}

async fn list_tasks(State(s): State<AppState>, Query(q): Query<FileScope>) -> ApiResult<Vec<Task>> {
    Ok(Json(tasks::list(&s.pool, q.file_id.as_deref()).await?))
}

async fn create_task(State(s): State<AppState>, Json(input): Json<CreateTaskInput>) -> ApiResult<Task> {
    Ok(Json(tasks::create(&s.pool, input, actor_name(&s).as_deref()).await?))
}

async fn update_task(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateTaskInput>) -> ApiResult<Task> {
    Ok(Json(tasks::update(&s.pool, &id, input).await?))
}

async fn delete_task(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    tasks::delete(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileIdQuery {
    file_id: String,
}

async fn list_hearings(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Vec<Hearing>> {
    Ok(Json(court::hearings_for_file(&s.pool, &q.file_id).await?))
}

async fn create_hearing(State(s): State<AppState>, Json(input): Json<HearingInput>) -> ApiResult<Hearing> {
    Ok(Json(court::create_hearing(&s.pool, input, actor_name(&s).as_deref()).await?))
}

async fn update_hearing(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<HearingInput>) -> ApiResult<Hearing> {
    Ok(Json(court::update_hearing(&s.pool, &id, input).await?))
}

async fn delete_hearing(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    court::delete_hearing(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_filings(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Vec<Filing>> {
    Ok(Json(court::filings_for_file(&s.pool, &q.file_id).await?))
}

async fn create_filing(State(s): State<AppState>, Json(input): Json<FilingInput>) -> ApiResult<Filing> {
    Ok(Json(court::create_filing(&s.pool, input, actor_name(&s).as_deref()).await?))
}

async fn delete_filing(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    court::delete_filing(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct Range {
    from: i64,
    to: i64,
}

async fn get_calendar(State(s): State<AppState>, Query(r): Query<Range>) -> ApiResult<Vec<CalendarEntry>> {
    Ok(Json(court::calendar(&s.pool, r.from, r.to).await?))
}

async fn list_file_items(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Vec<FileItem>> {
    Ok(Json(file_items::list(&s.pool, &q.file_id).await?))
}

async fn create_file_item(State(s): State<AppState>, Json(input): Json<FileItemInput>) -> ApiResult<FileItem> {
    Ok(Json(file_items::create(&s.pool, input, "person", actor_name(&s).as_deref()).await?))
}

async fn update_file_item(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<FileItemUpdate>) -> ApiResult<FileItem> {
    Ok(Json(file_items::update(&s.pool, &id, input, actor_name(&s).as_deref()).await?))
}

async fn delete_file_item(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    file_items::delete(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn confirm_file_items(State(s): State<AppState>, Json(q): Json<FileIdQuery>) -> ApiResult<serde_json::Value> {
    let n = file_items::confirm_all(&s.pool, &q.file_id, actor_name(&s).as_deref()).await?;
    Ok(Json(serde_json::json!({ "confirmed": n })))
}

async fn get_assist_settings(State(s): State<AppState>) -> ApiResult<AssistSettings> {
    Ok(Json(assist::settings(&s.pool).await?))
}

async fn save_assist_settings(State(s): State<AppState>, Json(input): Json<AssistSettingsInput>) -> ApiResult<AssistSettings> {
    let admin = require_admin(&s)?;
    Ok(Json(assist::save_settings(&s.pool, input, &admin.name).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BriefRequest {
    file_id: String,
    #[serde(default)]
    context: CountryContext,
    #[serde(default)]
    model: Option<String>,
}

async fn create_brief(State(s): State<AppState>, Json(r): Json<BriefRequest>) -> ApiResult<assist::Brief> {
    Ok(Json(assist::brief(&s.pool, &r.file_id, &r.context, r.model.as_deref(), actor_name(&s).as_deref()).await?))
}

async fn latest_brief(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Option<assist::Brief>> {
    Ok(Json(assist::latest_brief(&s.pool, &q.file_id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArrangeRequest {
    file_id: String,
    attachment_ids: Vec<String>,
    #[serde(default)]
    context: CountryContext,
    #[serde(default)]
    model: Option<String>,
}

async fn arrange_scans(State(s): State<AppState>, Json(r): Json<ArrangeRequest>) -> ApiResult<assist::Arranged> {
    Ok(Json(assist::arrange(&s.pool, &s.vault_root, &r.file_id, &r.attachment_ids, &r.context, r.model.as_deref(), actor_name(&s).as_deref()).await?))
}

async fn assist_log(State(s): State<AppState>) -> ApiResult<Vec<assist::LogEntry>> {
    Ok(Json(assist::recent_log(&s.pool, 50).await?))
}

// ---------------------------------------------------------------- Assist on this computer

use pleadli_node_core::local_ai;

fn local_err(e: pleadli_node_core::ai::AiError) -> ApiError {
    DomainError::Invalid(e.0).into()
}

async fn local_status(State(s): State<AppState>) -> ApiResult<local_ai::LocalStatus> {
    let _ = &s;
    Ok(Json(local_ai::status().await))
}

async fn local_install(State(s): State<AppState>) -> ApiResult<local_ai::LocalStatus> {
    require_admin(&s)?;
    local_ai::install().map_err(local_err)?;
    Ok(Json(local_ai::status().await))
}

async fn local_start(State(s): State<AppState>) -> ApiResult<local_ai::LocalStatus> {
    let _ = &s;
    local_ai::start().await.map_err(local_err)?;
    Ok(Json(local_ai::status().await))
}

#[derive(Deserialize)]
struct LocalPull {
    model: String,
}

async fn local_pull(State(s): State<AppState>, Json(input): Json<LocalPull>) -> ApiResult<local_ai::LocalStatus> {
    require_admin(&s)?;
    local_ai::pull(&input.model).map_err(local_err)?;
    Ok(Json(local_ai::status().await))
}

async fn assist_models(State(s): State<AppState>) -> ApiResult<Vec<crate::domain::ai::ModelInfo>> {
    Ok(Json(assist::models(&s.pool).await?))
}

async fn assist_chat(State(s): State<AppState>, Json(input): Json<ChatInput>) -> ApiResult<ChatReply> {
    Ok(Json(pipeline::chat(&s.pool, input, actor_name(&s).as_deref()).await?))
}

async fn case_board(State(s): State<AppState>) -> ApiResult<Vec<BoardCard>> {
    Ok(Json(pipeline::board(&s.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageInput {
    stage: String,
}

async fn set_file_stage(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<StageInput>) -> Result<StatusCode, ApiError> {
    pipeline::set_stage(&s.pool, &id, &input.stage, actor_name(&s).as_deref()).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_proposals(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Vec<Proposal>> {
    Ok(Json(pipeline::latest(&s.pool, &q.file_id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProposeRequest {
    file_id: String,
    stage: Option<String>,
    #[serde(default)]
    context: CountryContext,
}

async fn create_proposal(State(s): State<AppState>, Json(r): Json<ProposeRequest>) -> ApiResult<Proposal> {
    Ok(Json(pipeline::propose(&s.pool, &r.file_id, r.stage.as_deref(), &r.context, actor_name(&s).as_deref()).await?))
}

async fn answer_proposal(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<AnswerInput>) -> ApiResult<Answered> {
    let actor = s.security.actor().ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Nobody is signed in.".to_string()))?;
    Ok(Json(pipeline::answer(&s.pool, &s.vault_root, &id, input, &actor.name).await?))
}

async fn list_handovers(State(s): State<AppState>, Query(q): Query<FileIdQuery>) -> ApiResult<Vec<Handover>> {
    Ok(Json(pipeline::handovers(&s.pool, &q.file_id).await?))
}

async fn create_handover(State(s): State<AppState>, Json(input): Json<HandoverInput>) -> ApiResult<Handover> {
    Ok(Json(pipeline::record_handover(&s.pool, input, actor_name(&s).as_deref()).await?))
}

#[derive(Deserialize)]
struct JurisdictionQuery {
    jurisdiction: String,
}

async fn list_laws(State(s): State<AppState>, Query(q): Query<JurisdictionQuery>) -> ApiResult<Vec<LawSummary>> {
    Ok(Json(laws::list(&s.pool, &q.jurisdiction).await?))
}

async fn add_law(State(s): State<AppState>, Json(input): Json<ManualLaw>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    laws::add_manual(&s.pool, input).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_law(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    require_admin(&s)?;
    laws::delete(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct SyncRequest {
    jurisdiction: String,
    titles: Vec<String>,
}

async fn sync_laws(State(s): State<AppState>, Json(r): Json<SyncRequest>) -> ApiResult<laws::SyncResult> {
    require_admin(&s)?;
    let token = assist::laws_token(&s.pool).await?.ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Add the Laws.Africa token in Settings first.".to_string()))?;
    Ok(Json(laws::sync_laws_africa(&s.pool, &token, &r.jurisdiction, &r.titles).await?))
}

async fn list_custody(State(s): State<AppState>, Query(q): Query<FileScope>) -> ApiResult<Vec<CustodyEvent>> {
    Ok(Json(match q.file_id {
        Some(id) => custody::list(&s.pool, &id).await?,
        None => custody::open_files(&s.pool).await?,
    }))
}

async fn create_custody(State(s): State<AppState>, Json(input): Json<CustodyEventInput>) -> ApiResult<CustodyEvent> {
    Ok(Json(custody::create(&s.pool, input, "person", actor_name(&s).as_deref()).await?))
}

async fn delete_custody(State(s): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    custody::delete(&s.pool, &id).await?;
    Ok(StatusCode::NO_CONTENT)
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

/// A paper is leaving the application: its wording is recorded under the
/// code printed on it.
async fn stamp_paper(State(s): State<AppState>, Json(input): Json<PrintInput>) -> ApiResult<pleadli_node_core::paper::Stamp> {
    if input.body.trim().is_empty() || input.body.len() > 2_000_000 {
        return Err(DomainError::Invalid("This paper has no wording to record.".into()).into());
    }
    let actor = s.security.actor();
    let stamp = pleadli_node_core::paper::stamp(
        &s.pool,
        pleadli_node_core::paper::PaperInput {
            entity_type: &input.entity_type,
            entity_id: &input.entity_id,
            reference: input.reference.as_deref(),
            title: &input.title,
            body: &input.body,
            printed_by: actor.as_ref().map(|a| a.name.as_str()),
        },
    )
    .await
    .map_err(DomainError::from)?;
    Ok(Json(stamp))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LastPrintQuery {
    entity_type: String,
    entity_id: String,
}

async fn last_paper_print(State(s): State<AppState>, Query(q): Query<LastPrintQuery>) -> ApiResult<Option<pleadli_node_core::paper::PaperPrint>> {
    let print = pleadli_node_core::paper::last_print(&s.pool, &q.entity_type, &q.entity_id).await.map_err(DomainError::from)?;
    Ok(Json(print))
}

async fn paper_history(State(s): State<AppState>, Query(q): Query<LastPrintQuery>) -> ApiResult<Vec<pleadli_node_core::paper::PaperPrint>> {
    Ok(Json(pleadli_node_core::paper::history(&s.pool, &q.entity_type, &q.entity_id).await.map_err(DomainError::from)?))
}

/// The handwriting on one paper (a received statement, a scan), if any.
async fn get_paper_ink(State(s): State<AppState>, Query(q): Query<LastPrintQuery>) -> ApiResult<Option<String>> {
    Ok(Json(pleadli_node_core::paper::ink(&s.pool, &q.entity_type, &q.entity_id).await.map_err(DomainError::from)?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InkInput {
    entity_type: String,
    entity_id: String,
    ink: Option<String>,
}

/// Keeps (or clears) the handwriting on one paper, under who wrote it.
async fn put_paper_ink(State(s): State<AppState>, Json(input): Json<InkInput>) -> Result<StatusCode, ApiError> {
    if input.ink.as_ref().is_some_and(|i| i.len() > 4_000_000) {
        return Err(DomainError::Invalid("There is too much writing on this paper to keep.".into()).into());
    }
    let actor = s.security.actor();
    pleadli_node_core::paper::set_ink(&s.pool, &input.entity_type, &input.entity_id, input.ink.as_deref(), actor.as_ref().map(|a| a.name.as_str()))
        .await
        .map_err(DomainError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct PrintVerifyQuery {
    code: String,
}

/// Anyone holding a paper types its code and reads what was printed.
async fn verify_paper(State(s): State<AppState>, Query(q): Query<PrintVerifyQuery>) -> ApiResult<Option<pleadli_node_core::paper::PaperPrint>> {
    Ok(Json(pleadli_node_core::paper::verify(&s.pool, &q.code).await.map_err(DomainError::from)?))
}

pub fn router(state: AppState) -> Router {
    let api = Router::new()
        .route("/people", post(create_person).get(search_people))
        .route("/people/{id}", get(get_person).put(update_person))
        .route("/prosecution-files", post(create_file).get(list_files))
        .route("/prosecution-files/{id}", get(get_file).put(update_file))
        .route("/prosecution-files/{id}/people", post(link_person).get(list_file_people))
        .route("/prosecution-files/{id}/referrals", get(list_referrals))
        .route("/prosecution-files/{id}/decisions", get(list_decisions_for_file))
        .route("/prosecution-files/{id}/statements", get(list_statements))
        .route("/prosecution-files/{id}/evidence-items", get(list_evidence))
        .route("/prosecution-files/{id}/charges", get(list_charges))
        .route("/prosecution-files/{id}/review-notes", get(list_review_notes))
        .route("/prosecution-files/{id}/chronology", get(chronology))
        .route("/prosecution-files/{id}/charging-reviews", get(list_reviews))
        .route("/prosecution-files/{id}/directions", get(list_directions))
        .route("/directions/{id}/response", axum::routing::put(respond_to_direction))
        .route("/documents", post(prepare_document).get(list_documents))
        .route("/documents/{id}", get(get_document).delete(discard_document))
        .route("/documents/{id}/refresh", post(refresh_document))
        .route("/documents/{id}/issue", post(issue_document))
        .route("/documents/draft", post(draft_document))
        .route("/documents/verify", get(verify_document))
        .route("/prints", post(stamp_paper))
        .route("/prints/last", get(last_paper_print))
        .route("/prints/history", get(paper_history))
        .route("/prints/verify", get(verify_paper))
        .route("/prints/ink", get(get_paper_ink).put(put_paper_ink))
        .route("/documents/{id}/content", axum::routing::put(update_document_content))
        .route("/seals", get(get_seals))
        .route("/seals/signature", axum::routing::put(set_my_signature))
        .route("/seals/stamp", axum::routing::put(set_stamp))
        .route("/documents/{id}/export/{format}", get(export_document))
        .route("/security/lock", post(lock_now))
        .route("/security/unlock", post(unlock))
        .route("/security/passphrase", axum::routing::put(set_passphrase))
        .route("/security/passphrase/remove", post(remove_passphrase))
        .route("/security/idle", axum::routing::put(set_idle))
        .route("/audit", get(audit_recent))
        .route("/audit/verify", get(audit_verify))
        .route("/backups/create", post(create_backup))
        .route("/backups/restore", post(stage_restore))
        .route("/interchange/identity", get(get_office_identity).post(create_office_identity))
        .route("/interchange/connections", get(list_connections).post(create_invite))
        .route("/interchange/connections/{id}/invite", get(invite_file))
        .route("/interchange/connections/{id}/trust", post(trust_connection))
        .route("/interchange/connections/{id}/decline", post(decline_connection))
        .route("/interchange/connections/{id}/revoke", post(revoke_connection))
        .route("/interchange/import", post(import_package))
        .route("/interchange/incoming", get(list_incoming))
        .route("/interchange/incoming/{id}", get(get_incoming))
        .route("/interchange/incoming/{id}/accept", post(accept_incoming))
        .route("/interchange/incoming/{id}/reject", post(reject_incoming))
        .route("/interchange/outgoing", get(list_outgoing))
        .route("/interchange/outgoing/{id}/file", get(outgoing_file))
        .route("/interchange/decisions/{decision_id}/notice", post(prepare_notice))
        .route("/charging-reviews", post(start_review))
        .route("/charging-reviews/{id}/assessments/{criterion}", axum::routing::put(set_assessment))
        .route("/charging-reviews/{id}/outcome", axum::routing::put(set_outcome))
        .route("/prosecution-file-people/{id}", delete(unlink_person))
        .route("/referrals/resubmission", post(create_resubmission))
        .route("/decisions", post(create_decision).get(list_all_decisions))
        .route("/statements", post(create_statement))
        .route("/evidence-items", post(create_evidence))
        .route("/charges", post(create_charge))
        .route("/review-notes", post(create_review_note))
        .route("/comments", post(create_comment).get(list_comments))
        .route("/tasks", get(list_tasks).post(create_task))
        .route("/tasks/{id}", axum::routing::patch(update_task).delete(delete_task))
        .route("/hearings", get(list_hearings).post(create_hearing))
        .route("/hearings/{id}", axum::routing::put(update_hearing).delete(delete_hearing))
        .route("/filings", get(list_filings).post(create_filing))
        .route("/filings/{id}", delete(delete_filing))
        .route("/calendar", get(get_calendar))
        .route("/file-items", get(list_file_items).post(create_file_item))
        .route("/file-items/confirm", post(confirm_file_items))
        .route("/file-items/{id}", axum::routing::patch(update_file_item).delete(delete_file_item))
        .route("/assist/settings", get(get_assist_settings).put(save_assist_settings))
        .route("/assist/brief", get(latest_brief).post(create_brief))
        .route("/assist/arrange", post(arrange_scans))
        .route("/assist/log", get(assist_log))
        .route("/assist/models", get(assist_models))
        .route("/assist/local", get(local_status))
        .route("/assist/local/install", post(local_install))
        .route("/assist/local/start", post(local_start))
        .route("/assist/local/pull", post(local_pull))
        .route("/assist/chat", post(assist_chat))
        .route("/cases/board", get(case_board))
        .route("/prosecution-files/{id}/stage", axum::routing::put(set_file_stage))
        .route("/proposals", get(list_proposals).post(create_proposal))
        .route("/proposals/{id}/answer", post(answer_proposal))
        .route("/handovers", get(list_handovers).post(create_handover))
        .route("/laws", get(list_laws).post(add_law))
        .route("/laws/sync", post(sync_laws))
        .route("/laws/{id}", delete(delete_law))
        .route("/custody-events", get(list_custody).post(create_custody))
        .route("/custody-events/{id}", delete(delete_custody))
        .route("/attachments", post(create_attachment).get(list_attachments))
        .route("/attachments/{id}", delete(delete_attachment))
        .route("/attachments/{id}/file", get(attachment_file))
        .route("/search", get(search))
        .route("/workload", get(get_workload))
        .route("/capacity", get(get_capacity))
        .route("/activity", get(activity))
        .route("/material", get(material))
        .route("/prosecutor-profile", get(get_profile).post(save_profile).put(save_profile))
        .route("/setup/status", get(setup_status))
        .route("/setup/second-factor", post(setup_second_factor))
        .route("/setup/complete", post(setup_complete))
        .route("/installation", get(get_installation).put(update_installation))
        .route("/installation/brand", get(get_brand))
        .route("/installation/protection", axum::routing::put(set_protection))
        .route("/installation/jurisdiction", axum::routing::put(set_jurisdiction))
        .route("/session/people", get(session_people))
        .route("/session/sign-in", post(sign_in))
        .route("/session/sign-out", post(sign_out))
        .route("/staff", get(list_staff).post(create_staff))
        .route("/staff/{id}", axum::routing::put(update_staff))
        .route("/staff/{id}/secret", axum::routing::put(set_staff_secret))
        .route("/staff/{id}/second-factor", delete(reset_second_factor));

    // Status is always readable (the lock screen needs it). Unlocking is the
    // one thing a locked app allows; everything else is closed until then.
    let open = Router::new().route("/security/status", get(security_status));

    Router::new()
        .nest("/api", api.layer(axum::middleware::from_fn_with_state(state.clone(), gate)).merge(open))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .with_state(state)
}

/// Who may reach what. Branding and the lock status are always readable. Before
/// setup only setup itself works (and, on an older installation still behind
/// its passphrase, only unlocking). After setup, with nobody signed in, only
/// the sign-in list and signing in work. Everything else counts as use, which
/// postpones the idle sign-out.
async fn gate(State(s): State<AppState>, request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    // Inside the nested router the prefix is already stripped.
    let path = request.uri().path();
    if path.ends_with("/security/unlock") || path == "/installation/brand" {
        return next.run(request).await;
    }
    let locked = s.security.is_locked();
    if !s.security.is_installed() {
        if locked {
            return ApiError(StatusCode::LOCKED, "LOCKED", "The application is locked.".to_string()).into_response();
        }
        if path.starts_with("/setup/") {
            return next.run(request).await;
        }
        return ApiError(StatusCode::PRECONDITION_REQUIRED, "SETUP_REQUIRED", "The application is not set up yet.".to_string()).into_response();
    }
    if path.starts_with("/setup/") || path == "/session/people" || path == "/session/sign-in" {
        return next.run(request).await;
    }
    if locked {
        return ApiError(StatusCode::LOCKED, "LOCKED", "Sign in to continue.".to_string()).into_response();
    }
    s.security.touch();
    next.run(request).await
}

/// What runs when the data could not be opened (the key is missing, or the
/// database fails its check): the status says so, a backup can be restored, and
/// nothing else is served.
pub fn recovery_router(data_dir: PathBuf, reason: String) -> Router {
    #[derive(Clone)]
    struct Recovery {
        data_dir: PathBuf,
        reason: String,
    }
    async fn status(State(r): State<Recovery>) -> Json<serde_json::Value> {
        Json(serde_json::json!({
            "state": "recovery", "installed": false, "level": null, "actor": null, "configured": false, "locked": false, "idleMinutes": 0, "retryAfterSeconds": 0,
            "reason": r.reason, "protection": null, "lastBackupAt": null, "restorePending": backup::pending(&r.data_dir),
        }))
    }
    async fn restore(State(r): State<Recovery>, Json(input): Json<RestoreInput>) -> ApiResult<Staged> {
        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, input.data_base64.as_bytes())
            .map_err(|_| ApiError(StatusCode::UNPROCESSABLE_ENTITY, "INVALID", "That is not a backup file.".to_string()))?;
        Ok(Json(backup::stage_restore(&r.data_dir, &bytes[..], &input.passphrase).await?))
    }
    async fn refuse() -> ApiError {
        ApiError(StatusCode::SERVICE_UNAVAILABLE, "RECOVERY", "The data could not be opened. Restore a backup to continue.".to_string())
    }
    Router::new()
        .route("/api/security/status", get(status))
        .route("/api/backups/restore", post(restore))
        .fallback(refuse)
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .with_state(Recovery { data_dir, reason })
}

/// Development only: serves the router on loopback for the browser dev
/// server, which has no Tauri bridge. Compiled out of release builds.
#[cfg(debug_assertions)]
pub async fn serve_dev(router: Router) {
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
