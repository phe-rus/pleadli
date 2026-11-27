//! The organised case file, built as a PDF in the webview, leaving the app:
//! saved where the prosecutor chose, or opened in the system's viewer to be
//! printed. Only PDFs pass through here.

use base64::Engine;
use tauri::State;

use crate::db::Db;

fn decode(data: &str) -> Result<Vec<u8>, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF") {
        return Err("Only a PDF can be saved this way.".into());
    }
    Ok(bytes)
}

#[tauri::command]
pub async fn save_case_pdf(state: State<'_, Db>, path: String, data: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    std::fs::write(pleadli_node_core::save_grants::take(&path)?, decode(&data)?).map_err(|e| e.to_string())
}

/// Writes a copy to the temporary folder and opens it in the system's PDF
/// viewer, from where it is printed.
#[tauri::command]
pub async fn open_case_pdf(state: State<'_, Db>, name: String, data: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-dpp");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(if safe.ends_with(".pdf") { safe } else { format!("{safe}.pdf") });
    std::fs::write(&path, decode(&data)?).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// A paper or table leaving the application in the format chosen (Word, PDF,
/// Excel, CSV), saved where the person chose in the system's save window.
#[tauri::command]
pub async fn save_paper_file(state: State<'_, Db>, path: String, data: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let lower = path.to_lowercase();
    if ![".doc", ".docx", ".pdf", ".xlsx", ".csv", ".txt"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not saved from here.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(pleadli_node_core::save_grants::take(&path)?, bytes).map_err(|e| e.to_string())
}

/// A paper or table saved to the computer's Downloads folder, with no Save window. The window supplies only a name,
/// never a folder; a name already taken becomes "name (2)". Returns the path it was saved at.
#[tauri::command]
pub async fn save_paper_download(app: tauri::AppHandle, state: State<'_, Db>, file_name: String, data: String) -> Result<String, String> {
    use tauri::Manager;
    state.security.ensure_unlocked()?;
    let lower = file_name.to_lowercase();
    if ![".doc", ".docx", ".pdf", ".xlsx", ".csv", ".txt"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not saved from here.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let dir = pleadli_node_core::downloads::resolve_dir(app.path().download_dir().ok(), app.path().home_dir().ok())?;
    let path = pleadli_node_core::downloads::save_unique(&dir, &file_name, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Which office programs this computer has (Word, Excel, LibreOffice).
#[tauri::command]
pub async fn office_apps() -> pleadli_node_core::office::OfficeApps {
    pleadli_node_core::office::detect()
}

/// Writes a copy of a paper to the temporary folder and opens it in the
/// program the system uses for it (Word for a .doc where Office is installed).
#[tauri::command]
pub async fn open_paper_file(state: State<'_, Db>, name: String, data: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let lower = name.to_lowercase();
    if ![".doc", ".docx", ".xlsx", ".csv", ".pdf"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not opened from here.".into());
    }
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-dpp");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// Asks the prosecutor for a package file in the system open window. `None` when the window is cancelled.
#[tauri::command]
pub async fn pick_package_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    // Debug builds only: a test copy that names the file to open skips the system window (a driver cannot click
    // it). Release builds always ask the person.
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("PLEADLI_OPEN_FILE").filter(|p| !p.is_empty()) {
        return Ok(Some(path.to_string_lossy().to_string()));
    }
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Pleadli package", &["pxpkg"]).blocking_pick_file()).await.map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    Ok(Some(file.into_path().map_err(|e| e.to_string())?.to_string_lossy().to_string()))
}

/// Opens the system Save window and approves the one path the person picks, for a following export command.
#[tauri::command]
pub async fn pick_save_path(app: tauri::AppHandle, default_name: String, extension: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if extension.is_empty() || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Not a valid file type.".to_string());
    }
    let name = pleadli_node_core::downloads::clean_file_name(&default_name);
    // Debug builds only: a test copy that names its own downloads folder skips the system window (a driver cannot
    // click it) and writes there. Release builds always ask the person.
    #[cfg(debug_assertions)]
    if let Some(dir) = std::env::var_os("PLEADLI_DOWNLOADS_DIR") {
        let path = std::path::PathBuf::from(dir).join(&name);
        pleadli_node_core::save_grants::approve(&path);
        return Ok(Some(path.to_string_lossy().to_string()));
    }
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_file_name(name).add_filter("File", &[extension.as_str()]).blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    pleadli_node_core::save_grants::approve(&path);
    Ok(Some(path.to_string_lossy().to_string()))
}
