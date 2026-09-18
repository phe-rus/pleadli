use tauri::State;

use crate::db::Db;
use crate::domain::facilities::{self, Facility, PeerSyncConfig, RegisterFacilityInput, VerifyFacilityError};
use crate::domain::session;

/// Every Head Office management command requires an active HQ session
/// (spec: docs/specs/prisons/0001-head-office-peer-sync-network/index.md's
/// cross child contract), not a re-entered admin badge and password like
/// officers.rs; none of this is exposed on the public network facing server.
async fn require_hq_session(pool: &sqlx::SqlitePool) -> Result<(), String> {
    session::get_current_hq_session(pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Sign in as Head Office to do that.".to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_facilities(state: State<'_, Db>) -> Result<Vec<Facility>, String> {
    require_hq_session(&state.pool).await?;
    facilities::list_facilities(&state.pool).await.map_err(|e| e.to_string())
}

/// Read only, no session required: this is a peer's own local sync status,
/// the same trust level as `get_hq_config` (Settings needs to show it
/// before/without an HQ session existing at all on a facility install).
#[tauri::command]
pub async fn get_peer_sync_config(state: State<'_, Db>) -> Result<PeerSyncConfig, String> {
    facilities::get_peer_sync_config(&state.pool).await.map_err(|e| e.to_string())
}

/// No session required: this is the facility's own first-launch
/// onboarding step, before any pairing exists to be signed in to.
#[tauri::command]
pub async fn register_facility_self(state: State<'_, Db>, input: RegisterFacilityInput) -> Result<Facility, String> {
    facilities::register_facility_self(&state.pool, input).await.map_err(|e| e.to_string())
}

/// No session required, same as `get_peer_sync_config` above: a facility's
/// own read of its own registration/status.
#[tauri::command]
pub async fn get_own_facility(state: State<'_, Db>) -> Result<Option<Facility>, String> {
    facilities::get_own_facility(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_facility(state: State<'_, Db>, facility_id: String, code: String) -> Result<Facility, String> {
    require_hq_session(&state.pool).await?;
    facilities::verify_facility(&state.pool, &facility_id, &code).await.map_err(|e| match e {
        VerifyFacilityError::Db(e) => e.to_string(),
        VerifyFacilityError::NotFound => "Facility not found.".to_string(),
        VerifyFacilityError::InvalidOrExpired => "That code is invalid or has expired.".to_string(),
    })
}
