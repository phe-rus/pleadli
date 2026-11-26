//! The attachment operations that need the operating system: reading a file
//! the prosecutor picked, and opening one in its own program. Everything else
//! about attachments goes through `/api/attachments`. The webview is never
//! given a path into the vault: it names an attachment by id. These commands
//! reach data without going through the API, so each asks the lock itself.

use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::Db;
use crate::domain::attachments::{self, Attachment};

#[tauri::command]
pub async fn add_attachment(state: State<'_, Db>, entity_type: String, entity_id: String, source_path: String) -> Result<Attachment, String> {
    state.security.ensure_unlocked()?;
    attachments::add_attachment_from_path(&state.pool, &state.vault_root, &entity_type, &entity_id, std::path::Path::new(&source_path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_attachment_data_url(state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    state.security.ensure_unlocked()?;
    attachments::get_attachment_data_url(&state.pool, &state.vault_root, &id).await.map_err(|e| e.to_string())
}

/// Opens the document in the program the system associates with it, from a
/// readable copy in a private folder that is emptied when the app exits.
#[tauri::command]
pub async fn open_attachment(app: AppHandle, state: State<'_, Db>, id: String) -> Result<(), String> {
    state.security.ensure_unlocked()?;
    let path = attachments::open_copy(&state.pool, &state.vault_root, &state.data_dir.join("opened"), &id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Attachment not found.".to_string())?;
    app.opener().open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

/// The scans in a folder or on a memory stick the prosecutor chose, in the
/// order a person would read the names ("page2" before "page10"). Only the
/// folder itself, not the folders inside it; hidden files and anything that
/// is not a PDF or a photo are left out. The paths go back to `add_attachment`
/// one by one, so every scan is stored exactly as it was.
#[tauri::command]
pub fn list_scans_in_folder(folder: String) -> Result<Vec<String>, String> {
    let mut found: Vec<(String, String)> = Vec::new();
    for entry in std::fs::read_dir(&folder).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        let scan = path.extension().and_then(|e| e.to_str()).is_some_and(|e| matches!(e.to_lowercase().as_str(), "pdf" | "png" | "jpg" | "jpeg" | "webp" | "heic"));
        if path.is_file() && scan && !name.starts_with('.') {
            found.push((natural_key(&name), path.to_string_lossy().to_string()));
        }
    }
    found.sort();
    Ok(found.into_iter().map(|(_, p)| p).collect())
}

/// Lowercase, with every run of digits padded so text order is number order.
fn natural_key(name: &str) -> String {
    let mut out = String::new();
    let mut digits = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else {
            if !digits.is_empty() {
                out.push_str(&format!("{digits:0>12}"));
                digits.clear();
            }
            out.push(c);
        }
    }
    if !digits.is_empty() {
        out.push_str(&format!("{digits:0>12}"));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::natural_key;

    #[test]
    fn page_2_sorts_before_page_10() {
        let mut names = ["page10.pdf", "Page2.pdf", "page1.pdf"];
        names.sort_by_key(|n| natural_key(n));
        assert_eq!(names, ["page1.pdf", "Page2.pdf", "page10.pdf"]);
    }
}
