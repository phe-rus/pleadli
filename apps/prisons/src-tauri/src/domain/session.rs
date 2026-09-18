//! Head Office session (spec: docs/specs/_root/0001-officer-identity-sign-in).
//! `hq_login` verifies credentials and persists the session in one atomic
//! step, deliberately never split into a separate "sign in" call that
//! could be invoked without a password having just been checked.

use serde::Serialize;
use sqlx::SqlitePool;

use super::officers::{self, Officer, OfficerError};

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

/// Dev build only: flips `is_head_office` and its matching `role` together,
/// so the two columns never disagree, letting one signed in installation be
/// tested as both a facility and Head Office without a real activation code
/// (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0001-onboarding-and-activation-code.md).
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

pub async fn hq_login(pool: &SqlitePool, badge_number: &str, password: &str) -> Result<Officer, OfficerError> {
    let officer = officers::login(pool, badge_number, password).await?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO hq_session (id, officer_id, signed_in_at) VALUES ('default', ?, ?)
         ON CONFLICT (id) DO UPDATE SET officer_id = excluded.officer_id, signed_in_at = excluded.signed_in_at",
    )
    .bind(&officer.id)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(officer)
}

/// Checked on every call, not just at launch: a `LEFT JOIN` to officers
/// means a session pointing at a since-inactive (or, in principle, since-
/// removed, though officers are never actually deleted) officer degrades
/// to "signed out" here rather than the caller ever seeing a stale
/// session.
pub async fn get_current_hq_session(pool: &SqlitePool) -> Result<Option<Officer>, sqlx::Error> {
    let officer = sqlx::query_as::<_, Officer>(
        "SELECT o.id, o.badge_number, o.name, o.role, o.active, o.created_at
         FROM hq_session s
         LEFT JOIN officers o ON o.id = s.officer_id
         WHERE s.id = 'default' AND o.id IS NOT NULL AND o.active = 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(officer)
}

pub async fn hq_sign_out(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM hq_session WHERE id = 'default'").execute(pool).await?;
    Ok(())
}
