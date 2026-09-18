use tauri::State;

use crate::db::Db;
use crate::domain::comments::{self, Comment, CreateCommentInput};

#[tauri::command]
pub async fn create_comment(state: State<'_, Db>, input: CreateCommentInput) -> Result<Comment, String> {
    comments::create_comment(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_comments_for_entity(state: State<'_, Db>, entity_type: String, entity_id: String) -> Result<Vec<Comment>, String> {
    comments::list_for_entity(&state.pool, &entity_type, &entity_id).await.map_err(|e| e.to_string())
}
