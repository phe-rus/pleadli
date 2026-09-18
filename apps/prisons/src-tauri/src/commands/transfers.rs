use tauri::State;

use crate::db::Db;
use crate::domain::transfers::{self, CreateTransferInput, Transfer};

#[tauri::command]
pub async fn create_transfer(state: State<'_, Db>, input: CreateTransferInput) -> Result<Transfer, String> {
    transfers::create_transfer(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_transfers_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<Transfer>, String> {
    transfers::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
