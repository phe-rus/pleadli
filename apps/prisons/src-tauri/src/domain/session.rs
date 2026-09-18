//! Installation role configuration (`hq_config`). Sessions live in
//! `sessions.rs`; this module only reads and, in debug builds, flips the
//! installation's role.

use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HqConfig {
    pub is_head_office: bool,
    /// `NULL` until the first launch role choice is made (spec:
    /// docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-and-activation-code.md).
    pub role: Option<String>,
    pub activated_at: Option<i64>,
}

pub async fn get_hq_config(pool: &SqlitePool) -> Result<HqConfig, sqlx::Error> {
    sqlx::query_as::<_, HqConfig>("SELECT is_head_office, role, activated_at FROM hq_config WHERE id = 'default'")
        .fetch_one(pool)
        .await
}

pub async fn is_head_office(pool: &SqlitePool) -> bool {
    get_hq_config(pool).await.map(|c| c.is_head_office).unwrap_or(false)
}

/// Debug builds only: flips `is_head_office` and its matching `role`
/// together, so one signed in installation can be tested as both a facility
/// and Head Office without a real activation code. Compiled out of release
/// builds entirely.
#[cfg(debug_assertions)]
pub async fn set_dev_role(pool: &SqlitePool, is_head_office: bool) -> Result<(), sqlx::Error> {
    let role = if is_head_office { "head_office" } else { "facility" };
    sqlx::query("UPDATE hq_config SET is_head_office = ?, role = ? WHERE id = 'default'")
        .bind(is_head_office)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(())
}
