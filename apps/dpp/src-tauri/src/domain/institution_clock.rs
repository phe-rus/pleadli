//! The court's timezone and a check on the computer's clock, over the shared `pleadli_node_core::timezone`.
//! Separate things: a correct zone does not fix a wrong clock.
use pleadli_node_core::timezone::{self, ZoneStatus};
use sqlx::SqlitePool;

async fn country(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    let found: Option<String> = sqlx::query_scalar("SELECT jurisdiction FROM installation WHERE id = 'this'").fetch_optional(pool).await?;
    Ok(found.unwrap_or_else(|| "ug".to_string()))
}

async fn newest_record_ms(pool: &SqlitePool) -> Option<i64> {
    sqlx::query_scalar(
        "SELECT MAX(t) FROM (SELECT MAX(created_at) t FROM referrals UNION ALL SELECT MAX(created_at) FROM prosecution_files
         UNION ALL SELECT MAX(created_at) FROM decisions UNION ALL SELECT MAX(set_at) FROM institution_timezone)",
    )
    .fetch_one(pool)
    .await
    .ok()
    .flatten()
}

/// Loads the office zone into the shared display. At start and after any change of zone or country.
pub async fn reload(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    timezone::load_and_install(pool, &country(pool).await?).await
}

pub async fn status(pool: &SqlitePool) -> Result<ZoneStatus, sqlx::Error> {
    timezone::status(pool, &country(pool).await?, newest_record_ms(pool).await).await
}

/// Sets the zone from now on; the change and its audit entry commit together.
pub async fn set(pool: &SqlitePool, zone_id: &str, actor: &str, reason: Option<&str>) -> Result<(), String> {
    let country = country(pool).await.map_err(|e| e.to_string())?;
    let detail = format!("timezone {zone_id}");
    timezone::change(pool, &country, zone_id, actor, reason, move |conn| {
        Box::pin(async move {
            super::audit::record(conn, super::audit::Entry::new("timezone_changed").subject("installation", "this").detail(detail))
                .await
                .map_err(|_| "The change could not be recorded.".to_string())
        })
    })
    .await
    .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_office_in_congo_chooses_its_zone_and_the_change_is_audited() {
        let dir = std::env::temp_dir().join(format!("dpp-zone-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = crate::db::startup(&dir, None).await.ok().unwrap();
        let pool = db.pool.clone();
        assert_eq!(status(&pool).await.unwrap().zone_id.as_deref(), Some("Africa/Kampala"));
        sqlx::query("INSERT OR REPLACE INTO installation (id, jurisdiction, language, model, office_name, protection, accent, licence_version, licence_accepted_at, licence_accepted_by, completed_at, updated_at) VALUES ('this', 'cd', 'fr', 'office', 'Parquet de Gombe', 'none', 'teal', '1', 1, 'test', 1, 1)").execute(&pool).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().zone_id, None, "DR Congo has no default");
        set(&pool, "Africa/Lubumbashi", "Procureur", Some("parquet de Lubumbashi")).await.unwrap();
        assert_eq!(status(&pool).await.unwrap().zone_id.as_deref(), Some("Africa/Lubumbashi"));
        assert!(set(&pool, "Africa/Nairobi", "Procureur", None).await.is_err());
        let log = crate::domain::audit::recent(&pool, 10).await.unwrap();
        assert!(log.iter().any(|e| e.action == "timezone_changed"));
        assert!(sqlx::query("DELETE FROM institution_timezone").execute(&pool).await.is_err());
        timezone::install(vec![]);
        pool.close().await;
        drop(db);
    }
}
