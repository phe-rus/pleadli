use tauri::State;

use crate::db::Db;
use crate::domain::charge_sheets::{self, ChargeSheet, CreateChargeSheetInput};

#[tauri::command]
pub async fn create_charge_sheet(state: State<'_, Db>, input: CreateChargeSheetInput) -> Result<ChargeSheet, String> {
    charge_sheets::create_charge_sheet(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_charge_sheet(
    state: State<'_, Db>,
    id: String,
    input: CreateChargeSheetInput,
) -> Result<ChargeSheet, String> {
    charge_sheets::update_charge_sheet(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_charge_sheets(state: State<'_, Db>, query: String) -> Result<Vec<ChargeSheet>, String> {
    charge_sheets::list_charge_sheets(&state.pool, &query).await.map_err(|e| e.to_string())
}
