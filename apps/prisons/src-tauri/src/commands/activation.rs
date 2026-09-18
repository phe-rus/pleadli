use tauri::State;

use crate::db::Db;
use crate::domain::activation::{self, ActivationErrorPayload};

#[tauri::command]
pub async fn choose_role(state: State<'_, Db>, role: String) -> Result<(), String> {
    activation::choose_role(&state.pool, &role).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_activation_code(state: State<'_, Db>, token: String) -> Result<(), ActivationErrorPayload> {
    activation::verify_activation_code(&state.pool, &token).await.map_err(ActivationErrorPayload::from)
}

/// Always registered, per `set_dev_role`'s reasoning in `commands/session.rs`;
/// the dev signing key it depends on only exists in a debug build.
#[tauri::command]
pub fn mint_dev_activation_code() -> Result<String, String> {
    #[cfg(debug_assertions)]
    {
        Ok(activation::mint_dev_activation_code())
    }
    #[cfg(not(debug_assertions))]
    {
        Err("Not available in this build.".to_string())
    }
}
