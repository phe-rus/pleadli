//! First-launch setup, sign-in and the people of the installation. The same
//! routes and rules as every other Pleadli app; only the people differ.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;

use super::{ApiError, ApiResult, AppState};
use crate::domain::audit;
use crate::domain::error::DomainError;
use crate::domain::installation::{self, Brand, Installation, SetupInput, SetupStatus, UpdateInstallationInput};
use crate::domain::security::{self as security_domain, LockStatus, SignInInput, SignInOutcome};
use crate::domain::staff::{self, Actor, PersonInput, Protection, SignInPerson, Staff, UpdateStaffInput};
use crate::domain::totp::{self, Enrolment};

fn security(s: &AppState) -> Result<&std::sync::Arc<security_domain::Security>, ApiError> {
    s.security.as_ref().ok_or_else(|| ApiError(StatusCode::PRECONDITION_REQUIRED, "SETUP_REQUIRED", "Sign-in is not available here.".to_string()))
}

fn require_admin(s: &AppState) -> Result<Actor, ApiError> {
    match security(s)?.actor() {
        Some(actor) if actor.is_administrator() => Ok(actor),
        _ => Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Only an administrator can do that.".to_string())),
    }
}

fn not_installed(s: &AppState) -> Result<(), ApiError> {
    if security(s)?.is_installed() {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "This installation is already set up.".to_string()));
    }
    Ok(())
}

async fn setup_status(State(s): State<AppState>) -> ApiResult<SetupStatus> {
    let status = installation::setup_status(&s.pool).await?;
    Ok(Json(status))
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
    let sec = security(&s)?;
    sec.load(&s.pool).await?;
    // Whoever set it up is already signed in: they just proved who they are.
    if let Some(admin) = staff::first_administrator(&s.pool).await? {
        sec.adopt(&s.pool, admin).await?;
    }
    crate::domain::profile::sync_from_session(&s.pool).await?;
    Ok(Json(sec.status()))
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
struct ProtectionInput {
    protection: String,
    #[serde(default)]
    secret: Option<String>,
}

async fn set_protection(State(s): State<AppState>, Json(input): Json<ProtectionInput>) -> ApiResult<LockStatus> {
    let admin = require_admin(&s)?;
    let level = Protection::parse(&input.protection).ok_or_else(|| DomainError::Invalid("That protection level is not known.".to_string()))?;
    installation::set_protection(&s.pool, &admin.id, level, input.secret.as_deref()).await?;
    let sec = security(&s)?;
    sec.load(&s.pool).await?;
    sec.adopt(&s.pool, admin).await?;
    Ok(Json(sec.status()))
}

async fn session_people(State(s): State<AppState>) -> ApiResult<Vec<SignInPerson>> {
    Ok(Json(staff::sign_in_list(&s.pool, security(&s)?.protection()).await?))
}

async fn sign_in(State(s): State<AppState>, Json(input): Json<SignInInput>) -> ApiResult<SignInOutcome> {
    let outcome = security(&s)?.sign_in(&s.pool, input).await?;
    crate::domain::profile::sync_from_session(&s.pool).await?;
    Ok(Json(outcome))
}

async fn sign_out(State(s): State<AppState>) -> ApiResult<LockStatus> {
    let sec = security(&s)?;
    sec.lock_now(&s.pool).await;
    Ok(Json(sec.status()))
}

async fn security_status(State(s): State<AppState>) -> ApiResult<LockStatus> {
    Ok(Json(security(&s)?.status()))
}

async fn list_staff(State(s): State<AppState>) -> ApiResult<Vec<Staff>> {
    Ok(Json(staff::list(&s.pool).await?))
}

async fn create_staff(State(s): State<AppState>, Json(input): Json<PersonInput>) -> ApiResult<Staff> {
    require_admin(&s)?;
    let created = staff::create(&s.pool, security(&s)?.protection(), input).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("staff_added").subject("staff", &created.id)).await;
    Ok(Json(created))
}

async fn update_staff(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<UpdateStaffInput>) -> ApiResult<Staff> {
    require_admin(&s)?;
    let updated = staff::update(&s.pool, &id, input).await?;
    let _ = audit::log(&s.pool, audit::Entry::new("staff_changed").subject("staff", &id)).await;
    security(&s)?.refresh_actor(&s.pool).await?;
    Ok(Json(updated))
}

#[derive(Deserialize)]
struct SecretInput {
    secret: String,
}

async fn set_staff_secret(State(s): State<AppState>, Path(id): Path<String>, Json(input): Json<SecretInput>) -> Result<StatusCode, ApiError> {
    let sec = security(&s)?;
    let actor = sec.actor().ok_or_else(|| ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Nobody is signed in.".to_string()))?;
    if !actor.is_administrator() && actor.id != id {
        return Err(ApiError(StatusCode::FORBIDDEN, "FORBIDDEN", "Only an administrator can do that.".to_string()));
    }
    staff::set_secret(&s.pool, sec.protection(), &id, &input.secret).await?;
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

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/setup/status", get(setup_status))
        .route("/setup/second-factor", post(setup_second_factor))
        .route("/setup/complete", post(setup_complete))
        .route("/installation", get(get_installation).put(update_installation))
        .route("/installation/brand", get(get_brand))
        .route("/installation/protection", axum::routing::put(set_protection))
        .route("/session/people", get(session_people))
        .route("/session/sign-in", post(sign_in))
        .route("/session/sign-out", post(sign_out))
        .route("/staff", get(list_staff).post(create_staff))
        .route("/staff/{id}", axum::routing::put(update_staff))
        .route("/staff/{id}/secret", axum::routing::put(set_staff_secret))
        .route("/staff/{id}/second-factor", delete(reset_second_factor))
}

pub fn open_routes() -> Router<AppState> {
    Router::new().route("/security/status", get(security_status))
}

/// Who may reach what. Branding and the status are always readable. Before
/// only setup works; after it, with nobody signed in, only the sign-in
/// list and signing in. Everything else counts as use, which postpones the
/// idle sign-out. An application built without security (tests) is not gated.
pub async fn gate(State(s): State<AppState>, request: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let Some(sec) = s.security.as_ref() else { return next.run(request).await };
    let path = request.uri().path();
    if path == "/installation/brand" || path == "/system/status" {
        return next.run(request).await;
    }
    if !sec.is_installed() {
        if path.starts_with("/setup/") {
            return next.run(request).await;
        }
        return ApiError(StatusCode::PRECONDITION_REQUIRED, "SETUP_REQUIRED", "The application is not set up yet.".to_string()).into_response();
    }
    if path.starts_with("/setup/") || path == "/session/people" || path == "/session/sign-in" {
        return next.run(request).await;
    }
    if sec.is_locked() {
        return ApiError(StatusCode::LOCKED, "LOCKED", "Sign in to continue.".to_string()).into_response();
    }
    sec.touch();
    next.run(request).await
}
