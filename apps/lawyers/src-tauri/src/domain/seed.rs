//! Development only: a small practice so the screens can be seen with something
//! in them. Release builds start empty, with honest empty states.

use sqlx::SqlitePool;

use super::clients::{self, ClientInput};
use super::error::DomainError;
use super::hearings::{self, HearingInput};
use super::matters::{self, MatterInput};
use super::parties::{self, PartyInput};

const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;

pub async fn seed_if_empty(pool: &SqlitePool) -> Result<(), DomainError> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clients").fetch_one(pool).await?;
    if existing > 0 {
        return Ok(());
    }
    // The sample matters are criminal defence and a civil suit; setup later
    // replaces this set with what the practice chooses (matters stay).
    for usage in ["criminal", "civil"] {
        sqlx::query("INSERT OR IGNORE INTO usages (usage, enabled_at) VALUES (?, 0)").bind(usage).execute(pool).await?;
    }
    let now = chrono::Utc::now().timestamp_millis();
    let today_nine = now - now.rem_euclid(DAY) + 6 * HOUR;

    let okello = clients::create(pool, ClientInput { name: "Okello John".into(), phone: Some("0772 000 111".into()), address: None, custody: Some("remanded".into()), custody_place: Some("Kampala Remand Prison".into()), notes: None, kind: None, email: None }).await?;
    let m = matters::create(pool, MatterInput { client_id: okello.id.clone(), title: "Uganda v. Okello John".into(), our_ref: Some("PRA/2026/014".into()), court_number: Some("CRB 214/2026".into()), court_name: Some("Buganda Road Chief Magistrate's Court".into()), court_level: Some("magistrate".into()), offence: Some("Theft".into()), engagement: "state_appointed".into(), appointed_on: Some(now - 3 * DAY), notes: None, matter_type: Some("criminal_defence".into()) }).await?;
    hearings::schedule(pool, &m.id, HearingInput { at: today_nine, purpose: "hearing".into(), courtroom: Some("Court 2".into()), note: None }).await?;
    hearings::schedule(pool, &m.id, HearingInput { at: today_nine + 20 * DAY, purpose: "hearing".into(), courtroom: None, note: None }).await?;

    let auma = clients::create(pool, ClientInput { name: "Auma Grace".into(), phone: None, address: None, custody: Some("at_liberty".into()), custody_place: None, notes: None, kind: None, email: None }).await?;
    matters::create(pool, MatterInput { client_id: auma.id, title: "Uganda v. Auma Grace".into(), our_ref: Some("PRA/2026/019".into()), court_number: Some("CRB 231/2026".into()), court_name: None, court_level: Some("magistrate".into()), offence: Some("Assault occasioning actual bodily harm".into()), engagement: "private".into(), appointed_on: None, notes: None, matter_type: Some("criminal_defence".into()) }).await?;

    let dfcu = clients::create(pool, ClientInput { name: "Nsubuga Traders Ltd".into(), phone: Some("0414 000 222".into()), address: Some("Plot 4, Kampala Road".into()), custody: None, custody_place: None, notes: None, kind: Some("organisation".into()), email: Some("accounts@nsubuga.example".into()) }).await?;
    let suit = matters::create(pool, MatterInput { client_id: dfcu.id, title: "Nsubuga Traders Ltd v. Kato Hardware".into(), our_ref: Some("CIV/2026/007".into()), court_number: Some("HCCS 88/2026".into()), court_name: Some("High Court (Commercial Division)".into()), court_level: Some("high".into()), offence: None, engagement: "private".into(), appointed_on: None, notes: None, matter_type: Some("civil_suit".into()) }).await?;
    matters::set_stage(pool, &suit.id, "pleadings").await?;
    parties::add(pool, &suit.id, PartyInput { role: "opposing_party".into(), name: "Kato Hardware Ltd".into(), organisation: None, contact: None, notes: None }).await?;
    parties::add(pool, &suit.id, PartyInput { role: "opposing_counsel".into(), name: "Mugisha & Co. Advocates".into(), organisation: None, contact: None, notes: None }).await?;
    Ok(())
}
