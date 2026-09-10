use tauri::State;

use crate::db::Db;
use crate::domain::bonds::{self, Bond, CreateBondInput};

#[tauri::command]
pub async fn create_bond(state: State<'_, Db>, input: CreateBondInput) -> Result<Bond, String> {
    bonds::create_bond(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_bond(state: State<'_, Db>, id: String, input: CreateBondInput) -> Result<Bond, String> {
    bonds::update_bond(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_bonds(state: State<'_, Db>, query: String) -> Result<Vec<Bond>, String> {
    bonds::list_bonds(&state.pool, &query).await.map_err(|e| e.to_string())
}
