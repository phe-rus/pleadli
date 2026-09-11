use tauri::State;

use crate::db::Db;
use crate::domain::decisions::{self, CreateDecisionInput, Decision};

#[tauri::command]
pub async fn create_decision(state: State<'_, Db>, input: CreateDecisionInput) -> Result<Decision, String> {
    decisions::create_decision(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_decisions_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<Decision>, String> {
    decisions::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
