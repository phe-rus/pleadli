use tauri::State;

use crate::db::Db;
use crate::domain::charges::{self, Charge, CreateChargeInput};

#[tauri::command]
pub async fn create_charge(state: State<'_, Db>, input: CreateChargeInput) -> Result<Charge, String> {
    charges::create_charge(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_charges_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<Charge>, String> {
    charges::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
