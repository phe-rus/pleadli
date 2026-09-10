use tauri::State;

use crate::db::Db;
use crate::domain::duty::{self, CreateDutyAssignmentInput, DutyAssignment};

#[tauri::command]
pub async fn create_duty_assignment(
    state: State<'_, Db>,
    input: CreateDutyAssignmentInput,
) -> Result<DutyAssignment, String> {
    duty::create_assignment(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_duty_assignment(
    state: State<'_, Db>,
    id: String,
    input: CreateDutyAssignmentInput,
) -> Result<DutyAssignment, String> {
    duty::update_assignment(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_duty_assignments(state: State<'_, Db>, query: String) -> Result<Vec<DutyAssignment>, String> {
    duty::list_assignments(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
