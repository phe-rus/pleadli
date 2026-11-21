//! The station's timezone and a check on the computer's clock, over the shared `pleadli_node_core::timezone`.
//! They are separate: a correct zone does not fix a wrong clock.
use pleadli_node_core::timezone::{self, ZoneStatus};
use sqlx::SqlitePool;

/// The newest moment any record was made, to tell a clock that went backwards.
pub async fn newest_record_ms(pool: &SqlitePool) -> Option<i64> {
    sqlx::query_scalar(
        "SELECT MAX(t) FROM (
            SELECT MAX(created_at) t FROM incidents UNION ALL SELECT MAX(created_at) FROM cases
            UNION ALL SELECT MAX(created_at) FROM people UNION ALL SELECT MAX(created_at) FROM custody_records
            UNION ALL SELECT MAX(created_at) FROM statements UNION ALL SELECT MAX(set_at) FROM institution_timezone)",
    )
    .fetch_one(pool)
    .await
    .ok()
    .flatten()
}

/// Loads the station's zone into the shared display. Called at start and after any change of zone or country.
pub async fn reload(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let country = super::rules::station_country(pool).await?;
    timezone::load_and_install(pool, &country).await
}

pub async fn status(pool: &SqlitePool) -> Result<ZoneStatus, sqlx::Error> {
    let country = super::rules::station_country(pool).await?;
    timezone::status(pool, &country, newest_record_ms(pool).await).await
}

/// Sets the zone from now on. The history row records who, when and why (append-only by database trigger, so edits and deletes through the application are refused; there is no hash chain, so it is not tamper-evident to someone with the database key).
pub async fn set(pool: &SqlitePool, zone_id: &str, actor: &str, reason: Option<&str>) -> Result<(), String> {
    let country = super::rules::station_country(pool).await.map_err(|e| e.to_string())?;
    timezone::change(pool, &country, zone_id, actor, reason, |_| Box::pin(async { Ok(()) })).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn pool() -> SqlitePool {
        let dir = std::env::temp_dir().join(format!("pleadli-zone-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        crate::db::startup(&dir, dir.join("vault")).await.ok().unwrap().pool
    }

    #[tokio::test]
    async fn a_station_in_congo_must_choose_and_the_choice_is_kept() {
        let pool = pool().await;
        sqlx::query("INSERT INTO station_profile (id, name, country) VALUES ('default', 'Gombe', 'CD') ON CONFLICT(id) DO UPDATE SET country = 'CD'").execute(&pool).await.unwrap();
        let s = status(&pool).await.unwrap();
        assert_eq!(s.zone_id, None);
        assert_eq!(s.choices, vec!["Africa/Kinshasa", "Africa/Lubumbashi"]);
        set(&pool, "Africa/Lubumbashi", "Chief", Some("station is in Haut-Katanga")).await.unwrap();
        let s = status(&pool).await.unwrap();
        assert_eq!(s.zone_id.as_deref(), Some("Africa/Lubumbashi"));
        assert_eq!(s.history.len(), 1);
        assert!(set(&pool, "Africa/Kampala", "Chief", None).await.is_err());
        timezone::install(vec![]);
        pool.close().await;
    }
}
