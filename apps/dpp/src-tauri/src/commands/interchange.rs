//! Moving package files between the application and where the prosecutor keeps
//! them (a USB stick, a folder). The webview names a path it got from the
//! operating system's dialog; the bytes are made and read here.

use tauri::State;

use crate::db::Db;
use crate::domain::interchange::{self, ImportOutcome};

/// Reads a package from `path` and takes it in.
#[tauri::command]
pub async fn import_interchange_file(state: State<'_, Db>, path: String) -> Result<ImportOutcome, String> {
    state.security.ensure_unlocked()?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    interchange::import_package(&state.pool, &state.vault_root, &bytes).await.map_err(|e| e.to_string())
}

/// Writes an invitation (`kind` = "invite") or an outgoing package (`kind` =
/// "outgoing") to `path`.
#[tauri::command]
pub async fn save_interchange_file(state: State<'_, Db>, kind: String, id: String, path: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let bytes = match kind.as_str() {
        "invite" => interchange::invite_file(&state.pool, &id).await.map_err(|e| e.to_string())?,
        "outgoing" => interchange::export_outgoing(&state.pool, &id).await.map_err(|e| e.to_string())?.0,
        _ => return Err("Unknown kind of file.".to_string()),
    };
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// The name to offer in the save dialog.
#[tauri::command]
pub async fn interchange_file_name(state: State<'_, Db>, kind: String, id: String) -> Result<String, String> {
    state.security.ensure_unlocked()?;
    match kind.as_str() {
        "invite" => Ok("dpp-invitation.pxpkg".to_string()),
        _ => {
            let row: Option<(String, i64)> = sqlx::query_as("SELECT kind, seq FROM outgoing_packages WHERE id = ?").bind(&id).fetch_optional(&state.pool).await.map_err(|e| e.to_string())?;
            let (k, seq) = row.ok_or_else(|| "Nothing to send with that id.".to_string())?;
            Ok(format!("dpp-{}-{seq}.pxpkg", k.replace('_', "-")))
        }
    }
}
