//! The facility's sign-in policy: which kind of secret its officers use, and
//! how long a session lasts. Facility-owned; only an administrator changes it
//! and every change is audited.
//!
//! * `badge_only` an account may be marked as signing in with its badge
//!   alone. The default for a new facility: the first account is created
//!   that way. Refused on Head Office, refused while this machine serves LAN
//!   workstations, and never honoured for a workstation sign-in. Anyone may
//!   still be given a password, and then it is asked for.
//! * `password`   every account needs a password
//! * `pin`        non-administrators may use a 4 to 8 digit PIN instead
//!
//! Head Office always uses a secret; its first account starts on the default
//! passcode, `officers::HEAD_OFFICE_DEFAULT_PASSCODE`.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::time::now_ms;

pub const MODES: &[&str] = &["password", "pin", "badge_only"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AuthPolicy {
    pub mode: String,
    pub idle_timeout_minutes: i64,
    pub absolute_lifetime_hours: i64,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPolicyInput {
    pub mode: String,
    pub idle_timeout_minutes: i64,
    pub absolute_lifetime_hours: i64,
}

const SELECT: &str = "SELECT mode, idle_timeout_minutes, absolute_lifetime_hours, updated_at FROM auth_policy WHERE id = 'default'";

pub async fn get(pool: &SqlitePool) -> Result<AuthPolicy, sqlx::Error> {
    sqlx::query_as::<_, AuthPolicy>(SELECT).fetch_one(pool).await
}

pub async fn get_conn(conn: &mut SqliteConnection) -> Result<AuthPolicy, sqlx::Error> {
    sqlx::query_as::<_, AuthPolicy>(SELECT).fetch_one(&mut *conn).await
}

impl AuthPolicy {
    /// May this account use a PIN in place of a password?
    pub fn allows_pin(&self, is_admin: bool) -> bool {
        self.mode == "pin" && !is_admin
    }

    pub fn allows_passwordless(&self, _is_admin: bool, head_office: bool) -> bool {
        self.mode == "badge_only" && !head_office
    }
}

/// Saves the policy. Leaving `badge_only` strips the badge-only flag from every
/// account so none of them can sign in without a secret under the new mode;
/// they must be given one.
pub async fn save(conn: &mut SqliteConnection, actor: &Actor, input: AuthPolicyInput) -> Result<AuthPolicy, DomainError> {
    if !MODES.contains(&input.mode.as_str()) {
        return Err(DomainError::rejected("Choose password, PIN or badge only."));
    }
    if !(5..=720).contains(&input.idle_timeout_minutes) {
        return Err(DomainError::rejected("Signing out after inactivity must be between 5 minutes and 12 hours."));
    }
    if !(1..=24).contains(&input.absolute_lifetime_hours) {
        return Err(DomainError::rejected("A sign-in cannot last longer than 24 hours or shorter than 1 hour."));
    }
    if input.mode == "badge_only" {
        let head_office: bool = sqlx::query_scalar("SELECT is_head_office FROM hq_config WHERE id = 'default'").fetch_optional(&mut *conn).await?.unwrap_or(false);
        if head_office {
            return Err(DomainError::rejected("Badge-only sign-in is not available on Head Office."));
        }
        let mode: String = sqlx::query_scalar("SELECT node_mode FROM node_config WHERE id = 'default'").fetch_one(&mut *conn).await?;
        if mode != "standalone" {
            return Err(DomainError::rejected("Badge-only sign-in is not available while this machine serves workstations on the network."));
        }
    }

    let before = get_conn(conn).await?;
    if before.mode == "badge_only" && input.mode != "badge_only" {
        // Leaving badge-only would leave an administrator with no way in.
        let stranded: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM officers WHERE passwordless = 1 AND is_admin = 1 AND active = 1").fetch_one(&mut *conn).await?;
        if stranded > 0 {
            return Err(DomainError::rejected("Give every administrator a password first, from Officers. Until then they sign in with their badge alone."));
        }
    }
    sqlx::query("UPDATE auth_policy SET mode = ?, idle_timeout_minutes = ?, absolute_lifetime_hours = ?, updated_at = ?, updated_by = ? WHERE id = 'default'")
        .bind(&input.mode)
        .bind(input.idle_timeout_minutes)
        .bind(input.absolute_lifetime_hours)
        .bind(now_ms())
        .bind(actor.officer_id.as_deref())
        .execute(&mut *conn)
        .await?;
    if before.mode == "badge_only" && input.mode != "badge_only" {
        sqlx::query("UPDATE officers SET passwordless = 0 WHERE passwordless = 1").execute(&mut *conn).await?;
    }
    let after = get_conn(conn).await?;
    audit::record(conn, actor, AuditEntry::new("auth.policy_saved", "auth_policy", Some("default")).before(&before).after(&after)).await?;
    Ok(after)
}
