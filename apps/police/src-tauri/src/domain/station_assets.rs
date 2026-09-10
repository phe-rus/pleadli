use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// Armory Register and Impounded Assets share this one table (a `category`
/// column distinguishes them) — the product doc describes them as one
/// combined station-operations/asset-tracking concern, deliberately
/// separate from Evidence (different accountability model, even though
/// both involve physical items).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationAsset {
    pub id: String,
    pub category: String,
    pub description: String,
    pub item_identifier: Option<String>,
    pub status: String,
    pub holder_name: Option<String>,
    pub person_id: Option<String>,
    pub person_first_name: Option<String>,
    pub person_last_name: Option<String>,
    pub person_other_names: Option<String>,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStationAssetInput {
    pub category: String,
    pub description: String,
    pub item_identifier: Option<String>,
    pub status: String,
    pub holder_name: Option<String>,
    pub person_id: Option<String>,
    pub notes: Option<String>,
}

async fn write_asset_markdown(pool: &SqlitePool, vault_root: &Path, record: &StationAsset) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "station_asset", &record.id).await {
        if let Err(e) = markdown::write_record(&dir, &format!("station_asset-{}", record.id), &record.description, record) {
            log::warn!("failed to write station asset markdown: {e}");
        }
    }
}

pub async fn create_asset(pool: &SqlitePool, vault_root: &Path, input: CreateStationAssetInput) -> Result<StationAsset, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO station_assets (id, category, description, item_identifier, status, holder_name, person_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.category)
    .bind(&input.description)
    .bind(&input.item_identifier)
    .bind(&input.status)
    .bind(&input.holder_name)
    .bind(&input.person_id)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_asset(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_asset_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_asset(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateStationAssetInput,
) -> Result<StationAsset, sqlx::Error> {
    sqlx::query(
        "UPDATE station_assets
         SET category = ?, description = ?, item_identifier = ?, status = ?, holder_name = ?, person_id = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.category)
    .bind(&input.description)
    .bind(&input.item_identifier)
    .bind(&input.status)
    .bind(&input.holder_name)
    .bind(&input.person_id)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_asset(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_asset_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn list_assets(pool: &SqlitePool, query: &str) -> Result<Vec<StationAsset>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, StationAsset>(
            "SELECT
                a.id, a.category, a.description, a.item_identifier, a.status,
                a.holder_name, a.person_id, a.notes, a.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM station_assets a
             LEFT JOIN people p ON p.id = a.person_id
             ORDER BY a.created_at DESC LIMIT 50",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, StationAsset>(
        "SELECT
            a.id, a.category, a.description, a.item_identifier, a.status,
            a.holder_name, a.person_id, a.notes, a.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_assets a
         LEFT JOIN people p ON p.id = a.person_id
         WHERE a.description LIKE ?1 OR a.item_identifier LIKE ?1 OR a.holder_name LIKE ?1
         ORDER BY a.created_at DESC LIMIT 50",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

pub async fn get_asset(pool: &SqlitePool, id: &str) -> Result<Option<StationAsset>, sqlx::Error> {
    sqlx::query_as::<_, StationAsset>(
        "SELECT
            a.id, a.category, a.description, a.item_identifier, a.status,
            a.holder_name, a.person_id, a.notes, a.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_assets a
         LEFT JOIN people p ON p.id = a.person_id
         WHERE a.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM station_assets")
        .fetch_one(pool)
        .await?;
    if count > 0 {
        return Ok(());
    }

    let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 1")
        .fetch_all(pool)
        .await?;
    let person = person_ids.first().cloned();

    let samples = [
        (
            "armory",
            "Pistol, standard issue",
            Some("SN-44219"),
            "issued",
            Some("Okello, D."),
            None,
        ),
        (
            "armory",
            "Rifle, patrol carbine",
            Some("SN-88410"),
            "in_store",
            None,
            None,
        ),
        (
            "impounded",
            "Motorcycle, unregistered plates",
            Some("Frame no. UBX221"),
            "in_store",
            None,
            person,
        ),
    ];

    for (category, description, item_identifier, status, holder_name, person_id) in samples {
        create_asset(
            pool,
            vault_root,
            CreateStationAssetInput {
                category: category.to_string(),
                description: description.to_string(),
                item_identifier: item_identifier.map(str::to_string),
                status: status.to_string(),
                holder_name: holder_name.map(str::to_string),
                person_id,
                notes: None,
            },
        )
        .await?;
    }

    Ok(())
}
