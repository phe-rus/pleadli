//! The registry's registers (docs/specs/dpp/0001-simplified-dpp, AC-5).
//! Incoming and outgoing are built from events the app already records, once
//! each, in the order they happened; movement is entered by the clerk who gives
//! a file out, and giving a file to a named member of staff also makes them its
//! holder. Entries are never edited or removed: a paper register is not, and
//! a mistake is corrected by a new line.

use chrono::{Datelike, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::capabilities::{self, Capability, Set};
use super::error::{clean, invalid, DomainError};
use super::staff::{Actor, Protection};

pub const REGISTERS: &[&str] = &["incoming", "outgoing", "movement"];

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// The calendar year of an instant in the office's own timezone.
pub fn year_of(ms: i64) -> i64 {
    let offset = pleadli_node_core::timezone::offset_at(ms);
    i64::from(offset.timestamp_millis_opt(ms).single().map_or(1970, |t| t.year()))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub register: String,
    pub year: i64,
    pub number: i64,
    pub prosecution_file_id: String,
    pub file_title: String,
    pub odpp_registration_number: Option<String>,
    pub police_reference: Option<String>,
    pub occurred_at: i64,
    pub from_to: Option<String>,
    pub given_to: Option<String>,
    pub note: Option<String>,
    #[sqlx(json)]
    pub stamps: Value,
    pub actor: Option<String>,
    pub created_at: i64,
}

const SELECT: &str = "SELECT e.id, e.register, e.year, e.number, e.prosecution_file_id, f.title AS file_title, f.odpp_registration_number, f.police_reference,
        e.occurred_at, e.from_to, e.given_to, e.note, e.stamps_json AS stamps, e.actor, e.created_at
    FROM register_entries e JOIN prosecution_files f ON f.id = e.prosecution_file_id";

async fn add(pool: &SqlitePool, register: &str, file_id: &str, occurred_at: i64, from_to: Option<&str>, given_to: Option<&str>, staff: Option<&str>, note: Option<&str>, actor: Option<&str>, source_key: Option<&str>) -> Result<(), sqlx::Error> {
    let year = year_of(occurred_at);
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let number: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(number), 0) + 1 FROM register_entries WHERE register = ? AND year = ?").bind(register).bind(year).fetch_one(&mut *tx).await?;
    sqlx::query(
        "INSERT OR IGNORE INTO register_entries (id, register, year, number, prosecution_file_id, occurred_at, from_to, given_to, given_to_staff, note, actor, source_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(register)
    .bind(year)
    .bind(number)
    .bind(file_id)
    .bind(occurred_at)
    .bind(from_to)
    .bind(given_to)
    .bind(staff)
    .bind(note)
    .bind(actor)
    .bind(source_key)
    .bind(now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await
}

/// Writes a line for every file received and every handover made that the
/// registers do not have yet, oldest first, so numbers follow the dates.
pub async fn sync(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let files: Vec<(String, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, police_station, received_at FROM prosecution_files WHERE 'file:' || id NOT IN (SELECT source_key FROM register_entries WHERE source_key IS NOT NULL) ORDER BY received_at, created_at",
    )
    .fetch_all(pool)
    .await?;
    for (id, station, at) in files {
        add(pool, "incoming", &id, at, station.as_deref(), None, None, None, None, Some(&format!("file:{id}"))).await?;
    }
    let sent: Vec<(String, String, String, String, Option<String>, Option<String>, i64)> = sqlx::query_as(
        "SELECT id, prosecution_file_id, recipient, method, note, handed_by, handed_at FROM handovers
         WHERE 'handover:' || id NOT IN (SELECT source_key FROM register_entries WHERE source_key IS NOT NULL) ORDER BY handed_at",
    )
    .fetch_all(pool)
    .await?;
    for (id, file, recipient, method, note, by, at) in sent {
        let how = match note.as_deref().filter(|n| !n.is_empty()) {
            Some(n) => format!("{method}: {n}"),
            None => method,
        };
        add(pool, "outgoing", &file, at, Some(&recipient), None, None, Some(&how), by.as_deref(), Some(&format!("handover:{id}"))).await?;
    }
    Ok(())
}

pub async fn list(pool: &SqlitePool, register: &str, year: i64) -> Result<Vec<Entry>, DomainError> {
    if !REGISTERS.contains(&register) {
        return invalid("That is not a register.");
    }
    sync(pool).await?;
    Ok(sqlx::query_as::<_, Entry>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE e.register = ? AND e.year = ? ORDER BY e.number")))
        .bind(register)
        .bind(year)
        .fetch_all(pool)
        .await?)
}

/// Years that have at least one line, newest first, always including this one.
pub async fn years(pool: &SqlitePool) -> Result<Vec<i64>, sqlx::Error> {
    sync(pool).await?;
    let mut years: Vec<i64> = sqlx::query_scalar("SELECT DISTINCT year FROM register_entries ORDER BY year DESC").fetch_all(pool).await?;
    let this = year_of(now());
    if !years.contains(&this) {
        years.insert(0, this);
    }
    Ok(years)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GiveOut {
    pub prosecution_file_id: String,
    /// A member of staff, who then holds the file; or leave empty and name
    /// someone outside the office in `given_to`.
    pub staff_id: Option<String>,
    pub given_to: Option<String>,
    pub note: Option<String>,
}

/// Gives a file out: one line in the movement register, and the file's holder
/// changes when it went to a member of staff. Who may do which is the
/// capabilities' to say: giving a file nobody holds is allocating (or, to
/// oneself, taking it); moving one that someone holds is reassigning. Whoever
/// receives a file must be someone who can review it.
pub async fn give_out(pool: &SqlitePool, input: GiveOut, by: &Actor, power: &Set, protection: Protection) -> Result<(), DomainError> {
    let staff = clean(input.staff_id);
    let named = clean(input.given_to);
    let holder: Option<Option<String>> = sqlx::query_scalar("SELECT assigned_to FROM prosecution_files WHERE id = ?").bind(&input.prosecution_file_id).fetch_optional(pool).await?;
    let Some(holder) = holder else {
        return Err(DomainError::NotFound("File not found.".into()));
    };
    let given = match (&staff, named) {
        (Some(id), _) => {
            let name: Option<String> = sqlx::query_scalar("SELECT name FROM staff WHERE id = ? AND active = 1").bind(id).fetch_optional(pool).await?;
            let Some(name) = name else {
                return invalid("That person is not on the office's list.");
            };
            let target = capabilities::for_staff(pool, protection, id).await?.unwrap_or_default();
            if !target.can_hold() {
                return invalid(&format!("{name} does not review files, so a file cannot be given to them. Choose a prosecutor."));
            }
            match (&holder, id == &by.id) {
                (Some(h), _) if h == id => return invalid(&format!("{name} already holds this file.")),
                // Taking a file nobody holds. Whoever may give files out may also take one for themselves.
                (None, true) if !power.self_assign && !power.allocate_files => return capabilities::require(power, Capability::SelfAssign).map(|_| ()),
                (None, false) => capabilities::require(power, Capability::AllocateFiles)?,
                // Anything that takes a file from a holder, to oneself or another, is a reassignment.
                (Some(_), _) => capabilities::require(power, Capability::ReassignFiles)?,
                (None, true) => {}
            }
            name
        }
        (None, Some(n)) => {
            // Sending the paper file somewhere outside the office is only a register line.
            capabilities::require(power, Capability::RegisterFiles)?;
            n
        }
        (None, None) => return invalid("Say who the file was given to."),
    };
    add(pool, "movement", &input.prosecution_file_id, now(), None, Some(&given), staff.as_deref(), clean(input.note).as_deref(), Some(by.name.as_str()), None).await?;
    if let Some(id) = &staff {
        sqlx::query("UPDATE prosecution_files SET assigned_to = ? WHERE id = ?").bind(id).bind(&input.prosecution_file_id).execute(pool).await?;
    }
    Ok(())
}

/// A stamp on a register line: what it says, who put it and when. Recorded as
/// text and shown as a stamp; nothing is drawn.
pub async fn stamp(pool: &SqlitePool, entry_id: &str, label: &str, actor: Option<&str>) -> Result<(), DomainError> {
    let Some(label) = clean(Some(label.to_string())) else {
        return invalid("Say what the stamp says.");
    };
    let current: String = sqlx::query_scalar("SELECT stamps_json FROM register_entries WHERE id = ?").bind(entry_id).fetch_one(pool).await?;
    let mut stamps: Vec<Value> = serde_json::from_str(&current).unwrap_or_default();
    stamps.push(json!({ "label": label, "by": actor, "at": now() }));
    sqlx::query("UPDATE register_entries SET stamps_json = ? WHERE id = ?").bind(Value::Array(stamps).to_string()).bind(entry_id).execute(pool).await?;
    Ok(())
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Holder {
    pub staff_id: Option<String>,
    pub name: Option<String>,
    pub files: i64,
}

/// Who holds how many open files; files nobody holds show as one line with no name.
pub async fn holders(pool: &SqlitePool) -> Result<Vec<Holder>, sqlx::Error> {
    sqlx::query_as(
        "SELECT f.assigned_to AS staff_id, s.name AS name, COUNT(*) AS files FROM prosecution_files f LEFT JOIN staff s ON s.id = f.assigned_to
         WHERE f.stage <> 'concluded' GROUP BY f.assigned_to ORDER BY (s.name IS NULL), s.name COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await
}

/// The next ODPP file number, if the office's own numbers show a pattern: the
/// newest number of the form `PREFIX/0142/2026` in this year, plus one. It is
/// only a suggestion; the office's numbering is the office's to confirm.
pub async fn next_number(pool: &SqlitePool) -> Result<Option<String>, sqlx::Error> {
    let numbers: Vec<String> = sqlx::query_scalar("SELECT odpp_registration_number FROM prosecution_files WHERE odpp_registration_number IS NOT NULL AND TRIM(odpp_registration_number) <> ''").fetch_all(pool).await?;
    let year = year_of(now());
    let mut best: Option<(String, u64, usize)> = None;
    for n in numbers {
        let parts: Vec<&str> = n.trim().rsplitn(3, '/').collect();
        if parts.len() != 3 || parts[0].parse::<i64>().ok() != Some(year) {
            continue;
        }
        let Ok(seq) = parts[1].parse::<u64>() else { continue };
        let width = parts[1].len();
        let prefix = parts[2].to_string();
        if best.as_ref().is_none_or(|(_, s, _)| seq > *s) {
            best = Some((prefix, seq, width));
        }
    }
    Ok(best.map(|(prefix, seq, width)| format!("{prefix}/{:0width$}/{year}", seq + 1)))
}

/// Takes a file into the officer's hands: the ODPP number if given, the
/// officer's name as holder if nobody holds it, and a received stamp on its
/// line in the incoming register. Doing it twice changes nothing more.
pub async fn receive(pool: &SqlitePool, file_id: &str, odpp_number: Option<String>, actor_id: Option<&str>, actor_name: Option<&str>) -> Result<(), DomainError> {
    let row: Option<(Option<String>, Option<String>)> = sqlx::query_as("SELECT odpp_registration_number, assigned_to FROM prosecution_files WHERE id = ?").bind(file_id).fetch_optional(pool).await?;
    let Some((current_number, holder)) = row else {
        return Err(DomainError::NotFound("File not found.".into()));
    };
    if let (None, Some(number)) = (current_number.as_deref().filter(|n| !n.trim().is_empty()), clean(odpp_number)) {
        let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_files WHERE odpp_registration_number = ? AND id <> ?").bind(&number).bind(file_id).fetch_one(pool).await?;
        if taken > 0 {
            return invalid("Another file already has that ODPP number.");
        }
        sqlx::query("UPDATE prosecution_files SET odpp_registration_number = ? WHERE id = ?").bind(&number).bind(file_id).execute(pool).await?;
    }
    if holder.is_none() {
        if let Some(id) = actor_id {
            sqlx::query("UPDATE prosecution_files SET assigned_to = ? WHERE id = ?").bind(id).bind(file_id).execute(pool).await?;
        }
    }
    sync(pool).await?;
    let entry: Option<(String, String)> = sqlx::query_as("SELECT id, stamps_json FROM register_entries WHERE register = 'incoming' AND prosecution_file_id = ? ORDER BY number LIMIT 1").bind(file_id).fetch_optional(pool).await?;
    if let Some((id, stamps)) = entry {
        if !stamps.contains("\"RECEIVED\"") {
            stamp(pool, &id, "RECEIVED", actor_name).await?;
        }
    }
    Ok(())
}
