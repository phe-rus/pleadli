use tauri::State;

use crate::db::Db;
use crate::domain::visits::{self, CreateVisitInput, Visit};

#[tauri::command]
pub async fn create_visit(state: State<'_, Db>, input: CreateVisitInput) -> Result<Visit, String> {
    visits::create_visit(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_visits_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<Visit>, String> {
    visits::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
