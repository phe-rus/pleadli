use tauri::State;

use crate::db::Db;
use crate::domain::officers::{Officer, OfficerErrorPayload};
use crate::domain::session::{self, HqConfig};

#[tauri::command]
pub async fn get_hq_config(state: State<'_, Db>) -> Result<HqConfig, String> {
    session::get_hq_config(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hq_login(state: State<'_, Db>, badge_number: String, password: String) -> Result<Officer, OfficerErrorPayload> {
    session::hq_login(&state.pool, &badge_number, &password).await.map_err(OfficerErrorPayload::from)
}

#[tauri::command]
pub async fn get_current_hq_session(state: State<'_, Db>) -> Result<Option<Officer>, String> {
    session::get_current_hq_session(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn hq_sign_out(state: State<'_, Db>) -> Result<(), String> {
    session::hq_sign_out(&state.pool).await.map_err(|e| e.to_string())
}

/// The command itself is always registered (so `generate_handler!` stays one
/// flat list, matching every other command here), but the state mutating
/// body only exists in a debug build; a release binary contains no code
/// path that can flip `is_head_office` this way, "compiled out," not just
/// hidden behind a UI toggle.
#[tauri::command]
pub async fn set_dev_role(state: State<'_, Db>, is_head_office: bool) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        session::set_dev_role(&state.pool, is_head_office).await.map_err(|e| e.to_string())
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (state, is_head_office);
        Err("Not available in this build.".to_string())
    }
}
