use tauri::State;

use crate::db::Db;
use crate::domain::prosecutor_profile::{self, ProsecutorProfile, SaveProsecutorProfileInput};

#[tauri::command]
pub async fn get_prosecutor_profile(state: State<'_, Db>) -> Result<Option<ProsecutorProfile>, String> {
    prosecutor_profile::get_prosecutor_profile(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_prosecutor_profile(state: State<'_, Db>, input: SaveProsecutorProfileInput) -> Result<ProsecutorProfile, String> {
    prosecutor_profile::save_prosecutor_profile(&state.pool, input).await.map_err(|e| e.to_string())
}
