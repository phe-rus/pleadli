use tauri::State;

use crate::db::Db;
use crate::domain::search::{self, SearchResult};

#[tauri::command]
pub async fn search(state: State<'_, Db>, query: String) -> Result<Vec<SearchResult>, String> {
    search::search(&state.pool, &query).await.map_err(|e| e.to_string())
}
