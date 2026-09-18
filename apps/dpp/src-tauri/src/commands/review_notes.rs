use tauri::State;

use crate::db::Db;
use crate::domain::review_notes::{self, CreateReviewNoteInput, ReviewNote};

#[tauri::command]
pub async fn create_review_note(state: State<'_, Db>, input: CreateReviewNoteInput) -> Result<ReviewNote, String> {
    review_notes::create_review_note(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_review_notes_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<ReviewNote>, String> {
    review_notes::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
