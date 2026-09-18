use tauri::State;

use crate::db::Db;
use crate::domain::evidence::{self, CreateEvidenceItemInput, EvidenceItem};

#[tauri::command]
pub async fn create_evidence_item(state: State<'_, Db>, input: CreateEvidenceItemInput) -> Result<EvidenceItem, String> {
    evidence::create_evidence_item(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_evidence_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<EvidenceItem>, String> {
    evidence::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
