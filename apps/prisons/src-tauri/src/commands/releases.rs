use tauri::State;

use crate::db::Db;
use crate::domain::releases::{self, CreateReleaseInput, Release};

#[tauri::command]
pub async fn create_release(state: State<'_, Db>, input: CreateReleaseInput) -> Result<Release, String> {
    releases::create_release(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_releases_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<Release>, String> {
    releases::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
