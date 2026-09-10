use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// Field set grounded in docs/police/PRODUCT.md's audit (§G.2) — see the
/// migration's own comment for the sourcing. `status` is deliberately
/// minimal (in_storage / released / disposed): the obvious record-lifecycle
/// states, not an invented legal procedure, same reasoning already applied
/// to Bond's status field.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Exhibit {
    pub id: String,
    pub case_id: Option<String>,
    pub case_reference: Option<String>,
    pub incident_id: Option<String>,
    pub person_id: Option<String>,
    pub person_first_name: Option<String>,
    pub person_last_name: Option<String>,
    pub person_other_names: Option<String>,
    pub description: String,
    pub identification_mark: Option<String>,
    pub recovered_at: i64,
    pub recovered_from_location: Option<String>,
    pub handed_over_by: Option<String>,
    pub witnesses: Option<String>,
    pub receiving_officer_name: Option<String>,
    pub storage_location: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExhibitInput {
    pub case_id: Option<String>,
    pub incident_id: Option<String>,
    pub person_id: Option<String>,
    pub description: String,
    pub identification_mark: Option<String>,
    pub recovered_at: i64,
    pub recovered_from_location: Option<String>,
    pub handed_over_by: Option<String>,
    pub witnesses: Option<String>,
    pub receiving_officer_name: Option<String>,
    pub storage_location: Option<String>,
    pub status: String,
    pub notes: Option<String>,
}

/// One movement event — the record IS the chain of custody, never edited
/// after the fact.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ExhibitMovement {
    pub id: String,
    pub exhibit_id: String,
    pub moved_at: i64,
    pub location: String,
    pub custodian_name: Option<String>,
    pub reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateExhibitMovementInput {
    pub moved_at: i64,
    pub location: String,
    pub custodian_name: Option<String>,
    pub reason: Option<String>,
}

pub(crate) async fn write_exhibit_markdown(pool: &SqlitePool, vault_root: &Path, record: &Exhibit) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "exhibit", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("exhibit-{}", record.id), &record.description, record) {
            log::warn!("failed to write exhibit markdown: {e}");
        }
    }
}

pub async fn create_exhibit(pool: &SqlitePool, vault_root: &Path, input: CreateExhibitInput) -> Result<Exhibit, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO exhibits
            (id, case_id, incident_id, person_id, description, identification_mark, recovered_at,
             recovered_from_location, handed_over_by, witnesses, receiving_officer_name,
             storage_location, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.case_id)
    .bind(&input.incident_id)
    .bind(&input.person_id)
    .bind(&input.description)
    .bind(&input.identification_mark)
    .bind(input.recovered_at)
    .bind(&input.recovered_from_location)
    .bind(&input.handed_over_by)
    .bind(&input.witnesses)
    .bind(&input.receiving_officer_name)
    .bind(&input.storage_location)
    .bind(&input.status)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_exhibit(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_exhibit_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_exhibit(pool: &SqlitePool, vault_root: &Path, id: &str, input: CreateExhibitInput) -> Result<Exhibit, sqlx::Error> {
    sqlx::query(
        "UPDATE exhibits
         SET case_id = ?, incident_id = ?, person_id = ?, description = ?, identification_mark = ?,
             recovered_at = ?, recovered_from_location = ?, handed_over_by = ?, witnesses = ?,
             receiving_officer_name = ?, storage_location = ?, status = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.case_id)
    .bind(&input.incident_id)
    .bind(&input.person_id)
    .bind(&input.description)
    .bind(&input.identification_mark)
    .bind(input.recovered_at)
    .bind(&input.recovered_from_location)
    .bind(&input.handed_over_by)
    .bind(&input.witnesses)
    .bind(&input.receiving_officer_name)
    .bind(&input.storage_location)
    .bind(&input.status)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_exhibit(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_exhibit_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_exhibits(pool: &SqlitePool, query: &str) -> Result<Vec<Exhibit>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Exhibit>(
            "SELECT
                e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
                e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
                e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
                c.reference AS case_reference,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM exhibits e
             LEFT JOIN cases c ON c.id = e.case_id
             LEFT JOIN people p ON p.id = e.person_id
             ORDER BY e.recovered_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Exhibit>(
        "SELECT
            e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
            e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
            e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
            c.reference AS case_reference,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM exhibits e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN people p ON p.id = e.person_id
         WHERE e.description LIKE ?1 OR e.identification_mark LIKE ?1 OR e.storage_location LIKE ?1
         ORDER BY e.recovered_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every exhibit, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Exhibit>, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(
        "SELECT
            e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
            e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
            e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
            c.reference AS case_reference,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM exhibits e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN people p ON p.id = e.person_id
         ORDER BY e.recovered_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_exhibit(pool: &SqlitePool, id: &str) -> Result<Option<Exhibit>, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(
        "SELECT
            e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
            e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
            e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
            c.reference AS case_reference,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM exhibits e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN people p ON p.id = e.person_id
         WHERE e.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Exhibit>, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(
        "SELECT
            e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
            e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
            e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
            c.reference AS case_reference,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM exhibits e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN people p ON p.id = e.person_id
         WHERE e.person_id = ?
         ORDER BY e.recovered_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<Exhibit>, sqlx::Error> {
    sqlx::query_as::<_, Exhibit>(
        "SELECT
            e.id, e.case_id, e.incident_id, e.person_id, e.description, e.identification_mark,
            e.recovered_at, e.recovered_from_location, e.handed_over_by, e.witnesses,
            e.receiving_officer_name, e.storage_location, e.status, e.notes, e.created_at,
            c.reference AS case_reference,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM exhibits e
         LEFT JOIN cases c ON c.id = e.case_id
         LEFT JOIN people p ON p.id = e.person_id
         WHERE e.case_id = ?
         ORDER BY e.recovered_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn create_movement(
    pool: &SqlitePool,
    exhibit_id: &str,
    input: CreateExhibitMovementInput,
) -> Result<ExhibitMovement, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO exhibit_movements (id, exhibit_id, moved_at, location, custodian_name, reason)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(exhibit_id)
    .bind(input.moved_at)
    .bind(&input.location)
    .bind(&input.custodian_name)
    .bind(&input.reason)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, ExhibitMovement>("SELECT * FROM exhibit_movements WHERE id = ?")
        .bind(&id)
        .fetch_optional(pool)
        .await?
        .ok_or(sqlx::Error::RowNotFound)
}

pub async fn list_movements(pool: &SqlitePool, exhibit_id: &str) -> Result<Vec<ExhibitMovement>, sqlx::Error> {
    sqlx::query_as::<_, ExhibitMovement>(
        "SELECT * FROM exhibit_movements WHERE exhibit_id = ? ORDER BY moved_at DESC",
    )
    .bind(exhibit_id)
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exhibits").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let case_id: Option<String> = sqlx::query_scalar("SELECT id FROM cases ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;
    let person_id: Option<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 1 OFFSET 1")
        .fetch_optional(pool)
        .await?;

    let exhibit = create_exhibit(
        pool,
        vault_root,
        CreateExhibitInput {
            case_id,
            incident_id: None,
            person_id,
            description: "Claw hammer, wooden handle, suspected break-in tool".to_string(),
            identification_mark: Some("EX-2026-0001".to_string()),
            recovered_at: chrono::Utc::now().timestamp_millis() - 20 * 60 * 60 * 1000,
            recovered_from_location: Some("Rear entrance, Kampala Road retail shop".to_string()),
            handed_over_by: Some("Shop owner (complainant)".to_string()),
            witnesses: Some("Neighbouring shopkeeper".to_string()),
            receiving_officer_name: Some("Namuli, S.".to_string()),
            storage_location: Some("Exhibit store, Central Police Station".to_string()),
            status: "in_storage".to_string(),
            notes: None,
        },
    )
    .await?;

    create_movement(
        pool,
        &exhibit.id,
        CreateExhibitMovementInput {
            moved_at: chrono::Utc::now().timestamp_millis() - 18 * 60 * 60 * 1000,
            location: "Exhibit store, Central Police Station".to_string(),
            custodian_name: Some("Namuli, S.".to_string()),
            reason: Some("Initial logging".to_string()),
        },
    )
    .await?;

    Ok(())
}
