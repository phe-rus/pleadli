//! Development only: a small register so the screens can be seen with something
//! in them. Release builds start empty, with honest empty states.

use sqlx::SqlitePool;

use super::cases::{self, CaseInput, PartyInput};
use super::error::DomainError;
use super::sittings::{self, SittingInput};

const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;

pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), DomainError> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases").fetch_one(pool).await?;
    if existing > 0 {
        return Ok(());
    }
    let now = chrono::Utc::now().timestamp_millis();
    // 9:00 East Africa Time today (06:00 UTC).
    let today_nine = now - now.rem_euclid(DAY) + 6 * HOUR;

    let a = cases::create(pool, CaseInput { court_number: "CRB 214/2026".into(), title: "Uganda v. Okello John".into(), court_level: "magistrate".into(), offence: Some("Theft contrary to section 254 of the Penal Code Act".into()), registered_on: Some(now - 40 * DAY), notes: None }).await?;
    cases::add_party(pool, &a.id, PartyInput { role: "accused".into(), name: "Okello John".into(), custody: Some("remanded".into()), remand_until: Some(now + 3 * DAY), custody_place: Some("Kampala Remand Prison".into()), note: None }).await?;
    cases::add_party(pool, &a.id, PartyInput { role: "complainant".into(), name: "Nakato Sarah".into(), custody: None, remand_until: None, custody_place: None, note: None }).await?;
    sittings::schedule(pool, &a.id, SittingInput { scheduled_at: today_nine, purpose: "hearing".into(), courtroom: Some("Court 2".into()), note: None }).await?;

    let b = cases::create(pool, CaseInput { court_number: "CRB 231/2026".into(), title: "Uganda v. Auma Grace".into(), court_level: "magistrate".into(), offence: Some("Assault occasioning actual bodily harm".into()), registered_on: Some(now - 20 * DAY), notes: None }).await?;
    cases::add_party(pool, &b.id, PartyInput { role: "accused".into(), name: "Auma Grace".into(), custody: Some("on_bail".into()), remand_until: None, custody_place: None, note: None }).await?;
    sittings::schedule(pool, &b.id, SittingInput { scheduled_at: today_nine + 2 * HOUR, purpose: "plea".into(), courtroom: Some("Court 2".into()), note: None }).await?;

    let c = cases::create(pool, CaseInput { court_number: "CRB 198/2026".into(), title: "Uganda v. Mugisha Peter and another".into(), court_level: "magistrate".into(), offence: Some("Robbery".into()), registered_on: Some(now - 60 * DAY), notes: None }).await?;
    cases::add_party(pool, &c.id, PartyInput { role: "accused".into(), name: "Mugisha Peter".into(), custody: Some("remanded".into()), remand_until: None, custody_place: None, note: None }).await?;
    Ok(())
}
