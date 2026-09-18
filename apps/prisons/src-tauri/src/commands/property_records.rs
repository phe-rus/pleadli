use tauri::State;

use crate::db::Db;
use crate::domain::property_records::{self, CreatePropertyRecordInput, PropertyRecord, ReturnPropertyRecordInput};

#[tauri::command]
pub async fn create_property_record(state: State<'_, Db>, input: CreatePropertyRecordInput) -> Result<PropertyRecord, String> {
    property_records::create_property_record(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn return_property_record(state: State<'_, Db>, id: String, input: ReturnPropertyRecordInput) -> Result<PropertyRecord, String> {
    property_records::mark_returned(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_property_records_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<PropertyRecord>, String> {
    property_records::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
