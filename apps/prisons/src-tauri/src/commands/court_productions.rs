use tauri::State;

use crate::db::Db;
use crate::domain::court_productions::{self, CourtProduction, CreateCourtProductionInput, RemandListEntry};

#[tauri::command]
pub async fn create_court_production(state: State<'_, Db>, input: CreateCourtProductionInput) -> Result<CourtProduction, String> {
    court_productions::create_court_production(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_court_productions_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<CourtProduction>, String> {
    court_productions::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_remand(state: State<'_, Db>) -> Result<Vec<RemandListEntry>, String> {
    court_productions::list_remand(&state.pool).await.map_err(|e| e.to_string())
}
