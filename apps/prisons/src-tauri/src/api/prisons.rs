//! `/api/prisons/**`: the facility domain. Every route names the permission
//! it needs; every write runs in one transaction with its audit entry.

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::{Extension, Json};
use base64::Engine as _;
use serde::Deserialize;

use super::error::ApiError;
use super::guard::{Need, RouteTable};
use super::write;
use crate::domain::attachments::{self, Attachment};
use crate::domain::capture::{self, OpenedSession, SessionStatus};
use crate::domain::prisoner_photos::{self, PrisonerPhoto};
use crate::domain::authz::{perm, role_permissions, Actor, Forbidden};
use crate::domain::court_productions::{self, CourtOutcomeInput, CourtOutcomeResult, CourtProduction, CreateCourtProductionInput, RemandListEntry};
use crate::domain::custody::{self, ReceptionInput, ReceptionResult};
use crate::domain::facility_profile::{self, FacilityProfile, SaveFacilityProfileInput};
use crate::domain::instruments::{self, ExpectInstrumentInput, Instrument, RecordInstrumentInput};
use crate::domain::legal::{self, LegalOverview};
use crate::domain::obligations::{self, ResolveInput};
use crate::domain::officers;
use crate::domain::sentences::{self, Sentence, SetSentenceInput};
use crate::domain::today::{self, TodayView};
use crate::domain::health_events::{self, CreateHealthEventInput, HealthEvent, HospitalisedEntry};
use crate::domain::prisoners::{self, Prisoner, UpdatePrisonerInput};
use crate::domain::programmes::{self, CertifyProgrammeParticipationInput, CreateProgrammeParticipationInput, ProgrammeParticipation};
use crate::domain::property_records::{self, CreatePropertyRecordInput, PropertyRecord, ReturnPropertyRecordInput};
use crate::domain::releases::{self, Authoriser, CreateReleaseInput, DischargeAssessment, Release};
use crate::domain::reports::{self, GeneratedReport, ReportDocument, ReportRecord, SummaryStatement};
use crate::domain::requests::{self, CreateRequestInput, Request as PrisonRequest, ResolveRequestInput};
use crate::domain::search::{self, SearchResult};
use crate::domain::transfers::{self, Checklist, ConfirmArrivalInput, DispatchInput, DispatchResult, DossierPreview, FileExport, PrepareTransferInput, Transfer};
use crate::domain::visits::{
    self, ApproveVisitorInput, ApprovedVisitor, CheckInInput, CreateVisitInput, SaveVisitRulesInput, Visit, VisitItem, VisitListItem,
    VisitRules, Visitor,
};
use crate::node::NodeRef;

pub fn routes(node: NodeRef) -> RouteTable {
    use perm::*;
    RouteTable::new(node)
        .get("/api/prisons/prisoners", Need::Perm(PRISONER_READ), list_prisoners)
        .get("/api/prisons/today", Need::Perm(PRISONER_READ), get_today)
        .get("/api/prisons/legal", Need::Perm(PRISONER_READ), get_legal)
        .get("/api/prisons/facility", Need::Perm(PRISONER_READ), get_facility)
        .put("/api/prisons/facility", Need::Perm(NODE_MANAGE), save_facility)
        .post("/api/prisons/receptions", Need::Perm(CUSTODY_ADMIT), receive)
        .get("/api/prisons/prisoners/{id}/file", Need::Perm(PRISONER_READ), prisoner_file)
        .get("/api/prisons/prisoners/{id}/instruments", Need::Perm(PRISONER_READ), instruments_for_prisoner)
        .get("/api/prisons/prisoners/{id}/discharge-check", Need::Perm(PRISONER_READ), discharge_check)
        .post("/api/prisons/instruments", Need::Perm(CUSTODY_EDIT), record_instrument)
        .post("/api/prisons/instruments/expect", Need::Perm(CUSTODY_EDIT), expect_instrument)
        .post("/api/prisons/instruments/{id}/supersede", Need::Perm(AUTHORISE_EXCEPTION), supersede_instrument)
        .post("/api/prisons/sentences", Need::Perm(CUSTODY_EDIT), set_sentence)
        .post("/api/prisons/obligations/resolve", Need::Perm(CUSTODY_EDIT), resolve_obligation)
        .put("/api/prisons/court-productions/{id}/outcome", Need::Perm(COURT_MANAGE), court_outcome)
        .post("/api/prisons/court-productions/{id}/cancel", Need::Perm(COURT_MANAGE), court_cancel)
        .get("/api/prisons/transfers", Need::Perm(PRISONER_READ), list_transfers)
        .post("/api/prisons/transfers/import", Need::Perm(TRANSFER_MANAGE), import_dossier)
        .post("/api/prisons/transfers/import-receipt", Need::Perm(TRANSFER_MANAGE), import_receipt)
        .put("/api/prisons/transfers/{id}/checklist", Need::Perm(TRANSFER_MANAGE), update_checklist)
        .post("/api/prisons/transfers/{id}/dispatch", Need::Perm(TRANSFER_MANAGE), dispatch_transfer)
        .post("/api/prisons/transfers/{id}/cancel", Need::Perm(TRANSFER_MANAGE), cancel_transfer)
        .post("/api/prisons/transfers/{id}/confirm", Need::Perm(TRANSFER_MANAGE), confirm_arrival)
        .get("/api/prisons/transfers/{id}/dossier", Need::Perm(PRISONER_READ), dossier_preview)
        .get("/api/prisons/transfers/{id}/dossier-file", Need::Perm(TRANSFER_MANAGE), dossier_file)
        .get("/api/prisons/transfers/{id}/receipt-file", Need::Perm(TRANSFER_MANAGE), receipt_file)
        .get("/api/prisons/prisoners/{id}/photos", Need::Perm(PRISONER_READ), prisoner_photos_list)
        .put("/api/prisons/prisoners/{id}/photos/{view}", Need::Perm(CUSTODY_EDIT), prisoner_photo_save)
        .post("/api/prisons/capture-sessions", Need::Perm(CUSTODY_ADMIT), open_capture_session)
        .get("/api/prisons/capture-sessions/{id}", Need::Perm(CUSTODY_ADMIT), capture_session_status)
        .delete("/api/prisons/capture-sessions/{id}", Need::Perm(CUSTODY_ADMIT), close_capture_session)
        .get("/api/prisons/prisoners/in-custody", Need::Perm(PRISONER_READ), list_in_custody)
        .get("/api/prisons/prisoners/{id}", Need::Perm(PRISONER_READ), get_prisoner)
        .put("/api/prisons/prisoners/{id}", Need::Perm(CUSTODY_EDIT), update_prisoner)
        .get("/api/prisons/prisoners/{id}/releases", Need::Perm(PRISONER_READ), releases_for_prisoner)
        .get("/api/prisons/prisoners/{id}/court-productions", Need::Perm(PRISONER_READ), productions_for_prisoner)
        .get("/api/prisons/prisoners/{id}/visits", Need::Perm(PRISONER_READ), visits_for_prisoner)
        .get("/api/prisons/prisoners/{id}/health-events", Need::Perm(PRISONER_READ), health_for_prisoner)
        .get("/api/prisons/prisoners/{id}/transfers", Need::Perm(PRISONER_READ), transfers_for_prisoner)
        .get("/api/prisons/prisoners/{id}/programme-participations", Need::Perm(PRISONER_READ), programmes_for_prisoner)
        .get("/api/prisons/prisoners/{id}/property-records", Need::Perm(PRISONER_READ), property_for_prisoner)
        .get("/api/prisons/prisoners/{id}/requests", Need::Perm(PRISONER_READ), requests_for_prisoner)
        .post("/api/prisons/releases", Need::Perm(DISCHARGE_EXECUTE), create_release)
        .post("/api/prisons/court-productions", Need::Perm(COURT_MANAGE), create_court_production)
        .get("/api/prisons/remand", Need::Perm(PRISONER_READ), list_remand)
        .get("/api/prisons/search", Need::AnyPerm(&[PRISONER_READ, HQ_LOCATE]), search)
        .post("/api/prisons/visits", Need::Perm(VISIT_MANAGE), create_visit)
        .get("/api/prisons/visits", Need::Perm(PRISONER_READ), list_visits)
        .get("/api/prisons/visits/{id}/items", Need::Perm(PRISONER_READ), visit_items)
        .post("/api/prisons/visits/{id}/approve", Need::Perm(VISIT_MANAGE), approve_visit)
        .post("/api/prisons/visits/{id}/deny", Need::Perm(VISIT_MANAGE), deny_visit)
        .post("/api/prisons/visits/{id}/check-in", Need::Perm(VISIT_MANAGE), check_in_visit)
        .post("/api/prisons/visits/{id}/start", Need::Perm(VISIT_MANAGE), start_visit)
        .post("/api/prisons/visits/{id}/complete", Need::Perm(VISIT_MANAGE), complete_visit)
        .post("/api/prisons/visits/{id}/no-show", Need::Perm(VISIT_MANAGE), no_show_visit)
        .post("/api/prisons/visits/{id}/cancel", Need::Perm(VISIT_MANAGE), cancel_visit)
        .get("/api/prisons/visit-rules", Need::Perm(PRISONER_READ), get_visit_rules)
        .put("/api/prisons/visit-rules", Need::Perm(AUTHORISE_EXCEPTION), save_visit_rules)
        .get("/api/prisons/visitors", Need::Perm(PRISONER_READ), search_visitors)
        .get("/api/prisons/prisoners/{id}/visitors", Need::Perm(PRISONER_READ), approved_visitors)
        .post("/api/prisons/prisoners/{id}/visitors", Need::Perm(VISIT_MANAGE), approve_visitor)
        .post("/api/prisons/prisoners/{id}/visitors/{visitor_id}/status", Need::Perm(VISIT_MANAGE), set_visitor_status)
        .post("/api/prisons/health-events", Need::Perm(HEALTH_MANAGE), create_health_event)
        .get("/api/prisons/hospitalised", Need::Perm(PRISONER_READ), list_hospitalised)
        .post("/api/prisons/transfers", Need::Perm(TRANSFER_MANAGE), create_transfer)
        .post("/api/prisons/programme-participations", Need::Perm(PROGRAMME_MANAGE), create_programme)
        .put("/api/prisons/programme-participations/{id}/certify", Need::Perm(PROGRAMME_MANAGE), certify_programme)
        .post("/api/prisons/property-records", Need::Perm(PROPERTY_MANAGE), create_property)
        .put("/api/prisons/property-records/{id}/return", Need::Perm(PROPERTY_MANAGE), return_property)
        .post("/api/prisons/requests", Need::Perm(REQUEST_MANAGE), create_request)
        .get("/api/prisons/requests", Need::Perm(PRISONER_READ), list_requests)
        .put("/api/prisons/requests/{id}/resolve", Need::Perm(REQUEST_MANAGE), resolve_request)
        .get("/api/prisons/reports/preview", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), report_preview)
        .get("/api/prisons/reports/summary", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), report_summary)
        .get("/api/prisons/reports", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), list_reports)
        .post("/api/prisons/reports", Need::Perm(REPORT_GENERATE), generate_report)
        .get("/api/prisons/reports/{id}", Need::AnyPerm(&[REPORT_READ, HQ_REPORTS]), get_report)
        .post("/api/prisons/documents", Need::Perm(DOCUMENT_WRITE), add_document)
        .get("/api/prisons/documents", Need::Perm(DOCUMENT_READ), list_documents)
        .get("/api/prisons/documents/{id}/data-url", Need::Perm(DOCUMENT_READ), document_data_url)
        .post("/api/prisons/documents/{id}/void", Need::Perm(DOCUMENT_VOID), void_document)
}

#[derive(Deserialize)]
struct QueryParam {
    #[serde(default)]
    query: String,
}

type Api<T> = Result<Json<T>, ApiError>;

async fn list_prisoners(State(node): State<NodeRef>, Query(q): Query<QueryParam>) -> Api<Vec<Prisoner>> {
    Ok(Json(prisoners::list_prisoners(&node.pool, &q.query).await?))
}

async fn list_in_custody(State(node): State<NodeRef>) -> Api<Vec<Prisoner>> {
    Ok(Json(prisoners::list_in_custody(&node.pool).await?))
}

async fn get_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Option<Prisoner>> {
    Ok(Json(prisoners::get_prisoner(&node.pool, &id).await?))
}

async fn update_prisoner(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<UpdatePrisonerInput>,
) -> Api<Prisoner> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(prisoners::update_prisoner(c, &actor, &id, input).await?) })).await?))
}

async fn releases_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<Release>> {
    Ok(Json(releases::list_for_prisoner(&node.pool, &id).await?))
}

async fn productions_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<CourtProduction>> {
    Ok(Json(court_productions::list_for_prisoner(&node.pool, &id).await?))
}

async fn visits_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<Visit>> {
    Ok(Json(visits::list_for_prisoner(&node.pool, &id).await?))
}

async fn health_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<HealthEvent>> {
    Ok(Json(health_events::list_for_prisoner(&node.pool, &id).await?))
}

async fn transfers_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<Transfer>> {
    Ok(Json(transfers::list_for_prisoner(&node.pool, &id).await?))
}

async fn programmes_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<ProgrammeParticipation>> {
    Ok(Json(programmes::list_for_prisoner(&node.pool, &id).await?))
}

async fn property_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<PropertyRecord>> {
    Ok(Json(property_records::list_for_prisoner(&node.pool, &id).await?))
}

async fn requests_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<PrisonRequest>> {
    Ok(Json(requests::list_for_prisoner(&node.pool, &id).await?))
}

async fn create_release(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<CreateReleaseInput>) -> Api<Release> {
    let authoriser = resolve_authoriser(&node, &actor, &input).await?;
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(releases::create_release(c, &actor, input, authoriser).await?) })).await?))
}

/// The officer an exception rests on: the actor if they hold the authority,
/// otherwise an OIC who has just proved who they are at this workstation.
/// Returns `None` when there is no exception to authorise.
async fn resolve_authoriser(node: &NodeRef, actor: &Actor, input: &CreateReleaseInput) -> Result<Option<Authoriser>, ApiError> {
    let Some(exception) = &input.exception else { return Ok(None) };
    if actor.can(perm::AUTHORISE_EXCEPTION) {
        return Ok(Some(Authoriser {
            badge_number: actor.badge_number.clone().unwrap_or_default(),
            name: actor.name.clone(),
        }));
    }
    let Some(credentials) = &exception.authoriser else { return Ok(None) };
    let officer = officers::check_credentials(&node.pool, &credentials.badge_number, &credentials.password, actor.device_id.as_deref()).await?;
    if !role_permissions(&officer.role, officer.is_admin).contains(perm::AUTHORISE_EXCEPTION) {
        return Err(Forbidden { permission: perm::AUTHORISE_EXCEPTION }.into());
    }
    Ok(Some(Authoriser { badge_number: officer.badge_number, name: officer.name }))
}

async fn create_court_production(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<CreateCourtProductionInput>,
) -> Api<CourtProduction> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(court_productions::create_court_production(c, &actor, input).await?) })).await?))
}

async fn list_remand(State(node): State<NodeRef>) -> Api<Vec<RemandListEntry>> {
    Ok(Json(court_productions::list_remand(&node.pool).await?))
}

async fn search(State(node): State<NodeRef>, Query(q): Query<QueryParam>) -> Api<Vec<SearchResult>> {
    Ok(Json(search::search(&node.pool, &q.query).await?))
}

async fn create_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<CreateVisitInput>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::create_visit(c, &actor, input).await?) })).await?))
}

async fn list_visits(State(node): State<NodeRef>, Query(q): Query<QueryParam>) -> Api<Vec<VisitListItem>> {
    Ok(Json(visits::list_all(&node.pool, &q.query).await?))
}

async fn visit_items(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<VisitItem>> {
    Ok(Json(visits::list_items(&node.pool, &id).await?))
}

async fn approve_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::approve(c, &actor, &id).await?) })).await?))
}

async fn deny_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(body): Json<ReasonBody>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::deny(c, &actor, &id, &body.reason).await?) })).await?))
}

async fn cancel_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(body): Json<ReasonBody>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::cancel(c, &actor, &id, &body.reason).await?) })).await?))
}

async fn check_in_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(input): Json<CheckInInput>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::check_in(c, &actor, &id, input).await?) })).await?))
}

async fn start_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::start(c, &actor, &id).await?) })).await?))
}

#[derive(Deserialize, Default)]
struct CompleteBody {
    note: Option<String>,
}

async fn complete_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, body: Option<Json<CompleteBody>>) -> Api<Visit> {
    let note = body.and_then(|Json(b)| b.note);
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::complete(c, &actor, &id, note).await?) })).await?))
}

async fn no_show_visit(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Api<Visit> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::no_show(c, &actor, &id).await?) })).await?))
}

async fn get_visit_rules(State(node): State<NodeRef>) -> Api<VisitRules> {
    Ok(Json(visits::get_rules(&node.pool).await?))
}

async fn save_visit_rules(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<SaveVisitRulesInput>) -> Api<VisitRules> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::save_rules(c, &actor, input).await?) })).await?))
}

async fn search_visitors(State(node): State<NodeRef>, Query(q): Query<QueryParam>) -> Api<Vec<Visitor>> {
    Ok(Json(visits::search_visitors(&node.pool, &q.query).await?))
}

async fn approved_visitors(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<ApprovedVisitor>> {
    Ok(Json(visits::list_approved(&node.pool, &id).await?))
}

async fn approve_visitor(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>, Json(input): Json<ApproveVisitorInput>) -> Api<ApprovedVisitor> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::approve_visitor(c, &actor, &id, input).await?) })).await?))
}

#[derive(Deserialize)]
struct VisitorStatusBody {
    status: String,
    note: Option<String>,
}

async fn set_visitor_status(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path((id, visitor_id)): Path<(String, String)>,
    Json(body): Json<VisitorStatusBody>,
) -> Api<ApprovedVisitor> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(visits::set_approval_status(c, &actor, &id, &visitor_id, &body.status, body.note).await?) })).await?))
}

async fn create_health_event(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<CreateHealthEventInput>,
) -> Api<HealthEvent> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(health_events::create_health_event(c, &actor, input).await?) })).await?))
}

async fn list_hospitalised(State(node): State<NodeRef>) -> Api<Vec<HospitalisedEntry>> {
    Ok(Json(health_events::list_hospitalised(&node.pool).await?))
}

async fn list_transfers(State(node): State<NodeRef>) -> Api<Vec<Transfer>> {
    Ok(Json(transfers::list_all(&node.pool).await?))
}

async fn create_transfer(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<PrepareTransferInput>) -> Api<Transfer> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::prepare(c, &actor, input).await?) })).await?))
}

async fn update_checklist(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<Checklist>,
) -> Api<Transfer> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::update_checklist(c, &actor, &id, input).await?) })).await?))
}

async fn dispatch_transfer(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<DispatchInput>,
) -> Api<DispatchResult> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::dispatch(c, &actor, &id, input).await?) })).await?))
}

#[derive(Deserialize)]
struct ReasonBody {
    reason: String,
}

async fn cancel_transfer(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<ReasonBody>,
) -> Api<Transfer> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::cancel(c, &actor, &id, &body.reason).await?) })).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportDossierBody {
    content_base64: String,
    passphrase: String,
}

async fn import_dossier(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<ImportDossierBody>) -> Api<Transfer> {
    Ok(Json(
        write(&node, |c| Box::pin(async move { Ok(transfers::import_dossier(c, &actor, &body.content_base64, &body.passphrase).await?) })).await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportReceiptBody {
    content_base64: String,
}

async fn import_receipt(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<ImportReceiptBody>) -> Api<Transfer> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::import_receipt(c, &actor, &body.content_base64).await?) })).await?))
}

async fn confirm_arrival(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<ConfirmArrivalInput>,
) -> Api<Transfer> {
    let vault_root = node.vault_root.clone();
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(transfers::confirm_arrival(c, &actor, &vault_root, &id, input).await?) })).await?))
}

async fn dossier_preview(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<DossierPreview> {
    Ok(Json(transfers::dossier_preview(&node.pool, &id).await?))
}

async fn dossier_file(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<FileExport> {
    Ok(Json(transfers::export_dossier(&node.pool, &id).await?))
}

async fn receipt_file(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<FileExport> {
    Ok(Json(transfers::export_receipt(&node.pool, &id).await?))
}

async fn get_today(State(node): State<NodeRef>) -> Api<TodayView> {
    Ok(Json(today::build(&node.pool).await?))
}

async fn get_legal(State(node): State<NodeRef>) -> Api<LegalOverview> {
    Ok(Json(legal::overview(&node.pool).await?))
}

async fn get_facility(State(node): State<NodeRef>) -> Api<FacilityProfile> {
    Ok(Json(facility_profile::get(&node.pool).await?))
}

async fn save_facility(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<SaveFacilityProfileInput>) -> Api<FacilityProfile> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(facility_profile::save(c, &actor, input).await?) })).await?))
}

async fn receive(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(mut input): Json<ReceptionInput>) -> Api<ReceptionResult> {
    let photos = prisoner_photos::decode_reception_photos(&input.photos.take().unwrap_or_default())?;
    let vault_root = node.vault_root.clone();
    Ok(Json(
        write(&node, |c| {
            Box::pin(async move {
                let result = custody::receive(c, &actor, input).await?;
                if let Some(prisoner) = &result.prisoner {
                    prisoner_photos::save_reception_photos(c, &actor, &vault_root, &prisoner.id, &photos).await?;
                }
                Ok(result)
            })
        })
        .await?,
    ))
}

async fn prisoner_photos_list(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<PrisonerPhoto>> {
    Ok(Json(prisoner_photos::list_current(&node.pool, &id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoBody {
    data_url: String,
}

async fn prisoner_photo_save(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path((id, view)): Path<(String, String)>,
    Json(body): Json<PhotoBody>,
) -> Api<PrisonerPhoto> {
    prisoner_photos::check_view(&view)?;
    let bytes = prisoner_photos::decode_jpeg_data_url(&body.data_url)?;
    let vault_root = node.vault_root.clone();
    Ok(Json(
        write(&node, |c| Box::pin(async move { Ok(prisoner_photos::save_photo(c, &actor, &vault_root, &id, &view, &bytes, "retake").await?) })).await?,
    ))
}

async fn open_capture_session(State(node): State<NodeRef>, Extension(actor): Extension<Actor>) -> Api<OpenedSession> {
    let pool = node.pool.clone();
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(capture::open_session(&pool, c, &actor).await?) })).await?))
}

#[derive(Deserialize)]
struct KnownQuery {
    #[serde(default)]
    known: String,
}

async fn capture_session_status(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Query(q): Query<KnownQuery>,
) -> Api<SessionStatus> {
    let known: Vec<String> = q.known.split(',').filter(|s| !s.is_empty()).map(str::to_string).collect();
    Ok(Json(capture::status(&node.pool, &actor, &id, &known).await?))
}

async fn close_capture_session(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Path(id): Path<String>) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(capture::close_session(c, &actor, &id).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn prisoner_file(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<custody::PrisonerFile> {
    Ok(Json(custody::prisoner_file(&node.pool, &id).await?))
}

async fn instruments_for_prisoner(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Vec<Instrument>> {
    Ok(Json(instruments::list_for_prisoner(&node.pool, &id).await?))
}

async fn discharge_check(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<DischargeAssessment> {
    Ok(Json(releases::assess_pool(&node.pool, &id).await?))
}

async fn record_instrument(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<RecordInstrumentInput>) -> Api<Instrument> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(instruments::record_instrument(c, &actor, input).await?) })).await?))
}

async fn expect_instrument(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<ExpectInstrumentInput>) -> Api<Instrument> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(instruments::expect_instrument(c, &actor, input).await?) })).await?))
}

async fn supersede_instrument(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<ReasonBody>,
) -> Api<Instrument> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(instruments::supersede_instrument(c, &actor, &id, &body.reason).await?) })).await?))
}

async fn set_sentence(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<SetSentenceInput>) -> Api<Sentence> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(sentences::set_sentence(c, &actor, input).await?) })).await?))
}

async fn resolve_obligation(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<ResolveInput>) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(obligations::resolve(c, &actor, input).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn court_outcome(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<CourtOutcomeInput>,
) -> Api<CourtOutcomeResult> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(court_productions::record_outcome(c, &actor, &id, input).await?) })).await?))
}

async fn court_cancel(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<ReasonBody>,
) -> Api<CourtProduction> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(court_productions::cancel(c, &actor, &id, &body.reason).await?) })).await?))
}

async fn create_programme(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<CreateProgrammeParticipationInput>,
) -> Api<ProgrammeParticipation> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(programmes::create_participation(c, &actor, input).await?) })).await?))
}

async fn certify_programme(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<CertifyProgrammeParticipationInput>,
) -> Api<ProgrammeParticipation> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(programmes::certify_participation(c, &actor, &id, input).await?) })).await?))
}

async fn create_property(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Json(input): Json<CreatePropertyRecordInput>,
) -> Api<PropertyRecord> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(property_records::create_property_record(c, &actor, input).await?) })).await?))
}

async fn return_property(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<ReturnPropertyRecordInput>,
) -> Api<PropertyRecord> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(property_records::mark_returned(c, &actor, &id, input).await?) })).await?))
}

async fn create_request(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<CreateRequestInput>) -> Api<PrisonRequest> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(requests::create_request(c, &actor, input).await?) })).await?))
}

async fn list_requests(State(node): State<NodeRef>) -> Api<Vec<PrisonRequest>> {
    Ok(Json(requests::list_all(&node.pool).await?))
}

async fn resolve_request(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(input): Json<ResolveRequestInput>,
) -> Api<PrisonRequest> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(requests::resolve_request(c, &actor, &id, input).await?) })).await?))
}

#[derive(Deserialize)]
struct ReportQuery {
    kind: String,
    from: Option<i64>,
    to: Option<i64>,
}

#[derive(Deserialize)]
struct GenerateReportInput {
    kind: String,
    from: Option<i64>,
    to: Option<i64>,
}

async fn report_preview(State(node): State<NodeRef>, Query(q): Query<ReportQuery>) -> Api<ReportDocument> {
    let kind = reports::Kind::parse(&q.kind)?;
    reports::check_available(kind, crate::domain::session::is_head_office(&node.pool).await)?;
    let period = reports::resolve_period(kind, q.from, q.to)?;
    let mut conn = node.pool.acquire().await?;
    Ok(Json(reports::build(&mut conn, kind, period).await?))
}

async fn generate_report(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(input): Json<GenerateReportInput>) -> Api<GeneratedReport> {
    let kind = reports::Kind::parse(&input.kind)?;
    reports::check_available(kind, crate::domain::session::is_head_office(&node.pool).await)?;
    let period = reports::resolve_period(kind, input.from, input.to)?;
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(reports::generate(c, &actor, kind, period).await?) })).await?))
}

async fn list_reports(State(node): State<NodeRef>) -> Api<Vec<ReportRecord>> {
    Ok(Json(reports::list(&node.pool).await?))
}

async fn report_summary(State(node): State<NodeRef>) -> Api<SummaryStatement> {
    let mut conn = node.pool.acquire().await?;
    Ok(Json(reports::summary(&mut conn).await?))
}

async fn get_report(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<GeneratedReport> {
    reports::get(&node.pool, &id).await?.map(Json).ok_or_else(|| ApiError::not_found("That report"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddDocumentBody {
    entity_type: String,
    entity_id: String,
    file_name: String,
    content_base64: String,
}

async fn add_document(State(node): State<NodeRef>, Extension(actor): Extension<Actor>, Json(body): Json<AddDocumentBody>) -> Api<Attachment> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(body.content_base64.as_bytes())
        .map_err(|_| ApiError::bad_request("The file could not be read."))?;
    let vault_root = node.vault_root.clone();
    Ok(Json(
        write(&node, |c| {
            Box::pin(async move {
                Ok(attachments::add_attachment_bytes(c, &actor, &vault_root, &body.entity_type, &body.entity_id, &body.file_name, &bytes).await?)
            })
        })
        .await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentQuery {
    entity_type: String,
    entity_id: String,
}

async fn list_documents(State(node): State<NodeRef>, Query(q): Query<DocumentQuery>) -> Api<Vec<Attachment>> {
    Ok(Json(attachments::list_attachments(&node.pool, &q.entity_type, &q.entity_id).await?))
}

async fn document_data_url(State(node): State<NodeRef>, Path(id): Path<String>) -> Api<Option<String>> {
    Ok(Json(attachments::get_attachment_data_url(&node.pool, &id).await?))
}

#[derive(Deserialize)]
struct VoidBody {
    reason: String,
}

async fn void_document(
    State(node): State<NodeRef>,
    Extension(actor): Extension<Actor>,
    Path(id): Path<String>,
    Json(body): Json<VoidBody>,
) -> Result<StatusCode, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(attachments::void_attachment(c, &actor, &id, &body.reason).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}
