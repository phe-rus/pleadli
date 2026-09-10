use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// PF53 fields — see the migration's own comment for sourcing. Only what
/// nothing else in the system already owns lives here; everything else
/// (case reference, accused's name, related people/statements/evidence)
/// is read live through the join, never duplicated onto this row.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChargeSheet {
    pub id: String,
    pub case_id: String,
    pub case_reference: String,
    pub case_summary: String,
    pub accused_person_id: Option<String>,
    pub accused_first_name: Option<String>,
    pub accused_last_name: Option<String>,
    pub accused_other_names: Option<String>,
    pub offence: String,
    pub statutory_section: String,
    pub particulars: String,
    pub charged_at: i64,
    pub officer_name: Option<String>,
    pub station_name: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChargeSheetInput {
    pub case_id: String,
    pub accused_person_id: Option<String>,
    pub offence: String,
    pub statutory_section: String,
    pub particulars: String,
    pub charged_at: i64,
    pub officer_name: Option<String>,
    pub station_name: Option<String>,
}

async fn write_charge_sheet_markdown(pool: &SqlitePool, vault_root: &Path, record: &ChargeSheet) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "charge_sheet", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("charge_sheet-{}", record.id), &record.offence, record) {
            log::warn!("failed to write charge sheet markdown: {e}");
        }
    }
}

pub async fn create_charge_sheet(pool: &SqlitePool, vault_root: &Path, input: CreateChargeSheetInput) -> Result<ChargeSheet, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO charge_sheets
            (id, case_id, accused_person_id, offence, statutory_section, particulars, charged_at,
             officer_name, station_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.case_id)
    .bind(&input.accused_person_id)
    .bind(&input.offence)
    .bind(&input.statutory_section)
    .bind(&input.particulars)
    .bind(input.charged_at)
    .bind(&input.officer_name)
    .bind(&input.station_name)
    .execute(pool)
    .await?;

    let record = get_charge_sheet(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_charge_sheet_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_charge_sheet(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateChargeSheetInput,
) -> Result<ChargeSheet, sqlx::Error> {
    sqlx::query(
        "UPDATE charge_sheets
         SET case_id = ?, accused_person_id = ?, offence = ?, statutory_section = ?, particulars = ?,
             charged_at = ?, officer_name = ?, station_name = ?
         WHERE id = ?",
    )
    .bind(&input.case_id)
    .bind(&input.accused_person_id)
    .bind(&input.offence)
    .bind(&input.statutory_section)
    .bind(&input.particulars)
    .bind(input.charged_at)
    .bind(&input.officer_name)
    .bind(&input.station_name)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_charge_sheet(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_charge_sheet_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_charge_sheets(pool: &SqlitePool, query: &str) -> Result<Vec<ChargeSheet>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, ChargeSheet>(
            "SELECT
                cs.id, cs.case_id, cs.accused_person_id, cs.offence, cs.statutory_section, cs.particulars,
                cs.charged_at, cs.officer_name, cs.station_name, cs.created_at,
                c.reference AS case_reference,
                c.summary AS case_summary,
                p.first_name AS accused_first_name,
                p.last_name AS accused_last_name,
                p.other_names AS accused_other_names
             FROM charge_sheets cs
             JOIN cases c ON c.id = cs.case_id
             LEFT JOIN people p ON p.id = cs.accused_person_id
             ORDER BY cs.charged_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, ChargeSheet>(
        "SELECT
            cs.id, cs.case_id, cs.accused_person_id, cs.offence, cs.statutory_section, cs.particulars,
            cs.charged_at, cs.officer_name, cs.station_name, cs.created_at,
            c.reference AS case_reference,
            c.summary AS case_summary,
            p.first_name AS accused_first_name,
            p.last_name AS accused_last_name,
            p.other_names AS accused_other_names
         FROM charge_sheets cs
         JOIN cases c ON c.id = cs.case_id
         LEFT JOIN people p ON p.id = cs.accused_person_id
         WHERE cs.offence LIKE ?1 OR c.reference LIKE ?1 OR p.first_name LIKE ?1 OR p.last_name LIKE ?1
         ORDER BY cs.charged_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn get_charge_sheet(pool: &SqlitePool, id: &str) -> Result<Option<ChargeSheet>, sqlx::Error> {
    sqlx::query_as::<_, ChargeSheet>(
        "SELECT
            cs.id, cs.case_id, cs.accused_person_id, cs.offence, cs.statutory_section, cs.particulars,
            cs.charged_at, cs.officer_name, cs.station_name, cs.created_at,
            c.reference AS case_reference,
            c.summary AS case_summary,
            p.first_name AS accused_first_name,
            p.last_name AS accused_last_name,
            p.other_names AS accused_other_names
         FROM charge_sheets cs
         JOIN cases c ON c.id = cs.case_id
         LEFT JOIN people p ON p.id = cs.accused_person_id
         WHERE cs.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_case(pool: &SqlitePool, case_id: &str) -> Result<Vec<ChargeSheet>, sqlx::Error> {
    sqlx::query_as::<_, ChargeSheet>(
        "SELECT
            cs.id, cs.case_id, cs.accused_person_id, cs.offence, cs.statutory_section, cs.particulars,
            cs.charged_at, cs.officer_name, cs.station_name, cs.created_at,
            c.reference AS case_reference,
            c.summary AS case_summary,
            p.first_name AS accused_first_name,
            p.last_name AS accused_last_name,
            p.other_names AS accused_other_names
         FROM charge_sheets cs
         JOIN cases c ON c.id = cs.case_id
         LEFT JOIN people p ON p.id = cs.accused_person_id
         WHERE cs.case_id = ?
         ORDER BY cs.charged_at DESC",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<ChargeSheet>, sqlx::Error> {
    sqlx::query_as::<_, ChargeSheet>(
        "SELECT
            cs.id, cs.case_id, cs.accused_person_id, cs.offence, cs.statutory_section, cs.particulars,
            cs.charged_at, cs.officer_name, cs.station_name, cs.created_at,
            c.reference AS case_reference,
            c.summary AS case_summary,
            p.first_name AS accused_first_name,
            p.last_name AS accused_last_name,
            p.other_names AS accused_other_names
         FROM charge_sheets cs
         JOIN cases c ON c.id = cs.case_id
         LEFT JOIN people p ON p.id = cs.accused_person_id
         WHERE cs.accused_person_id = ?
         ORDER BY cs.charged_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM charge_sheets").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let case_id: Option<String> = sqlx::query_scalar("SELECT id FROM cases ORDER BY created_at LIMIT 1")
        .fetch_optional(pool)
        .await?;
    let Some(case_id) = case_id else { return Ok(()) };

    let accused_person_id: Option<String> = sqlx::query_scalar(
        "SELECT person_id FROM case_people WHERE case_id = ? AND role IN ('accused', 'suspect') LIMIT 1",
    )
    .bind(&case_id)
    .fetch_optional(pool)
    .await?;

    create_charge_sheet(
        pool,
        vault_root,
        CreateChargeSheetInput {
            case_id,
            accused_person_id,
            offence: "Theft".to_string(),
            statutory_section: "s.254, Penal Code Act (Cap 128)".to_string(),
            particulars: "On the night of the reported break-in, at the Kampala Road retail shop, stole a cash register and its contents, the property of the complainant.".to_string(),
            charged_at: chrono::Utc::now().timestamp_millis(),
            officer_name: Some("Namuli, S.".to_string()),
            station_name: Some("Central Police Station".to_string()),
        },
    )
    .await?;

    Ok(())
}
