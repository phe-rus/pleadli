use tauri::State;

use crate::db::Db;
use crate::domain::statements::{self, CreateStatementInput, Statement};

#[tauri::command]
pub async fn create_statement(state: State<'_, Db>, input: CreateStatementInput) -> Result<Statement, String> {
    statements::create_statement(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_statements_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<Statement>, String> {
    statements::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
