use tauri::State;

use crate::db::Db;
use crate::domain::attachments::Attachment;
use crate::domain::people::{self, CreatePersonInput, Person, PersonProfile};

#[tauri::command]
pub async fn create_person(state: State<'_, Db>, input: CreatePersonInput) -> Result<Person, String> {
    people::create_person(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_person(
    state: State<'_, Db>,
    id: String,
    input: CreatePersonInput,
) -> Result<Person, String> {
    people::update_person(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_people(state: State<'_, Db>, query: String) -> Result<Vec<Person>, String> {
    people::search_people(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_person(state: State<'_, Db>, id: String) -> Result<Option<Person>, String> {
    people::get_person(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_person_profile(state: State<'_, Db>, id: String) -> Result<Option<PersonProfile>, String> {
    people::get_person_profile(&state.pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_person_headshot(state: State<'_, Db>, id: String, attachment_id: String) -> Result<Person, String> {
    people::set_headshot(&state.pool, &id, &attachment_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_person_headshot(state: State<'_, Db>, id: String) -> Result<Person, String> {
    people::clear_headshot(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_person_photo_from_path(
    state: State<'_, Db>,
    id: String,
    angle: String,
    source_path: String,
) -> Result<Attachment, String> {
    if !people::PHOTO_ANGLES.contains(&angle.as_str()) {
        return Err("Invalid photo angle.".to_string());
    }
    let path = std::path::Path::new(&source_path);
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("photo").to_string();
    people::set_photo(&state.pool, &state.vault_root, &id, &angle, &file_name, &bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_person_photo(state: State<'_, Db>, id: String, angle: String) -> Result<(), String> {
    if !people::PHOTO_ANGLES.contains(&angle.as_str()) {
        return Err("Invalid photo angle.".to_string());
    }
    people::clear_photo(&state.pool, &id, &angle).await.map_err(|e| e.to_string())
}
