use tauri::State;

use crate::db::Db;
use crate::domain::referrals::{self, CreateReferralInput, Referral};

#[tauri::command]
pub async fn create_referral(state: State<'_, Db>, input: CreateReferralInput) -> Result<Referral, String> {
    referrals::create_referral(&state.pool, &state.vault_root, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_referral(state: State<'_, Db>, id: String, input: CreateReferralInput) -> Result<Referral, String> {
    referrals::update_referral(&state.pool, &state.vault_root, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_referrals(state: State<'_, Db>, query: String) -> Result<Vec<Referral>, String> {
    referrals::list_referrals(&state.pool, &query).await.map_err(|e| e.to_string())
}
