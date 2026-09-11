use tauri::State;

use crate::db::Db;
use crate::domain::prisoners::{self, CreatePrisonerInput, Prisoner, UpdatePrisonerInput};

#[tauri::command]
pub async fn create_prisoner(state: State<'_, Db>, input: CreatePrisonerInput) -> Result<Prisoner, String> {
    prisoners::create_prisoner(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_prisoner(state: State<'_, Db>, id: String, input: UpdatePrisonerInput) -> Result<Prisoner, String> {
    prisoners::update_prisoner(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_prisoners(state: State<'_, Db>, query: String) -> Result<Vec<Prisoner>, String> {
    prisoners::list_prisoners(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_in_custody(state: State<'_, Db>) -> Result<Vec<Prisoner>, String> {
    prisoners::list_in_custody(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_prisoner(state: State<'_, Db>, id: String) -> Result<Option<Prisoner>, String> {
    prisoners::get_prisoner(&state.pool, &id).await.map_err(|e| e.to_string())
}
