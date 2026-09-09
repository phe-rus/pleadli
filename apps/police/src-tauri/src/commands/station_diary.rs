use tauri::State;

use crate::db::Db;
use crate::domain::station_diary::{self, CreateStationDiaryEntryInput, StationDiaryEntry};

#[tauri::command]
pub async fn create_station_diary_entry(
    state: State<'_, Db>,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, String> {
    station_diary::create_entry(&state.pool, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_station_diary_entry(
    state: State<'_, Db>,
    id: String,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, String> {
    station_diary::update_entry(&state.pool, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_station_diary_entries(
    state: State<'_, Db>,
    query: String,
) -> Result<Vec<StationDiaryEntry>, String> {
    station_diary::list_entries(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
