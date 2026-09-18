use tauri::State;

use crate::db::Db;
use crate::domain::health_events::{self, CreateHealthEventInput, HealthEvent, HospitalisedEntry};

#[tauri::command]
pub async fn create_health_event(state: State<'_, Db>, input: CreateHealthEventInput) -> Result<HealthEvent, String> {
    health_events::create_health_event(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_health_events_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<HealthEvent>, String> {
    health_events::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_hospitalised(state: State<'_, Db>) -> Result<Vec<HospitalisedEntry>, String> {
    health_events::list_hospitalised(&state.pool).await.map_err(|e| e.to_string())
}
