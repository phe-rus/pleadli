use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::officers::{self, Officer};
use super::{attachments, markdown};

#[derive(Debug)]
pub enum CheckInError {
    Db(sqlx::Error),
    OfficerNotFound,
}

impl From<sqlx::Error> for CheckInError {
    fn from(e: sqlx::Error) -> Self {
        CheckInError::Db(e)
    }
}

impl std::fmt::Display for CheckInError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CheckInError::Db(e) => write!(f, "{e}"),
            CheckInError::OfficerNotFound => write!(f, "no officer with that badge number"),
        }
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OfficerCheckIn {
    pub id: String,
    pub officer_id: String,
    pub officer_name: String,
    /// `badge_entry` (typed at the desk) or `remote_scan` (an officer's
    /// own phone, already authenticated via the existing badge+password
    /// remote login — see transport::remote_server's `/check-in`).
    pub method: String,
    pub checked_in_at: i64,
    pub created_at: i64,
}

pub(crate) async fn write_check_in_markdown(pool: &SqlitePool, vault_root: &Path, record: &OfficerCheckIn) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "officer_check_in", &record.id).await {
        let title = format!("Check-in: {}", record.officer_name);
        if let Err(e) = markdown::write_record(&dir, &format!("officer_check_in-{}", record.id), &title, record) {
            log::warn!("failed to write check-in markdown: {e}");
        }
    }
}

/// The one write path both check-in methods funnel through, `method`
/// being the only thing that differs between them.
async fn check_in_officer(
    pool: &SqlitePool,
    vault_root: &Path,
    officer: &Officer,
    method: &str,
) -> Result<OfficerCheckIn, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query("INSERT INTO officer_check_ins (id, officer_id, method, checked_in_at) VALUES (?, ?, ?, ?)")
        .bind(&id)
        .bind(&officer.id)
        .bind(method)
        .bind(now)
        .execute(pool)
        .await?;

    let record = get_check_in(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_check_in_markdown(pool, vault_root, &record).await;
    Ok(record)
}

/// Badge-entry check-in: whoever's at the front desk types the arriving
/// officer's badge number — one round trip, no picker needed for the
/// common case.
pub async fn check_in_by_badge(
    pool: &SqlitePool,
    vault_root: &Path,
    badge_number: &str,
) -> Result<OfficerCheckIn, CheckInError> {
    let officer = officers::get_officer_by_badge(pool, badge_number).await?.ok_or(CheckInError::OfficerNotFound)?;
    Ok(check_in_officer(pool, vault_root, &officer, "badge_entry").await?)
}

/// Remote-scan check-in: the officer is already authenticated (their
/// phone holds a valid session token) — this just records that they
/// confirmed arrival.
pub async fn check_in_remote(
    pool: &SqlitePool,
    vault_root: &Path,
    officer: &Officer,
) -> Result<OfficerCheckIn, sqlx::Error> {
    check_in_officer(pool, vault_root, officer, "remote_scan").await
}

pub async fn get_check_in(pool: &SqlitePool, id: &str) -> Result<Option<OfficerCheckIn>, sqlx::Error> {
    sqlx::query_as::<_, OfficerCheckIn>(
        "SELECT c.id, c.officer_id, o.name AS officer_name, c.method, c.checked_in_at, c.created_at
         FROM officer_check_ins c
         JOIN officers o ON o.id = c.officer_id
         WHERE c.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_check_ins(pool: &SqlitePool, query: &str) -> Result<Vec<OfficerCheckIn>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, OfficerCheckIn>(
            "SELECT c.id, c.officer_id, o.name AS officer_name, c.method, c.checked_in_at, c.created_at
             FROM officer_check_ins c
             JOIN officers o ON o.id = c.officer_id
             ORDER BY c.checked_in_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, OfficerCheckIn>(
        "SELECT c.id, c.officer_id, o.name AS officer_name, c.method, c.checked_in_at, c.created_at
         FROM officer_check_ins c
         JOIN officers o ON o.id = c.officer_id
         WHERE o.name LIKE ?1
         ORDER BY c.checked_in_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every check-in, unfiltered and unlimited, for the bulk data export.
pub async fn list_all_check_ins(pool: &SqlitePool) -> Result<Vec<OfficerCheckIn>, sqlx::Error> {
    sqlx::query_as::<_, OfficerCheckIn>(
        "SELECT c.id, c.officer_id, o.name AS officer_name, c.method, c.checked_in_at, c.created_at
         FROM officer_check_ins c
         JOIN officers o ON o.id = c.officer_id
         ORDER BY c.checked_in_at ASC",
    )
    .fetch_all(pool)
    .await
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ShiftHandover {
    pub id: String,
    pub outgoing_officer_id: Option<String>,
    pub outgoing_officer_name: Option<String>,
    pub incoming_officer_id: String,
    pub incoming_officer_name: String,
    pub unit: Option<String>,
    pub notes: Option<String>,
    pub handed_over_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShiftHandoverInput {
    pub outgoing_officer_id: Option<String>,
    pub incoming_officer_id: String,
    pub unit: Option<String>,
    pub notes: Option<String>,
    pub handed_over_at: i64,
}

pub(crate) async fn write_handover_markdown(pool: &SqlitePool, vault_root: &Path, record: &ShiftHandover) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "shift_handover", &record.id).await {
        let title = format!("Handover to {}", record.incoming_officer_name);
        if let Err(e) = markdown::write_record(&dir, &format!("shift_handover-{}", record.id), &title, record) {
            log::warn!("failed to write shift handover markdown: {e}");
        }
    }
}

pub async fn create_handover(
    pool: &SqlitePool,
    vault_root: &Path,
    input: CreateShiftHandoverInput,
) -> Result<ShiftHandover, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO shift_handovers (id, outgoing_officer_id, incoming_officer_id, unit, notes, handed_over_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.outgoing_officer_id)
    .bind(&input.incoming_officer_id)
    .bind(&input.unit)
    .bind(&input.notes)
    .bind(input.handed_over_at)
    .execute(pool)
    .await?;

    let record = get_handover(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_handover_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn get_handover(pool: &SqlitePool, id: &str) -> Result<Option<ShiftHandover>, sqlx::Error> {
    sqlx::query_as::<_, ShiftHandover>(
        "SELECT
            h.id, h.outgoing_officer_id, out_o.name AS outgoing_officer_name,
            h.incoming_officer_id, in_o.name AS incoming_officer_name,
            h.unit, h.notes, h.handed_over_at, h.created_at
         FROM shift_handovers h
         LEFT JOIN officers out_o ON out_o.id = h.outgoing_officer_id
         JOIN officers in_o ON in_o.id = h.incoming_officer_id
         WHERE h.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_handovers(pool: &SqlitePool, query: &str) -> Result<Vec<ShiftHandover>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, ShiftHandover>(
            "SELECT
                h.id, h.outgoing_officer_id, out_o.name AS outgoing_officer_name,
                h.incoming_officer_id, in_o.name AS incoming_officer_name,
                h.unit, h.notes, h.handed_over_at, h.created_at
             FROM shift_handovers h
             LEFT JOIN officers out_o ON out_o.id = h.outgoing_officer_id
             JOIN officers in_o ON in_o.id = h.incoming_officer_id
             ORDER BY h.handed_over_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, ShiftHandover>(
        "SELECT
            h.id, h.outgoing_officer_id, out_o.name AS outgoing_officer_name,
            h.incoming_officer_id, in_o.name AS incoming_officer_name,
            h.unit, h.notes, h.handed_over_at, h.created_at
         FROM shift_handovers h
         LEFT JOIN officers out_o ON out_o.id = h.outgoing_officer_id
         JOIN officers in_o ON in_o.id = h.incoming_officer_id
         WHERE in_o.name LIKE ?1 OR out_o.name LIKE ?1 OR h.unit LIKE ?1
         ORDER BY h.handed_over_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every handover, unfiltered and unlimited, for the bulk data export.
pub async fn list_all_handovers(pool: &SqlitePool) -> Result<Vec<ShiftHandover>, sqlx::Error> {
    sqlx::query_as::<_, ShiftHandover>(
        "SELECT
            h.id, h.outgoing_officer_id, out_o.name AS outgoing_officer_name,
            h.incoming_officer_id, in_o.name AS incoming_officer_name,
            h.unit, h.notes, h.handed_over_at, h.created_at
         FROM shift_handovers h
         LEFT JOIN officers out_o ON out_o.id = h.outgoing_officer_id
         JOIN officers in_o ON in_o.id = h.incoming_officer_id
         ORDER BY h.handed_over_at ASC",
    )
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let check_in_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officer_check_ins").fetch_one(pool).await?;
    let handover_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM shift_handovers").fetch_one(pool).await?;
    if check_in_count > 0 || handover_count > 0 {
        return Ok(());
    }

    let officer_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM officers ORDER BY name LIMIT 2").fetch_all(pool).await?;
    let (Some(first), second) = (officer_ids.first().cloned(), officer_ids.get(1).cloned()) else {
        return Ok(());
    };

    if let Some(officer) = officers::get_officer(pool, &first).await? {
        check_in_officer(pool, vault_root, &officer, "badge_entry").await?;
    }

    if let Some(incoming) = second {
        create_handover(
            pool,
            vault_root,
            CreateShiftHandoverInput {
                outgoing_officer_id: Some(first),
                incoming_officer_id: incoming,
                unit: Some("Front Desk".to_string()),
                notes: Some("Quiet shift. One walk-in inquiry, no incidents.".to_string()),
                handed_over_at: chrono::Utc::now().timestamp_millis(),
            },
        )
        .await?;
    }

    Ok(())
}
