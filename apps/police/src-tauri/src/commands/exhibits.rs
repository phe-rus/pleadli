use tauri::State;

use crate::db::Db;
use crate::domain::exhibits::{self, CreateExhibitInput, CreateExhibitMovementInput, Exhibit, ExhibitMovement};

#[tauri::command]
pub async fn create_exhibit(state: State<'_, Db>, input: CreateExhibitInput) -> Result<Exhibit, String> {
    exhibits::create_exhibit(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_exhibit(state: State<'_, Db>, id: String, input: CreateExhibitInput) -> Result<Exhibit, String> {
    exhibits::update_exhibit(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_exhibits(state: State<'_, Db>, query: String) -> Result<Vec<Exhibit>, String> {
    exhibits::list_exhibits(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_exhibit_movement(
    state: State<'_, Db>,
    exhibit_id: String,
    input: CreateExhibitMovementInput,
) -> Result<ExhibitMovement, String> {
    exhibits::create_movement(&state.pool, &exhibit_id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_exhibit_movements(state: State<'_, Db>, exhibit_id: String) -> Result<Vec<ExhibitMovement>, String> {
    exhibits::list_movements(&state.pool, &exhibit_id).await.map_err(|e| e.to_string())
}
