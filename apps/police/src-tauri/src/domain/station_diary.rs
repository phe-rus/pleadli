use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown, registers};

#[cfg(debug_assertions)]
use super::seed_support::plain_text_to_rich_text_json;

/// The category list is the one already established in
/// docs/police/PRODUCT.md's Station Diary section — not invented here.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationDiaryEntry {
    pub id: String,
    pub category: String,
    pub content: String,
    pub person_id: Option<String>,
    pub person_first_name: Option<String>,
    pub person_last_name: Option<String>,
    pub person_other_names: Option<String>,
    /// Its place in the station's diary for the year: `entry_number` of
    /// `entry_year`, counted from 1 each year.
    pub entry_year: Option<i64>,
    pub entry_number: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStationDiaryEntryInput {
    pub category: String,
    pub content: String,
    pub person_id: Option<String>,
}

pub(crate) async fn write_entry_markdown(pool: &SqlitePool, vault_root: &Path, record: &StationDiaryEntry) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "station_diary_entry", &record.id).await {
        let title = format!("Station Diary: {}", record.category.replace('_', " "));
        if let Err(e) = markdown::write_record(&dir, &format!("station_diary_entry-{}", record.id), &title, record) {
            log::warn!("failed to write station diary entry markdown: {e}");
        }
    }
}

pub async fn create_entry(
    pool: &SqlitePool,
    vault_root: &Path,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    // The number is taken in the same transaction that writes the entry, so
    // a failed write gives it back.
    let mut tx = pool.begin().await?;
    let (number, year) = registers::take_next(&mut tx, registers::SD).await?;
    sqlx::query(
        "INSERT INTO station_diary_entries (id, category, content, person_id, entry_year, entry_number) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.category)
    .bind(&input.content)
    .bind(&input.person_id)
    .bind(year)
    .bind(number)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;

    let record = get_entry(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_entry_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_entry(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateStationDiaryEntryInput,
) -> Result<StationDiaryEntry, sqlx::Error> {
    sqlx::query("UPDATE station_diary_entries SET category = ?, content = ?, person_id = ? WHERE id = ?")
        .bind(&input.category)
        .bind(&input.content)
        .bind(&input.person_id)
        .bind(id)
        .execute(pool)
        .await?;

    let record = get_entry(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_entry_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_entries(pool: &SqlitePool, query: &str) -> Result<Vec<StationDiaryEntry>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, StationDiaryEntry>(
            "SELECT
                sd.id, sd.category, sd.content, sd.person_id, sd.created_at, sd.entry_year, sd.entry_number,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM station_diary_entries sd
             LEFT JOIN people p ON p.id = sd.person_id
             ORDER BY sd.created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at, sd.entry_year, sd.entry_number,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         WHERE sd.content LIKE ?1 OR sd.category LIKE ?1
         ORDER BY sd.created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every station diary entry, unfiltered and unlimited, for the bulk data
/// export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<StationDiaryEntry>, sqlx::Error> {
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at, sd.entry_year, sd.entry_number,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         ORDER BY sd.created_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<StationDiaryEntry>, sqlx::Error> {
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at, sd.entry_year, sd.entry_number,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         WHERE sd.person_id = ?
         ORDER BY sd.created_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn get_entry(pool: &SqlitePool, id: &str) -> Result<Option<StationDiaryEntry>, sqlx::Error> {
    sqlx::query_as::<_, StationDiaryEntry>(
        "SELECT
            sd.id, sd.category, sd.content, sd.person_id, sd.created_at, sd.entry_year, sd.entry_number,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_diary_entries sd
         LEFT JOIN people p ON p.id = sd.person_id
         WHERE sd.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// Dev/test convenience only, same as people::seed_if_empty — compiled out
/// of release builds entirely via #[cfg(debug_assertions)] in db.rs.
#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM station_diary_entries")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 2")
        .fetch_all(pool)
        .await?;
    let first_person = person_ids.first().cloned();
    let second_person = person_ids.get(1).cloned();

    let samples: [(&str, &str, Option<String>); 5] = [
        (
            "public_inquiry",
            "Woman came to the counter asking whether a lost national ID had been handed in. None on record.",
            None,
        ),
        (
            "lost_property",
            "Reported a lost phone near the taxi park, last seen around 6pm.",
            first_person.clone(),
        ),
        (
            "officer_movement",
            "Patrol team departed for Ntinda route, expected back by 22:00.",
            None,
        ),
        (
            "shift_handover",
            "Day shift handover: no outstanding issues at the counter, cell block quiet.",
            None,
        ),
        (
            "incident_report",
            "Neighbour dispute reported over a boundary wall, no injuries, advised to seek LC1 mediation first.",
            second_person.clone(),
        ),
    ];

    for (category, content, person_id) in samples {
        create_entry(
            pool,
            vault_root,
            CreateStationDiaryEntryInput {
                category: category.to_string(),
                content: plain_text_to_rich_text_json(content),
                person_id,
            },
        )
        .await?;
    }

    Ok(())
}
