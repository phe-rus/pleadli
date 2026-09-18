//! The facility's own identity and approved capacity (docs/prisons/
//! product-map/02 F8.1). One row.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::time::now_ms;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FacilityProfile {
    pub name: Option<String>,
    pub facility_number: Option<String>,
    pub location: Option<String>,
    pub region: Option<String>,
    pub approved_capacity: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFacilityProfileInput {
    pub name: String,
    pub facility_number: Option<String>,
    pub location: Option<String>,
    pub region: Option<String>,
    pub approved_capacity: Option<i64>,
}

pub async fn get(pool: &SqlitePool) -> Result<FacilityProfile, sqlx::Error> {
    sqlx::query_as::<_, FacilityProfile>(
        "SELECT name, facility_number, location, region, approved_capacity, updated_at FROM facility_profile WHERE id = 'default'",
    )
    .fetch_one(pool)
    .await
}

pub async fn get_conn(conn: &mut SqliteConnection) -> Result<FacilityProfile, sqlx::Error> {
    sqlx::query_as::<_, FacilityProfile>(
        "SELECT name, facility_number, location, region, approved_capacity, updated_at FROM facility_profile WHERE id = 'default'",
    )
    .fetch_one(&mut *conn)
    .await
}

/// The name written on a dossier and shown to a receiving facility.
pub async fn display_name(conn: &mut SqliteConnection) -> Result<String, sqlx::Error> {
    Ok(get_conn(conn).await?.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| "Unnamed facility".to_string()))
}

pub async fn save(conn: &mut SqliteConnection, actor: &Actor, input: SaveFacilityProfileInput) -> Result<FacilityProfile, sqlx::Error> {
    let before = get_conn(conn).await?;
    sqlx::query(
        "UPDATE facility_profile
         SET name = ?, facility_number = ?, location = ?, region = ?, approved_capacity = ?, updated_at = ?
         WHERE id = 'default'",
    )
    .bind(input.name.trim())
    .bind(&input.facility_number)
    .bind(&input.location)
    .bind(&input.region)
    .bind(input.approved_capacity)
    .bind(now_ms())
    .execute(&mut *conn)
    .await?;
    let after = get_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("facility.profile_saved", "facility_profile", Some("default")).before(&before).after(&after)).await?;
    Ok(after)
}
