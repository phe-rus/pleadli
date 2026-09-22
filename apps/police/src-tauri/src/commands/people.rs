//! The person commands that need the operating system: a photo read from a
//! path the officer picked in the file dialog. Everything else about a person
//! is `/api/people`.

use tauri::State;

use crate::db::Db;
use crate::domain::attachments::Attachment;
use crate::domain::people;

#[tauri::command]
pub async fn set_person_photo_from_path(_who: super::api::SignedIn,
    state: State<'_, Db>,
    id: String,
    angle: String,
    source_path: String,
) -> Result<Attachment, String> {
    if !people::PHOTO_ANGLES.contains(&angle.as_str()) {
        return Err("Invalid photo angle.".to_string());
    }
    let path = std::path::Path::new(&source_path);
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("photo").to_string();
    people::set_photo(&state.pool, &state.vault_root, &id, &angle, &file_name, &bytes)
        .await
        .map_err(|e| e.to_string())
}
