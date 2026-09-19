//! Prisoner photographs: front and both sides. A photo is a vault document
//! (an attachment on the prisoner); this module says which view it is. A
//! retake supersedes the earlier photo and never deletes it.

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::attachments;
use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::time::now_ms;

pub const MAX_PHOTO_BYTES: usize = 1_500_000;
pub const VIEWS: [&str; 3] = ["front", "left", "right"];
const JPEG_PREFIX: &str = "data:image/jpeg;base64,";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrisonerPhoto {
    pub view: String,
    pub attachment_id: String,
    pub taken_at: i64,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceptionPhotos {
    pub front: Option<String>,
    pub left: Option<String>,
    pub right: Option<String>,
}

pub fn check_view(view: &str) -> Result<(), DomainError> {
    if VIEWS.contains(&view) {
        Ok(())
    } else {
        Err(DomainError::rejected("The photo view must be front, left or right."))
    }
}

/// Only a JPEG within the size limit is accepted, and the bytes must really
/// start like a JPEG, so a data URL cannot smuggle another kind of file into
/// the vault.
pub fn decode_jpeg_data_url(data_url: &str) -> Result<Vec<u8>, DomainError> {
    let encoded = data_url
        .strip_prefix(JPEG_PREFIX)
        .ok_or_else(|| DomainError::rejected("The photo must be a JPEG image."))?;
    if encoded.len() > MAX_PHOTO_BYTES * 4 / 3 + 8 {
        return Err(DomainError::rejected("That photo is larger than 1.5 MB."));
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| DomainError::rejected("The photo could not be read."))?;
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err(DomainError::rejected("That photo is larger than 1.5 MB."));
    }
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return Err(DomainError::rejected("The photo must be a JPEG image."));
    }
    Ok(bytes)
}

pub async fn list_current(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<PrisonerPhoto>, sqlx::Error> {
    sqlx::query_as::<_, PrisonerPhoto>(
        "SELECT view, attachment_id, taken_at FROM prisoner_photos
         WHERE prisoner_id = ? AND superseded_at IS NULL
         ORDER BY CASE view WHEN 'front' THEN 0 WHEN 'left' THEN 1 ELSE 2 END",
    )
    .bind(prisoner_id)
    .fetch_all(pool)
    .await
}

pub async fn save_photo(
    conn: &mut SqliteConnection,
    actor: &Actor,
    vault_root: &Path,
    prisoner_id: &str,
    view: &str,
    bytes: &[u8],
    source: &str,
) -> Result<PrisonerPhoto, DomainError> {
    check_view(view)?;
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM prisoners WHERE id = ?)").bind(prisoner_id).fetch_one(&mut *conn).await?;
    if !exists {
        return Err(DomainError::NotFound("That prisoner"));
    }

    let attachment = attachments::add_attachment_bytes(conn, actor, vault_root, "prisoner", prisoner_id, &format!("photo-{view}.jpg"), bytes)
        .await
        .map_err(|e| match e {
            attachments::AttachmentError::Db(e) => DomainError::Db(e),
            other => DomainError::rejected(other.to_string()),
        })?;

    let now = now_ms();
    sqlx::query("UPDATE prisoner_photos SET superseded_at = ? WHERE prisoner_id = ? AND view = ? AND superseded_at IS NULL")
        .bind(now)
        .bind(prisoner_id)
        .bind(view)
        .execute(&mut *conn)
        .await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO prisoner_photos (id, prisoner_id, view, attachment_id, taken_at, source) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(prisoner_id)
        .bind(view)
        .bind(&attachment.id)
        .bind(now)
        .bind(source)
        .execute(&mut *conn)
        .await?;

    let photo = PrisonerPhoto { view: view.to_string(), attachment_id: attachment.id, taken_at: now };
    audit::record(conn, actor, AuditEntry::new("prisoner.photo_saved", "prisoner", Some(prisoner_id)).after(&photo).reason(source)).await?;
    Ok(photo)
}

/// The photos taken during reception, saved in the same transaction as the
/// admission itself.
pub async fn save_reception_photos(
    conn: &mut SqliteConnection,
    actor: &Actor,
    vault_root: &Path,
    prisoner_id: &str,
    photos: &[(&'static str, Vec<u8>)],
) -> Result<(), DomainError> {
    for (view, bytes) in photos {
        save_photo(conn, actor, vault_root, prisoner_id, view, bytes, "reception").await?;
    }
    Ok(())
}

/// Validates every supplied reception photo up front, so a bad one refuses
/// the whole reception before anything is written.
pub fn decode_reception_photos(photos: &ReceptionPhotos) -> Result<Vec<(&'static str, Vec<u8>)>, DomainError> {
    let mut decoded = Vec::new();
    for (view, value) in [("front", &photos.front), ("left", &photos.left), ("right", &photos.right)] {
        if let Some(data_url) = value.as_deref().filter(|v| !v.is_empty()) {
            decoded.push((view, decode_jpeg_data_url(data_url)?));
        }
    }
    Ok(decoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_real_jpeg_data_urls_are_accepted() {
        let jpeg = base64::engine::general_purpose::STANDARD.encode([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
        assert!(decode_jpeg_data_url(&format!("data:image/jpeg;base64,{jpeg}")).is_ok());
        let png = base64::engine::general_purpose::STANDARD.encode([0x89, b'P', b'N', b'G', 1, 2]);
        assert!(decode_jpeg_data_url(&format!("data:image/jpeg;base64,{png}")).is_err(), "bytes must be a JPEG whatever the label says");
        assert!(decode_jpeg_data_url(&format!("data:image/png;base64,{jpeg}")).is_err());
    }
}
