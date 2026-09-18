use tauri::State;

use crate::db::Db;
use crate::domain::cloudflare_tunnel::{self, CloudflareConfig, SaveCloudflareConfigInput};
use crate::domain::session;

/// Every Head Office management command requires an active HQ session
/// (spec: docs/specs/prisons/0001-head-office-peer-sync-network/index.md's
/// cross child contract), same as `commands::facilities`'s own gate.
async fn require_hq_session(pool: &sqlx::SqlitePool) -> Result<(), String> {
    session::get_current_hq_session(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Sign in as Head Office to do that.".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_cloudflare_config(state: State<'_, Db>) -> Result<Option<CloudflareConfig>, String> {
    require_hq_session(&state.pool).await?;
    cloudflare_tunnel::get_config(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_cloudflare_config(state: State<'_, Db>, input: SaveCloudflareConfigInput) -> Result<(), String> {
    require_hq_session(&state.pool).await?;
    cloudflare_tunnel::save_config(&state.pool, input).await.map_err(|e| e.to_string())
}
