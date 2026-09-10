use tauri::State;

use crate::db::Db;
use crate::domain::station_admin::{
    self, CreateStationEstablishmentMemberInput, SaveStationProfileInput, StationEstablishmentMember, StationProfile,
};

#[tauri::command]
pub async fn get_station_profile(state: State<'_, Db>) -> Result<Option<StationProfile>, String> {
    station_admin::get_station_profile(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_station_profile(state: State<'_, Db>, input: SaveStationProfileInput) -> Result<StationProfile, String> {
    station_admin::save_station_profile(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_station_establishment_member(
    state: State<'_, Db>,
    input: CreateStationEstablishmentMemberInput,
) -> Result<StationEstablishmentMember, String> {
    station_admin::create_establishment_member(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_station_establishment_member(
    state: State<'_, Db>,
    id: String,
    input: CreateStationEstablishmentMemberInput,
) -> Result<StationEstablishmentMember, String> {
    station_admin::update_establishment_member(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_station_establishment(state: State<'_, Db>, query: String) -> Result<Vec<StationEstablishmentMember>, String> {
    station_admin::list_establishment(&state.pool, &query).await.map_err(|e| e.to_string())
}
