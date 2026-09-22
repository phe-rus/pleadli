//! Development only: a small practice so the screens can be seen with something
//! in them. Release builds start empty, with honest empty states.

use sqlx::SqlitePool;

use super::clients::{self, ClientInput};
use super::error::DomainError;
use super::hearings::{self, HearingInput};
use super::matters::{self, MatterInput};

const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;

pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), DomainError> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clients").fetch_one(pool).await?;
    if existing > 0 {
        return Ok(());
    }
    let now = chrono::Utc::now().timestamp_millis();
    let today_nine = now - now.rem_euclid(DAY) + 6 * HOUR;

    let okello = clients::create(pool, ClientInput { name: "Okello John".into(), phone: Some("0772 000 111".into()), address: None, custody: Some("remanded".into()), custody_place: Some("Kampala Remand Prison".into()), notes: None }).await?;
    let m = matters::create(pool, MatterInput { client_id: okello.id.clone(), title: "Uganda v. Okello John".into(), our_ref: Some("PRA/2026/014".into()), court_number: Some("CRB 214/2026".into()), court_name: Some("Buganda Road Chief Magistrate's Court".into()), court_level: Some("magistrate".into()), offence: Some("Theft".into()), engagement: "state_appointed".into(), appointed_on: Some(now - 3 * DAY), notes: None }).await?;
    hearings::schedule(pool, &m.id, HearingInput { at: today_nine, purpose: "hearing".into(), courtroom: Some("Court 2".into()), note: None }).await?;
    hearings::schedule(pool, &m.id, HearingInput { at: today_nine + 20 * DAY, purpose: "hearing".into(), courtroom: None, note: None }).await?;

    let auma = clients::create(pool, ClientInput { name: "Auma Grace".into(), phone: None, address: None, custody: Some("at_liberty".into()), custody_place: None, notes: None }).await?;
    matters::create(pool, MatterInput { client_id: auma.id, title: "Uganda v. Auma Grace".into(), our_ref: Some("PRA/2026/019".into()), court_number: Some("CRB 231/2026".into()), court_name: None, court_level: Some("magistrate".into()), offence: Some("Assault occasioning actual bodily harm".into()), engagement: "private".into(), appointed_on: None, notes: None }).await?;
    Ok(())
}
