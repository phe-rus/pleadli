use std::collections::HashMap;
use tauri::State;

use crate::db::Db;
use crate::domain::import::{self, BulkImportResult, CaseResolution, ImportField, ImportPreview, PersonCandidate, PersonResolution};

#[tauri::command]
pub async fn import_fields(entity_type: String) -> Result<Vec<ImportField>, String> {
    import::import_fields(&entity_type).ok_or_else(|| "Unsupported record type.".to_string())
}

#[tauri::command]
pub async fn parse_import_file(path: String) -> Result<ImportPreview, String> {
    import::parse_import_file(std::path::Path::new(&path)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_people(state: State<'_, Db>, candidates: Vec<PersonCandidate>) -> Result<Vec<PersonResolution>, String> {
    import::resolve_people(&state.pool, candidates).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_cases(state: State<'_, Db>, references: Vec<String>) -> Result<Vec<CaseResolution>, String> {
    import::resolve_cases(&state.pool, references).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn bulk_import(
    state: State<'_, Db>,
    entity_type: String,
    rows: Vec<HashMap<String, String>>,
) -> Result<BulkImportResult, String> {
    Ok(import::bulk_import(&state.pool, &state.vault_root, &entity_type, rows).await)
}
