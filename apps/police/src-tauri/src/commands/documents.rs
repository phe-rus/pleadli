use tauri::{Manager, State};

use super::api::{signed_in_actor, LocalSession};
use crate::db::Db;
use crate::domain::{cases, documents};

const RESTRICTED: &str = "This case is restricted. Only an administrator or the officer who restricted it can open it.";

/// `destination_path` must be a place the person picked in a native Save window opened by `pick_save_path`:
/// `save_grants::take` refuses any other path, so the web layer cannot make these commands write elsewhere.
///
/// The Markdown vault copies files off disk, so an officer who cannot open some restricted case
/// is refused it (the spreadsheet, PDF and Word exports leave those cases out instead).
#[tauri::command]
pub async fn export_all_markdown(session: State<'_, LocalSession>, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    if !cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?.is_empty() {
        return Err("This export would include restricted cases you may not open. Ask an administrator to export it.".to_string());
    }
    let done = documents::export_all_markdown(&state.pool, &state.vault_root, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export all (Markdown)", None, None, done).await
}

#[tauri::command]
pub async fn export_all_xlsx(session: State<'_, LocalSession>, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    let done = documents::export_all_xlsx(&state.pool, &hidden, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export all (xlsx)", None, None, done).await
}

#[tauri::command]
pub async fn export_all_pdf(session: State<'_, LocalSession>, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    let done = documents::export_all_pdf(&state.pool, &hidden, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export all (pdf)", None, None, done).await
}

#[tauri::command]
pub async fn export_all_docx(session: State<'_, LocalSession>, state: State<'_, Db>, destination_path: String) -> Result<(), String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    let done = documents::export_all_docx(&state.pool, &hidden, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export all (docx)", None, None, done).await
}

fn parse_format(format: &str) -> Result<documents::DocumentFormat, String> {
    documents::DocumentFormat::parse(format).ok_or_else(|| "Invalid document format.".to_string())
}

/// Returns `false` (not an error) when the record itself doesn't exist:
/// the frontend only offers this action from a record's own page, so
/// that's an edge case (deleted mid-export), not a broken request.
#[tauri::command]
pub async fn export_person_document(
    session: State<'_, LocalSession>,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    // The person document lists their cases, so it is refused whenever any case they appear in is hidden from this officer.
    let their_cases: Vec<String> = sqlx::query_scalar("SELECT case_id FROM case_people WHERE person_id = ?").bind(&id).fetch_all(&state.pool).await.map_err(|e| e.to_string())?;
    if their_cases.iter().any(|c| hidden.contains(c)) {
        return Err(RESTRICTED.to_string());
    }
    let done = documents::export_person_document(&state.pool, &state.vault_root, &id, parse_format(&format)?, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export person document", Some(("person", &id)), None, done).await
}

#[tauri::command]
pub async fn export_case_document(
    session: State<'_, LocalSession>,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    if !cases::can_open(&state.pool, &id, &actor).await.map_err(|e| e.to_string())? {
        return Err(RESTRICTED.to_string());
    }
    let done = documents::export_case_document(&state.pool, &id, parse_format(&format)?, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export case document", Some(("case", &id)), Some(&id), done).await
}

#[tauri::command]
pub async fn export_charge_sheet_document(
    session: State<'_, LocalSession>,
    state: State<'_, Db>,
    id: String,
    format: String,
    destination_path: String,
) -> Result<bool, String> {
    let actor = signed_in_actor(&session, &state.pool).await?;
    let hidden = cases::hidden_case_ids(&state.pool, &actor).await.map_err(|e| e.to_string())?;
    if !cases::may_see_entity(&state.pool, "charge_sheet", &id, &hidden).await.map_err(|e| e.to_string())? {
        return Err(RESTRICTED.to_string());
    }
    let done = documents::export_charge_sheet_document(&state.pool, &id, parse_format(&format)?, &pleadli_node_core::save_grants::take(&destination_path)?).await.map_err(|e| e.to_string());
    trail(&state.pool, &actor, "export charge sheet document", Some(("charge_sheet", &id)), None, done).await
}

/// A paper or table leaving the station in the format chosen (Word, PDF,
/// Excel, CSV), written at the path `downloads_path` gave. Only a file directly inside the Downloads folder is
/// written, and never over a file that is already there, so the window cannot make this command write anywhere else.
#[tauri::command]
pub async fn save_paper_file(_who: super::api::SignedIn, app: tauri::AppHandle, path: String, data: String) -> Result<(), String> {
    use base64::Engine;
    use std::io::Write;
    let lower = path.to_lowercase();
    if ![".doc", ".docx", ".pdf", ".xlsx", ".csv", ".txt", ".pxpkg"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not saved from here.".into());
    }
    let downloads = pleadli_node_core::downloads::resolve_dir(app.path().download_dir().ok(), app.path().home_dir().ok())?;
    let target = std::path::Path::new(&path);
    let inside = match (target.parent().and_then(|p| p.canonicalize().ok()), downloads.canonicalize().ok()) {
        (Some(parent), Some(dir)) => parent == dir,
        _ => false,
    };
    if !inside {
        return Err("Files are saved in the Downloads folder only.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(target).map_err(|_| "That file name is already taken in the Downloads folder.".to_string())?;
    file.write_all(&bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())
}

/// A package file the officer chose in the open window, read for the exchange.
/// Only `.pxpkg` files, at most 50 MB.
#[tauri::command]
pub async fn read_paper_file(_who: super::api::SignedIn, path: String) -> Result<String, String> {
    use base64::Engine;
    if !path.to_lowercase().ends_with(".pxpkg") {
        return Err("Only Pleadli package files are opened from here.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("That file is too large.".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Which office programs this computer has (Word, Excel, LibreOffice).
#[tauri::command]
pub async fn office_apps() -> pleadli_node_core::office::OfficeApps {
    pleadli_node_core::office::detect()
}

/// A copy of a paper in the temporary folder, opened in the program the
/// system uses for it (Word for a .doc where Office is installed).
#[tauri::command]
pub async fn open_paper_file(_who: super::api::SignedIn, name: String, data: String) -> Result<(), String> {
    use base64::Engine;
    let lower = name.to_lowercase();
    if ![".doc", ".docx", ".xlsx", ".csv", ".pdf"].iter().any(|ext| lower.ends_with(ext)) {
        return Err("This kind of file is not opened from here.".into());
    }
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || c == '-' || c == '.' { c } else { '-' }).collect();
    let dir = std::env::temp_dir().join("pleadli-police");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

/// Where a saved paper goes without asking: the computer's Downloads folder (the one the officer
/// already knows from the browser), under a name that is free there, so nothing is ever
/// overwritten ("Statement.pdf", then "Statement (2).pdf"). The window then writes the file with
/// `save_paper_file`. A test copy can point it elsewhere with PLEADLI_DOWNLOADS_DIR.
#[tauri::command]
pub async fn downloads_path(_who: super::api::SignedIn, app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let dir = match std::env::var_os("PLEADLI_DOWNLOADS_DIR") {
        Some(custom) => std::path::PathBuf::from(custom),
        None => app
            .path()
            .download_dir()
            .or_else(|_| app.path().home_dir().map(|h| h.join("Downloads")))
            .map_err(|_| "This computer has no Downloads folder.".to_string())?,
    };
    std::fs::create_dir_all(&dir).map_err(|_| "The Downloads folder could not be opened.".to_string())?;
    // Only the file's own name: no folders, nothing a file system dislikes.
    let clean: String = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("file")
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let clean = clean.trim().trim_matches('.').to_string();
    let clean = if clean.is_empty() { "file".to_string() } else { clean };
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (clean.clone(), String::new()),
    };
    let mut candidate = dir.join(format!("{stem}{ext}"));
    let mut n = 2;
    while candidate.exists() {
        candidate = dir.join(format!("{stem} ({n}){ext}"));
        n += 1;
    }
    // A name in Downloads that the export command may write: approved here, spent by its first use.
    pleadli_node_core::save_grants::approve(&candidate);
    Ok(candidate.to_string_lossy().into_owned())
}

/// Opens the system Save window and approves the one path the person picks, for a following export command.
/// Returns `None` when the window is cancelled.
#[tauri::command]
pub async fn pick_save_path(_who: super::api::SignedIn, app: tauri::AppHandle, default_name: String, extension: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    if extension.is_empty() || !extension.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Not a valid file type.".to_string());
    }
    let name = pleadli_node_core::downloads::clean_file_name(&default_name);
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().set_file_name(name).add_filter("File", &[extension.as_str()]).blocking_save_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(file) = picked else { return Ok(None) };
    let path = file.into_path().map_err(|e| e.to_string())?;
    pleadli_node_core::save_grants::approve(&path);
    Ok(Some(path.to_string_lossy().to_string()))
}

/// A file leaving the station is an event: when the export worked, it goes on the audit trail with
/// the officer who made it. If the trail cannot take it the officer is told, as for a write through
/// the router.
async fn trail<T>(
    pool: &sqlx::SqlitePool,
    actor: &crate::domain::sessions::Actor,
    action: &str,
    subject: Option<(&str, &str)>,
    scope: Option<&str>,
    done: Result<T, String>,
) -> Result<T, String> {
    let value = done?;
    crate::domain::audit::log_event(pool, actor, action, subject, scope)
        .await
        .map_err(|e| format!("The file was saved but could not be written to the audit trail: {e}"))?;
    Ok(value)
}
