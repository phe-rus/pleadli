use tauri::State;

use crate::db::Db;
use crate::domain::statements::{self, CreateStatementInput, Statement};

#[tauri::command]
pub async fn create_statement(state: State<'_, Db>, input: CreateStatementInput) -> Result<Statement, String> {
    statements::create_statement(&state.pool, &state.vault_root, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_statement(
    state: State<'_, Db>,
    id: String,
    input: CreateStatementInput,
) -> Result<Statement, String> {
    statements::update_statement(&state.pool, &state.vault_root, &id, input)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_statements(state: State<'_, Db>, query: String) -> Result<Vec<Statement>, String> {
    statements::list_statements(&state.pool, &query)
        .await
        .map_err(|e| e.to_string())
}
