use tauri::State;

use crate::db::Db;
use crate::domain::people::{self, CreatePersonInput, Person};

#[tauri::command]
pub async fn create_person(state: State<'_, Db>, input: CreatePersonInput) -> Result<Person, String> {
    people::create_person(&state.pool, input)
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
