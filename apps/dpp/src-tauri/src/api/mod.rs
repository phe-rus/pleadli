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
use crate::domain::security::{LockStatus, Security};
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

async fn issue_document(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Document> {
    Ok(Json(documents::issue(&s.pool, &id).await?))
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
    Ok(Json(prosecutor_profile::save_prosecutor_profile(&s.pool, input).await?))
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
        .route("/attachments", post(create_attachment).get(list_attachments))
        .route("/attachments/{id}", delete(delete_attachment))
        .route("/attachments/{id}/file", get(attachment_file))
        .route("/search", get(search))
        .route("/workload", get(get_workload))
        .route("/capacity", get(get_capacity))
        .route("/activity", get(activity))
        .route("/material", get(material))
        .route("/prosecutor-profile", get(get_profile).post(save_profile).put(save_profile));

    // Status is always readable (the lock screen needs it). Unlocking is the
    // one thing a locked app allows; everything else is closed until then.
    let open = Router::new().route("/security/status", get(security_status));

    Router::new()
        .nest("/api", api.layer(axum::middleware::from_fn_with_state(state.clone(), gate)).merge(open))
        .layer(DefaultBodyLimit::max(512 * 1024 * 1024))
        .with_state(state)
}

/// While the app is locked, only unlocking is allowed. Anything else is refused
/// with 423 before it reaches a handler. Every other call counts as use, which
/// postpones the idle lock.
async fn gate(State(s): State<AppState>, request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    // Inside the nested router the prefix is already stripped.
    if !request.uri().path().ends_with("/security/unlock") {
        if s.security.is_locked() {
            return ApiError(StatusCode::LOCKED, "LOCKED", "The application is locked.".to_string()).into_response();
        }
        s.security.touch();
    }
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
            "state": "recovery", "configured": false, "locked": false, "idleMinutes": 0, "retryAfterSeconds": 0,
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
