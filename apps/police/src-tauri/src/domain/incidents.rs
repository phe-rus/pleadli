use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

#[cfg(debug_assertions)]
use super::seed_support::plain_text_to_rich_text_json;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Incident {
    pub id: String,
    pub summary: String,
    pub description: String,
    pub location: Option<String>,
    pub occurred_at: i64,
    pub person_id: Option<String>,
    pub person_first_name: Option<String>,
    pub person_last_name: Option<String>,
    pub person_other_names: Option<String>,
    pub station_diary_entry_id: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateIncidentInput {
    pub summary: String,
    pub description: String,
    pub location: Option<String>,
    pub occurred_at: i64,
    pub person_id: Option<String>,
    pub station_diary_entry_id: Option<String>,
}

async fn write_incident_markdown(pool: &SqlitePool, vault_root: &Path, record: &Incident) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "incident", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("incident-{}", record.id), &record.summary, record) {
            log::warn!("failed to write incident markdown: {e}");
        }
    }
}

pub async fn create_incident(pool: &SqlitePool, vault_root: &Path, input: CreateIncidentInput) -> Result<Incident, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO incidents (id, summary, description, location, occurred_at, person_id, station_diary_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.summary)
    .bind(&input.description)
    .bind(&input.location)
    .bind(input.occurred_at)
    .bind(&input.person_id)
    .bind(&input.station_diary_entry_id)
    .execute(pool)
    .await?;

    let record = get_incident(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_incident_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_incident(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateIncidentInput,
) -> Result<Incident, sqlx::Error> {
    sqlx::query(
        "UPDATE incidents
         SET summary = ?, description = ?, location = ?, occurred_at = ?, person_id = ?, station_diary_entry_id = ?
         WHERE id = ?",
    )
    .bind(&input.summary)
    .bind(&input.description)
    .bind(&input.location)
    .bind(input.occurred_at)
    .bind(&input.person_id)
    .bind(&input.station_diary_entry_id)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_incident(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_incident_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_incidents(pool: &SqlitePool, query: &str) -> Result<Vec<Incident>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Incident>(
            "SELECT
                i.id, i.summary, i.description, i.location, i.occurred_at,
                i.person_id, i.station_diary_entry_id, i.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM incidents i
             LEFT JOIN people p ON p.id = i.person_id
             ORDER BY i.occurred_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Incident>(
        "SELECT
            i.id, i.summary, i.description, i.location, i.occurred_at,
            i.person_id, i.station_diary_entry_id, i.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM incidents i
         LEFT JOIN people p ON p.id = i.person_id
         WHERE i.summary LIKE ?1 OR i.location LIKE ?1
         ORDER BY i.occurred_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Incident>, sqlx::Error> {
    sqlx::query_as::<_, Incident>(
        "SELECT
            i.id, i.summary, i.description, i.location, i.occurred_at,
            i.person_id, i.station_diary_entry_id, i.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM incidents i
         LEFT JOIN people p ON p.id = i.person_id
         WHERE i.person_id = ?
         ORDER BY i.occurred_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

pub async fn get_incident(pool: &SqlitePool, id: &str) -> Result<Option<Incident>, sqlx::Error> {
    sqlx::query_as::<_, Incident>(
        "SELECT
            i.id, i.summary, i.description, i.location, i.occurred_at,
            i.person_id, i.station_diary_entry_id, i.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM incidents i
         LEFT JOIN people p ON p.id = i.person_id
         WHERE i.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM incidents")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 3")
        .fetch_all(pool)
        .await?;
    let person = person_ids.first().cloned();

    let now = chrono::Utc::now().timestamp_millis();
    let day_ms = 24 * 60 * 60 * 1000;

    let samples = [
        (
            "Break-in reported at a retail shop on Kampala Road",
            "Owner reported a broken rear window and missing cash register overnight.",
            Some("Kampala Road"),
            now - day_ms,
            person.clone(),
        ),
        (
            "Motor vehicle collision near the taxi park",
            "Two vehicles collided at low speed, no injuries reported, one driver disputes fault.",
            Some("Old Taxi Park"),
            now - 2 * day_ms,
            None,
        ),
    ];

    for (summary, description, location, occurred_at, person_id) in samples {
        create_incident(
            pool,
            vault_root,
            CreateIncidentInput {
                summary: summary.to_string(),
                description: plain_text_to_rich_text_json(description),
                location: location.map(str::to_string),
                occurred_at,
                person_id,
                station_diary_entry_id: None,
            },
        )
        .await?;
    }

    Ok(())
}
