//! The commissioner for oaths' and notary public's registers
//! (docs/lawyers/REVIEW-2026-09-30.md, L5; D10). One row per oath taken or
//! notarial act done, numbered per register per year. Entries are never edited
//! or deleted: a wrong one is voided with a reason and stays in the register.
//!
//! Who may make an entry is the law's, as far as it is known:
//! - only an advocate is a commissioner for oaths or notary here (Commissioners
//!   for Oaths (Advocates) Act; Notaries Public Act) [S], and the person must
//!   have recorded their appointment in Settings, so the register never holds
//!   an act by someone the app knows nothing about;
//! - a practising certificate on record that has expired stops them
//!   (Advocates Act s.11: the certificate runs to 31 December) [P];
//! - a commissioner does not take an oath in a matter in which they, or their
//!   practice, act for a party (Commissioners for Oaths (Advocates) Act,
//!   proviso to s.1) [S], so an oath is never linked to one of this practice's
//!   matters. A notarial act for a client (a conveyance, a power of attorney)
//!   may be.

use chrono::{Datelike, FixedOffset, TimeZone};
use pleadli_node_core::db::begin_write;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::staff::Actor;

pub const OATHS_KINDS: [&str; 4] = ["affidavit", "statutory_declaration", "affirmation", "other"];
pub const NOTARIAL_KINDS: [&str; 6] = ["attestation", "acknowledgment", "certified_copy", "protest", "statutory_declaration", "other"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct RegisterEntry {
    pub id: String,
    pub register: String,
    pub number: String,
    pub kind: String,
    pub on_day: i64,
    pub place: Option<String>,
    pub person_name: String,
    pub person_id_document: Option<String>,
    pub person_address: Option<String>,
    pub document_title: String,
    pub pages: Option<i64>,
    pub interpreter: Option<String>,
    pub fee: Option<i64>,
    pub matter_id: Option<String>,
    pub matter_title: Option<String>,
    pub notes: Option<String>,
    pub commissioner_id: String,
    pub commissioner_name: String,
    pub voided_at: Option<i64>,
    pub voided_reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub register: String,
    pub kind: String,
    pub on_day: i64,
    pub place: Option<String>,
    pub person_name: String,
    pub person_id_document: Option<String>,
    pub person_address: Option<String>,
    pub document_title: String,
    pub pages: Option<i64>,
    pub interpreter: Option<String>,
    pub fee: Option<i64>,
    pub matter_id: Option<String>,
    pub notes: Option<String>,
}

const SELECT: &str = "SELECT r.id, r.register, r.number, r.kind, r.on_day, r.place, r.person_name, r.person_id_document, r.person_address,
    r.document_title, r.pages, r.interpreter, r.fee, r.matter_id, m.title AS matter_title, r.notes, r.commissioner_id, r.commissioner_name,
    r.voided_at, r.voided_reason, r.created_at
    FROM register_entries r LEFT JOIN matters m ON m.id = r.matter_id";

/// East Africa Time: the register's year is the year in Kampala.
fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("valid offset")
}

/// The first millisecond of `year` and of the next, in Kampala.
pub fn year_bounds(year: i32) -> (i64, i64) {
    let start = |y: i32| eat().with_ymd_and_hms(y, 1, 1, 0, 0, 0).single().map(|d| d.timestamp_millis()).unwrap_or(0);
    (start(year), start(year + 1))
}

pub fn year_of(ms: i64) -> i32 {
    eat().timestamp_millis_opt(ms).single().map(|d| d.year()).unwrap_or(1970)
}

fn prefix(register: &str) -> &'static str {
    if register == "oaths" { "OA" } else { "NP" }
}

pub async fn list(pool: &SqlitePool, register: &str, year: i32) -> Result<Vec<RegisterEntry>, sqlx::Error> {
    let (from, to) = year_bounds(year);
    let sql = format!("{SELECT} WHERE r.register = ? AND r.on_day >= ? AND r.on_day < ? ORDER BY r.number DESC");
    sqlx::query_as::<_, RegisterEntry>(sqlx::AssertSqlSafe(sql)).bind(register).bind(from).bind(to).fetch_all(pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<RegisterEntry>, sqlx::Error> {
    sqlx::query_as::<_, RegisterEntry>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE r.id = ?"))).bind(id).fetch_optional(pool).await
}

/// Why this person may not make an entry in this register today, if they may not.
pub async fn refusal(pool: &SqlitePool, actor: &Actor, register: &str, today: i64) -> Result<Option<&'static str>, sqlx::Error> {
    if actor.role != "advocate" {
        return Ok(Some("Only an advocate appointed commissioner for oaths or notary public makes an entry in this register."));
    }
    let (expires, commissioner, notary): (Option<i64>, Option<i64>, Option<i64>) =
        sqlx::query_as("SELECT certificate_expires_on, commissioner_since, notary_since FROM staff WHERE id = ?").bind(&actor.id).fetch_one(pool).await?;
    if register == "oaths" && commissioner.is_none() {
        return Ok(Some("Record your appointment as commissioner for oaths first (Settings, You, Practising)."));
    }
    if register == "notarial" && notary.is_none() {
        return Ok(Some("Record your appointment as notary public first (Settings, You, Practising)."));
    }
    if expires.is_some_and(|e| e < today) {
        return Ok(Some("Your practising certificate on record has expired. Renew it (Advocates Act s.11) and update it in Settings."));
    }
    Ok(None)
}

pub async fn add(pool: &SqlitePool, actor: &Actor, input: EntryInput) -> Result<RegisterEntry, DomainError> {
    let kinds: &[&str] = match input.register.as_str() {
        "oaths" => &OATHS_KINDS,
        "notarial" => &NOTARIAL_KINDS,
        _ => return invalid("That register is not known."),
    };
    if !kinds.contains(&input.kind.as_str()) {
        return invalid("That is not an act recorded in this register.");
    }
    check_timestamp(input.on_day, "The day")?;
    let now = chrono::Utc::now().timestamp_millis();
    if let Some(reason) = refusal(pool, actor, &input.register, now).await? {
        return invalid(reason);
    }
    let person = input.person_name.trim();
    if person.is_empty() {
        return invalid("Write the name of the person before you.");
    }
    let document = input.document_title.trim();
    if document.is_empty() {
        return invalid("Write what document it is.");
    }
    if input.pages.is_some_and(|p| p <= 0) {
        return invalid("Pages is a number above nothing.");
    }
    if input.fee.is_some_and(|f| f < 0) {
        return invalid("A fee is not below nothing.");
    }
    let matter_id = clean(input.matter_id);
    if matter_id.is_some() && input.register == "oaths" {
        return invalid("A commissioner does not take an oath in a matter their practice acts in. Send the deponent to another commissioner.");
    }

    let id = Uuid::new_v4().to_string();
    let year = year_of(input.on_day);
    let mut tx = begin_write(pool).await?;
    if let Some(matter) = &matter_id {
        let found: Option<String> = sqlx::query_scalar("SELECT id FROM matters WHERE id = ?").bind(matter).fetch_optional(&mut *tx).await?;
        if found.is_none() {
            return Err(DomainError::NotFound("No such matter.".into()));
        }
    }
    let pre = prefix(&input.register);
    let in_year: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM register_entries WHERE number LIKE ?").bind(format!("{pre}/{year}/%")).fetch_one(&mut *tx).await?;
    let number = format!("{pre}/{year}/{:04}", in_year + 1);
    sqlx::query(
        "INSERT INTO register_entries (id, register, number, kind, on_day, place, person_name, person_id_document, person_address, document_title,
            pages, interpreter, fee, matter_id, notes, commissioner_id, commissioner_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.register)
    .bind(&number)
    .bind(&input.kind)
    .bind(input.on_day)
    .bind(clean(input.place))
    .bind(person)
    .bind(clean(input.person_id_document))
    .bind(clean(input.person_address))
    .bind(document)
    .bind(input.pages)
    .bind(clean(input.interpreter))
    .bind(input.fee)
    .bind(&matter_id)
    .bind(clean(input.notes))
    .bind(&actor.id)
    .bind(&actor.name)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("register_entry_added").subject("register_entry", &id).detail(number.clone())).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Strikes an entry through. Only the person who made it, or an administrator.
pub async fn void(pool: &SqlitePool, actor: &Actor, id: &str, reason: &str) -> Result<RegisterEntry, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return invalid("Say why the entry is struck out.");
    }
    let entry = get(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such entry.".into()))?;
    if entry.voided_at.is_some() {
        return invalid("That entry is already struck out.");
    }
    if entry.commissioner_id != actor.id && !actor.is_admin {
        return Err(DomainError::Forbidden("Only the person who made the entry, or an administrator, strikes it out.".into()));
    }
    let mut tx = begin_write(pool).await?;
    sqlx::query("UPDATE register_entries SET voided_at = ?, voided_reason = ? WHERE id = ? AND voided_at IS NULL")
        .bind(chrono::Utc::now().timestamp_millis())
        .bind(reason)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("register_entry_voided").subject("register_entry", id).detail(format!("{}: {reason}", entry.number))).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_year_is_kampalas() {
        let (from, to) = year_bounds(2026);
        // 1 January 2026 00:00 EAT is 31 December 2025 21:00 UTC.
        assert_eq!(from, 1_767_214_800_000);
        assert_eq!(year_of(from), 2026);
        assert_eq!(year_of(from - 1), 2025);
        assert_eq!(year_of(to - 1), 2026);
    }
}
