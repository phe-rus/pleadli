//! Practice compliance (docs/lawyers/REVIEW-2026-09-30.md, L5): for each
//! advocate, the practising certificate (annual, to 31 December, Advocates Act
//! s.11 [P]; refused while the Uganda Law Society subscription is unpaid,
//! s.12(1)(e) [P]), appointments as commissioner for oaths and notary, and pro
//! bono hours towards the 40 a year (Advocates (Pro Bono Services to Indigent
//! Persons) Regulations 2009 [S]).
//!
//! Pro bono hours are the time the advocate recorded on matters taken pro
//! bono or through a legal aid clinic. State briefs are paid by the state and
//! are not pro bono. The app counts; whether the Law Council accepts the hours
//! is the Law Council's.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

use super::audit::{self, Entry};
use super::error::{check_date, clean, invalid, DomainError};
use super::registers::year_bounds;

pub const PRO_BONO_TARGET_MINUTES: i64 = 40 * 60;
/// A certificate expiring within this many days is flagged.
const SOON_DAYS: i64 = 30;

const PRO_BONO_ENGAGEMENTS: &str = "('pro_bono', 'legal_aid_clinic')";

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AdvocateCompliance {
    pub staff_id: String,
    pub name: String,
    pub practising_number: Option<String>,
    pub certificate_expires_on: Option<i64>,
    pub uls_paid_year: Option<i64>,
    pub commissioner_since: Option<i64>,
    pub notary_since: Option<i64>,
    pub pro_bono_minutes: i64,
    /// `missing` (nothing recorded), `valid`, `soon` (within 30 days), `expired`.
    #[sqlx(skip)]
    pub certificate: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Compliance {
    pub year: i32,
    pub target_minutes: i64,
    pub advocates: Vec<AdvocateCompliance>,
    /// Pro bono time recorded before time had an author, or by a paralegal.
    pub other_pro_bono_minutes: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComplianceInput {
    pub practising_number: Option<String>,
    pub certificate_expires_on: Option<i64>,
    pub uls_paid_year: Option<i64>,
    pub commissioner_since: Option<i64>,
    pub notary_since: Option<i64>,
}

pub fn certificate_status(expires: Option<i64>, now: i64) -> &'static str {
    match expires {
        None => "missing",
        Some(e) if e < now => "expired",
        Some(e) if e < now + SOON_DAYS * 86_400_000 => "soon",
        Some(_) => "valid",
    }
}

pub async fn get(pool: &SqlitePool, year: i32) -> Result<Compliance, sqlx::Error> {
    let (from, to) = year_bounds(year);
    let sql = format!(
        "SELECT s.id AS staff_id, s.name, s.practising_number, s.certificate_expires_on, s.uls_paid_year, s.commissioner_since, s.notary_since,
            (SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t JOIN matters m ON m.id = t.matter_id
              WHERE t.staff_id = s.id AND m.engagement IN {PRO_BONO_ENGAGEMENTS} AND t.worked_on >= ?1 AND t.worked_on < ?2) AS pro_bono_minutes
         FROM staff s WHERE s.role = 'advocate' AND s.active = 1 ORDER BY s.name"
    );
    let mut advocates = sqlx::query_as::<_, AdvocateCompliance>(sqlx::AssertSqlSafe(sql)).bind(from).bind(to).fetch_all(pool).await?;
    let now = chrono::Utc::now().timestamp_millis();
    for a in &mut advocates {
        a.certificate = certificate_status(a.certificate_expires_on, now);
    }
    let sql = format!(
        "SELECT COALESCE(SUM(t.minutes), 0) FROM time_entries t JOIN matters m ON m.id = t.matter_id
         LEFT JOIN staff s ON s.id = t.staff_id
         WHERE m.engagement IN {PRO_BONO_ENGAGEMENTS} AND t.worked_on >= ? AND t.worked_on < ? AND (s.id IS NULL OR s.role <> 'advocate' OR s.active = 0)"
    );
    let other_pro_bono_minutes = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(from).bind(to).fetch_one(pool).await?;
    Ok(Compliance { year, target_minutes: PRO_BONO_TARGET_MINUTES, advocates, other_pro_bono_minutes })
}

pub async fn update(pool: &SqlitePool, staff_id: &str, input: ComplianceInput) -> Result<Compliance, DomainError> {
    for (value, what) in [
        (input.certificate_expires_on, "The certificate's expiry"),
        (input.commissioner_since, "The commissioner appointment"),
        (input.notary_since, "The notary appointment"),
    ] {
        if let Some(v) = value {
            check_date(v, what)?;
        }
    }
    if input.uls_paid_year.is_some_and(|y| !(1990..=2100).contains(&y)) {
        return invalid("Write the subscription year as four digits.");
    }
    let role: Option<String> = sqlx::query_scalar("SELECT role FROM staff WHERE id = ?").bind(staff_id).fetch_optional(pool).await?;
    match role.as_deref() {
        None => return Err(DomainError::NotFound("That person is not in this practice.".into())),
        Some("advocate") => {}
        Some(_) => return invalid("Practising details belong to an advocate."),
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query(
        "UPDATE staff SET practising_number = ?, certificate_expires_on = ?, uls_paid_year = ?, commissioner_since = ?, notary_since = ?, updated_at = ? WHERE id = ?",
    )
    .bind(clean(input.practising_number))
    .bind(input.certificate_expires_on)
    .bind(input.uls_paid_year)
    .bind(input.commissioner_since)
    .bind(input.notary_since)
    .bind(chrono::Utc::now().timestamp_millis())
    .bind(staff_id)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("compliance_changed").subject("staff", staff_id)).await?;
    tx.commit().await?;
    Ok(get(pool, chrono::Datelike::year(&chrono::Utc::now())).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn certificate_states() {
        let now = 1_800_000_000_000;
        assert_eq!(certificate_status(None, now), "missing");
        assert_eq!(certificate_status(Some(now - 1), now), "expired");
        assert_eq!(certificate_status(Some(now + 5 * 86_400_000), now), "soon");
        assert_eq!(certificate_status(Some(now + 60 * 86_400_000), now), "valid");
    }
}
