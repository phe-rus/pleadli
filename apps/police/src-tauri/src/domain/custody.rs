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
    pub legal_access: Option<String>,
    pub legal_name: Option<String>,
    pub legal_requested_at: Option<i64>,
    pub legal_note: Option<String>,
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
    #[serde(default)]
    pub legal_access: Option<String>,
    #[serde(default)]
    pub legal_name: Option<String>,
    #[serde(default)]
    pub legal_requested_at: Option<i64>,
    #[serde(default)]
    pub legal_note: Option<String>,
}

pub const LEGAL_ACCESS: [&str; 5] = ["own_advocate", "legal_aid", "duty_counsel", "declined", "not_yet_asked"];

/// Who the person asked for is a record, so it must be one of the known answers, and a named lawyer or body needs a name.
pub fn check_legal_access(input: &CreateCustodyRecordInput) -> Result<(), String> {
    let Some(kind) = input.legal_access.as_deref() else { return Ok(()) };
    if !LEGAL_ACCESS.contains(&kind) {
        return Err("That is not a way a person in custody can reach a lawyer.".into());
    }
    let named = input.legal_name.as_deref().map(str::trim).is_some_and(|n| !n.is_empty());
    if matches!(kind, "own_advocate" | "legal_aid" | "duty_counsel") && !named {
        return Err("Write down who the lawyer or the legal aid body is.".into());
    }
    Ok(())
}

pub(crate) async fn write_custody_markdown(pool: &SqlitePool, vault_root: &Path, record: &CustodyRecord) {
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
             cross_jurisdiction_transfer, transferred_at, status, released_at, notes,
             legal_access, legal_name, legal_requested_at, legal_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(&input.legal_access)
    .bind(&input.legal_name)
    .bind(input.legal_requested_at)
    .bind(&input.legal_note)
    .execute(pool)
    .await?;

    if let Some(case_id) = &input.case_id {
        super::cases::ensure_case_person(pool, case_id, &input.person_id, "suspect").await?;
    }
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
             cross_jurisdiction_transfer = ?, transferred_at = ?, status = ?, released_at = ?, notes = ?,
             legal_access = ?, legal_name = ?, legal_requested_at = ?, legal_note = ?
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
    .bind(&input.legal_access)
    .bind(&input.legal_name)
    .bind(input.legal_requested_at)
    .bind(&input.legal_note)
    .bind(id)
    .execute(pool)
    .await?;

    if let Some(case_id) = &input.case_id {
        super::cases::ensure_case_person(pool, case_id, &input.person_id, "suspect").await?;
    }
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
                cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
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
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
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

/// Every custody record, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<CustodyRecord>, sqlx::Error> {
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         ORDER BY cr.arrested_at ASC",
    )
    .fetch_all(pool)
    .await
}


#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustodyAlert {
    pub id: String,
    pub person_name: String,
    pub hours_remaining: f64,
    pub is_overdue: bool,
    pub basis: &'static str,
}

/// In-custody records approaching or past their compliance deadline:
/// the only custody information the restricted remote API exposes.
/// Deliberately returns just enough to alert on, never the full record
/// (no case reference, no arrest location, no notes).
pub async fn list_alerts(pool: &SqlitePool) -> Result<Vec<CustodyAlert>, sqlx::Error> {
    let records = sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names,
            c.reference AS case_reference
         FROM custody_records cr
         JOIN people p ON p.id = cr.person_id
         LEFT JOIN cases c ON c.id = cr.case_id
         WHERE cr.status = 'in_custody'",
    )
    .fetch_all(pool)
    .await?;

    let now_ms = chrono::Utc::now().timestamp_millis();
    let limits = super::attention::custody_limits(pool).await;
    Ok(records
        .into_iter()
        .filter_map(|record| {
            let (deadline, basis) = super::attention::custody_deadline(limits, record.arrested_at, record.cross_jurisdiction_transfer, record.transferred_at);
            let hours_remaining = super::attention::hours_remaining(deadline, now_ms);
            let is_overdue = hours_remaining < 0.0;
            if !is_overdue && hours_remaining > super::attention::DUE_SOON_HOURS {
                return None;
            }
            Some(CustodyAlert {
                id: record.id,
                person_name: [record.person_last_name, record.person_first_name]
                    .into_iter()
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>()
                    .join(", "),
                hours_remaining,
                is_overdue,
                basis,
            })
        })
        .collect())
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<CustodyRecord>, sqlx::Error> {
    sqlx::query_as::<_, CustodyRecord>(
        "SELECT
            cr.id, cr.person_id, cr.incident_id, cr.case_id, cr.arrested_at, cr.location,
            cr.cross_jurisdiction_transfer, cr.transferred_at, cr.status, cr.released_at,
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
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
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
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
            cr.notes, cr.legal_access, cr.legal_name, cr.legal_requested_at, cr.legal_note, cr.created_at,
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
            legal_access: None,
            legal_name: None,
            legal_requested_at: None,
            legal_note: None,
        },
    )
    .await?;

    Ok(())
}

#[cfg(test)]
mod legal_access_tests {
    use super::*;

    fn input(kind: Option<&str>, name: Option<&str>) -> CreateCustodyRecordInput {
        CreateCustodyRecordInput {
            person_id: "p".into(),
            incident_id: None,
            case_id: None,
            arrested_at: 0,
            location: None,
            cross_jurisdiction_transfer: false,
            transferred_at: None,
            status: "in_custody".into(),
            released_at: None,
            notes: None,
            legal_access: kind.map(str::to_string),
            legal_name: name.map(str::to_string),
            legal_requested_at: None,
            legal_note: None,
        }
    }

    #[test]
    fn who_the_person_asked_for_is_a_known_answer_and_a_lawyer_has_a_name() {
        assert!(check_legal_access(&input(None, None)).is_ok(), "not recorded is allowed");
        assert!(check_legal_access(&input(Some("declined"), None)).is_ok());
        assert!(check_legal_access(&input(Some("not_yet_asked"), None)).is_ok());
        assert!(check_legal_access(&input(Some("own_advocate"), Some("Adv. Nabirye"))).is_ok());
        assert!(check_legal_access(&input(Some("own_advocate"), None)).is_err(), "a lawyer needs a name");
        assert!(check_legal_access(&input(Some("legal_aid"), Some("  "))).is_err());
        assert!(check_legal_access(&input(Some("magic"), Some("x"))).is_err());
    }
}
