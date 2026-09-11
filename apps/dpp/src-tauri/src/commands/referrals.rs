use tauri::State;

use crate::db::Db;
use crate::domain::referrals::{self, CreateResubmissionInput, Referral};

#[tauri::command]
pub async fn create_resubmission(state: State<'_, Db>, input: CreateResubmissionInput) -> Result<Referral, String> {
    referrals::create_resubmission(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_referrals_for_file(state: State<'_, Db>, prosecution_file_id: String) -> Result<Vec<Referral>, String> {
    referrals::list_for_file(&state.pool, &prosecution_file_id).await.map_err(|e| e.to_string())
}
