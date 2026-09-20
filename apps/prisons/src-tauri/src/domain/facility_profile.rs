//! The facility's own identity and approved capacity (docs/prisons/
//! product-map/02 F8.1). One row.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::time::now_ms;

/// The jurisdictions this build has a pack for. A pack is the seam, not a
/// country dropdown: terminology, thresholds and instruments live with it.
pub const JURISDICTIONS: &[&str] = &["ug"];
/// Languages with a complete catalogue. Others fall back to English.
pub const LANGUAGES: &[&str] = &["en"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FacilityProfile {
    pub name: Option<String>,
    pub facility_number: Option<String>,
    pub location: Option<String>,
    pub region: Option<String>,
    pub approved_capacity: Option<i64>,
    pub updated_at: Option<i64>,
    pub country: Option<String>,
    pub jurisdiction: String,
    pub language: String,
    pub badge_prefix: Option<String>,
    pub document_prefix: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveFacilityProfileInput {
    pub name: String,
    pub facility_number: Option<String>,
    pub location: Option<String>,
    pub region: Option<String>,
    pub approved_capacity: Option<i64>,
    /// The fields below are set at first setup. A save that leaves them out
    /// (the profile form in Settings) keeps what is there.
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub jurisdiction: Option<String>,
    #[serde(default)]
    pub language: Option<String>,
    #[serde(default)]
    pub badge_prefix: Option<String>,
    #[serde(default)]
    pub document_prefix: Option<String>,
}

const SELECT: &str = "SELECT name, facility_number, location, region, approved_capacity, updated_at, country, jurisdiction, language, badge_prefix, document_prefix
     FROM facility_profile WHERE id = 'default'";

pub async fn get(pool: &SqlitePool) -> Result<FacilityProfile, sqlx::Error> {
    sqlx::query_as::<_, FacilityProfile>(SELECT).fetch_one(pool).await
}

pub async fn get_conn(conn: &mut SqliteConnection) -> Result<FacilityProfile, sqlx::Error> {
    sqlx::query_as::<_, FacilityProfile>(SELECT).fetch_one(&mut *conn).await
}

/// The name written on a dossier and shown to a receiving facility.
pub async fn display_name(conn: &mut SqliteConnection) -> Result<String, sqlx::Error> {
    Ok(get_conn(conn).await?.name.filter(|n| !n.trim().is_empty()).unwrap_or_else(|| "Unnamed facility".to_string()))
}

fn clean(value: &Option<String>) -> Option<String> {
    value.as_deref().map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

/// A prefix is printed on badges and documents, so keep it to characters that
/// survive a print run and a filename.
fn check_prefix(label: &str, value: &Option<String>) -> Result<Option<String>, DomainError> {
    let Some(value) = clean(value) else { return Ok(None) };
    if value.chars().count() > 12 || !value.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '/' | '.')) {
        return Err(DomainError::rejected(format!("{label} can be up to 12 letters, digits, - . or /.")));
    }
    Ok(Some(value))
}

/// Saves the profile. The facility code, once set, cannot change after the
/// first person has been admitted: it is printed on every document and is how
/// Head Office recognises this facility.
pub async fn save(conn: &mut SqliteConnection, actor: &Actor, input: SaveFacilityProfileInput) -> Result<FacilityProfile, DomainError> {
    let before = get_conn(conn).await?;
    if input.name.trim().is_empty() {
        return Err(DomainError::rejected("Give the facility a name."));
    }
    let number = clean(&input.facility_number);
    if let (Some(existing), true) = (clean(&before.facility_number), number != clean(&before.facility_number)) {
        let admitted: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE facility_id IS NULL").fetch_one(&mut *conn).await?;
        if admitted > 0 {
            return Err(DomainError::conflict(
                "FACILITY_CODE_LOCKED",
                format!("The facility code {existing} is on {admitted} people's records and cannot change now."),
            ));
        }
    }
    if let Some(jurisdiction) = input.jurisdiction.as_deref() {
        if !JURISDICTIONS.contains(&jurisdiction) {
            return Err(DomainError::rejected("That jurisdiction is not available in this version."));
        }
    }
    if let Some(language) = input.language.as_deref() {
        if !LANGUAGES.contains(&language) {
            return Err(DomainError::rejected("That language is not available yet. English is."));
        }
    }
    let badge_prefix = check_prefix("The badge prefix", &input.badge_prefix)?;
    let document_prefix = check_prefix("The document prefix", &input.document_prefix)?;

    sqlx::query(
        "UPDATE facility_profile
         SET name = ?, facility_number = ?, location = ?, region = ?, approved_capacity = ?, updated_at = ?,
             country = COALESCE(?, country), jurisdiction = COALESCE(?, jurisdiction), language = COALESCE(?, language),
             badge_prefix = COALESCE(?, badge_prefix), document_prefix = COALESCE(?, document_prefix)
         WHERE id = 'default'",
    )
    .bind(input.name.trim())
    .bind(number)
    .bind(clean(&input.location))
    .bind(clean(&input.region))
    .bind(input.approved_capacity)
    .bind(now_ms())
    .bind(clean(&input.country))
    .bind(input.jurisdiction)
    .bind(input.language)
    .bind(badge_prefix)
    .bind(document_prefix)
    .execute(&mut *conn)
    .await?;
    let after = get_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("facility.profile_saved", "facility_profile", Some("default")).before(&before).after(&after)).await?;
    Ok(after)
}
