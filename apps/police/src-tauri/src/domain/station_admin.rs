use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;
use uuid::Uuid;

use super::{attachments, markdown};

/// The canonical source for station identity — see the migration's own
/// comment for what this replaces and why it's a singleton (`id =
/// 'default'`, always the one row).
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationProfile {
    pub id: String,
    pub name: Option<String>,
    pub address: Option<String>,
    pub jurisdiction: Option<String>,
    pub contact: Option<String>,
    pub oc_station_name: Option<String>,
    pub oc_station_rank: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStationProfileInput {
    pub name: Option<String>,
    pub address: Option<String>,
    pub jurisdiction: Option<String>,
    pub contact: Option<String>,
    pub oc_station_name: Option<String>,
    pub oc_station_rank: Option<String>,
}

pub async fn get_station_profile(pool: &SqlitePool) -> Result<Option<StationProfile>, sqlx::Error> {
    sqlx::query_as::<_, StationProfile>("SELECT * FROM station_profile WHERE id = 'default'")
        .fetch_optional(pool)
        .await
}

pub async fn save_station_profile(
    pool: &SqlitePool,
    vault_root: &Path,
    input: SaveStationProfileInput,
) -> Result<StationProfile, sqlx::Error> {
    sqlx::query(
        "INSERT INTO station_profile (id, name, address, jurisdiction, contact, oc_station_name, oc_station_rank)
         VALUES ('default', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            address = excluded.address,
            jurisdiction = excluded.jurisdiction,
            contact = excluded.contact,
            oc_station_name = excluded.oc_station_name,
            oc_station_rank = excluded.oc_station_rank",
    )
    .bind(&input.name)
    .bind(&input.address)
    .bind(&input.jurisdiction)
    .bind(&input.contact)
    .bind(&input.oc_station_name)
    .bind(&input.oc_station_rank)
    .execute(pool)
    .await?;

    let record = get_station_profile(pool).await?.ok_or(sqlx::Error::RowNotFound)?;
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "station_profile", "profile").await {
        let title = record.name.clone().unwrap_or_else(|| "Station Profile".to_string());
        if let Err(e) = markdown::write_record(&dir, "station_profile-profile", &title, &record) {
            log::warn!("failed to write station profile markdown: {e}");
        }
    }
    Ok(record)
}

/// Who is posted to this station in a standing role — distinct from Duty
/// Roster's shift-by-shift schedule. References the existing `people`
/// row rather than duplicating officer identity; only `rank` and `post`
/// are genuinely new information the Person record doesn't own. `post`
/// is deliberately not a constrained enum; see the migration's comment.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct StationEstablishmentMember {
    pub id: String,
    pub person_id: String,
    pub person_first_name: String,
    pub person_last_name: String,
    pub person_other_names: Option<String>,
    pub post: Option<String>,
    pub rank: Option<String>,
    pub active: bool,
    pub notes: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateStationEstablishmentMemberInput {
    pub person_id: String,
    pub post: Option<String>,
    pub rank: Option<String>,
    pub active: bool,
    pub notes: Option<String>,
}

pub(crate) async fn write_establishment_member_markdown(pool: &SqlitePool, vault_root: &Path, record: &StationEstablishmentMember) {
    if let Ok(dir) = attachments::resolve_vault_dir(pool, vault_root, "station_establishment_member", &record.id).await {
        let title = format!("Establishment: {} {}", record.person_first_name, record.person_last_name);
        if let Err(e) = markdown::write_record(&dir, &format!("station_establishment_member-{}", record.id), &title, record) {
            log::warn!("failed to write establishment member markdown: {e}");
        }
    }
}

pub async fn create_establishment_member(
    pool: &SqlitePool,
    vault_root: &Path,
    input: CreateStationEstablishmentMemberInput,
) -> Result<StationEstablishmentMember, sqlx::Error> {
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO station_establishment (id, person_id, post, rank, active, notes)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.person_id)
    .bind(&input.post)
    .bind(&input.rank)
    .bind(input.active)
    .bind(&input.notes)
    .execute(pool)
    .await?;

    let record = get_establishment_member(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_establishment_member_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn update_establishment_member(
    pool: &SqlitePool,
    vault_root: &Path,
    id: &str,
    input: CreateStationEstablishmentMemberInput,
) -> Result<StationEstablishmentMember, sqlx::Error> {
    sqlx::query(
        "UPDATE station_establishment
         SET person_id = ?, post = ?, rank = ?, active = ?, notes = ?
         WHERE id = ?",
    )
    .bind(&input.person_id)
    .bind(&input.post)
    .bind(&input.rank)
    .bind(input.active)
    .bind(&input.notes)
    .bind(id)
    .execute(pool)
    .await?;

    let record = get_establishment_member(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?;
    write_establishment_member_markdown(pool, vault_root, &record).await;
    Ok(record)
}

pub async fn get_establishment_member(pool: &SqlitePool, id: &str) -> Result<Option<StationEstablishmentMember>, sqlx::Error> {
    sqlx::query_as::<_, StationEstablishmentMember>(
        "SELECT
            se.id, se.person_id, se.post, se.rank, se.active, se.notes, se.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_establishment se
         JOIN people p ON p.id = se.person_id
         WHERE se.id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn list_establishment(pool: &SqlitePool, query: &str) -> Result<Vec<StationEstablishmentMember>, sqlx::Error> {
    let trimmed = query.trim();

    if trimmed.is_empty() {
        return sqlx::query_as::<_, StationEstablishmentMember>(
            "SELECT
                se.id, se.person_id, se.post, se.rank, se.active, se.notes, se.created_at,
                p.first_name AS person_first_name,
                p.last_name AS person_last_name,
                p.other_names AS person_other_names
             FROM station_establishment se
             JOIN people p ON p.id = se.person_id
             ORDER BY se.created_at DESC LIMIT 100",
        )
        .fetch_all(pool)
        .await;
    }

    let like = format!("%{trimmed}%");
    sqlx::query_as::<_, StationEstablishmentMember>(
        "SELECT
            se.id, se.person_id, se.post, se.rank, se.active, se.notes, se.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_establishment se
         JOIN people p ON p.id = se.person_id
         WHERE p.first_name LIKE ?1 OR p.last_name LIKE ?1 OR se.post LIKE ?1 OR se.rank LIKE ?1
         ORDER BY se.created_at DESC LIMIT 100",
    )
    .bind(like)
    .fetch_all(pool)
    .await
}

/// Every establishment member, unfiltered and unlimited, for the bulk
/// data export. Named distinctly from `list_establishment` (its
/// UI-oriented, 100-row-capped counterpart) since this module also has a
/// singleton `station_profile` that a plain `list_all` name would be
/// ambiguous against.
pub async fn list_all_establishment(pool: &SqlitePool) -> Result<Vec<StationEstablishmentMember>, sqlx::Error> {
    sqlx::query_as::<_, StationEstablishmentMember>(
        "SELECT
            se.id, se.person_id, se.post, se.rank, se.active, se.notes, se.created_at,
            p.first_name AS person_first_name,
            p.last_name AS person_last_name,
            p.other_names AS person_other_names
         FROM station_establishment se
         JOIN people p ON p.id = se.person_id
         ORDER BY se.created_at ASC",
    )
    .fetch_all(pool)
    .await
}

#[cfg(debug_assertions)]
pub async fn seed_if_empty(pool: &SqlitePool, vault_root: &Path) -> Result<(), sqlx::Error> {
    let existing = get_station_profile(pool).await?;
    if existing.is_none() {
        save_station_profile(
            pool,
            vault_root,
            SaveStationProfileInput {
                name: Some("Central Police Station".to_string()),
                address: Some("Kampala Road, Kampala".to_string()),
                jurisdiction: Some("Kampala Central Division".to_string()),
                contact: Some("0800 199 888".to_string()),
                oc_station_name: Some("Okello, J.".to_string()),
                oc_station_rank: Some("Superintendent of Police".to_string()),
            },
        )
        .await?;
    }

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM station_establishment").fetch_one(pool).await?;
    if count == 0 {
        let person_ids: Vec<String> = sqlx::query_scalar("SELECT id FROM people ORDER BY created_at LIMIT 2")
            .fetch_all(pool)
            .await?;
        let posts = [
            (Some("Superintendent of Police"), Some("OC Station")),
            (Some("Inspector"), Some("OC CID")),
        ];
        for (i, person_id) in person_ids.into_iter().enumerate() {
            let (rank, post) = posts.get(i).copied().unwrap_or((None, Some("General Officer")));
            create_establishment_member(
                pool,
                vault_root,
                CreateStationEstablishmentMemberInput {
                    person_id,
                    post: post.map(str::to_string),
                    rank: rank.map(str::to_string),
                    active: true,
                    notes: None,
                },
            )
            .await?;
        }
    }

    Ok(())
}
