use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// Modeled after `station_assets` (closest existing analog — standalone
/// entity, optional person link). See docs/police/PRODUCT.md's Vehicles
/// section: this is a plate/owner registry, not a DMV integration — no
/// external data source is assumed or faked (see "External integrations").
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Vehicle {
    pub id: String,
    pub plate_number: String,
    pub make: Option<String>,
    pub model: Option<String>,
    pub color: Option<String>,
    pub owner_person_id: Option<String>,
    pub owner_first_name: Option<String>,
    pub owner_last_name: Option<String>,
    pub owner_other_names: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateVehicleInput {
    pub plate_number: String,
    pub make: Option<String>,
    pub model: Option<String>,
    pub color: Option<String>,
    pub owner_person_id: Option<String>,
    pub notes: Option<String>,
}

pub(crate) async fn write_vehicle_markdown(pool: &SqlitePool, vault_root: &Path, record: &Vehicle) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "vehicle", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("vehicle-{}", record.id), &record.plate_number, record) {
            log::warn!("failed to write vehicle markdown: {e}");
        }
    }
}

pub async fn create_vehicle(pool: &SqlitePool, vault_root: &Path, input: CreateVehicleInput) -> Result<Vehicle, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO vehicles (id, plate_number, make, model, color, owner_person_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.plate_number)
    .bind(&input.make)
    .bind(&input.model)
    .bind(&input.color)
    .bind(&input.owner_person_id)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_vehicle(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_vehicle_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_vehicle(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateVehicleInput,
) -> Result<Vehicle, sqlx::Error> {
    sqlx::query(
        "UPDATE vehicles
         SET plate_number = ?, make = ?, model = ?, color = ?, owner_person_id = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.plate_number)
    .bind(&input.make)
    .bind(&input.model)
    .bind(&input.color)
    .bind(&input.owner_person_id)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_vehicle(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_vehicle_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_vehicles(pool: &SqlitePool, query: &str) -> Result<Vec<Vehicle>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, Vehicle>(
            "SELECT
                v.id, v.plate_number, v.make, v.model, v.color, v.owner_person_id, v.notes, v.created_at,
                p.first_name AS owner_first_name,
                p.last_name AS owner_last_name,
                p.other_names AS owner_other_names
             FROM vehicles v
             LEFT JOIN people p ON p.id = v.owner_person_id
             ORDER BY v.created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, Vehicle>(
        "SELECT
            v.id, v.plate_number, v.make, v.model, v.color, v.owner_person_id, v.notes, v.created_at,
            p.first_name AS owner_first_name,
            p.last_name AS owner_last_name,
            p.other_names AS owner_other_names
         FROM vehicles v
         LEFT JOIN people p ON p.id = v.owner_person_id
         WHERE v.plate_number LIKE ?1 OR v.make LIKE ?1 OR v.model LIKE ?1
         ORDER BY v.created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every vehicle, unfiltered and unlimited, for the bulk data export.
pub async fn list_all(pool: &SqlitePool) -> Result<Vec<Vehicle>, sqlx::Error> {
    sqlx::query_as::<_, Vehicle>(
        "SELECT
            v.id, v.plate_number, v.make, v.model, v.color, v.owner_person_id, v.notes, v.created_at,
            p.first_name AS owner_first_name,
            p.last_name AS owner_last_name,
            p.other_names AS owner_other_names
         FROM vehicles v
         LEFT JOIN people p ON p.id = v.owner_person_id
         ORDER BY v.created_at ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_vehicle(pool: &SqlitePool, id: &str) -> Result<Option<Vehicle>, sqlx::Error> {
    sqlx::query_as::<_, Vehicle>(
        "SELECT
            v.id, v.plate_number, v.make, v.model, v.color, v.owner_person_id, v.notes, v.created_at,
            p.first_name AS owner_first_name,
            p.last_name AS owner_last_name,
            p.other_names AS owner_other_names
         FROM vehicles v
         LEFT JOIN people p ON p.id = v.owner_person_id
         WHERE v.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_for_person(pool: &SqlitePool, person_id: &str) -> Result<Vec<Vehicle>, sqlx::Error> {
    sqlx::query_as::<_, Vehicle>(
        "SELECT
            v.id, v.plate_number, v.make, v.model, v.color, v.owner_person_id, v.notes, v.created_at,
            p.first_name AS owner_first_name,
            p.last_name AS owner_last_name,
            p.other_names AS owner_other_names
         FROM vehicles v
         LEFT JOIN people p ON p.id = v.owner_person_id
         WHERE v.owner_person_id = ?
         ORDER BY v.created_at DESC",
    )
    .bind(person_id)
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vehicles").fetch_one(pool).await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 2")
        .fetch_all(pool)
        .await?;

    let samples = [
        ("UBA 123X", Some("Toyota"), Some("Corolla"), Some("White"), person_ids.first().cloned()),
        ("UBB 456Y", Some("Isuzu"), Some("D-Max"), Some("Silver"), None),
        ("UBC 789Z", Some("Honda"), Some("CB150"), Some("Black"), person_ids.get(1).cloned()),
    ];

    for (plate_number, make, model, color, owner_person_id) in samples {
        create_vehicle(
            pool,
            vault_root,
            CreateVehicleInput {
                plate_number: plate_number.to_string(),
                make: make.map(str::to_string),
                model: model.map(str::to_string),
                color: color.map(str::to_string),
                owner_person_id,
                notes: None,
            },
        )
        .await?;
    }

    Ok(())
}
