use tauri::State;

use crate::db::Db;
use crate::domain::cases::{self, Case, CasePerson, CaseWorkspace, CreateCaseInput};

#[tauri::command]
pub async fn create_case(state: State<'_, Db>, input: CreateCaseInput) -> Result<Case, String> {
    cases::create_case(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_case(state: State<'_, Db>, id: String, input: CreateCaseInput) -> Result<Case, String> {
    cases::update_case(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_cases(state: State<'_, Db>, query: String) -> Result<Vec<Case>, String> {
    cases::list_cases(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_case_people(state: State<'_, Db>, case_id: String) -> Result<Vec<CasePerson>, String> {
    cases::list_case_people(&state.pool, &case_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_case_workspace(state: State<'_, Db>, id: String) -> Result<Option<CaseWorkspace>, String> {
    cases::get_case_workspace(&state.pool, &id).await.map_err(|e| e.to_string())
}
