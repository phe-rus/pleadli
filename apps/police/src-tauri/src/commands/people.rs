use tauri::State;

use crate::db::Db;
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
