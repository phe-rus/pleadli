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
    std::fs::write(&path, decode(&data)?).map_err(|e| e.to_string())
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
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
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
