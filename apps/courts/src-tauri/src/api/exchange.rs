//! The registry's exchange with DPP offices over the local API. Files travel as
//! base64; the window's own dialogs choose where they come from and go to.

use axum::extract::{Path, State};
use axum::Json;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};

use super::{ApiError, ApiResult, AppState};
use crate::domain::error::DomainError;
use crate::domain::exchange::{self, Imported, Incoming, Link, RegistryIdentity};

fn decode(file: &str) -> Result<Vec<u8>, ApiError> {
    B64.decode(file).map(Ok).unwrap_or_else(|_| Err(DomainError::Invalid("That file could not be read.".into()).into()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WithFile<T: Serialize> {
    #[serde(flatten)]
    value: T,
    file: String,
    name: String,
}

pub async fn get_identity(State(s): State<AppState>) -> ApiResult<Option<RegistryIdentity>> {
    Ok(Json(exchange::get_identity(&s.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityInput {
    name: String,
    jurisdiction: Option<String>,
}

pub async fn create_identity(State(s): State<AppState>, Json(i): Json<IdentityInput>) -> ApiResult<RegistryIdentity> {
    Ok(Json(exchange::create_identity(&s.pool, &i.name, i.jurisdiction.as_deref()).await?))
}

pub async fn list_links(State(s): State<AppState>) -> ApiResult<Vec<Link>> {
    Ok(Json(exchange::list_links(&s.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteInput {
    intended_office: String,
    valid_days: i64,
}

pub async fn create_invite(State(s): State<AppState>, Json(i): Json<InviteInput>) -> ApiResult<WithFile<Link>> {
    let (link, bytes) = exchange::create_invite(&s.pool, &i.intended_office, i.valid_days).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "court-invitation.pxpkg".into() }))
}

#[derive(Deserialize)]
pub struct TrustInput {
    fingerprint: String,
}

pub async fn trust_link(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<TrustInput>) -> ApiResult<WithFile<Link>> {
    let (link, bytes) = exchange::trust_link(&s.pool, &id, &i.fingerprint).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "court-confirmation.pxpkg".into() }))
}

#[derive(Deserialize)]
pub struct FileInput {
    file: String,
}

pub async fn import_package(State(s): State<AppState>, Json(i): Json<FileInput>) -> ApiResult<Imported> {
    Ok(Json(exchange::import_package(&s.pool, &decode(&i.file)?).await?))
}

pub async fn list_incoming(State(s): State<AppState>) -> ApiResult<Vec<Incoming>> {
    Ok(Json(exchange::list_incoming(&s.pool).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptInput {
    court_number: String,
    decided_by: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Accepted {
    case_id: String,
}

pub async fn accept_filing(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<AcceptInput>) -> ApiResult<WithFile<Accepted>> {
    let (case_id, bytes) = exchange::accept_filing(&s.pool, &id, &i.court_number, &i.decided_by).await?;
    Ok(Json(WithFile { value: Accepted { case_id }, file: B64.encode(bytes), name: "court-receipt.pxpkg".into() }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordWithdrawalInput {
    decided_by: String,
}

pub async fn record_withdrawal(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<RecordWithdrawalInput>) -> ApiResult<WithFile<Accepted>> {
    let (case_id, bytes) = exchange::record_withdrawal(&s.pool, &id, &i.decided_by).await?;
    Ok(Json(WithFile { value: Accepted { case_id }, file: B64.encode(bytes), name: "withdrawal-receipt.pxpkg".into() }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RejectInput {
    reason: String,
    decided_by: String,
}

#[derive(Serialize)]
pub struct Rejected {}

pub async fn reject_filing(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<RejectInput>) -> ApiResult<WithFile<Rejected>> {
    let bytes = exchange::reject_filing(&s.pool, &id, &i.reason, &i.decided_by).await?;
    Ok(Json(WithFile { value: Rejected {}, file: B64.encode(bytes), name: "court-receipt.pxpkg".into() }))
}

// ---- Court -> prison: facilities that invited this registry, and the orders sent to them.
use crate::domain::custody_exchange::{self, Delivery, Imported as PrisonImported, PrisonLink};

pub async fn list_prison_links(State(s): State<AppState>) -> ApiResult<Vec<PrisonLink>> {
    Ok(Json(custody_exchange::list_links(&s.pool).await?))
}

#[derive(Deserialize)]
pub struct AnswerInput {
    file: String,
    contact: Option<String>,
}

pub async fn answer_prison_invite(State(s): State<AppState>, Json(i): Json<AnswerInput>) -> ApiResult<WithFile<PrisonLink>> {
    let (link, bytes) = custody_exchange::accept_invite(&s.pool, &decode(&i.file)?, i.contact.as_deref()).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "answer-to-prison.pxpkg".into() }))
}

pub async fn import_prison_package(State(s): State<AppState>, Json(i): Json<FileInput>) -> ApiResult<PrisonImported> {
    Ok(Json(custody_exchange::import_package(&s.pool, &decode(&i.file)?).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOrderInput {
    link_id: String,
}

#[derive(Serialize)]
pub struct Sent {}

pub async fn send_order(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<SendOrderInput>) -> ApiResult<WithFile<Sent>> {
    let (bytes, name) = custody_exchange::export_order(&s.pool, &id, &i.link_id).await?;
    Ok(Json(WithFile { value: Sent {}, file: B64.encode(bytes), name }))
}

pub async fn prison_reports(State(s): State<AppState>) -> ApiResult<Vec<custody_exchange::PrisonReport>> {
    Ok(Json(custody_exchange::list_reports(&s.pool, None).await?))
}

pub async fn case_prison_reports(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<custody_exchange::PrisonReport>> {
    Ok(Json(custody_exchange::list_reports(&s.pool, Some(&id)).await?))
}

pub async fn order_deliveries(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<Delivery>> {
    Ok(Json(custody_exchange::list_deliveries(&s.pool, &id).await?))
}

// ---- Court -> law firm: firms that invited this registry, and the notices sent to them.
use crate::domain::firm_exchange::{self, Delivery as FirmDelivery, FirmLink, Imported as FirmImported};

pub async fn list_firm_links(State(s): State<AppState>) -> ApiResult<Vec<FirmLink>> {
    Ok(Json(firm_exchange::list_links(&s.pool).await?))
}

pub async fn answer_firm_invite(State(s): State<AppState>, Json(i): Json<AnswerInput>) -> ApiResult<WithFile<FirmLink>> {
    let (link, bytes) = firm_exchange::accept_invite(&s.pool, &decode(&i.file)?, i.contact.as_deref()).await?;
    Ok(Json(WithFile { value: link, file: B64.encode(bytes), name: "answer-to-firm.pxpkg".into() }))
}

pub async fn import_firm_package(State(s): State<AppState>, Json(i): Json<FileInput>) -> ApiResult<FirmImported> {
    Ok(Json(firm_exchange::import_package(&s.pool, &decode(&i.file)?).await?))
}

pub async fn notify_order(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<SendOrderInput>) -> ApiResult<WithFile<Sent>> {
    let (bytes, name) = firm_exchange::export_order_copy(&s.pool, &id, &i.link_id).await?;
    Ok(Json(WithFile { value: Sent {}, file: B64.encode(bytes), name }))
}

pub async fn notify_sitting(State(s): State<AppState>, Path(id): Path<String>, Json(i): Json<SendOrderInput>) -> ApiResult<WithFile<Sent>> {
    let (bytes, name) = firm_exchange::export_hearing(&s.pool, &id, &i.link_id).await?;
    Ok(Json(WithFile { value: Sent {}, file: B64.encode(bytes), name }))
}

pub async fn notice_deliveries(State(s): State<AppState>, Path(id): Path<String>) -> ApiResult<Vec<FirmDelivery>> {
    Ok(Json(firm_exchange::list_deliveries(&s.pool, &id).await?))
}
