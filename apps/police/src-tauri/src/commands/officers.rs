//! The officer commands that must raise an event on the desktop window, which
//! a plain request cannot do. Everything else about officers is `/api/officers`.

use tauri::{AppHandle, Emitter, State};

use crate::db::Db;
use crate::domain::officers::{self, BackupAlert};

/// Emitted whenever a backup alert's responder/ended state changes from
/// the desktop side (`transport::remote_server`'s `/backup-alert` handler
/// emits the sibling `backup-alert:created` event when a phone creates
/// one) — the one channel the app-shell listener, the toolbar's
/// active-dispatch indicator, and the ringtone/toast all key off, so
/// every source of a backup-alert change reaches the same frontend
/// listener the same way.
const BACKUP_ALERT_UPDATED_EVENT: &str = "backup-alert:updated";

#[tauri::command]
pub async fn respond_to_backup_alert(_who: super::api::SignedIn,
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
pub async fn end_backup_alert(_who: super::api::SignedIn, app: AppHandle, state: State<'_, Db>, id: String) -> Result<BackupAlert, String> {
    let alert = officers::end_backup_alert(&state.pool, &id).await.map_err(|e| e.to_string())?;
    let _ = app.emit(BACKUP_ALERT_UPDATED_EVENT, &alert);
    Ok(alert)
}
