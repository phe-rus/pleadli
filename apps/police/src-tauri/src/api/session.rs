//! Who may call the API, and the calls that decide it: first-launch setup,
//! sign-in, the sign-in policy. The guard sits in front of every route: a
//! request without a valid session is refused whether or not the window
//! showed a sign-in screen, and some routes need an administrator.

use axum::extract::{OriginalUri, Request, State};
use axum::http::{header, HeaderMap, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use serde::Serialize;

use super::{ApiError, AppState};
use crate::domain::auth::{self, AuthEvent, AuthPolicy, PolicyInput, SignInInput};
use crate::domain::error::DomainError;
use crate::domain::installation::{self, CommandSetupInput, InstallationState, StationSetupInput};
use crate::domain::officers::Officer;
use crate::domain::sessions::{self, Actor};

pub fn domain_error(err: DomainError) -> ApiError {
    let status = match &err {
        DomainError::Invalid(_) => StatusCode::UNPROCESSABLE_ENTITY,
        DomainError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
        DomainError::NotFound(_) => StatusCode::NOT_FOUND,
        DomainError::Conflict(_) => StatusCode::CONFLICT,
        DomainError::Slow(_) => StatusCode::TOO_MANY_REQUESTS,
        DomainError::Db(_) => StatusCode::INTERNAL_SERVER_ERROR,
    };
    (status, err.to_string())
}

/// The token of the request that passed the guard, for sign-out.
#[derive(Clone)]
pub struct Token(pub String);

fn bearer(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    value.strip_prefix("Bearer ").map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

/// Routes that answer without a session: what the window needs to decide
/// between setup and sign-in, and sign-in itself.
fn is_public(method: &Method, path: &str) -> bool {
    matches!(
        (method.as_str(), path),
        ("GET", "/api/system/state") | ("POST", "/api/system/onboarding/station") | ("POST", "/api/system/onboarding/command") | ("POST", "/api/auth/sign-in")
    )
}

/// Routes only an administrator may call.
fn admin_only(method: &Method, path: &str) -> bool {
    let write = method != Method::GET;
    path == "/api/auth/policy" && write
        || path == "/api/auth/events"
        || (path == "/api/officers" || path.starts_with("/api/officers/")) && write
        || path == "/api/station-profile" && write
        || path == "/api/units/chain" && write
        || path == "/api/import/bulk"
        || path.starts_with("/api/hq/") && write
        || path == "/api/command-link" && write
        || path == "/api/system/dev-mode"
}

/// A Command holds no case or person records, so the routes for them are not
/// there to call.
fn command_allows(path: &str) -> bool {
    ["/api/system", "/api/auth", "/api/officers", "/api/station-profile", "/api/units", "/api/hq"]
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

pub async fn guard(State(state): State<AppState>, mut request: Request, next: Next) -> Response {
    let path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|uri| uri.path().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    let method = request.method().clone();

    if is_public(&method, &path) {
        return next.run(request).await;
    }

    let Some(token) = bearer(request.headers()) else {
        return (StatusCode::UNAUTHORIZED, "Sign in to continue.").into_response();
    };
    let actor = match sessions::resolve(&state.pool, &token).await {
        Ok(Some(actor)) => actor,
        Ok(None) => return (StatusCode::UNAUTHORIZED, "Sign in to continue.").into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };
    if admin_only(&method, &path) && !actor.is_admin() {
        return (StatusCode::FORBIDDEN, "Only an administrator can do that.").into_response();
    }
    match installation::mode(&state.pool).await {
        Ok(Some(mode)) if mode == "command" && !command_allows(&path) => {
            return (StatusCode::NOT_FOUND, "A command holds no station records.").into_response();
        }
        // A station has no stations of its own to manage; a command has no link
        // to a command above it (that is one level at a time, for now).
        Ok(Some(mode)) if mode == "station" && path.starts_with("/api/hq") => {
            return (StatusCode::NOT_FOUND, "A station has no stations under it.").into_response();
        }
        Ok(_) => {}
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }

    request.extensions_mut().insert(actor);
    request.extensions_mut().insert(Token(token));
    next.run(request).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedIn {
    /// Held by the shell in the desktop app and never shown to the window; the
    /// browser dev server keeps it in session storage.
    pub token: String,
    pub officer: Officer,
}

pub async fn system_state(State(state): State<AppState>) -> Result<Json<InstallationState>, ApiError> {
    installation::state(&state.pool).await.map(Json).map_err(|e| domain_error(e.into()))
}

pub async fn onboard_station(State(state): State<AppState>, Json(input): Json<StationSetupInput>) -> Result<Json<SignedIn>, ApiError> {
    let (token, officer) = installation::setup_station(&state.pool, input).await.map_err(domain_error)?;
    Ok(Json(SignedIn { token, officer }))
}

pub async fn onboard_command(State(state): State<AppState>, Json(input): Json<CommandSetupInput>) -> Result<Json<SignedIn>, ApiError> {
    let (token, officer) = installation::setup_command(&state.pool, input).await.map_err(domain_error)?;
    Ok(Json(SignedIn { token, officer }))
}

#[cfg(debug_assertions)]
#[derive(serde::Deserialize)]
pub struct DevModeBody {
    pub mode: String,
}

/// Dev builds only: flips this installation between Station and Command so
/// both can be tried without a second machine or a fresh database.
#[cfg(debug_assertions)]
pub async fn dev_mode(State(state): State<AppState>, Extension(actor): Extension<Actor>, Json(body): Json<DevModeBody>) -> Result<Json<InstallationState>, ApiError> {
    installation::set_dev_mode(&state.pool, &actor.officer_id, &body.mode).await.map_err(domain_error)?;
    installation::state(&state.pool).await.map(Json).map_err(|e| domain_error(e.into()))
}

pub async fn sign_in(State(state): State<AppState>, Json(input): Json<SignInInput>) -> Result<Json<SignedIn>, ApiError> {
    let (token, officer) = auth::sign_in(&state.pool, input).await.map_err(domain_error)?;
    Ok(Json(SignedIn { token, officer }))
}

pub async fn sign_out(State(state): State<AppState>, Extension(actor): Extension<Actor>, Extension(token): Extension<Token>) -> Result<StatusCode, ApiError> {
    auth::sign_out(&state.pool, &actor, &token.0).await.map_err(domain_error)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn me(Extension(actor): Extension<Actor>) -> Json<Actor> {
    Json(actor)
}

pub async fn get_policy(State(state): State<AppState>) -> Result<Json<AuthPolicy>, ApiError> {
    auth::get_policy(&state.pool).await.map(Json).map_err(|e| domain_error(e.into()))
}

pub async fn save_policy(
    State(state): State<AppState>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<PolicyInput>,
) -> Result<Json<AuthPolicy>, ApiError> {
    auth::save_policy(&state.pool, &actor, input).await.map(Json).map_err(domain_error)
}

pub async fn list_events(State(state): State<AppState>) -> Result<Json<Vec<AuthEvent>>, ApiError> {
    auth::list_events(&state.pool).await.map(Json).map_err(|e| domain_error(e.into()))
}
