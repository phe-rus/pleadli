//! `/api/system/**`: liveness, first-launch state and onboarding, the peer
//! (Head Office) connection, and the audit trail.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::Json;
use serde::{Deserialize, Serialize};

use super::error::ApiError;
use super::guard::{CallerDevice, Need, RouteTable};
use super::write;
use crate::domain::activation;
use crate::domain::auth_policy::{self, AuthPolicy, AuthPolicyInput};
use crate::domain::facility_profile::{self, SaveFacilityProfileInput};
use crate::domain::numbering::{self, NumberingInput};
use crate::domain::officers;
use crate::domain::sessions::{self, SessionInfo};
use crate::domain::audit::{self, AuditFilter, AuditRow, ChainStatus};
use crate::domain::backup::{self, BackupConfig, BackupInfo, BackupSummary, SaveBackupConfigInput};
use crate::domain::authz::{perm, Actor};
use crate::domain::connectivity::{self, ConnectivityStatus};
use crate::domain::facilities::{self, PeerSyncConfig};
use crate::domain::nodeconfig::{self, Environment};
use crate::domain::connection::FacilityLookup;
use crate::domain::peer::{self, ConnectFacilityInput, ConnectResult, PairError, PairInput, PairResult};
use crate::domain::session::{self, HqConfig};
use crate::domain::sync::SyncRunResult;
use crate::node::NodeRef;

/// Bumped when the shape of the node API changes incompatibly, so a
/// workstation running an older build can be refused with a clear message.
pub const API_LEVEL: u32 = 1;

pub fn routes(node: NodeRef) -> RouteTable {
    let table = RouteTable::new(node)
        .get("/api/system/health", Need::Public, health)
        .get("/api/system/state", Need::Device, state)
        .post("/api/system/onboarding/role", Need::Onboarding, choose_role)
        .post("/api/system/onboarding/facility", Need::Onboarding, setup_facility)
        .post("/api/system/onboarding/head-office", Need::Onboarding, setup_head_office)
        .post("/api/system/onboarding/numbering-preview", Need::Onboarding, numbering_preview)
        .get("/api/system/auth-policy", Need::Session, get_auth_policy)
        .put("/api/system/auth-policy", Need::Perm(perm::NODE_MANAGE), save_auth_policy)
        .post("/api/system/onboarding/activate", Need::Onboarding, activate)
        .post("/api/system/onboarding/pair", Need::Onboarding, pair_first_launch)
        .get("/api/system/network/peer", Need::Session, get_peer)
        .post("/api/system/onboarding/facility-lookup", Need::Onboarding, lookup_first_launch)
        .post("/api/system/onboarding/connect-facility", Need::Onboarding, connect_first_launch)
        .post("/api/system/onboarding/connection/refresh", Need::Onboarding, refresh_first_launch)
        .post("/api/system/onboarding/connection/cancel", Need::Onboarding, cancel_first_launch)
        .post("/api/system/network/pair", Need::Perm(perm::NODE_MANAGE), pair_later)
        .post("/api/system/network/facility-lookup", Need::Perm(perm::NODE_MANAGE), lookup_later)
        .post("/api/system/network/connect-facility", Need::Perm(perm::NODE_MANAGE), connect_later)
        .post("/api/system/network/connection/refresh", Need::Perm(perm::NODE_MANAGE), refresh_later)
        .post("/api/system/network/connection/cancel", Need::Perm(perm::NODE_MANAGE), cancel_later)
        .get("/api/system/network/reachability", Need::Session, reachability)
        .post("/api/system/network/sync-now", Need::Perm(perm::NODE_MANAGE), sync_now)
        .get("/api/system/network/status", Need::Session, network_status)
        .post("/api/system/network/disconnect", Need::Perm(perm::NODE_MANAGE), disconnect_from_head_office)
        .put("/api/system/network/sync-classes/{class}", Need::Perm(perm::NODE_MANAGE), set_sync_class)
        .get("/api/system/environment", Need::Session, environment)
        .put("/api/system/node-mode", Need::Perm(perm::NODE_MANAGE), set_node_mode)
        .post("/api/system/onboarding/connect", Need::Onboarding, connect_workstation)
        .get("/api/system/local/connection", Need::Onboarding, local_connection)
        .post("/api/system/local/disconnect", Need::Onboarding, disconnect_workstation)
        .get("/api/system/recovery", Need::Public, recovery_status)
        .get("/api/system/backups", Need::Perm(perm::NODE_MANAGE), backups_overview)
        .put("/api/system/backups/config", Need::Perm(perm::NODE_MANAGE), save_backup_config)
        .post("/api/system/backups", Need::Perm(perm::NODE_MANAGE), run_backup)
        .post("/api/system/backups/verify", Need::Perm(perm::NODE_MANAGE), verify_backup)
        .post("/api/system/backups/restore", Need::Perm(perm::NODE_MANAGE), restore_backup)
        .get("/api/system/audit", Need::Perm(perm::AUDIT_READ), list_audit)
        .get("/api/system/audit/verify", Need::Perm(perm::AUDIT_READ), verify_audit);

    #[cfg(debug_assertions)]
    let table = table
        .post("/api/system/dev/role", Need::Onboarding, dev_role)
        .get("/api/system/dev/activation-code", Need::Onboarding, dev_activation_code);

    table
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Health {
    ok: bool,
    api_level: u32,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health { ok: true, api_level: API_LEVEL, version: env!("CARGO_PKG_VERSION") })
}

/// Everything the sign-in and onboarding screens need before anyone is
/// signed in: which role this installation has, whether it still needs its
/// first account, and whether a facility has paired. Nothing about records.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemState {
    #[serde(flatten)]
    config: HqConfig,
    bootstrap: bool,
    paired: bool,
    /// `none`, `pending`, `connected` or `rejected`: where this installation
    /// stands with Head Office.
    connection: String,
    /// The facility's sign-in mode, so the sign-in screen knows whether a
    /// blank secret can be submitted. Says nothing about any account.
    auth_mode: String,
    api_level: u32,
}

async fn state(State(node): State<NodeRef>) -> Result<Json<SystemState>, ApiError> {
    let config = session::get_hq_config(&node.pool).await?;
    let bootstrap = crate::domain::officers::is_bootstrap(&node.pool).await?;
    let peer = facilities::get_peer_sync_config(&node.pool).await?;
    let auth_mode = auth_policy::get(&node.pool).await?.mode;
    Ok(Json(SystemState { config, bootstrap, paired: peer.connection_state == "connected" && peer.facility_id.is_some(), connection: peer.connection_state, auth_mode, api_level: API_LEVEL }))
}

#[derive(Deserialize)]
struct RoleBody {
    role: String,
}

async fn choose_role(State(node): State<NodeRef>, Json(body): Json<RoleBody>) -> Result<StatusCode, ApiError> {
    let actor = Actor::system("first launch");
    write(&node, |c| Box::pin(async move { Ok(activation::choose_role(c, &actor, &body.role).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Everything a new facility decides at first setup, saved together. Nothing
/// is kept if any part is refused, and the first administrator is signed in.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FacilitySetupBody {
    profile: SaveFacilityProfileInput,
    numbering: NumberingInput,
    auth_mode: String,
    admin: SetupAdmin,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetupAdmin {
    badge_number: String,
    name: String,
    password: String,
}

async fn setup_facility(
    State(node): State<NodeRef>,
    axum::Extension(device): axum::Extension<CallerDevice>,
    Json(body): Json<FacilitySetupBody>,
) -> Result<Json<SessionInfo>, ApiError> {
    require_bootstrap(&node).await?;
    if session::get_hq_config(&node.pool).await?.is_head_office {
        return Err(ApiError::conflict("NOT_A_FACILITY", "This installation is set up as Head Office."));
    }
    let FacilitySetupBody { profile, numbering, auth_mode, admin } = body;
    let (badge, password) = (admin.badge_number.clone(), admin.password.clone());
    write(&node, |c| {
        Box::pin(async move {
            let actor = Actor::system("first launch");
            activation::choose_role(c, &actor, "facility").await?;
            // The profile comes first: the badge prefix it sets applies to the
            // administrator created next.
            facility_profile::save(c, &actor, profile).await?;
            numbering::save_config(c, &actor, numbering).await?;
            officers::create_first_admin(c, &admin.badge_number, &admin.name, &admin.password).await?;
            let current = auth_policy::get_conn(c).await?;
            auth_policy::save(
                c,
                &actor,
                AuthPolicyInput { mode: auth_mode, idle_timeout_minutes: current.idle_timeout_minutes, absolute_lifetime_hours: current.absolute_lifetime_hours },
            )
            .await?;
            Ok(())
        })
    })
    .await?;
    Ok(Json(sessions::sign_in(&node.pool, &badge, &password, device.0.as_deref()).await?))
}

/// What a new Head Office decides at first setup. There is no numbering or
/// sign-in choice: Head Office holds no prisoners and its accounts always use
/// a password.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeadOfficeSetupBody {
    profile: SaveFacilityProfileInput,
    admin: SetupAdmin,
}

/// Head Office first setup, saved together like a facility's: the role, the
/// identity, and the first administrator, with nothing kept if any part is
/// refused. No Pleadli Cloud code is needed; verifying with Pleadli is a later,
/// optional step in Settings.
async fn setup_head_office(
    State(node): State<NodeRef>,
    axum::Extension(device): axum::Extension<CallerDevice>,
    Json(body): Json<HeadOfficeSetupBody>,
) -> Result<Json<SessionInfo>, ApiError> {
    require_bootstrap(&node).await?;
    if session::get_hq_config(&node.pool).await?.role.as_deref() == Some("facility") {
        return Err(ApiError::conflict("NOT_A_HEAD_OFFICE", "This installation is set up as a facility."));
    }
    let HeadOfficeSetupBody { profile, admin } = body;
    let (badge, password) = (admin.badge_number.clone(), admin.password.clone());
    write(&node, |c| {
        Box::pin(async move {
            let actor = Actor::system("first launch");
            // Already Head Office (a code was used earlier) changes nothing here and carries on.
            activation::choose_head_office(c, &actor).await?;
            facility_profile::save(c, &actor, profile).await?;
            officers::create_first_admin(c, &admin.badge_number, &admin.name, &admin.password).await?;
            Ok(())
        })
    })
    .await?;
    Ok(Json(sessions::sign_in(&node.pool, &badge, &password, device.0.as_deref()).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NumberingPreviewBody {
    pattern: String,
    reset: String,
    facility_number: Option<String>,
}

#[derive(Serialize)]
struct NumberingPreview {
    valid: bool,
    /// Why the pattern is refused, in words for an officer.
    message: Option<String>,
    preview: Vec<String>,
}

/// What a prisoner-number pattern would produce, checked by the same rules
/// that will apply once it is saved, so the setup screen never previews a
/// pattern the node would refuse.
async fn numbering_preview(State(node): State<NodeRef>, Json(body): Json<NumberingPreviewBody>) -> Result<Json<NumberingPreview>, ApiError> {
    require_bootstrap(&node).await?;
    Ok(Json(match numbering::validate(&body.pattern, &body.reset) {
        Ok(()) => NumberingPreview { valid: true, message: None, preview: numbering::preview(body.pattern.trim(), body.facility_number.as_deref()) },
        Err(error) => NumberingPreview { valid: false, message: Some(error.to_string()), preview: Vec::new() },
    }))
}

async fn get_auth_policy(State(node): State<NodeRef>) -> Result<Json<AuthPolicy>, ApiError> {
    Ok(Json(auth_policy::get(&node.pool).await?))
}

async fn save_auth_policy(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(input): Json<AuthPolicyInput>,
) -> Result<Json<AuthPolicy>, ApiError> {
    Ok(Json(write(&node, |c| Box::pin(async move { Ok(auth_policy::save(c, &actor, input).await?) })).await?))
}

#[derive(Deserialize)]
struct ActivateBody {
    token: String,
}

async fn activate(State(node): State<NodeRef>, Json(body): Json<ActivateBody>) -> Result<StatusCode, ApiError> {
    let actor = Actor::system("first launch");
    write(&node, |c| Box::pin(async move { Ok(activation::verify_activation_code(c, &actor, &body.token).await?) })).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Pairing during first launch, before any account exists. Once the
/// installation has accounts this route refuses, so it cannot be used to
/// re-point a working facility without signing in.
async fn pair_first_launch(State(node): State<NodeRef>, Json(input): Json<PairInput>) -> Result<Json<PairResult>, ApiError> {
    if !crate::domain::officers::is_bootstrap(&node.pool).await? {
        return Err(ApiError::conflict("ALREADY_INITIALISED", "This installation is already set up."));
    }
    Ok(Json(peer::pair_with_head_office(&node.pool, &Actor::system("first launch"), input).await?))
}

/// Pairing after first launch, for a facility that started on its own. Needs
/// `node.manage`; the domain refuses if this installation is already paired.
async fn pair_later(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(input): Json<PairInput>,
) -> Result<Json<PairResult>, ApiError> {
    Ok(Json(peer::pair_with_head_office(&node.pool, &actor, input).await?))
}

/// A refusal from Head Office on the connect path is about the facility
/// number or activation code, not a pairing code.
fn connect_error(err: PairError) -> ApiError {
    match err {
        PairError::Rejected => ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "CONNECTION_NOT_ACCEPTED",
            "Head Office did not accept this. Check the facility number, and that the activation code (if you used one) is current.",
        ),
        other => other.into(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LookupBody {
    hq_address: String,
    facility_number: String,
}

async fn lookup(body: LookupBody) -> Result<Json<Option<FacilityLookup>>, ApiError> {
    Ok(Json(peer::lookup_facility(&body.hq_address, &body.facility_number).await.map_err(connect_error)?))
}

async fn require_bootstrap(node: &NodeRef) -> Result<(), ApiError> {
    if crate::domain::officers::is_bootstrap(&node.pool).await? {
        Ok(())
    } else {
        Err(ApiError::conflict("ALREADY_INITIALISED", "This installation is already set up."))
    }
}

async fn lookup_first_launch(State(node): State<NodeRef>, Json(body): Json<LookupBody>) -> Result<Json<Option<FacilityLookup>>, ApiError> {
    require_bootstrap(&node).await?;
    lookup(body).await
}

async fn lookup_later(Json(body): Json<LookupBody>) -> Result<Json<Option<FacilityLookup>>, ApiError> {
    lookup(body).await
}

async fn connect_first_launch(State(node): State<NodeRef>, Json(input): Json<ConnectFacilityInput>) -> Result<Json<ConnectResult>, ApiError> {
    require_bootstrap(&node).await?;
    Ok(Json(peer::connect_facility(&node.pool, &Actor::system("first launch"), input).await.map_err(connect_error)?))
}

async fn connect_later(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(input): Json<ConnectFacilityInput>,
) -> Result<Json<ConnectResult>, ApiError> {
    Ok(Json(peer::connect_facility(&node.pool, &actor, input).await.map_err(connect_error)?))
}

async fn refresh(node: &NodeRef) -> Result<Json<PeerSyncConfig>, ApiError> {
    peer::refresh_connection(&node.pool).await?;
    Ok(Json(facilities::get_peer_sync_config(&node.pool).await?))
}

async fn refresh_first_launch(State(node): State<NodeRef>) -> Result<Json<PeerSyncConfig>, ApiError> {
    require_bootstrap(&node).await?;
    refresh(&node).await
}

async fn refresh_later(State(node): State<NodeRef>) -> Result<Json<PeerSyncConfig>, ApiError> {
    refresh(&node).await
}

async fn cancel_first_launch(State(node): State<NodeRef>) -> Result<StatusCode, ApiError> {
    require_bootstrap(&node).await?;
    peer::cancel_connection(&node.pool, &Actor::system("first launch")).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn cancel_later(State(node): State<NodeRef>, axum::Extension(actor): axum::Extension<Actor>) -> Result<StatusCode, ApiError> {
    peer::cancel_connection(&node.pool, &actor).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Reachability {
    reachable: bool,
    checked_at: i64,
}

async fn reachability(State(node): State<NodeRef>) -> Json<Reachability> {
    Json(Reachability { reachable: peer::hq_reachable(&node.pool).await, checked_at: crate::domain::time::now_ms() })
}

async fn get_peer(State(node): State<NodeRef>) -> Result<Json<PeerSyncConfig>, ApiError> {
    Ok(Json(facilities::get_peer_sync_config(&node.pool).await?))
}

/// The one status the shell, Settings and the inbox read: where this facility
/// stands with Head Office, what it shares, and what is waiting to be sent.
async fn network_status(State(node): State<NodeRef>) -> Result<Json<ConnectivityStatus>, ApiError> {
    Ok(Json(connectivity::status(&node.pool).await?))
}

/// Ends the link. Local records, officers, audit and backups are untouched.
async fn disconnect_from_head_office(State(node): State<NodeRef>, axum::Extension(actor): axum::Extension<Actor>) -> Result<Json<ConnectivityStatus>, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(connectivity::disconnect(c, &actor).await?) })).await?;
    Ok(Json(connectivity::status(&node.pool).await?))
}

#[derive(Deserialize)]
struct ClassBody {
    enabled: bool,
}

async fn set_sync_class(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    axum::extract::Path(class): axum::extract::Path<String>,
    Json(body): Json<ClassBody>,
) -> Result<Json<ConnectivityStatus>, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(connectivity::set_class_enabled(c, &actor, &class, body.enabled).await?) })).await?;
    Ok(Json(connectivity::status(&node.pool).await?))
}

async fn sync_now(State(node): State<NodeRef>) -> Result<Json<SyncRunResult>, ApiError> {
    connectivity::exchange(&node.pool, true).await.map(Json).map_err(|e| {
        log::warn!("manual sync: {e}");
        ApiError::new(StatusCode::BAD_GATEWAY, "SYNC_FAILED", &e)
    })
}

async fn environment(State(node): State<NodeRef>) -> Result<Json<Environment>, ApiError> {
    Ok(Json(nodeconfig::environment(&node).await?))
}

#[derive(Deserialize)]
struct NodeModeBody {
    serve: bool,
    port: Option<i64>,
}

/// Switches this node between working alone and serving workstations on the
/// facility LAN. The listener follows the setting within a few seconds.
async fn set_node_mode(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(body): Json<NodeModeBody>,
) -> Result<Json<Environment>, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(nodeconfig::set_serving(c, &actor, body.serve, body.port).await?) })).await?;
    Ok(Json(nodeconfig::environment(&node).await?))
}

#[derive(Deserialize)]
struct ConnectBody {
    address: String,
    fingerprint: String,
    code: String,
}

/// First launch on a workstation: enrol with a facility node using the code
/// and fingerprint shown on the node's screen. Only on a machine with no role
/// and no accounts, and only from that machine.
async fn connect_workstation(State(node): State<NodeRef>, Json(body): Json<ConnectBody>) -> Result<StatusCode, ApiError> {
    nodeconfig::connect_as_workstation(&node, &body.address, &body.fingerprint, &body.code).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalConnection {
    /// `standalone`, `node` or `client`.
    mode: String,
    node_url: Option<String>,
}

/// About this machine's own connection, answered locally even on a
/// workstation (where every other route is forwarded to the node).
async fn local_connection(State(node): State<NodeRef>) -> Result<Json<LocalConnection>, ApiError> {
    let config = nodeconfig::get(&node.pool).await?;
    Ok(Json(LocalConnection { mode: config.node_mode, node_url: config.remote_node_url }))
}

async fn disconnect_workstation(State(node): State<NodeRef>) -> Result<StatusCode, ApiError> {
    nodeconfig::disconnect(&node).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Always "not recovering" here: a node in recovery mode serves the
/// recovery router instead of this one.
async fn recovery_status() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "recovering": false }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupsOverview {
    config: BackupConfig,
    backups: Vec<BackupInfo>,
}

async fn backups_overview(State(node): State<NodeRef>) -> Result<Json<BackupsOverview>, ApiError> {
    let config = backup::get_config(&node.pool, &node.data_dir).await?;
    let backups = backup::list_backups(std::path::Path::new(&config.effective_dir)).unwrap_or_default();
    Ok(Json(BackupsOverview { config, backups }))
}

async fn save_backup_config(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(input): Json<SaveBackupConfigInput>,
) -> Result<Json<BackupConfig>, ApiError> {
    write(&node, |c| Box::pin(async move { Ok(backup::save_config(c, &actor, input).await?) })).await?;
    Ok(Json(backup::get_config(&node.pool, &node.data_dir).await?))
}

async fn run_backup(State(node): State<NodeRef>, axum::Extension(actor): axum::Extension<Actor>) -> Result<Json<BackupInfo>, ApiError> {
    Ok(Json(backup::run_and_record(&node.pool, &node.data_dir, &node.vault_root, &actor).await?))
}

#[derive(Deserialize)]
struct BackupFileBody {
    path: String,
    passphrase: String,
}

async fn verify_backup(State(node): State<NodeRef>, Json(body): Json<BackupFileBody>) -> Result<Json<BackupSummary>, ApiError> {
    Ok(Json(backup::verify_backup(&node.data_dir, std::path::Path::new(&body.path), &body.passphrase).await?))
}

/// Stages a restore to be applied at the next start of the node. The running
/// database is not touched. The staging is audited.
async fn restore_backup(
    State(node): State<NodeRef>,
    axum::Extension(actor): axum::Extension<Actor>,
    Json(body): Json<BackupFileBody>,
) -> Result<(StatusCode, Json<BackupSummary>), ApiError> {
    let summary = backup::stage_restore(&node.data_dir, std::path::Path::new(&body.path), &body.passphrase).await?;
    write(&node, |c| {
        let source = body.path.clone();
        Box::pin(async move {
            Ok(audit::record(c, &actor, audit::AuditEntry::new("system.restore_staged", "backup", None).reason(&source)).await?)
        })
    })
    .await?;
    Ok((StatusCode::ACCEPTED, Json(summary)))
}

async fn list_audit(State(node): State<NodeRef>, Query(filter): Query<AuditFilter>) -> Result<Json<Vec<AuditRow>>, ApiError> {
    Ok(Json(audit::list(&node.pool, &filter).await?))
}

async fn verify_audit(State(node): State<NodeRef>) -> Result<Json<ChainStatus>, ApiError> {
    Ok(Json(audit::verify_chain(&node.pool).await?))
}

#[cfg(debug_assertions)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevRoleBody {
    is_head_office: bool,
}

#[cfg(debug_assertions)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DevAccount {
    badge_number: String,
    password: String,
}

#[cfg(debug_assertions)]
async fn dev_role(State(node): State<NodeRef>, Json(body): Json<DevRoleBody>) -> Result<Json<DevAccount>, ApiError> {
    session::set_dev_role(&node.pool, body.is_head_office).await?;
    let (badge_number, password) = crate::domain::officers::ensure_dev_account(&node.pool, body.is_head_office).await?;
    Ok(Json(DevAccount { badge_number, password }))
}

#[cfg(debug_assertions)]
async fn dev_activation_code() -> Json<String> {
    Json(activation::mint_dev_activation_code())
}
