use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// A shift. `officer_id` points at the officer on the station's books; the
/// name and rank are kept on the shift as they were when it was made, so an
/// old roster still reads correctly after an officer is renamed or promoted. A
/// shift for someone not on the books has no `officer_id` and just the name.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DutyAssignment {
    pub id: String,
    pub officer_id: Option<String>,
    pub officer_name: String,
    pub officer_rank: Option<String>,
    pub unit: Option<String>,
    pub shift_start: i64,
    pub shift_end: i64,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDutyAssignmentInput {
    #[serde(default)]
    pub officer_id: Option<String>,
    pub officer_name: String,
    pub officer_rank: Option<String>,
    pub unit: Option<String>,
    pub shift_start: i64,
    pub shift_end: i64,
    pub notes: Option<String>,
}

/// With an officer chosen, the name and rank on the shift come from the
/// officer's record, whatever the caller sent.
async fn resolve_officer(pool: &SqlitePool, input: &CreateDutyAssignmentInput) -> Result<(String, Option<String>), sqlx::Error> {
    if let Some(officer_id) = &input.officer_id {
        let row: Option<(String, Option<String>)> = sqlx::query_as("SELECT name, rank FROM officers WHERE id = ?")
            .bind(officer_id)
            .fetch_optional(pool)
            .await?;
        return row.ok_or(sqlx::Error::RowNotFound);
    }
    Ok((input.officer_name.trim().to_string(), input.officer_rank.clone()))
}

pub(crate) async fn write_assignment_markdown(pool: &SqlitePool, vault_root: &Path, record: &DutyAssignment) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "duty_assignment", &record.id).await {
        let title = format!("Duty: {}", record.officer_name);
        if let Err(e) = markdown::write_record(&dir, &format!("duty_assignment-{}", record.id), &title, record) {
            log::warn!("failed to write duty assignment markdown: {e}");
        }
    }
}

pub async fn create_assignment(
    pool: &SqlitePool,
    vault_root: &Path,
    input: CreateDutyAssignmentInput,
) -> Result<DutyAssignment, sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let (officer_name, officer_rank) = resolve_officer(pool, &input).await?;

    sqlx::query(
        "INSERT INTO duty_assignments (id, officer_id, officer_name, officer_rank, unit, shift_start, shift_end, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.officer_id)
    .bind(&officer_name)
    .bind(&officer_rank)
    .bind(&input.unit)
    .bind(input.shift_start)
    .bind(input.shift_end)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_assignment(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_assignment_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_assignment(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateDutyAssignmentInput,
) -> Result<DutyAssignment, sqlx::Error> {
    let (officer_name, officer_rank) = resolve_officer(pool, &input).await?;
    sqlx::query(
        "UPDATE duty_assignments
         SET officer_id = ?, officer_name = ?, officer_rank = ?, unit = ?, shift_start = ?, shift_end = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.officer_id)
    .bind(&officer_name)
    .bind(&officer_rank)
    .bind(&input.unit)
    .bind(input.shift_start)
    .bind(input.shift_end)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_assignment(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_assignment_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_assignments(pool: &SqlitePool, query: &str) -> Result<Vec<DutyAssignment>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, DutyAssignment>(
            "SELECT * FROM duty_assignments ORDER BY shift_start DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, DutyAssignment>(
        "SELECT * FROM duty_assignments
         WHERE officer_name LIKE ?1 OR unit LIKE ?1
         ORDER BY shift_start DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every duty assignment, unfiltered and unlimited, for the bulk data
/// export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<DutyAssignment>, sqlx::Error> {
    sqlx::query_as::<_, DutyAssignment>("SELECT * FROM duty_assignments ORDER BY shift_start ASC")
        .fetch_all(pool)
        .await
}

pub async fn get_assignment(pool: &SqlitePool, id: &str) -> Result<Option<DutyAssignment>, sqlx::Error> {
    sqlx::query_as::<_, DutyAssignment>("SELECT * FROM duty_assignments WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM duty_assignments")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp_millis();
    let hour_ms = 60 * 60 * 1000;

    let samples = [
        ("Namuli, S.", Some("Constable"), Some("Front Desk"), 0, 8, None),
        ("Okello, D.", Some("Corporal"), Some("Patrol"), 8, 16, Some("Covering the taxi park beat")),
        ("Kabuye, R.", Some("Sergeant"), Some("Cell Block"), 16, 24, None),
    ];

    for (officer_name, officer_rank, unit, start_hour, end_hour, notes) in samples {
        create_assignment(
            pool,
            vault_root,
            CreateDutyAssignmentInput {
                officer_id: None,
                officer_name: officer_name.to_string(),
                officer_rank: officer_rank.map(str::to_string),
                unit: unit.map(str::to_string),
                shift_start: now + start_hour * hour_ms,
                shift_end: now + end_hour * hour_ms,
                notes: notes.map(str::to_string),
            },
        )
        .await?;
    }

    Ok(())
}
