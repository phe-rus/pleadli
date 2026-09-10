use tauri::{AppHandle, Emitter, State};

use crate::db::Db;
use crate::domain::officers::{
    self, BackupAlert, CreateOfficerInput, Officer, RemoteAccessLogEntry, RemoteAccessSettings, UpdateOfficerInput,
};

/// Emitted whenever a backup alert's responder/ended state changes from
/// the desktop side (`transport::remote_server`'s `/backup-alert` handler
/// emits the sibling `backup-alert:created` event when a phone creates
/// one) — the one channel the app-shell listener, the toolbar's
/// active-dispatch indicator, and the ringtone/toast all key off, so
/// every source of a backup-alert change reaches the same frontend
/// listener the same way.
const BACKUP_ALERT_UPDATED_EVENT: &str = "backup-alert:updated";

#[tauri::command]
pub async fn create_officer(state: State<'_, Db>, input: CreateOfficerInput) -> Result<Officer, String> {
    officers::create_officer(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_officer(state: State<'_, Db>, id: String, input: UpdateOfficerInput) -> Result<Officer, String> {
    officers::update_officer(&state.pool, &id, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_officers(state: State<'_, Db>) -> Result<Vec<Officer>, String> {
    officers::list_officers(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_remote_access_log(state: State<'_, Db>) -> Result<Vec<RemoteAccessLogEntry>, String> {
    officers::list_remote_access_log(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_remote_access_settings(state: State<'_, Db>) -> Result<RemoteAccessSettings, String> {
    officers::get_remote_access_settings(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_backup_alerts(state: State<'_, Db>) -> Result<Vec<BackupAlert>, String> {
    officers::list_backup_alerts(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn acknowledge_backup_alert(state: State<'_, Db>, id: String) -> Result<(), String> {
    officers::acknowledge_backup_alert(&state.pool, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_active_backup_alerts(state: State<'_, Db>) -> Result<Vec<BackupAlert>, String> {
    officers::list_active_backup_alerts(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn respond_to_backup_alert(
    app: AppHandle,
    state: State<'_, Db>,
    id: String,
    officer_id: String,
) -> Result<BackupAlert, String> {
    let alert = officers::respond_to_backup_alert(&state.pool, &id, &officer_id).await.map_err(|e| e.to_string())?;
    let _ = app.emit(BACKUP_ALERT_UPDATED_EVENT, &alert);
    Ok(alert)
}

#[tauri::command]
pub async fn end_backup_alert(app: AppHandle, state: State<'_, Db>, id: String) -> Result<BackupAlert, String> {
    let alert = officers::end_backup_alert(&state.pool, &id).await.map_err(|e| e.to_string())?;
    let _ = app.emit(BACKUP_ALERT_UPDATED_EVENT, &alert);
    Ok(alert)
}
