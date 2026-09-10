use tauri::State;

use crate::db::Db;
use crate::domain::incidents::{self, CreateIncidentInput, Incident};

#[tauri::command]
pub async fn create_incident(state: State<'_, Db>, input: CreateIncidentInput) -> Result<Incident, String> {
    incidents::create_incident(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_incident(
    state: State<'_, Db>,
    id: String,
    input: CreateIncidentInput,
) -> Result<Incident, String> {
    incidents::update_incident(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_incidents(state: State<'_, Db>, query: String) -> Result<Vec<Incident>, String> {
    incidents::list_incidents(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
