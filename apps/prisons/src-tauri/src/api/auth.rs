//! `/api/auth/**`: identity. Sign-in, session, accounts, workstation devices.

use std::time::Duration;

use axum::extract::{Path, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{CallerDevice, Ingress, Need, RouteTable};
use super::write;
use crate::domain::authz::{perm, role_permissions, Actor};
use crate::domain::devices::{self, Device, EnrolmentCode};
use crate::domain::officers::{self, CreateOfficerInput, Officer, UpdateOfficerInput};
use crate::domain::sessions::{self, SessionInfo};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    RouteTable::new(node)
        .get("/api/auth/bootstrap-status", Need::Device, bootstrap_status)
        .post("/api/auth/bootstrap", Need::Onboarding, bootstrap)
        .post("/api/auth/login", Need::Device, login)
        .post("/api/auth/logout", Need::Session, logout)
        .get("/api/auth/session", Need::Session, current_session)
        .get("/api/auth/accounts", Need::Perm(perm::ACCOUNTS_MANAGE), list_accounts)
        .post("/api/auth/accounts", Need::Perm(perm::ACCOUNTS_MANAGE), create_account)
        .put("/api/auth/accounts/{id}", Need::Perm(perm::ACCOUNTS_MANAGE), update_account)
        .get("/api/auth/devices", Need::Perm(perm::DEVICES_MANAGE), list_devices)
        .post("/api/auth/devices/enrolment-codes", Need::Perm(perm::DEVICES_MANAGE), create_enrolment_code)
        .post("/api/auth/devices/{id}/revoke", Need::Perm(perm::DEVICES_MANAGE), revoke_device)
        .post("/api/auth/devices/enrol", Need::Public, enrol_device)
}

#[derive(Serialize)]
struct BootstrapStatus {
    bootstrap: bool,
}

async fn bootstrap_status(State(node): State<NodeRef>) -> Result<Json<BootstrapStatus>, ApiError> {
    Ok(Json(BootstrapStatus { bootstrap: officers::is_bootstrap(&node.pool).await? }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapBody {
    badge_number: String,
    name: String,
    password: String,
}

/// The one time first account of a brand new installation. Only while there
/// are zero accounts, only on the node's own machine; it signs the new
/// administrator in.
async fn bootstrap(
    State(node): State<NodeRef>,
    Extension(device): Extension<CallerDevice>,
    Json(body): Json<BootstrapBody>,
) -> Result<Json<SessionInfo>, ApiError> {
    let badge = body.badge_number.clone();
    let password = body.password.clone();
    write(&node, |c| {
        Box::pin(async move {
            officers::create_first_admin(c, &body.badge_number, &body.name, &body.password).await?;
            Ok(())
        })
    })
    .await?;
    Ok(Json(sessions::sign_in(&node.pool, &badge, &password, device.0.as_deref()).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginBody {
    badge_number: String,
    password: String,
}

const LOGIN_LIMIT_PER_MINUTE: usize = 30;

async fn login(
    State(node): State<NodeRef>,
    ingress: Option<Extension<Ingress>>,
    Extension(device): Extension<CallerDevice>,
    Json(body): Json<LoginBody>,
) -> Result<Json<SessionInfo>, ApiError> {
    let key = format!("login:{:?}", ingress.map(|Extension(i)| i));
    if !node.limiter.check(&key, LOGIN_LIMIT_PER_MINUTE, Duration::from_secs(60)) {
        return Err(ApiError::new(StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Wait a minute and try again."));
    }
    Ok(Json(sessions::sign_in(&node.pool, &body.badge_number, &body.password, device.0.as_deref()).await?))
}

async fn logout(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, headers: HeaderMap) -> Result<StatusCode, ApiError> {
    let token = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or_default()
        .to_string();
    write(&node, |c| Box::pin(async move { Ok(sessions::sign_out(c, &actor, &token).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CurrentSession {
    officer: Officer,
    permissions: Vec<String>,
}

async fn current_session(State(node): State<NodeRef>, Extension(actor): Extension<Actor>) -> Result<Json<CurrentSession>, ApiError> {
    let id = actor.officer_id.as_deref().ok_or_else(ApiError::unauthenticated)?;
    let officer = officers::get_officer(&node.pool, id).await?.ok_or_else(ApiError::unauthenticated)?;
    let permissions = role_permissions(&officer.role, officer.is_admin).into_iter().map(String::from).collect();
    Ok(Json(CurrentSession { officer, permissions }))
}

async fn list_accounts(State(node): State<NodeRef>) -> Result<Json<Vec<Officer>>, ApiError> {
    Ok(Json(officers::list_officers(&node.pool).await?))
}

async fn create_account(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<CreateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(officers::create_officer(c, &actor, input).await?) })).await?))
}

async fn update_account(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<UpdateOfficerInput>,
) -> Result<Json<Officer>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(officers::update_officer(c, &actor, &id, input).await?) })).await?))
}

async fn list_devices(State(node): State<NodeRef>) -> Result<Json<Vec<Device>>, ApiError> {
    Ok(Json(devices::list(&node.pool).await?))
}

#[derive(Deserialize)]
struct EnrolmentCodeBody {
    label: String,
}

async fn create_enrolment_code(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(body): Json<EnrolmentCodeBody>,
) -> Result<Json<EnrolmentCode>, ApiError> {
    if body.label.trim().is_empty() {
        return Err(ApiError::bad_request("Name the workstation so it can be recognised later."));
    }
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(devices::create_enrolment_code(c, &actor, body.label.trim()).await?) })).await?))
}

async fn revoke_device(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(devices::revoke(c, &actor, &id).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct EnrolBody {
    code: String,
}

/// A workstation trades a one-time code for its device token. Public because
/// the workstation has no credential yet; guessing is limited to a few tries
/// a minute against a ten-minute, single-use, eight-digit code.
async fn enrol_device(State(node): State<NodeRef>, Json(body): Json<EnrolBody>) -> Result<Json<devices::Enrolled>, ApiError> {
    if !node.limiter.check("enrol", 10, Duration::from_secs(60)) {
        return Err(ApiError::new(StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS", "Too many attempts. Wait a minute and try again."));
    }
    match devices::enrol(&node.pool, &body.code).await? {
        Some(enrolled) => Ok(Json(enrolled)),
        None => Err(ApiError::new(StatusCode::UNAUTHORIZED, "INVALID_ENROLMENT_CODE", "That code is invalid or has expired.")),
    }
}
