use tauri::State;

use crate::db::Db;
use crate::domain::vehicles::{self, CreateVehicleInput, Vehicle};

#[tauri::command]
pub async fn create_vehicle(state: State<'_, Db>, input: CreateVehicleInput) -> Result<Vehicle, String> {
    vehicles::create_vehicle(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_vehicle(state: State<'_, Db>, id: String, input: CreateVehicleInput) -> Result<Vehicle, String> {
    vehicles::update_vehicle(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_vehicles(state: State<'_, Db>, query: String) -> Result<Vec<Vehicle>, String> {
    vehicles::list_vehicles(&state.pool, &query).await.map_err(|e| e.to_string())
}
