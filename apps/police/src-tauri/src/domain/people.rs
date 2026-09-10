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
use super::{attachments, bonds, cases, charge_sheets, custody, exhibits, incidents, markdown, statements, station_diary};

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
async fn write_person_markdown(pool: &SqlitePool, vault_root: &Path, record: &Person) {
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

pub async fn get_person(pool: &SqlitePool, id: &str) -> Result<Option<Person>, sqlx::Error> {
    sqlx::query_as::<_, Person>("SELECT * FROM people WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
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
