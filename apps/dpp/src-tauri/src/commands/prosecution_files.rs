use tauri::State;

use crate::db::Db;
use crate::domain::prosecution_files::{
    self, CreateProsecutionFileInput, ProsecutionFile, ProsecutionFilePerson, UpdateProsecutionFileInput,
};

#[tauri::command]
pub async fn create_prosecution_file(state: State<'_, Db>, input: CreateProsecutionFileInput) -> Result<ProsecutionFile, String> {
    prosecution_files::create_prosecution_file(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_prosecution_file(
    state: State<'_, Db>,
    id: String,
    input: UpdateProsecutionFileInput,
) -> Result<ProsecutionFile, String> {
    prosecution_files::update_prosecution_file(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_prosecution_files(state: State<'_, Db>, query: String) -> Result<Vec<ProsecutionFile>, String> {
    prosecution_files::list_prosecution_files(&state.pool, &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_intake_queue(state: State<'_, Db>) -> Result<Vec<ProsecutionFile>, String> {
    prosecution_files::list_intake_queue(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_prosecution_file(state: State<'_, Db>, id: String) -> Result<Option<ProsecutionFile>, String> {
    prosecution_files::get_prosecution_file(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn link_person_to_file(
    state: State<'_, Db>,
    prosecution_file_id: String,
    person_id: String,
    role: String,
) -> Result<ProsecutionFilePerson, String> {
    prosecution_files::link_person(&state.pool, &prosecution_file_id, &person_id, &role)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn unlink_person_from_file(state: State<'_, Db>, id: String) -> Result<(), String> {
    prosecution_files::unlink_person(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_file_people(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<ProsecutionFilePerson>, String> {
    prosecution_files::list_file_people(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
