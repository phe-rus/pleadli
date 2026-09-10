//! The restricted, always-available (not debug-only) HTTP surface a
//! phone reaches — over Cloudflare Tunnel from anywhere, or directly
//! over the local network. Deliberately a separate, much smaller router
//! than `server.rs`'s full dev-fallback API: login, search, and custody
//! alerts only — and search itself is scoped to checking a civilian's
//! identity/situation (see `CIVILIAN_ENTITY_TYPES`), never internal
//! police operations (duty rosters, station assets, station diary,
//! files). Every request is logged against the officer who made it.

use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::oneshot;

use crate::domain::attachments;
use crate::domain::bonds::{self, Bond};
use crate::domain::cases::{self, CaseWorkspace};
use crate::domain::charge_sheets::{self, ChargeSheet};
use crate::domain::custody::{self, CustodyAlert, CustodyRecord};
use crate::domain::officers;
use crate::domain::people::{self, PersonProfile};
use crate::domain::search::{self, SearchResult};
use crate::domain::statements::{self, Statement};

pub const DEFAULT_PORT: u16 = 47822;

#[derive(Clone)]
struct RemoteState {
    pool: SqlitePool,
    /// `None` only in tests — every real caller (the desktop app itself)
    /// has one, and it's how a backup alert reaches a native OS
    /// notification on this station's screen.
    app: Option<AppHandle>,
}

pub struct RemoteServerHandle {
    shutdown: oneshot::Sender<()>,
}

impl RemoteServerHandle {
    pub fn stop(self) {
        let _ = self.shutdown.send(());
    }
}

type ApiError = (StatusCode, String);

fn internal_error(err: sqlx::Error) -> ApiError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}

async fn require_officer(state: &RemoteState, headers: &HeaderMap) -> Result<officers::Officer, ApiError> {
    let token = bearer_token(headers).ok_or((StatusCode::UNAUTHORIZED, "missing token".to_string()))?;
    officers::validate_session(&state.pool, token)
        .await
        .map_err(internal_error)?
        .ok_or((StatusCode::UNAUTHORIZED, "session expired or invalid".to_string()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginBody {
    badge_number: String,
    password: String,
}

#[derive(Serialize)]
struct LoginResponse {
    token: String,
}

async fn login_handler(
    State(state): State<RemoteState>,
    Json(body): Json<LoginBody>,
) -> Result<Json<LoginResponse>, ApiError> {
    let token = officers::login(&state.pool, &body.badge_number, &body.password)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::UNAUTHORIZED, "invalid badge number or password".to_string()))?;
    Ok(Json(LoginResponse { token }))
}

async fn logout_handler(State(state): State<RemoteState>, headers: HeaderMap) -> StatusCode {
    if let Some(token) = bearer_token(&headers) {
        let _ = officers::logout(&state.pool, token).await;
    }
    StatusCode::NO_CONTENT
}

#[derive(Deserialize)]
struct SearchParams {
    #[serde(default)]
    query: String,
}

/// What remote search is actually for: checking whether a member of the
/// public is known to the station and what their situation is — not
/// browsing internal police operations. Deliberately excludes
/// `incident`, `station_diary_entry`, `duty_assignment`, `station_asset`,
/// `exhibit`, `referral`, and `attachment` — all office-side/procedural
/// records, never a civilian's own identity.
const CIVILIAN_ENTITY_TYPES: &[&str] = &["person", "case", "custody_record", "bond", "statement", "charge_sheet"];

async fn search_handler(
    State(state): State<RemoteState>,
    headers: HeaderMap,
    Query(params): Query<SearchParams>,
) -> Result<Json<Vec<SearchResult>>, ApiError> {
    let officer = require_officer(&state, &headers).await?;
    let results = search::search(&state.pool, &params.query)
        .await
        .map_err(internal_error)?
        .into_iter()
        .filter(|r| CIVILIAN_ENTITY_TYPES.contains(&r.entity_type.as_str()))
        .collect::<Vec<_>>();
    let _ = officers::log_remote_access(&state.pool, &officer.id, "search", Some(&params.query)).await;
    Ok(Json(results))
}

async fn custody_alerts_handler(
    State(state): State<RemoteState>,
    headers: HeaderMap,
) -> Result<Json<Vec<CustodyAlert>>, ApiError> {
    let officer = require_officer(&state, &headers).await?;
    let alerts = custody::list_alerts(&state.pool).await.map_err(internal_error)?;
    let _ = officers::log_remote_access(&state.pool, &officer.id, "custody_alerts", None).await;
    Ok(Json(alerts))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DetailParams {
    entity_type: String,
    entity_id: String,
}

/// The full record behind a search result — a person's whole profile
/// (their cases, statements, custody, bonds, exhibits, charge sheets),
/// a case's whole workspace, or (for the four record types that are
/// only ever browsed as a sub-list under a Person/Case today) the
/// single record itself. Reuses the exact same rich structures the
/// desktop app itself reads; there is no separate, thinner remote shape
/// for any of these.
///
/// `kind` is deliberately left to serde's default `rename_all =
/// "camelCase"` lowering (so `Person` -> `"person"`, matching the
/// lowercase `entity_type` string every search result already carries)
/// rather than kept PascalCase — the one place this drifted
/// (`remote_ui.html` briefly compared against the PascalCase variant
/// names) was the bug, not a reason to change the convention here.
#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
enum DetailResponse {
    Person(PersonProfile),
    Case(CaseWorkspace),
    CustodyRecord(CustodyRecord),
    Bond(Bond),
    Statement(Statement),
    ChargeSheet(ChargeSheet),
    Unavailable,
}

async fn detail_handler(
    State(state): State<RemoteState>,
    headers: HeaderMap,
    Query(params): Query<DetailParams>,
) -> Result<Json<DetailResponse>, ApiError> {
    let officer = require_officer(&state, &headers).await?;

    let response = match params.entity_type.as_str() {
        "person" => people::get_person_profile(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::Person)
            .unwrap_or(DetailResponse::Unavailable),
        "case" => cases::get_case_workspace(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::Case)
            .unwrap_or(DetailResponse::Unavailable),
        "custody_record" => custody::get_record(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::CustodyRecord)
            .unwrap_or(DetailResponse::Unavailable),
        "bond" => bonds::get_bond(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::Bond)
            .unwrap_or(DetailResponse::Unavailable),
        "statement" => statements::get_statement(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::Statement)
            .unwrap_or(DetailResponse::Unavailable),
        "charge_sheet" => charge_sheets::get_charge_sheet(&state.pool, &params.entity_id)
            .await
            .map_err(internal_error)?
            .map(DetailResponse::ChargeSheet)
            .unwrap_or(DetailResponse::Unavailable),
        _ => DetailResponse::Unavailable,
    };

    let _ = officers::log_remote_access(
        &state.pool,
        &officer.id,
        "view_detail",
        Some(&format!("{}:{}", params.entity_type, params.entity_id)),
    )
    .await;

    Ok(Json(response))
}

#[derive(Deserialize)]
struct BackupAlertBody {
    latitude: Option<f64>,
    longitude: Option<f64>,
}

async fn backup_alert_handler(
    State(state): State<RemoteState>,
    headers: HeaderMap,
    Json(body): Json<BackupAlertBody>,
) -> Result<StatusCode, ApiError> {
    let officer = require_officer(&state, &headers).await?;

    let alert = officers::create_backup_alert(&state.pool, &officer.id, body.latitude, body.longitude)
        .await
        .map_err(internal_error)?;

    let location = match (body.latitude, body.longitude) {
        (Some(lat), Some(lng)) => format!("Location: {lat:.5}, {lng:.5}"),
        _ => "Location not available".to_string(),
    };
    let _ = officers::log_remote_access(&state.pool, &officer.id, "backup_alert", Some(&location)).await;

    if let Some(app) = &state.app {
        // The native notification's sound is a one-shot chime (every
        // platform's own limitation, not this app's) — for while the
        // window isn't focused. The actual "keeps ringing until
        // answered" behavior is the frontend's job, looping a
        // synthesized tone once it receives the `backup-alert:created`
        // event emitted below.
        let _ = app
            .notification()
            .builder()
            .title("Backup requested")
            .body(format!("{} is requesting backup. {location}", officer.name))
            .sound("phone-incoming-call")
            .show();

        let _ = app.emit("backup-alert:created", &alert);
    }

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoParams {
    entity_id: String,
}

/// Serves only a person's own designated headshot, never an arbitrary
/// attachment by id — the point is visually confirming a civilian's
/// identity, not a general file-download surface. Still requires the
/// bearer token like every other endpoint here; the phone side fetches
/// this with that header and turns it into a blob URL rather than using
/// a bare `<img src>` (which can't carry an Authorization header).
async fn photo_handler(
    State(state): State<RemoteState>,
    headers: HeaderMap,
    Query(params): Query<PhotoParams>,
) -> Result<Response, ApiError> {
    require_officer(&state, &headers).await?;

    let person = people::get_person(&state.pool, &params.entity_id)
        .await
        .map_err(internal_error)?
        .ok_or((StatusCode::NOT_FOUND, "person not found".to_string()))?;

    let attachment_id = person
        .headshot_attachment_id
        .ok_or((StatusCode::NOT_FOUND, "no headshot set".to_string()))?;

    let attachment = attachments::get_attachment(&state.pool, &attachment_id)
        .await
        .map_err(internal_error)?
        .ok_or((StatusCode::NOT_FOUND, "attachment not found".to_string()))?;

    let bytes = tokio::fs::read(&attachment.stored_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, attachment.mime_type)
        .body(Body::from(bytes))
        .unwrap())
}

async fn index_handler() -> impl IntoResponse {
    Html(include_str!("remote_ui.html"))
}

fn build_router(state: RemoteState) -> Router {
    Router::new()
        .route("/", get(index_handler))
        .route("/login", post(login_handler))
        .route("/logout", post(logout_handler))
        .route("/search", get(search_handler))
        .route("/detail", get(detail_handler))
        .route("/photo", get(photo_handler))
        .route("/custody-alerts", get(custody_alerts_handler))
        .route("/backup-alert", post(backup_alert_handler))
        .with_state(state)
}

/// Starts listening on every network interface (`0.0.0.0`), not just
/// loopback — this is the one real production-facing server in the app,
/// reached either through the Cloudflare Tunnel sidecar or directly by
/// another device on the same LAN. Only ever running while a station has
/// explicitly turned remote access on.
pub async fn start(pool: SqlitePool, port: u16, app_handle: AppHandle) -> std::io::Result<RemoteServerHandle> {
    start_with_state(RemoteState { pool, app: Some(app_handle) }, port).await
}

async fn start_with_state(state: RemoteState, port: u16) -> std::io::Result<RemoteServerHandle> {
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    let app = build_router(state);
    let (tx, rx) = oneshot::channel::<()>();

    tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async {
                let _ = rx.await;
            })
            .await;
    });

    Ok(RemoteServerHandle { shutdown: tx })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::officers::{self, CreateOfficerInput};
    use serde_json::{json, Value};

    async fn test_pool() -> (SqlitePool, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-remote-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault_root = dir.join("vault");
        let db = crate::db::connect(dir.join("test.db"), vault_root.clone()).await.unwrap();
        (db.pool, vault_root)
    }

    /// Real HTTP round-trips through the actual restricted router — not
    /// just calling the domain functions directly — so this also proves
    /// the auth check, the bearer-token wiring, and the route table
    /// itself all agree with each other.
    #[tokio::test]
    async fn login_search_and_alerts_over_http() {
        let (pool, vault_root) = test_pool().await;

        officers::create_officer(
            &pool,
            CreateOfficerInput {
                badge_number: "T-100".into(),
                name: "Test Officer".into(),
                password: "correct-password".into(),
                role: "officer".into(),
                person_id: None,
            },
        )
        .await
        .unwrap();

        // A civilian (should be findable remotely) and an internal
        // police-operations record sharing the same search term (should
        // never be) — proves `CIVILIAN_ENTITY_TYPES` actually filters,
        // not just that it compiles.
        crate::domain::people::create_person(
            &pool,
            &vault_root,
            crate::domain::people::CreatePersonInput {
                first_name: "Zzzqx".into(),
                last_name: "Civilian".into(),
                other_names: None,
                phone: None,
                national_id: None,
                address: None,
            },
        )
        .await
        .unwrap();

        crate::domain::duty::create_assignment(
            &pool,
            &vault_root,
            crate::domain::duty::CreateDutyAssignmentInput {
                officer_name: "Zzzqx Dutyofficer".into(),
                officer_rank: None,
                unit: None,
                shift_start: 0,
                shift_end: 1,
                notes: None,
            },
        )
        .await
        .unwrap();

        let port = 47850;
        let handle = start_with_state(RemoteState { pool, app: None }, port)
            .await
            .expect("start remote server");
        let client = reqwest::Client::new();
        let base = format!("http://127.0.0.1:{port}");

        let wrong = client
            .post(format!("{base}/login"))
            .json(&json!({ "badgeNumber": "T-100", "password": "wrong" }))
            .send()
            .await
            .unwrap();
        assert_eq!(wrong.status(), StatusCode::UNAUTHORIZED, "wrong password must be rejected");

        let login = client
            .post(format!("{base}/login"))
            .json(&json!({ "badgeNumber": "T-100", "password": "correct-password" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success(), "correct login must succeed");
        let token = login.json::<Value>().await.unwrap()["token"].as_str().unwrap().to_string();
        assert!(!token.is_empty());

        let unauthed_search = client.get(format!("{base}/search?query=test")).send().await.unwrap();
        assert_eq!(unauthed_search.status(), StatusCode::UNAUTHORIZED, "search must require a token");

        let search = client
            .get(format!("{base}/search?query=zzzqx"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert!(search.status().is_success(), "authed search must succeed");
        let results: Vec<Value> = search.json().await.unwrap();
        assert!(
            results.iter().any(|r| r["entityType"] == "person"),
            "a matching civilian must still be findable: {results:?}"
        );
        assert!(
            !results.iter().any(|r| r["entityType"] == "duty_assignment"),
            "an internal duty-roster match must never appear in remote search: {results:?}"
        );

        let alerts = client
            .get(format!("{base}/custody-alerts"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert!(alerts.status().is_success(), "authed custody-alerts must succeed");
        let _: Vec<Value> = alerts.json().await.unwrap();

        let logout = client.post(format!("{base}/logout")).bearer_auth(&token).send().await.unwrap();
        assert_eq!(logout.status(), StatusCode::NO_CONTENT);

        let after_logout = client
            .get(format!("{base}/search?query=test"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(after_logout.status(), StatusCode::UNAUTHORIZED, "token must be dead after logout");

        handle.stop();
    }
}
