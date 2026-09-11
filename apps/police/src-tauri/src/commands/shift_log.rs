use tauri::State;

use crate::db::Db;
use crate::domain::shift_log::{self, CreateShiftHandoverInput, OfficerCheckIn, ShiftHandover};

#[tauri::command]
pub async fn check_in_officer_by_badge(state: State<'_, Db>, badge_number: String) -> Result<OfficerCheckIn, String> {
    shift_log::check_in_by_badge(&state.pool, &state.vault_root, &badge_number)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_check_ins(state: State<'_, Db>, query: String) -> Result<Vec<OfficerCheckIn>, String> {
    shift_log::list_check_ins(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_shift_handover(state: State<'_, Db>, input: CreateShiftHandoverInput) -> Result<ShiftHandover, String> {
    shift_log::create_handover(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_shift_handovers(state: State<'_, Db>, query: String) -> Result<Vec<ShiftHandover>, String> {
    shift_log::list_handovers(&state.pool, &query).await.map_err(|e| e.to_string())
}
