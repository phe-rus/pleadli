//! The facility's timezone and a check on the computer's clock, over the shared `pleadli_node_core::timezone`.
//! Separate things: a correct zone does not fix a wrong clock.
use pleadli_node_core::timezone::{self, ZoneStatus};
use sqlx::SqlitePool;

use super::authz::Actor;
use super::audit::{self, AuditEntry};

/// The country's two-letter code from the facility profile, which keeps the country as a name or a code. Uganda until it says otherwise.
fn code_of(country: &str) -> &'static str {
    let c = country.trim().to_ascii_lowercase();
    if c == "ke" || c.starts_with("kenya") {
        "KE"
    } else if c == "cd" || c == "drc" || c.starts_with("congo") || c.contains("rdc") {
        "CD"
    } else {
        "UG"
    }
}

async fn country(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    let found: Option<Option<String>> = sqlx::query_scalar("SELECT country FROM facility_profile LIMIT 1").fetch_optional(pool).await?;
    Ok(code_of(found.flatten().as_deref().unwrap_or("")).to_string())
}

async fn newest_record_ms(pool: &SqlitePool) -> Option<i64> {
    sqlx::query_scalar(
        "SELECT MAX(t) FROM (SELECT MAX(created_at) t FROM prisoners UNION ALL SELECT MAX(created_at) FROM visits
         UNION ALL SELECT MAX(created_at) FROM releases UNION ALL SELECT MAX(set_at) FROM institution_timezone)",
    )
    .fetch_one(pool)
    .await
    .ok()
    .flatten()
}

/// Loads the facility's zone into the shared display. At start and after any change of zone or country.
pub async fn reload(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    timezone::load_and_install(pool, &country(pool).await?).await
}

pub async fn status(pool: &SqlitePool) -> Result<ZoneStatus, sqlx::Error> {
    timezone::status(pool, &country(pool).await?, newest_record_ms(pool).await).await
}

/// Sets the zone from now on; the change and its audit entry commit together.
pub async fn set(pool: &SqlitePool, actor: &Actor, zone_id: &str, reason: Option<&str>) -> Result<(), String> {
    let country = country(pool).await.map_err(|e| e.to_string())?;
    let who = actor.clone();
    let zone = zone_id.to_string();
    let why = reason.map(str::to_string);
    timezone::change(pool, &country, zone_id, &actor.name, reason, move |conn| {
        Box::pin(async move {
            let mut entry = AuditEntry::new("timezone.change", "facility", None);
            entry.after = Some(serde_json::json!({ "zoneId": zone }));
            if let Some(r) = why.as_deref() {
                entry.reason = Some(r);
            }
            audit::record(conn, &who, entry).await.map_err(|_| "The change could not be recorded.".to_string())
        })
    })
    .await
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_facility_defaults_by_country_and_a_congo_facility_must_choose() {
        let dir = std::env::temp_dir().join(format!("prisons-zone-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let started = crate::db::startup(&dir, &dir.join("vault"), None).await.ok().unwrap();
        let pool = started.pool.clone();
        assert_eq!(status(&pool).await.unwrap().zone_id.as_deref(), Some("Africa/Kampala"));
        let actor = Actor::system("test");

        sqlx::query("UPDATE facility_profile SET country = 'Kenya'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().zone_id.as_deref(), Some("Africa/Nairobi"));

        sqlx::query("UPDATE facility_profile SET country = 'Congo (DRC)'").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().zone_id, None, "DR Congo has no default");
        set(&pool, &actor, "Africa/Lubumbashi", Some("prison de Kassapa")).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().zone_id.as_deref(), Some("Africa/Lubumbashi"));
        assert!(set(&pool, &actor, "Africa/Kampala", None).await.is_err());

        let changes: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'timezone.change'").fetch_one(&pool).await.unwrap();
        assert_eq!(changes, 1, "the change is in the audit chain");
        assert!(sqlx::query("DELETE FROM institution_timezone").execute(&pool).await.is_err());
        timezone::install(vec![]);
        pool.close().await;
        drop(started);
    }
}
