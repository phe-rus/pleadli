//! Backups the prosecutor saves to, and restores from, a place they choose. The
//! webview names the path it got from the operating system's dialog; the bytes
//! are made and read here, and never pass through the webview. Restoring stages
//! the backup and the app restarts to apply it (`domain/backup.rs`).

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::domain::backup::{self, Staged};

/// The data folder, managed even when the data could not be opened, so a
/// restore can still be staged then.
pub struct DataDir(pub std::path::PathBuf);

#[tauri::command]
pub async fn create_backup(state: State<'_, Db>, path: String, passphrase: String) -> Result<i64, String> {
    state.security.ensure_unlocked()?;
    let file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    let out = std::io::BufWriter::new(file);
    match backup::write_backup(&state.pool, &state.vault_root, &state.data_dir, &passphrase, out).await {
        Ok(meta) => Ok(meta.documents),
        Err(e) => {
            let _ = std::fs::remove_file(&path);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn stage_restore(dir: State<'_, DataDir>, path: String, passphrase: String) -> Result<Staged, String> {
    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    backup::stage_restore(&dir.0, std::io::BufReader::new(file), &passphrase).await.map_err(|e| e.to_string())
}

/// Restarts the application, which is what applies a staged restore.
#[tauri::command]
pub fn restart_app(app: AppHandle) {
    app.restart();
}
