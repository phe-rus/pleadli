use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::path::Path;

use super::{attachments, markdown, officers};

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

    // Who works here now lives with the officers (domain/officers.rs).
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers").fetch_one(pool).await?;
    if count == 0 {
        let people: Vec<(String, String, String)> =
            sqlx::query_as("SELECT id, first_name, last_name FROM people ORDER BY created_at LIMIT 2").fetch_all(pool).await?;
        let posts = [("Superintendent of Police", "OC Station"), ("Inspector", "OC CID")];
        for (i, (person_id, first, last)) in people.into_iter().enumerate() {
            let (rank, post) = posts.get(i).copied().unwrap_or(("", "General Officer"));
            officers::create_officer(
                pool,
                officers::CreateOfficerInput {
                    badge_number: None,
                    name: format!("{first} {last}"),
                    rank: Some(rank.to_string()).filter(|r| !r.is_empty()),
                    post: Some(post.to_string()),
                    role: "officer".to_string(),
                    notes: None,
                    person_id: Some(person_id),
                    password: None,
                },
            )
            .await
            .map_err(|e| sqlx::Error::Protocol(e.to_string()))?;
        }
    }

    Ok(())
}
