use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// Every field here is grounded in
/// docs/police/research/custody-and-bonds.md — see that file's confidence
/// tables before changing this shape. `status` is exactly the five decision
/// points the research verified against the Police Act; 48-hour compliance
/// is deliberately NOT a column here — it's derived from `arrested_at` (and
/// the cross-jurisdiction fields) on the frontend, never a maintained flag
/// that could drift from the actual timestamps.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CustodyRecord {
    pub id: String,
    pub person_id: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
    pub incident_id: Option<String>,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub arrested_at: i64,
    pub location: Option<String>,
    pub cross_jurisdiction_transfer: bool,
    pub transferred_at: Option<i64>,
    pub status: String,
    pub released_at: Option<i64>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustodyRecordInput {
    pub person_id: String,
    pub incident_id: Option<String>,
    pub case_id: Option<String>,
    pub arrested_at: i64,
    pub location: Option<String>,
    pub cross_jurisdiction_transfer: bool,
    pub transferred_at: Option<i64>,
    pub status: String,
    pub released_at: Option<i64>,
    pub notes: Option<String>,
}

async fn write_custody_markdown(pool: &SqlitePool, vault_root: &Path, record: &CustodyRecord) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "custody_record", &record.id).await {
        let title = format!("Custody record: {} {}", record.person_first_name, record.person_last_name);
        if let Err(e) = markdown::write_record(&dir, &format!("custody_record-{}", record.id), &title, record) {
            log::warn!("failed to write custody record markdown: {e}");
        }
    }
}

pub async fn create_record(
    pool: &SqlitePool,
    vault_root: &Path,
    input: CreateCustodyRecordInput,
) -> Result<CustodyRecord, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO custody_records
            (id, person_id, incident_id, case_id, arrested_at, location,
             cross_jurisdiction_transfer, transferred_at, status, released_at, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.person_id)
    .bind(&input.incident_id)
    .bind(&input.case_id)
    .bind(input.arrested_at)
    .bind(&input.location)
    .bind(input.cross_jurisdiction_transfer)
    .bind(input.transferred_at)
    .bind(&input.status)
    .bind(input.released_at)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_record(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_custody_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_record(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateCustodyRecordInput,
) -> Result<CustodyRecord, sqlx::Error> {
    sqlx::query(
        "UPDATE custody_records
         SET person_id = ?, incident_id = ?, case_id = ?, arrested_at = ?, location = ?,
             cross_jurisdiction_transfer = ?, transferred_at = ?, status = ?, released_at = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.person_id)
    .bind(&input.incident_id)
    .bind(&input.case_id)
    .bind(input.arrested_at)
    .bind(&input.location)
    .bind(input.cross_jurisdiction_transfer)
    .bind(input.transferred_at)
    .bind(&input.status)
    .bind(input.released_at)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_record(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_custody_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_records(pool: &SqlitePool, query: &str) -> Result<Vec<CustodyRecord>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, CustodyRecord>(
            "SELECT
                cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
                cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
                cr.notes, cr.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names,
                c.reference AS case_reference
             FROM custody_records cr
             JOIN people p ON p.id = cr.person_id
             LEFT JOIN cases c ON c.id = cr.case_id
             ORDER BY cr.arrested_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         WHERE p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR cr.location LIKE ?1
         ORDER BY cr.arrested_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<CustodyRecord>, sqlx::Error> {
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         WHERE cr.person_id = ?
         ORDER BY cr.arrested_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<CustodyRecord>, sqlx::Error> {
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         WHERE cr.case_id = ?
         ORDER BY cr.arrested_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn get_record(pool: &SqlitePool, id: &str) -> Result<Option<CustodyRecord>, sqlx::Error> {
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         WHERE cr.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM custody_records")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_id: Option<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;
    let Some(person_id) = person_id else { return Ok(()) };

    let now = chrono::Utc::now().timestamp_millis();

    create_record(
        pool,
        vault_root,
        CreateCustodyRecordInput {
            person_id,
            incident_id: None,
            case_id: None,
            arrested_at: now - 40 * 60 * 60 * 1000, // 40h ago — nearing the 48h mark
            location: Some("Central Police Station".to_string()),
            cross_jurisdiction_transfer: false,
            transferred_at: None,
            status: "in_custody".to_string(),
            released_at: None,
            notes: None,
        },
    )
    .await?;

    Ok(())
}
