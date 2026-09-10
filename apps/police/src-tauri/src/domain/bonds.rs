use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// Field set mirrors the real, named PF18 "Release on Bond" form as closely
/// as docs/police/research/custody-and-bonds.md actually confirms — see
/// that file, topic 3. `officer_name`/`officer_rank` are plain fields, same
/// reasoning as duty::DutyAssignment and statements::Statement: no auth
/// yet, so "who granted it" can only be a denormalized name.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Bond {
    pub id: String,
    pub person_id: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
    pub custody_id: Option<String>,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub lock_up_serial_number: Option<String>,
    pub with_surety: bool,
    pub surety_name: Option<String>,
    pub surety_contact: Option<String>,
    pub reporting_schedule: Option<String>,
    pub officer_name: Option<String>,
    pub officer_rank: Option<String>,
    pub status: String,
    pub granted_at: i64,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBondInput {
    pub person_id: String,
    pub custody_id: Option<String>,
    pub case_id: Option<String>,
    pub lock_up_serial_number: Option<String>,
    pub with_surety: bool,
    pub surety_name: Option<String>,
    pub surety_contact: Option<String>,
    pub reporting_schedule: Option<String>,
    pub officer_name: Option<String>,
    pub officer_rank: Option<String>,
    pub status: String,
    pub granted_at: i64,
    pub notes: Option<String>,
}

pub(crate) async fn write_bond_markdown(pool: &SqlitePool, vault_root: &Path, record: &Bond) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "bond", &record.id).await {
        let title = format!("Bond: {} {}", record.person_first_name, record.person_last_name);
        if let Err(e) = markdown::write_record(&dir, &format!("bond-{}", record.id), &title, record) {
            log::warn!("failed to write bond markdown: {e}");
        }
    }
}

pub async fn create_bond(pool: &SqlitePool, vault_root: &Path, input: CreateBondInput) -> Result<Bond, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO bonds
            (id, person_id, custody_id, case_id, lock_up_serial_number, with_surety,
             surety_name, surety_contact, reporting_schedule, officer_name, officer_rank,
             status, granted_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.person_id)
    .bind(&input.custody_id)
    .bind(&input.case_id)
    .bind(&input.lock_up_serial_number)
    .bind(input.with_surety)
    .bind(&input.surety_name)
    .bind(&input.surety_contact)
    .bind(&input.reporting_schedule)
    .bind(&input.officer_name)
    .bind(&input.officer_rank)
    .bind(&input.status)
    .bind(input.granted_at)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_bond(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_bond_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_bond(pool: &SqlitePool, vault_root: &Path, id: &str, input: CreateBondInput) -> Result<Bond, sqlx::Error> {
    sqlx::query(
        "UPDATE bonds
         SET person_id = ?, custody_id = ?, case_id = ?, lock_up_serial_number = ?, with_surety = ?,
             surety_name = ?, surety_contact = ?, reporting_schedule = ?, officer_name = ?,
             officer_rank = ?, status = ?, granted_at = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.person_id)
    .bind(&input.custody_id)
    .bind(&input.case_id)
    .bind(&input.lock_up_serial_number)
    .bind(input.with_surety)
    .bind(&input.surety_name)
    .bind(&input.surety_contact)
    .bind(&input.reporting_schedule)
    .bind(&input.officer_name)
    .bind(&input.officer_rank)
    .bind(&input.status)
    .bind(input.granted_at)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_bond(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_bond_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_bonds(pool: &SqlitePool, query: &str) -> Result<Vec<Bond>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Bond>(
            "SELECT
                b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
                b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
                b.status, b.granted_at, b.notes, b.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names,
                c.reference AS case_reference
             FROM bonds b
             JOIN people p ON p.id = b.person_id
             LEFT JOIN cases c ON c.id = b.case_id
             ORDER BY b.granted_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Bond>(
        "SELECT
            b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
            b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
            b.status, b.granted_at, b.notes, b.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM bonds b
         JOIN people p ON p.id = b.person_id
         LEFT JOIN cases c ON c.id = b.case_id
         WHERE p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR b.surety_name LIKE ?1
         ORDER BY b.granted_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every bond, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Bond>, sqlx::Error> {
    sqlx::query_as::<_, Bond>(
        "SELECT
            b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
            b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
            b.status, b.granted_at, b.notes, b.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM bonds b
         JOIN people p ON p.id = b.person_id
         LEFT JOIN cases c ON c.id = b.case_id
         ORDER BY b.granted_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Bond>, sqlx::Error> {
    sqlx::query_as::<_, Bond>(
        "SELECT
            b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
            b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
            b.status, b.granted_at, b.notes, b.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM bonds b
         JOIN people p ON p.id = b.person_id
         LEFT JOIN cases c ON c.id = b.case_id
         WHERE b.person_id = ?
         ORDER BY b.granted_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Bond>, sqlx::Error> {
    sqlx::query_as::<_, Bond>(
        "SELECT
            b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
            b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
            b.status, b.granted_at, b.notes, b.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM bonds b
         JOIN people p ON p.id = b.person_id
         LEFT JOIN cases c ON c.id = b.case_id
         WHERE b.case_id = ?
         ORDER BY b.granted_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn get_bond(pool: &SqlitePool, id: &str) -> Result<Option<Bond>, sqlx::Error> {
    sqlx::query_as::<_, Bond>(
        "SELECT
            b.id, b.person_id, b.custody_id, b.case_id, b.lock_up_serial_number, b.with_surety,
            b.surety_name, b.surety_contact, b.reporting_schedule, b.officer_name, b.officer_rank,
            b.status, b.granted_at, b.notes, b.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM bonds b
         JOIN people p ON p.id = b.person_id
         LEFT JOIN cases c ON c.id = b.case_id
         WHERE b.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bonds").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let person_id: Option<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 1 OFFSET 1")
        .fetch_optional(pool)
        .await?;
    let Some(person_id) = person_id else { return Ok(()) };

    create_bond(
        pool,
        vault_root,
        CreateBondInput {
            person_id,
            custody_id: None,
            case_id: None,
            lock_up_serial_number: Some("LU-0231".to_string()),
            with_surety: true,
            surety_name: Some("Namuli, Grace".to_string()),
            surety_contact: Some("0772 118 402".to_string()),
            reporting_schedule: Some("Every Monday, 9am, to the OC CID".to_string()),
            officer_name: Some("Kabuye, R.".to_string()),
            officer_rank: Some("Sergeant".to_string()),
            status: "active".to_string(),
            granted_at: chrono::Utc::now().timestamp_millis(),
            notes: None,
        },
    )
    .await?;

    Ok(())
}
