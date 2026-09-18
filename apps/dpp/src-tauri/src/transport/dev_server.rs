//! A local-only HTTP server, dev builds only. Lets the plain browser dev
//! server (which has no Tauri IPC bridge) exercise the same domain logic
//! the desktop app's Tauri commands use — same functions, same database,
//! different transport. Not a real network-facing service: bound to
//! 127.0.0.1, compiled out of release builds entirely. Mirrors Pleadli
//! Police's own src-tauri/src/transport/dev_server.rs pattern.

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
use crate::domain::charges::{self, Charge, CreateChargeInput};
use crate::domain::comments::{self, Comment, CreateCommentInput};
use crate::domain::decisions::{self, CreateDecisionInput, Decision};
use crate::domain::evidence::{self, CreateEvidenceItemInput, EvidenceItem};
use crate::domain::people::{self, CreatePersonInput, Person};
use crate::domain::review_notes::{self, CreateReviewNoteInput, ReviewNote};
use crate::domain::statements::{self, CreateStatementInput, Statement};
use crate::domain::prosecution_files::{
    self, CreateProsecutionFileInput, ProsecutionFile, ProsecutionFilePerson, UpdateProsecutionFileInput,
};
use crate::domain::referrals::{self, CreateResubmissionInput, Referral};
use crate::domain::search::{self, SearchResult};
use crate::domain::prosecutor_profile::{self, ProsecutorProfile, SaveProsecutorProfileInput};

pub const PORT: u16 = 47921;

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

async fn create_person_handler(State(state): State<AppState>, Json(input): Json<CreatePersonInput>) -> Result<Json<Person>, ApiError> {
    people::create_person(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn update_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<CreatePersonInput>,
) -> Result<Json<Person>, ApiError> {
    people::update_person(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn search_people_handler(State(state): State<AppState>, Query(params): Query<QueryParam>) -> Result<Json<Vec<Person>>, ApiError> {
    people::search_people(&state.pool, &params.query).await.map(Json).map_err(internal_error)
}

async fn get_person_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Option<Person>>, ApiError> {
    people::get_person(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_prosecution_file_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateProsecutionFileInput>,
) -> Result<Json<ProsecutionFile>, ApiError> {
    prosecution_files::create_prosecution_file(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn update_prosecution_file_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<UpdateProsecutionFileInput>,
) -> Result<Json<ProsecutionFile>, ApiError> {
    prosecution_files::update_prosecution_file(&state.pool, &id, input).await.map(Json).map_err(internal_error)
}

async fn list_prosecution_files_handler(
    State(state): State<AppState>,
    Query(params): Query<QueryParam>,
) -> Result<Json<Vec<ProsecutionFile>>, ApiError> {
    prosecution_files::list_prosecution_files(&state.pool, &params.query).await.map(Json).map_err(internal_error)
}

async fn list_intake_queue_handler(State(state): State<AppState>) -> Result<Json<Vec<ProsecutionFile>>, ApiError> {
    prosecution_files::list_intake_queue(&state.pool).await.map(Json).map_err(internal_error)
}

async fn get_prosecution_file_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Option<ProsecutionFile>>, ApiError> {
    prosecution_files::get_prosecution_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkPersonInput {
    person_id: String,
    role: String,
}

async fn link_person_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(input): Json<LinkPersonInput>,
) -> Result<Json<ProsecutionFilePerson>, ApiError> {
    prosecution_files::link_person(&state.pool, &id, &input.person_id, &input.role)
        .await
        .map(Json)
        .map_err(internal_error)
}

async fn unlink_person_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    prosecution_files::unlink_person(&state.pool, &id).await.map_err(internal_error)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn list_file_people_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<ProsecutionFilePerson>>, ApiError> {
    prosecution_files::list_file_people(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_resubmission_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateResubmissionInput>,
) -> Result<Json<Referral>, ApiError> {
    referrals::create_resubmission(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_referrals_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Referral>>, ApiError> {
    referrals::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_decision_handler(State(state): State<AppState>, Json(input): Json<CreateDecisionInput>) -> Result<Json<Decision>, ApiError> {
    decisions::create_decision(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_decisions_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Decision>>, ApiError> {
    decisions::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_statement_handler(State(state): State<AppState>, Json(input): Json<CreateStatementInput>) -> Result<Json<Statement>, ApiError> {
    statements::create_statement(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_statements_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Statement>>, ApiError> {
    statements::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_evidence_item_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateEvidenceItemInput>,
) -> Result<Json<EvidenceItem>, ApiError> {
    evidence::create_evidence_item(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_evidence_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<EvidenceItem>>, ApiError> {
    evidence::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_charge_handler(State(state): State<AppState>, Json(input): Json<CreateChargeInput>) -> Result<Json<Charge>, ApiError> {
    charges::create_charge(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_charges_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<Charge>>, ApiError> {
    charges::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn create_review_note_handler(
    State(state): State<AppState>,
    Json(input): Json<CreateReviewNoteInput>,
) -> Result<Json<ReviewNote>, ApiError> {
    review_notes::create_review_note(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_review_notes_handler(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Vec<ReviewNote>>, ApiError> {
    review_notes::list_for_file(&state.pool, &id).await.map(Json).map_err(internal_error)
}

async fn search_handler(State(state): State<AppState>, Query(params): Query<QueryParam>) -> Result<Json<Vec<SearchResult>>, ApiError> {
    search::search(&state.pool, &params.query).await.map(Json).map_err(internal_error)
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

async fn create_comment_handler(State(state): State<AppState>, Json(input): Json<CreateCommentInput>) -> Result<Json<Comment>, ApiError> {
    comments::create_comment(&state.pool, input).await.map(Json).map_err(internal_error)
}

async fn list_comments_handler(State(state): State<AppState>, Query(params): Query<EntityQuery>) -> Result<Json<Vec<Comment>>, ApiError> {
    comments::list_for_entity(&state.pool, &params.entity_type, &params.entity_id)
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

async fn get_prosecutor_profile_handler(State(state): State<AppState>) -> Result<Json<Option<ProsecutorProfile>>, ApiError> {
    prosecutor_profile::get_prosecutor_profile(&state.pool).await.map(Json).map_err(internal_error)
}

async fn save_prosecutor_profile_handler(
    State(state): State<AppState>,
    Json(input): Json<SaveProsecutorProfileInput>,
) -> Result<Json<ProsecutorProfile>, ApiError> {
    prosecutor_profile::save_prosecutor_profile(&state.pool, input).await.map(Json).map_err(internal_error)
}

pub async fn serve(pool: SqlitePool, vault_root: PathBuf) {
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/people", post(create_person_handler).get(search_people_handler))
        .route("/people/{id}", get(get_person_handler).put(update_person_handler))
        .route(
            "/prosecution-files",
            post(create_prosecution_file_handler).get(list_prosecution_files_handler),
        )
        .route("/prosecution-files/intake", get(list_intake_queue_handler))
        .route(
            "/prosecution-files/{id}",
            get(get_prosecution_file_handler).put(update_prosecution_file_handler),
        )
        .route(
            "/prosecution-files/{id}/people",
            post(link_person_handler).get(list_file_people_handler),
        )
        .route("/prosecution-file-people/{id}", axum::routing::delete(unlink_person_handler))
        .route(
            "/referrals/resubmission",
            post(create_resubmission_handler),
        )
        .route("/prosecution-files/{id}/referrals", get(list_referrals_handler))
        .route("/decisions", post(create_decision_handler))
        .route("/prosecution-files/{id}/decisions", get(list_decisions_handler))
        .route("/search", get(search_handler))
        .route("/statements", post(create_statement_handler))
        .route("/prosecution-files/{id}/statements", get(list_statements_handler))
        .route("/evidence-items", post(create_evidence_item_handler))
        .route("/prosecution-files/{id}/evidence-items", get(list_evidence_handler))
        .route("/charges", post(create_charge_handler))
        .route("/prosecution-files/{id}/charges", get(list_charges_handler))
        .route("/review-notes", post(create_review_note_handler))
        .route("/prosecution-files/{id}/review-notes", get(list_review_notes_handler))
        .route("/comments", post(create_comment_handler).get(list_comments_handler))
        .route("/attachments", post(create_attachment_handler).get(list_attachments_handler))
        .route("/attachments/{id}", axum::routing::delete(delete_attachment_handler))
        .route("/attachments/{id}/file", get(get_attachment_file_handler))
        .route(
            "/prosecutor-profile",
            get(get_prosecutor_profile_handler).post(save_prosecutor_profile_handler),
        )
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
