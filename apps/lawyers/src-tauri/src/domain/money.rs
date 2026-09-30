//! Money (docs/lawyers/REVIEW-2026-09-30.md, L4; D9): the client account
//! ledger and fee notes. The rules the law puts on an advocate's books are
//! enforced here, not in the screen:
//! - each client's money is kept apart, and the books are append-only for the
//!   six years the Accounts Rules (r.9) require: a mistake is reversed by a new
//!   entry, never edited or deleted;
//! - nothing is paid out of a client's money that the client does not have;
//! - client money moves to the practice only against a fee note delivered to
//!   that client, and never more than it still owes;
//! - state brief, pro bono and legal aid clinic matters are never billed.
//! A fee note is not a tax invoice: a VAT-registered practice issues that
//! through URA's EFRIS, which this app does not do.

use chrono::Datelike;
use pleadli_node_core::db::begin_write;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::matters::require_open;

const UNBILLED: [&str; 3] = ["state_appointed", "pro_bono", "legal_aid_clinic"];
/// A sanity bound, not a rule: ten billion shillings.
const MAX_AMOUNT: i64 = 10_000_000_000;

fn eat_year(ms: i64) -> i32 {
    let eat = chrono::FixedOffset::east_opt(3 * 3600).expect("a valid offset");
    chrono::DateTime::from_timestamp_millis(ms).map(|d| d.with_timezone(&eat).year()).unwrap_or(1970)
}

// ---------------------------------------------------------------- the ledger

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub id: String,
    pub client_id: String,
    pub matter_id: Option<String>,
    pub account: String,
    pub kind: String,
    pub amount: i64,
    pub on_day: i64,
    pub reference: Option<String>,
    pub description: String,
    pub fee_note_id: Option<String>,
    pub fee_note_number: Option<String>,
    pub reverses: Option<String>,
    /// Another entry reverses this one.
    pub reversed: bool,
    pub recorded_by: Option<String>,
    pub created_at: i64,
    pub matter_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryInput {
    pub client_id: String,
    pub matter_id: Option<String>,
    pub kind: String,
    pub amount: i64,
    pub on_day: i64,
    pub reference: Option<String>,
    pub description: String,
    pub fee_note_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientMoney {
    pub client_id: String,
    pub client_name: String,
    /// Held for the client in the client account.
    pub client_balance: i64,
    /// Paid by the practice for the client and not yet billed back.
    pub disbursements_unbilled: i64,
    /// Owed on issued fee notes.
    pub owed: i64,
    pub entries: Vec<LedgerEntry>,
}

fn account_of(kind: &str) -> Option<&'static str> {
    match kind {
        "received" | "paid_out" | "to_office" => Some("client"),
        "fee_received" | "disbursement" => Some("office"),
        _ => None,
    }
}

/// What a client-account entry does to the client's balance, before reversal.
const CLIENT_SIGN: &str = "CASE kind WHEN 'received' THEN 1 WHEN 'paid_out' THEN -1 WHEN 'to_office' THEN -1 ELSE 0 END";

async fn client_balance(conn: &mut SqliteConnection, client_id: &str) -> Result<i64, sqlx::Error> {
    let sql = format!("SELECT COALESCE(SUM(({CLIENT_SIGN}) * amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE client_id = ? AND account = 'client'");
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(client_id).fetch_one(&mut *conn).await
}

/// Paid on a fee note so far: to office from the client account, or straight
/// to the practice, net of reversals.
async fn paid_on(conn: &mut SqliteConnection, fee_note_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE fee_note_id = ? AND kind IN ('to_office', 'fee_received')",
    )
    .bind(fee_note_id)
    .fetch_one(&mut *conn)
    .await
}

async fn note_total(conn: &mut SqliteConnection, fee_note_id: &str) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT COALESCE(SUM(amount), 0) FROM fee_note_lines WHERE fee_note_id = ?").bind(fee_note_id).fetch_one(&mut *conn).await
}

/// Records one entry in the books, refusing what the Accounts Rules forbid.
pub async fn record(pool: &SqlitePool, input: EntryInput, by: &str) -> Result<LedgerEntry, DomainError> {
    let Some(account) = account_of(&input.kind) else {
        return invalid("Unknown kind of entry.");
    };
    if input.amount <= 0 || input.amount > MAX_AMOUNT {
        return invalid("Give an amount in shillings, more than nothing.");
    }
    check_timestamp(input.on_day, "The day")?;
    let description = input.description.trim().to_string();
    if description.is_empty() {
        return invalid("Say what the money is for.");
    }
    let mut tx = begin_write(pool).await?;
    let client: Option<String> = sqlx::query_scalar("SELECT id FROM clients WHERE id = ?").bind(&input.client_id).fetch_optional(&mut *tx).await?;
    if client.is_none() {
        return Err(DomainError::NotFound("No such client.".into()));
    }
    if let Some(matter_id) = &input.matter_id {
        let owner: Option<String> = sqlx::query_scalar("SELECT client_id FROM matters WHERE id = ?").bind(matter_id).fetch_optional(&mut *tx).await?;
        if owner.as_deref() != Some(input.client_id.as_str()) {
            return invalid("That matter is another client's.");
        }
    }
    let needs_note = matches!(input.kind.as_str(), "to_office" | "fee_received");
    let fee_note_id = if needs_note { clean(input.fee_note_id) } else { None };
    if needs_note {
        let Some(note_id) = &fee_note_id else {
            return invalid("Client money goes to the practice only against a fee note delivered to the client. Choose the fee note.");
        };
        let note: Option<(String, String)> = sqlx::query_as("SELECT client_id, status FROM fee_notes WHERE id = ?").bind(note_id).fetch_optional(&mut *tx).await?;
        match note {
            Some((client, status)) if client == input.client_id && status == "issued" => {}
            Some((client, _)) if client != input.client_id => return invalid("That fee note is another client's."),
            Some(_) => return invalid("Only an issued fee note can be paid."),
            None => return Err(DomainError::NotFound("No such fee note.".into())),
        }
        let outstanding = note_total(&mut tx, note_id).await? - paid_on(&mut tx, note_id).await?;
        if input.amount > outstanding {
            return Err(DomainError::Invalid(format!("That is more than is owed on the fee note (UGX {outstanding}).")));
        }
    }
    if matches!(input.kind.as_str(), "paid_out" | "to_office") {
        let balance = client_balance(&mut tx, &input.client_id).await?;
        if input.amount > balance {
            return Err(DomainError::Invalid(format!(
                "The client holds UGX {balance} in the client account. Nothing may be paid from a client's money that the client does not have (Accounts Rules)."
            )));
        }
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO ledger_entries (id, client_id, matter_id, account, kind, amount, on_day, reference, description, fee_note_id, recorded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.client_id)
    .bind(clean(input.matter_id))
    .bind(account)
    .bind(&input.kind)
    .bind(input.amount)
    .bind(input.on_day)
    .bind(clean(input.reference))
    .bind(&description)
    .bind(&fee_note_id)
    .bind(by)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("ledger_entry").subject("ledger_entry", &id).detail(format!("{} {} UGX {}", account, input.kind, input.amount))).await?;
    tx.commit().await?;
    Ok(entry(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Puts a mistake right: a new entry that undoes one, once. Reversing money
/// received is refused if it has already been spent.
pub async fn reverse(pool: &SqlitePool, id: &str, reason: &str, by: &str) -> Result<LedgerEntry, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return invalid("Say why it is reversed.");
    }
    let original = entry(pool, id).await?.ok_or_else(|| DomainError::NotFound("No such entry.".into()))?;
    if original.reverses.is_some() {
        return invalid("A reversal is not reversed. Record the entry again instead.");
    }
    if original.reversed {
        return invalid("That entry is already reversed.");
    }
    let mut tx = begin_write(pool).await?;
    if original.kind == "received" && client_balance(&mut tx, &original.client_id).await? < original.amount {
        return invalid("That money has already been paid out or moved to the practice. Reverse those entries first.");
    }
    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO ledger_entries (id, client_id, matter_id, account, kind, amount, on_day, reference, description, fee_note_id, reverses, recorded_by)
         SELECT ?, client_id, matter_id, account, kind, amount, ?, reference, ?, fee_note_id, id, ? FROM ledger_entries WHERE id = ?",
    )
    .bind(&new_id)
    .bind(chrono::Utc::now().timestamp_millis())
    .bind(format!("Reversal: {reason}"))
    .bind(by)
    .bind(id)
    .execute(&mut *tx)
    .await?;
    audit::record(&mut tx, Entry::new("ledger_reversed").subject("ledger_entry", id).detail(reason.to_string())).await?;
    tx.commit().await?;
    Ok(entry(pool, &new_id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

const ENTRY_COLUMNS: &str = "e.id, e.client_id, e.matter_id, e.account, e.kind, e.amount, e.on_day, e.reference, e.description, e.fee_note_id, f.number AS fee_note_number,
    e.reverses, EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses = e.id) AS reversed, e.recorded_by, e.created_at, m.title AS matter_title";

async fn entry(pool: &SqlitePool, id: &str) -> Result<Option<LedgerEntry>, sqlx::Error> {
    let sql = format!("SELECT {ENTRY_COLUMNS} FROM ledger_entries e LEFT JOIN fee_notes f ON f.id = e.fee_note_id LEFT JOIN matters m ON m.id = e.matter_id WHERE e.id = ?");
    sqlx::query_as::<_, LedgerEntry>(sqlx::AssertSqlSafe(sql)).bind(id).fetch_optional(pool).await
}

/// A client's books: both accounts, oldest first, and what is held and owed.
pub async fn client_money(pool: &SqlitePool, client_id: &str) -> Result<ClientMoney, DomainError> {
    let name: String = sqlx::query_scalar("SELECT name FROM clients WHERE id = ?").bind(client_id).fetch_optional(pool).await?.ok_or_else(|| DomainError::NotFound("No such client.".into()))?;
    let sql = format!("SELECT {ENTRY_COLUMNS} FROM ledger_entries e LEFT JOIN fee_notes f ON f.id = e.fee_note_id LEFT JOIN matters m ON m.id = e.matter_id WHERE e.client_id = ? ORDER BY e.on_day, e.created_at");
    let entries = sqlx::query_as::<_, LedgerEntry>(sqlx::AssertSqlSafe(sql)).bind(client_id).fetch_all(pool).await?;
    let mut conn = pool.acquire().await?;
    let client_balance = client_balance(&mut conn, client_id).await?;
    let disbursed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE client_id = ? AND kind = 'disbursement'",
    )
    .bind(client_id)
    .fetch_one(&mut *conn)
    .await?;
    let billed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(l.amount), 0) FROM fee_note_lines l JOIN fee_notes f ON f.id = l.fee_note_id WHERE f.client_id = ? AND f.status = 'issued' AND l.kind = 'disbursement'",
    )
    .bind(client_id)
    .fetch_one(&mut *conn)
    .await?;
    let owed: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM((SELECT COALESCE(SUM(amount), 0) FROM fee_note_lines WHERE fee_note_id = f.id)
            - (SELECT COALESCE(SUM(amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE fee_note_id = f.id AND kind IN ('to_office', 'fee_received'))), 0)
         FROM fee_notes f WHERE f.client_id = ? AND f.status = 'issued'",
    )
    .bind(client_id)
    .fetch_one(&mut *conn)
    .await?;
    Ok(ClientMoney { client_id: client_id.to_string(), client_name: name, client_balance, disbursements_unbilled: (disbursed - billed).max(0), owed, entries })
}

// ---------------------------------------------------------------- fee notes

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeeNoteLine {
    pub id: String,
    pub position: i64,
    pub kind: String,
    pub description: String,
    pub amount: i64,
    pub time_entry_id: Option<String>,
    pub minutes: Option<i64>,
    pub rate: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FeeNoteSummary {
    pub id: String,
    pub number: Option<String>,
    pub matter_id: String,
    pub client_id: String,
    pub status: String,
    pub issued_on: Option<i64>,
    pub due_on: Option<i64>,
    pub note: Option<String>,
    pub issued_by: Option<String>,
    pub cancelled_reason: Option<String>,
    pub created_at: i64,
    pub matter_title: String,
    pub court_number: Option<String>,
    pub client_name: String,
    pub total: i64,
    pub paid: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeNote {
    #[serde(flatten)]
    pub summary: FeeNoteSummary,
    pub lines: Vec<FeeNoteLine>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineInput {
    pub kind: String,
    pub description: String,
    pub amount: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeeNoteInput {
    pub matter_id: String,
    /// Time entries to bill at `rate` shillings an hour.
    #[serde(default)]
    pub time_entry_ids: Vec<String>,
    pub rate: Option<i64>,
    #[serde(default)]
    pub lines: Vec<LineInput>,
    pub note: Option<String>,
}

const NOTE_COLUMNS: &str = "f.id, f.number, f.matter_id, f.client_id, f.status, f.issued_on, f.due_on, f.note, f.issued_by, f.cancelled_reason, f.created_at,
    m.title AS matter_title, m.court_number, c.name AS client_name,
    (SELECT COALESCE(SUM(amount), 0) FROM fee_note_lines WHERE fee_note_id = f.id) AS total,
    (SELECT COALESCE(SUM(amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE fee_note_id = f.id AND kind IN ('to_office', 'fee_received')) AS paid";

pub async fn list_notes(pool: &SqlitePool, matter_id: &str, client_id: &str) -> Result<Vec<FeeNoteSummary>, sqlx::Error> {
    let sql = format!(
        "SELECT {NOTE_COLUMNS} FROM fee_notes f JOIN matters m ON m.id = f.matter_id JOIN clients c ON c.id = f.client_id
         WHERE (?1 = '' OR f.matter_id = ?1) AND (?2 = '' OR f.client_id = ?2) ORDER BY COALESCE(f.issued_on, f.created_at) DESC"
    );
    sqlx::query_as::<_, FeeNoteSummary>(sqlx::AssertSqlSafe(sql)).bind(matter_id).bind(client_id).fetch_all(pool).await
}

pub async fn get_note(pool: &SqlitePool, id: &str) -> Result<Option<FeeNote>, sqlx::Error> {
    let sql = format!("SELECT {NOTE_COLUMNS} FROM fee_notes f JOIN matters m ON m.id = f.matter_id JOIN clients c ON c.id = f.client_id WHERE f.id = ?");
    let Some(summary) = sqlx::query_as::<_, FeeNoteSummary>(sqlx::AssertSqlSafe(sql)).bind(id).fetch_optional(pool).await? else {
        return Ok(None);
    };
    let lines = sqlx::query_as::<_, FeeNoteLine>("SELECT id, position, kind, description, amount, time_entry_id, minutes, rate FROM fee_note_lines WHERE fee_note_id = ? ORDER BY position")
        .bind(id)
        .fetch_all(pool)
        .await?;
    Ok(Some(FeeNote { summary, lines }))
}

/// Writes a draft's lines (all of them, replacing any before).
async fn write_lines(conn: &mut SqliteConnection, note_id: &str, matter_id: &str, input: &FeeNoteInput) -> Result<(), DomainError> {
    sqlx::query("DELETE FROM fee_note_lines WHERE fee_note_id = ?").bind(note_id).execute(&mut *conn).await?;
    let mut position = 0i64;
    if !input.time_entry_ids.is_empty() {
        let rate = input.rate.filter(|r| *r > 0 && *r <= MAX_AMOUNT).ok_or_else(|| DomainError::Invalid("Give the hourly rate for the time billed.".into()))?;
        for time_id in &input.time_entry_ids {
            let found: Option<(String, i64, i64, String)> =
                sqlx::query_as("SELECT matter_id, worked_on, minutes, description FROM time_entries WHERE id = ?").bind(time_id).fetch_optional(&mut *conn).await?;
            let Some((entry_matter, worked_on, minutes, description)) = found else {
                return Err(DomainError::NotFound("No such time entry.".into()));
            };
            if entry_matter != matter_id {
                return invalid("That time was spent on another matter.");
            }
            let billed: Option<String> = sqlx::query_scalar("SELECT fee_note_id FROM fee_note_lines WHERE time_entry_id = ?").bind(time_id).fetch_optional(&mut *conn).await?;
            if billed.is_some() {
                return invalid("Some of that time is already on another fee note.");
            }
            let eat = chrono::FixedOffset::east_opt(3 * 3600).expect("a valid offset");
            let day = chrono::DateTime::from_timestamp_millis(worked_on).map(|d| d.with_timezone(&eat).format("%-d %b %Y").to_string()).unwrap_or_default();
            position += 1;
            sqlx::query("INSERT INTO fee_note_lines (id, fee_note_id, position, kind, description, amount, time_entry_id, minutes, rate) VALUES (?, ?, ?, 'time', ?, ?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string())
                .bind(note_id)
                .bind(position)
                .bind(format!("{day}: {description}"))
                .bind((minutes * rate + 30) / 60)
                .bind(time_id)
                .bind(minutes)
                .bind(rate)
                .execute(&mut *conn)
                .await?;
        }
    }
    for line in &input.lines {
        if !["fee", "disbursement"].contains(&line.kind.as_str()) {
            return invalid("A line is a fee or a disbursement.");
        }
        if line.description.trim().is_empty() {
            return invalid("Every line needs a description.");
        }
        if line.amount <= 0 || line.amount > MAX_AMOUNT {
            return invalid("Every line needs an amount in shillings.");
        }
        position += 1;
        sqlx::query("INSERT INTO fee_note_lines (id, fee_note_id, position, kind, description, amount) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(note_id)
            .bind(position)
            .bind(&line.kind)
            .bind(line.description.trim())
            .bind(line.amount)
            .execute(&mut *conn)
            .await?;
    }
    Ok(())
}

pub async fn create_note(pool: &SqlitePool, input: FeeNoteInput) -> Result<FeeNote, DomainError> {
    let mut tx = begin_write(pool).await?;
    let (engagement, _) = require_open(&mut tx, &input.matter_id).await?;
    if UNBILLED.contains(&engagement.as_str()) {
        return invalid("This matter is on the state brief, pro bono or with a legal aid clinic: it is not billed to the client.");
    }
    let client_id: String = sqlx::query_scalar("SELECT client_id FROM matters WHERE id = ?").bind(&input.matter_id).fetch_one(&mut *tx).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO fee_notes (id, matter_id, client_id, note) VALUES (?, ?, ?, ?)").bind(&id).bind(&input.matter_id).bind(&client_id).bind(clean(input.note.clone())).execute(&mut *tx).await?;
    write_lines(&mut tx, &id, &input.matter_id, &input).await?;
    tx.commit().await?;
    Ok(get_note(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update_note(pool: &SqlitePool, id: &str, input: FeeNoteInput) -> Result<FeeNote, DomainError> {
    let mut tx = begin_write(pool).await?;
    let found: Option<(String, String)> = sqlx::query_as("SELECT matter_id, status FROM fee_notes WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some((matter_id, status)) = found else {
        return Err(DomainError::NotFound("No such fee note.".into()));
    };
    if status != "draft" {
        return invalid("An issued fee note is not changed. Cancel it and make a new one.");
    }
    if matter_id != input.matter_id {
        return invalid("A fee note stays on its matter.");
    }
    sqlx::query("UPDATE fee_notes SET note = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(clean(input.note.clone())).bind(id).execute(&mut *tx).await?;
    write_lines(&mut tx, id, &matter_id, &input).await?;
    tx.commit().await?;
    Ok(get_note(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn delete_draft(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM fee_notes WHERE id = ?").bind(id).fetch_optional(pool).await?;
    match status.as_deref() {
        None => Err(DomainError::NotFound("No such fee note.".into())),
        Some("draft") => {
            sqlx::query("DELETE FROM fee_notes WHERE id = ?").bind(id).execute(pool).await?;
            Ok(())
        }
        Some(_) => invalid("An issued fee note is kept. Cancel it instead."),
    }
}

/// Issues a draft: it gets its number and is delivered; from now on client
/// money may be moved to the practice against it.
pub async fn issue(pool: &SqlitePool, id: &str, issued_on: i64, due_on: Option<i64>, by: &str) -> Result<FeeNote, DomainError> {
    check_timestamp(issued_on, "The day it is issued")?;
    if due_on.is_some_and(|d| d < issued_on) {
        return invalid("It cannot fall due before it is issued.");
    }
    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM fee_notes WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match status.as_deref() {
        None => return Err(DomainError::NotFound("No such fee note.".into())),
        Some("draft") => {}
        Some(_) => return invalid("That fee note is already issued or cancelled."),
    }
    if note_total(&mut tx, id).await? <= 0 {
        return invalid("A fee note needs at least one line with an amount.");
    }
    let year = eat_year(issued_on);
    let in_year: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM fee_notes WHERE number LIKE ?").bind(format!("FN/{year}/%")).fetch_one(&mut *tx).await?;
    let number = format!("FN/{year}/{:04}", in_year + 1);
    sqlx::query("UPDATE fee_notes SET status = 'issued', number = ?, issued_on = ?, due_on = ?, issued_by = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&number)
        .bind(issued_on)
        .bind(due_on)
        .bind(by)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("fee_note_issued").subject("fee_note", id).detail(number)).await?;
    tx.commit().await?;
    Ok(get_note(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Cancels an issued fee note that nothing has been paid on. Its time can be
/// billed again; the note and its number stay in the books.
pub async fn cancel(pool: &SqlitePool, id: &str, reason: &str) -> Result<FeeNote, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return invalid("Say why it is cancelled.");
    }
    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM fee_notes WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    if status.as_deref() != Some("issued") {
        return invalid("Only an issued fee note is cancelled. A draft is simply deleted.");
    }
    if paid_on(&mut tx, id).await? > 0 {
        return invalid("Money has been received on it. Reverse those entries first.");
    }
    sqlx::query("UPDATE fee_notes SET status = 'cancelled', cancelled_reason = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(reason).bind(id).execute(&mut *tx).await?;
    sqlx::query("UPDATE fee_note_lines SET time_entry_id = NULL WHERE fee_note_id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("fee_note_cancelled").subject("fee_note", id).detail(reason.to_string())).await?;
    tx.commit().await?;
    Ok(get_note(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Time on a matter not yet on a fee note.
pub async fn unbilled_time(pool: &SqlitePool, matter_id: &str) -> Result<Vec<super::notes::TimeEntry>, sqlx::Error> {
    sqlx::query_as(
        "SELECT t.id, t.matter_id, t.worked_on, t.minutes, t.description, t.created_at, m.title AS matter_title, m.court_number, m.engagement
         FROM time_entries t JOIN matters m ON m.id = t.matter_id
         WHERE t.matter_id = ? AND NOT EXISTS (SELECT 1 FROM fee_note_lines l WHERE l.time_entry_id = t.id) ORDER BY t.worked_on",
    )
    .bind(matter_id)
    .fetch_all(pool)
    .await
}

/// Across the practice: what clients hold and owe, for the Money page.
#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ClientPosition {
    pub client_id: String,
    pub client_name: String,
    pub client_balance: i64,
    pub owed: i64,
}

pub async fn positions(pool: &SqlitePool) -> Result<Vec<ClientPosition>, sqlx::Error> {
    let sql = format!(
        "SELECT c.id AS client_id, c.name AS client_name,
           (SELECT COALESCE(SUM(({CLIENT_SIGN}) * amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE client_id = c.id AND account = 'client') AS client_balance,
           (SELECT COALESCE(SUM((SELECT COALESCE(SUM(amount), 0) FROM fee_note_lines WHERE fee_note_id = f.id)
              - (SELECT COALESCE(SUM(amount * (CASE WHEN reverses IS NULL THEN 1 ELSE -1 END)), 0) FROM ledger_entries WHERE fee_note_id = f.id AND kind IN ('to_office', 'fee_received'))), 0)
            FROM fee_notes f WHERE f.client_id = c.id AND f.status = 'issued') AS owed
         FROM clients c
         WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE client_id = c.id) OR EXISTS (SELECT 1 FROM fee_notes WHERE client_id = c.id AND status = 'issued')
         ORDER BY c.name"
    );
    sqlx::query_as::<_, ClientPosition>(sqlx::AssertSqlSafe(sql)).fetch_all(pool).await
}
