use tauri::State;

use crate::db::Db;
use crate::domain::requests::{self, CreateRequestInput, Request, ResolveRequestInput};

#[tauri::command]
pub async fn create_request(state: State<'_, Db>, input: CreateRequestInput) -> Result<Request, String> {
    requests::create_request(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_request(state: State<'_, Db>, id: String, input: ResolveRequestInput) -> Result<Request, String> {
    requests::resolve_request(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_requests(state: State<'_, Db>) -> Result<Vec<Request>, String> {
    requests::list_all(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_requests_for_prisoner(state: State<'_, Db>, prisoner_id: String) -> Result<Vec<Request>, String> {
    requests::list_for_prisoner(&state.pool, &prisoner_id).await.map_err(|e| e.to_string())
}
