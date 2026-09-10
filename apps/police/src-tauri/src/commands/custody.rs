use tauri::State;

use crate::db::Db;
use crate::domain::custody::{self, CreateCustodyRecordInput, CustodyRecord};

#[tauri::command]
pub async fn create_custody_record(
    state: State<'_, Db>,
    input: CreateCustodyRecordInput,
) -> Result<CustodyRecord, String> {
    custody::create_record(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_custody_record(
    state: State<'_, Db>,
    id: String,
    input: CreateCustodyRecordInput,
) -> Result<CustodyRecord, String> {
    custody::update_record(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_custody_records(state: State<'_, Db>, query: String) -> Result<Vec<CustodyRecord>, String> {
    custody::list_records(&state.pool, &query).await.map_err(|e| e.to_string())
}
