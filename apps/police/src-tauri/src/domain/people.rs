use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::attachments::Attachment;
use super::bonds::Bond;
use super::cases::Case;
use super::charge_sheets::ChargeSheet;
use super::custody::CustodyRecord;
use super::exhibits::Exhibit;
use super::incidents::Incident;
use super::statements::Statement;
use super::station_diary::StationDiaryEntry;
use super::vehicles::Vehicle;
use super::{
    attachments, bonds, cases, charge_sheets, custody, exhibits, incidents, markdown, statements, station_diary,
    vehicles,
};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Person {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub phone: Option<String>,
    pub national_id: Option<String>,
    pub address: Option<String>,
    pub created_at: i64,
    pub headshot_attachment_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePersonInput {
    pub first_name: String,
    pub last_name: String,
    pub other_names: Option<String>,
    pub phone: Option<String>,
    pub national_id: Option<String>,
    pub address: Option<String>,
}

/// Best-effort — a Vault write failure must never fail the record save
/// that already succeeded in the database.
pub(crate) async fn write_person_markdown(pool: &SqlitePool, vault_root: &Path, record: &Person) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "person", &record.id).await {
        let title = format!("{} {}", record.first_name, record.last_name);
        if let Err(e) = markdown::write_record(&dir, &format!("person-{}", record.id), &title, record) {
            log::warn!("failed to write person markdown: {e}");
        }
    }
}

pub async fn create_person(pool: &SqlitePool, vault_root: &Path, input: CreatePersonInput) -> Result<Person, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO people (id, first_name, last_name, other_names, phone, national_id, address)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.phone)
    .bind(&input.national_id)
    .bind(&input.address)
    .execute(pool)
    .await?;

    let record = get_person(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_person_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_person(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreatePersonInput,
) -> Result<Person, sqlx::Error> {
    sqlx::query(
        "UPDATE people
         SET first_name = ?, last_name = ?, other_names = ?, phone = ?, national_id = ?, address = ?
         WHERE id = ?",
    )
    .bind(&input.first_name)
    .bind(&input.last_name)
    .bind(&input.other_names)
    .bind(&input.phone)
    .bind(&input.national_id)
    .bind(&input.address)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_person(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_person_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn search_people(pool: &SqlitePool, query: &str) -> Result<Vec<Person>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Person>("SELECT * FROM people ORDER BY created_at DESC LIMIT 50")
            .fetch_all(pool)
            .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Person>(
        "SELECT * FROM people
         WHERE first_name LIKE ?1 OR last_name LIKE ?1 OR other_names LIKE ?1
            OR phone LIKE ?1 OR national_id LIKE ?1
         ORDER BY created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every person record, unfiltered and unlimited, used by the bulk data
/// export, which needs the whole table rather than `search_people`'s
/// UI-oriented 50-row cap.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Person>, sqlx::Error> {
    sqlx::query_as::<_, Person>("SELECT * FROM people ORDER BY created_at ASC")
        .fetch_all(pool)
        .await
}

pub async fn get_person(pool: &SqlitePool, id: &str) -> Result<Option<Person>, sqlx::Error> {
    sqlx::query_as::<_, Person>("SELECT * FROM people WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// Only lets a person's headshot point at a file already attached to
/// that same person, never an arbitrary attachment id.
pub async fn set_headshot(pool: &SqlitePool, person_id: &str, attachment_id: &str) -> Result<Person, sqlx::Error> {
    let belongs: Option<String> = sqlx::query_scalar(
        "SELECT id FROM attachments WHERE id = ? AND entity_type = 'person' AND entity_id = ?",
    )
    .bind(attachment_id)
    .bind(person_id)
    .fetch_optional(pool)
    .await?;
    if belongs.is_none() {
        return Err(sqlx::Error::RowNotFound);
    }

    sqlx::query("UPDATE people SET headshot_attachment_id = ? WHERE id = ?")
        .bind(attachment_id)
        .bind(person_id)
        .execute(pool)
        .await?;
    get_person(pool, person_id).await?.ok_or(sqlx::Error::RowNotFound)
}

pub async fn clear_headshot(pool: &SqlitePool, person_id: &str) -> Result<Person, sqlx::Error> {
    sqlx::query("UPDATE people SET headshot_attachment_id = NULL WHERE id = ?")
        .bind(person_id)
        .execute(pool)
        .await?;
    get_person(pool, person_id).await?.ok_or(sqlx::Error::RowNotFound)
}

/// The four identification-photo slots a person record can carry: a
/// proper mugshot set, not one arbitrary "best" photo.
pub const PHOTO_ANGLES: [&str; 4] = ["front", "left_profile", "right_profile", "back"];

async fn existing_photo_attachment_id(
    pool: &SqlitePool,
    person_id: &str,
    angle: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT id FROM attachments WHERE entity_type = 'person' AND entity_id = ? AND photo_angle = ?",
    )
    .bind(person_id)
    .bind(angle)
    .fetch_optional(pool)
    .await
}

/// Fills one of a person's four angle-photo slots, replacing whatever
/// attachment already occupied it. `angle` is trusted to already be one
/// of `PHOTO_ANGLES`; callers (the Tauri commands and dev-server routes)
/// validate it before reaching here. The front slot doubles as the
/// avatar shown everywhere a person is listed, so setting it also drives
/// the existing single-headshot pointer other views (list rows, the
/// remote civilian-lookup endpoint) already read.
pub async fn set_photo(
    pool: &SqlitePool,
    vault_root: &Path,
    person_id: &str,
    angle: &str,
    file_name: &str,
    bytes: &[u8],
) -> Result<Attachment, attachments::AttachmentError> {
    if let Some(existing_id) = existing_photo_attachment_id(pool, person_id, angle).await? {
        attachments::delete_attachment(pool, &existing_id).await?;
    }

    let attachment =
        attachments::add_attachment_bytes(pool, vault_root, "person", person_id, file_name, bytes).await?;

    sqlx::query("UPDATE attachments SET photo_angle = ? WHERE id = ?")
        .bind(angle)
        .bind(&attachment.id)
        .execute(pool)
        .await?;

    if angle == "front" {
        set_headshot(pool, person_id, &attachment.id).await?;
    }

    attachments::get_attachment(pool, &attachment.id)
        .await?
        .ok_or(attachments::AttachmentError::Db(sqlx::Error::RowNotFound))
}

/// Empties one of a person's angle-photo slots. Clearing the front slot
/// also clears the single-headshot pointer, same as `set_photo` keeps it
/// in sync when that slot is filled.
pub async fn clear_photo(pool: &SqlitePool, person_id: &str, angle: &str) -> Result<(), attachments::AttachmentError> {
    if let Some(existing_id) = existing_photo_attachment_id(pool, person_id, angle).await? {
        attachments::delete_attachment(pool, &existing_id).await?;
    }
    if angle == "front" {
        clear_headshot(pool, person_id).await?;
    }
    Ok(())
}

/// The continuity view: everything the system already knows about a person,
/// composed from each domain's own `list_for_person` — nothing new is
/// indexed or duplicated, this just assembles what already exists so an
/// officer can understand a person once instead of re-searching every
/// domain by hand.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonProfile {
    pub person: Person,
    pub cases: Vec<Case>,
    pub incidents: Vec<Incident>,
    pub statements: Vec<Statement>,
    pub custody_records: Vec<CustodyRecord>,
    pub bonds: Vec<Bond>,
    pub station_diary_entries: Vec<StationDiaryEntry>,
    pub exhibits: Vec<Exhibit>,
    pub charge_sheets: Vec<ChargeSheet>,
    pub vehicles: Vec<Vehicle>,
    pub attachments: Vec<Attachment>,
}

pub async fn get_person_profile(pool: &SqlitePool, id: &str) -> Result<Option<PersonProfile>, sqlx::Error> {
    let Some(person) = get_person(pool, id).await? else {
        return Ok(None);
    };

    let cases = cases::list_for_person(pool, id).await?;
    let incidents = incidents::list_for_person(pool, id).await?;
    let statements = statements::list_for_person(pool, id).await?;
    let custody_records = custody::list_for_person(pool, id).await?;
    let bonds = bonds::list_for_person(pool, id).await?;
    let station_diary_entries = station_diary::list_for_person(pool, id).await?;
    let exhibits = exhibits::list_for_person(pool, id).await?;
    let charge_sheets = charge_sheets::list_for_person(pool, id).await?;
    let vehicles = vehicles::list_for_person(pool, id).await?;
    let attachments = attachments::list_attachments(pool, "person", id).await?;

    Ok(Some(PersonProfile {
        person,
        cases,
        incidents,
        statements,
        custody_records,
        bonds,
        station_diary_entries,
        exhibits,
        charge_sheets,
        vehicles,
        attachments,
    }))
}

/// Dev/test convenience only — inserts a handful of sample people the first
/// time the local database is empty. Compiled out of release builds entirely
/// via `#[cfg(debug_assertions)]` in db.rs, so it can never ship.
#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM people")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let samples = [
        ("Mungu", "Wasswa", Some("M."), Some("0772 445 190"), Some("CM9012345ABCDE"), Some("Ntinda, Kampala")),
        ("Deborah", "Wasswa", None, Some("0701 223 887"), Some("CF8823410XYZAB"), Some("Bugolobi, Kampala")),
        ("Wasswa", "Otema", Some("K."), Some("0782 991 004"), None, Some("Gulu Town")),
        ("S.", "Kigozi", None, None, Some("CM7712209QRSTU"), Some("Mukono")),
        ("Grace", "Nabirye", None, Some("0759 664 213"), Some("CF9034521LMNOP"), Some("Jinja Road, Kampala")),
    ];

    for (first_name, last_name, other_names, phone, national_id, address) in samples {
        create_person(
            pool,
            vault_root,
            CreatePersonInput {
                first_name: first_name.to_string(),
                last_name: last_name.to_string(),
                other_names: other_names.map(str::to_string),
                phone: phone.map(str::to_string),
                national_id: national_id.map(str::to_string),
                address: address.map(str::to_string),
            },
        )
        .await?;
    }

    Ok(())
}
