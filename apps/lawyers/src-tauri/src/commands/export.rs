//! A filing pack, built as a PDF in the webview, leaving the app: saved where
//! the person chose. Only PDFs pass through here, and only while someone is
//! signed in (the same gate the API keeps).

use std::sync::Arc;

use base64::Engine;
use tauri::State;

use crate::domain::network::Runtime as Network;
use crate::domain::security::Security;

/// Signed in here, or a computer joined to an office (the office checked who
/// is signed in when the file's contents were read).
fn may_save(security: &Security, network: &Network) -> bool {
    network.link().is_some() || (security.is_installed() && !security.is_locked())
}

#[tauri::command]
pub async fn save_pdf(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, path: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to save a filing pack.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"%PDF") {
        return Err("Only a PDF can be saved this way.".into());
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Any file the person exports (a document as PDF or Word, all the records as
/// a ZIP), saved where they chose. The bytes must be what the kind says.
#[tauri::command]
pub async fn save_export(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, path: String, kind: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to export.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let ok = match kind.as_str() {
        "pdf" => bytes.starts_with(b"%PDF"),
        "docx" | "zip" => bytes.starts_with(b"PK\x03\x04"),
        "json" => bytes.first().is_some_and(|b| *b == b'{' || *b == b'['),
        // A paper saved for Word: a web page Word opens as a document.
        "doc" => bytes.starts_with(b"<html"),
        "csv" => std::str::from_utf8(&bytes).is_ok(),
        "png" => bytes.starts_with(b"\x89PNG"),
        "jpg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "webp" => bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !ok {
        return Err("That file is not what it says it is.".into());
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Which office programs this computer has (Word, Excel, LibreOffice).
#[tauri::command]
pub async fn office_apps() -> pleadli_node_core::office::OfficeApps {
    pleadli_node_core::office::detect()
}

/// A copy of a paper in the temporary folder, opened in the program the
/// system uses for it (Word for a .doc where Office is installed).
#[tauri::command]
pub async fn open_paper_file(security: State<'_, Arc<Security>>, network: State<'_, Arc<Network>>, name: String, data: String) -> Result<(), String> {
    if !may_save(&security, &network) {
        return Err("Sign in to open a paper.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if !bytes.starts_with(b"<html") && !bytes.starts_with(b"%PDF") {
        return Err("Only a paper can be opened this way.".into());
    }
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-lawyers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}
