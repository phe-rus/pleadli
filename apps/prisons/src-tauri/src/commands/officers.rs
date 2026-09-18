use tauri::State;

use crate::db::Db;
use crate::domain::officers::{
    self, CreateOfficerInput, CreateOfficerTrustedInput, Officer, OfficerErrorPayload, UpdateOfficerInput,
    UpdateOfficerTrustedInput,
};
use crate::domain::session;

#[tauri::command]
pub async fn create_officer(state: State<'_, Db>, input: CreateOfficerInput) -> Result<Officer, OfficerErrorPayload> {
    officers::create_officer(&state.pool, input).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn update_officer(state: State<'_, Db>, id: String, input: UpdateOfficerInput) -> Result<Officer, OfficerErrorPayload> {
    officers::update_officer(&state.pool, &id, input).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn list_officers(
    state: State<'_, Db>,
    admin_badge_number: String,
    admin_password: String,
) -> Result<Vec<Officer>, OfficerErrorPayload> {
    officers::list_officers(&state.pool, &admin_badge_number, &admin_password).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn get_officer_by_badge(state: State<'_, Db>, badge_number: String) -> Result<Option<Officer>, String> {
    officers::get_officer_by_badge(&state.pool, &badge_number).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn login(state: State<'_, Db>, badge_number: String, password: String) -> Result<Officer, OfficerErrorPayload> {
    officers::login(&state.pool, &badge_number, &password).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn is_bootstrap(state: State<'_, Db>) -> Result<bool, String> {
    officers::is_bootstrap(&state.pool).await.map_err(|e| e.to_string())
}

/// Resolves the already signed in Head Office officer from the session
/// table, never from anything the caller supplies — this is what lets the
/// `_trusted` commands below skip re-asking for a badge and password
/// (spec: docs/specs/prisons/0001-head-office-peer-sync-network/index.md's
/// cross child contract).
async fn require_hq_officer(pool: &sqlx::SqlitePool) -> Result<Officer, OfficerErrorPayload> {
    session::get_current_hq_session(pool)
        .await
        .map_err(|e| OfficerErrorPayload { code: "DB_ERROR".to_string(), message: e.to_string() })?
        .ok_or_else(|| OfficerErrorPayload {
            code: "NOT_SIGNED_IN".to_string(),
            message: "Sign in as Head Office to manage officers.".to_string(),
        })
}

#[tauri::command]
pub async fn list_officers_trusted(state: State<'_, Db>) -> Result<Vec<Officer>, OfficerErrorPayload> {
    let actor = require_hq_officer(&state.pool).await?;
    officers::list_officers_trusted(&state.pool, &actor.id).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn create_officer_trusted(state: State<'_, Db>, input: CreateOfficerTrustedInput) -> Result<Officer, OfficerErrorPayload> {
    let actor = require_hq_officer(&state.pool).await?;
    officers::create_officer_trusted(&state.pool, &actor.id, input).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn update_officer_trusted(state: State<'_, Db>, id: String, input: UpdateOfficerTrustedInput) -> Result<Officer, OfficerErrorPayload> {
    let actor = require_hq_officer(&state.pool).await?;
    officers::update_officer_trusted(&state.pool, &actor.id, &id, input).await.map_err(OfficerErrorPayload::from)
}
