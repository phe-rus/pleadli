use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Case {
    pub id: String,
    pub court_number: String,
    pub title: String,
    pub court_level: String,
    pub offence: Option<String>,
    pub registered_on: Option<i64>,
    pub status: String,
    pub outcome: Option<String>,
    pub concluded_at: Option<i64>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A row of the register: the case and the few facts a list needs, so the
/// bench can pick a case without opening every one.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CaseSummary {
    pub id: String,
    pub court_number: String,
    pub title: String,
    pub court_level: String,
    pub offence: Option<String>,
    pub status: String,
    pub outcome: Option<String>,
    pub accused: Option<String>,
    pub next_sitting_at: Option<i64>,
    pub adjournments: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Party {
    pub id: String,
    pub case_id: String,
    pub role: String,
    pub name: String,
    pub custody: Option<String>,
    pub remand_until: Option<i64>,
    pub custody_place: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseInput {
    pub court_number: String,
    pub title: String,
    pub court_level: String,
    pub offence: Option<String>,
    pub registered_on: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyInput {
    pub role: String,
    pub name: String,
    pub custody: Option<String>,
    pub remand_until: Option<i64>,
    pub custody_place: Option<String>,
    pub note: Option<String>,
}

const CASE_COLUMNS: &str = "id, court_number, title, court_level, offence, registered_on, status, outcome, concluded_at, notes, created_at, updated_at";

struct Checked {
    court_number: String,
    title: String,
    offence: Option<String>,
    notes: Option<String>,
}

fn check(input: &CaseInput) -> Result<Checked, DomainError> {
    let court_number = input.court_number.trim().to_string();
    if court_number.is_empty() {
        return invalid("A case needs the number the court registry gave it.");
    }
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A case needs a title, for example the State against the accused.");
    }
    if !matches!(input.court_level.as_str(), "magistrate" | "high") {
        return invalid("The court level is a magistrates court or the High Court.");
    }
    if let Some(day) = input.registered_on {
        check_timestamp(day, "The date registered")?;
    }
    Ok(Checked { court_number, title, offence: clean(input.offence.clone()), notes: clean(input.notes.clone()) })
}

async fn number_is_free(pool: &SqlitePool, court_number: &str, except: Option<&str>) -> Result<bool, sqlx::Error> {
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases WHERE court_number = ? COLLATE NOCASE AND id <> ?")
        .bind(court_number)
        .bind(except.unwrap_or(""))
        .fetch_one(pool)
        .await?;
    Ok(taken == 0)
}

pub async fn create(pool: &SqlitePool, input: CaseInput) -> Result<Case, DomainError> {
    let checked = check(&input)?;
    if !number_is_free(pool, &checked.court_number, None).await? {
        return invalid("A case with that court number is already registered here.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    sqlx::query("INSERT INTO cases (id, court_number, title, court_level, offence, registered_on, notes) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&checked.court_number)
        .bind(&checked.title)
        .bind(&input.court_level)
        .bind(&checked.offence)
        .bind(input.registered_on)
        .bind(&checked.notes)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("case_registered").subject("case", &id).scope(&id).detail(&checked.court_number)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: CaseInput) -> Result<Case, DomainError> {
    let checked = check(&input)?;
    if !number_is_free(pool, &checked.court_number, Some(id)).await? {
        return invalid("Another case already has that court number.");
    }
    let mut tx = begin_write(pool).await?;
    let done = sqlx::query(
        "UPDATE cases SET court_number = ?, title = ?, court_level = ?, offence = ?, registered_on = ?, notes = ?,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(&checked.court_number)
    .bind(&checked.title)
    .bind(&input.court_level)
    .bind(&checked.offence)
    .bind(input.registered_on)
    .bind(&checked.notes)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Case not found.".to_string()));
    }
    audit::record(&mut tx, Entry::new("case_updated").subject("case", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Case>, sqlx::Error> {
    sqlx::query_as::<_, Case>(sqlx::AssertSqlSafe(format!("SELECT {CASE_COLUMNS} FROM cases WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

/// `view` is one of `open`, `unscheduled` (open, with no sitting fixed),
/// `concluded`, or empty for every case. `query` matches the number, title,
/// offence or the name of anyone in the case.
pub async fn list(pool: &SqlitePool, query: &str, view: &str, limit: i64) -> Result<Vec<CaseSummary>, sqlx::Error> {
    let filter = match view {
        "open" => "AND c.status = 'open'",
        "concluded" => "AND c.status = 'concluded'",
        "unscheduled" => "AND c.status = 'open' AND NOT EXISTS (SELECT 1 FROM sittings s WHERE s.case_id = c.id AND s.status = 'scheduled')",
        _ => "",
    };
    let like = format!("%{}%", query.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    sqlx::query_as::<_, CaseSummary>(sqlx::AssertSqlSafe(format!(
        "SELECT c.id, c.court_number, c.title, c.court_level, c.offence, c.status, c.outcome,
            (SELECT group_concat(p.name, '; ') FROM case_parties p WHERE p.case_id = c.id AND p.role = 'accused') AS accused,
            (SELECT MIN(s.scheduled_at) FROM sittings s WHERE s.case_id = c.id AND s.status = 'scheduled') AS next_sitting_at,
            (SELECT COUNT(*) FROM adjournments a WHERE a.case_id = c.id) AS adjournments,
            c.created_at
         FROM cases c
         WHERE (c.court_number LIKE ?1 ESCAPE '\\' OR c.title LIKE ?1 ESCAPE '\\' OR c.offence LIKE ?1 ESCAPE '\\'
                OR EXISTS (SELECT 1 FROM case_parties p WHERE p.case_id = c.id AND p.name LIKE ?1 ESCAPE '\\'))
         {filter}
         ORDER BY c.created_at DESC, c.court_number LIMIT ?2"
    )))
    .bind(like)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn list_parties(pool: &SqlitePool, case_id: &str) -> Result<Vec<Party>, sqlx::Error> {
    sqlx::query_as::<_, Party>(
        "SELECT id, case_id, role, name, custody, remand_until, custody_place, note, created_at FROM case_parties
         WHERE case_id = ? ORDER BY CASE role WHEN 'accused' THEN 0 WHEN 'complainant' THEN 1 WHEN 'prosecutor' THEN 2 ELSE 3 END, created_at",
    )
    .bind(case_id)
    .fetch_all(pool)
    .await
}

struct CheckedParty {
    name: String,
    custody: Option<String>,
    remand_until: Option<i64>,
    custody_place: Option<String>,
}

fn check_party(input: &PartyInput) -> Result<CheckedParty, DomainError> {
    if !matches!(input.role.as_str(), "accused" | "complainant" | "prosecutor" | "defence_counsel") {
        return invalid("That is not a role in a case.");
    }
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("A person in a case needs a name.");
    }
    if input.role != "accused" {
        if input.custody.is_some() || input.remand_until.is_some() {
            return invalid("Custody is recorded for an accused person only.");
        }
        return Ok(CheckedParty { name, custody: None, remand_until: None, custody_place: None });
    }
    let custody = clean(input.custody.clone());
    if let Some(c) = &custody {
        if !matches!(c.as_str(), "remanded" | "on_bail" | "not_in_custody") {
            return invalid("Custody is remanded, on bail, or not in custody.");
        }
    }
    if input.remand_until.is_some() && custody.as_deref() != Some("remanded") {
        return invalid("A remand date only goes with a person who is remanded.");
    }
    if let Some(day) = input.remand_until {
        if day <= 0 {
            return invalid("The remand date is not a valid date.");
        }
    }
    let place = if custody.as_deref() == Some("remanded") { clean(input.custody_place.clone()) } else { None };
    Ok(CheckedParty { name, custody, remand_until: input.remand_until, custody_place: place })
}

pub async fn add_party(pool: &SqlitePool, case_id: &str, input: PartyInput) -> Result<Party, DomainError> {
    let party = check_party(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    require_open_case(&mut tx, case_id).await?;
    sqlx::query("INSERT INTO case_parties (id, case_id, role, name, custody, remand_until, custody_place, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(case_id)
        .bind(&input.role)
        .bind(&party.name)
        .bind(&party.custody)
        .bind(party.remand_until)
        .bind(&party.custody_place)
        .bind(clean(input.note))
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("party_added").subject("party", &id).scope(case_id).detail(&input.role)).await?;
    tx.commit().await?;
    Ok(get_party(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update_party(pool: &SqlitePool, id: &str, input: PartyInput) -> Result<Party, DomainError> {
    let party = check_party(&input)?;
    let mut tx = begin_write(pool).await?;
    let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM case_parties WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(case_id) = case_id else { return Err(DomainError::NotFound("Person not found.".to_string())) };
    require_open_case(&mut tx, &case_id).await?;
    sqlx::query("UPDATE case_parties SET role = ?, name = ?, custody = ?, remand_until = ?, custody_place = ?, note = ? WHERE id = ?")
        .bind(&input.role)
        .bind(&party.name)
        .bind(&party.custody)
        .bind(party.remand_until)
        .bind(&party.custody_place)
        .bind(clean(input.note))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("party_updated").subject("party", id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(get_party(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn remove_party(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let case_id: Option<String> = sqlx::query_scalar("SELECT case_id FROM case_parties WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some(case_id) = case_id else { return Err(DomainError::NotFound("Person not found.".to_string())) };
    require_open_case(&mut tx, &case_id).await?;
    sqlx::query("DELETE FROM case_parties WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("party_removed").subject("party", id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(())
}

async fn get_party(pool: &SqlitePool, id: &str) -> Result<Option<Party>, sqlx::Error> {
    sqlx::query_as::<_, Party>("SELECT id, case_id, role, name, custody, remand_until, custody_place, note, created_at FROM case_parties WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
}

/// A concluded case is a closed record: it takes no new people or sittings until
/// it is reopened.
pub(super) async fn require_open_case(conn: &mut sqlx::SqliteConnection, case_id: &str) -> Result<(), DomainError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM cases WHERE id = ?").bind(case_id).fetch_optional(&mut *conn).await?;
    match status.as_deref() {
        None => Err(DomainError::NotFound("Case not found.".to_string())),
        Some("open") => Ok(()),
        Some(_) => invalid("This case is concluded. Reopen it to change it."),
    }
}

pub async fn conclude(pool: &SqlitePool, id: &str, outcome: &str) -> Result<Case, DomainError> {
    let outcome = outcome.trim();
    if outcome.is_empty() {
        return invalid("Record how the case ended.");
    }
    let mut tx = begin_write(pool).await?;
    require_open_case(&mut tx, id).await?;
    let waiting: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM sittings WHERE case_id = ? AND status = 'scheduled'").bind(id).fetch_one(&mut *tx).await?;
    if waiting > 0 {
        return invalid("Close or cancel the sittings still scheduled before concluding the case.");
    }
    sqlx::query("UPDATE cases SET status = 'concluded', outcome = ?, concluded_at = cast(unixepoch('subsecond') * 1000 as integer), updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(outcome)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("case_concluded").subject("case", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn reopen(pool: &SqlitePool, id: &str) -> Result<Case, DomainError> {
    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM cases WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match status.as_deref() {
        None => return Err(DomainError::NotFound("Case not found.".to_string())),
        Some("concluded") => {}
        Some(_) => return invalid("This case is already open."),
    }
    sqlx::query("UPDATE cases SET status = 'open', outcome = NULL, concluded_at = NULL, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("case_reopened").subject("case", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
