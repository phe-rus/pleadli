use tauri::State;

use crate::db::Db;
use crate::domain::station_assets::{self, CreateStationAssetInput, StationAsset};

#[tauri::command]
pub async fn create_station_asset(
    state: State<'_, Db>,
    input: CreateStationAssetInput,
) -> Result<StationAsset, String> {
    station_assets::create_asset(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_station_asset(
    state: State<'_, Db>,
    id: String,
    input: CreateStationAssetInput,
) -> Result<StationAsset, String> {
    station_assets::update_asset(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_station_assets(state: State<'_, Db>, query: String) -> Result<Vec<StationAsset>, String> {
    station_assets::list_assets(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
