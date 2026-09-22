//! The workspace of one sitting: who appeared, the notes taken as it ran, and
//! the signed record. The law makes the judicial officer's signed record the
//! record of proceedings (MCA s.136(2) and s.138, TIA s.86(2)), so the record is
//! the officer's own: appearances and notes are theirs to write until they sign,
//! and signing freezes them under a SHA-256 of exactly what was signed.
//!
//! Individual notes are not written to the audit trail: a busy sitting would
//! drown it, and until signing they are working notes. Taking appearances and
//! signing are.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::cases::{self, Party};
use super::error::{clean, invalid, DomainError};
use super::exhibits::{self, Exhibit};
use super::sittings::{self, Adjournment, Sitting};
use pleadli_node_core::db::begin_write;

pub const ROLES: [&str; 7] = ["accused", "complainant", "prosecutor", "defence_counsel", "witness", "interpreter", "other"];
pub const ATTENDANCE: [&str; 5] = ["unrecorded", "present", "absent", "represented", "not_produced"];
pub const NOTE_KINDS: [&str; 6] = ["note", "evidence", "submission", "objection", "ruling", "direction"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub id: String,
    pub sitting_id: String,
    pub party_id: Option<String>,
    pub name: String,
    pub role: String,
    pub attendance: String,
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BenchNote {
    pub id: String,
    pub sitting_id: String,
    pub at: i64,
    pub kind: String,
    pub speaker: Option<String>,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceInput {
    pub name: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceInput {
    pub attendance: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub kind: String,
    pub speaker: Option<String>,
    pub body: String,
    /// When it was written; the moment of the request if not given.
    pub at: Option<i64>,
}

/// The case as the sitting needs to see it.
#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CaseHead {
    pub id: String,
    pub court_number: String,
    pub title: String,
    pub court_level: String,
    pub offence: Option<String>,
    pub status: String,
}

/// What happened at an earlier sitting of the same case: the preparation a
/// judicial officer wants before the next one.
#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PreviousSitting {
    pub id: String,
    pub scheduled_at: i64,
    pub purpose: String,
    pub status: String,
    pub outcome: Option<String>,
    pub reason: Option<String>,
    pub responsible: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordState {
    pub signed_at: Option<i64>,
    pub signed_by: Option<String>,
    pub sha256: Option<String>,
    /// Whether the stored notes and appearances still hash to what was signed.
    pub intact: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SittingDetail {
    pub sitting: Sitting,
    pub case: CaseHead,
    pub parties: Vec<Party>,
    pub appearances: Vec<Appearance>,
    pub notes: Vec<BenchNote>,
    pub exhibits: Vec<Exhibit>,
    pub adjournment: Option<Adjournment>,
    pub previous: Vec<PreviousSitting>,
    pub record: RecordState,
}

const APPEARANCE_COLUMNS: &str = "id, sitting_id, party_id, name, role, attendance, note, created_at";

pub async fn list_appearances(pool: &SqlitePool, sitting_id: &str) -> Result<Vec<Appearance>, sqlx::Error> {
    sqlx::query_as::<_, Appearance>(sqlx::AssertSqlSafe(format!(
        "SELECT {APPEARANCE_COLUMNS} FROM appearances WHERE sitting_id = ?
         ORDER BY CASE role WHEN 'accused' THEN 0 WHEN 'prosecutor' THEN 1 WHEN 'defence_counsel' THEN 2 WHEN 'complainant' THEN 3 ELSE 4 END, created_at, id"
    )))
    .bind(sitting_id)
    .fetch_all(pool)
    .await
}

pub async fn list_notes(pool: &SqlitePool, sitting_id: &str) -> Result<Vec<BenchNote>, sqlx::Error> {
    sqlx::query_as::<_, BenchNote>("SELECT id, sitting_id, at, kind, speaker, body, created_at, updated_at FROM bench_notes WHERE sitting_id = ? ORDER BY at, created_at, id")
        .bind(sitting_id)
        .fetch_all(pool)
        .await
}

/// The canonical text that is signed: the sitting's own facts, the appearances
/// and the notes in order. `serde_json` writes object keys in sorted order, so
/// the same record always gives the same text.
fn canonical(sitting: &Sitting, appearances: &[Appearance], notes: &[BenchNote]) -> String {
    serde_json::json!({
        "sittingId": sitting.id,
        "caseId": sitting.case_id,
        "scheduledAt": sitting.scheduled_at,
        "purpose": sitting.purpose,
        "status": sitting.status,
        "appearances": appearances.iter().map(|a| serde_json::json!({ "name": a.name, "role": a.role, "attendance": a.attendance, "note": a.note })).collect::<Vec<_>>(),
        "notes": notes.iter().map(|n| serde_json::json!({ "at": n.at, "kind": n.kind, "speaker": n.speaker, "body": n.body })).collect::<Vec<_>>(),
    })
    .to_string()
}

fn hex(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

pub async fn detail(pool: &SqlitePool, id: &str) -> Result<SittingDetail, DomainError> {
    let sitting = sittings::get(pool, id).await?.ok_or_else(|| DomainError::NotFound("Sitting not found.".to_string()))?;
    let case = sqlx::query_as::<_, CaseHead>("SELECT id, court_number, title, court_level, offence, status FROM cases WHERE id = ?").bind(&sitting.case_id).fetch_one(pool).await?;
    let appearances = list_appearances(pool, id).await?;
    let notes = list_notes(pool, id).await?;
    let (signed_at, signed_by, sha256): (Option<i64>, Option<String>, Option<String>) =
        sqlx::query_as("SELECT record_signed_at, record_signed_by, record_sha256 FROM sittings WHERE id = ?").bind(id).fetch_one(pool).await?;
    let intact = sha256.as_ref().map(|hash| &hex(&canonical(&sitting, &appearances, &notes)) == hash);
    let adjournment = sqlx::query_as::<_, Adjournment>(
        "SELECT id, sitting_id, case_id, reason, responsible, note, next_date, next_sitting_id, recorded_at FROM adjournments WHERE sitting_id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    let previous = sqlx::query_as::<_, PreviousSitting>(
        "SELECT s.id, s.scheduled_at, s.purpose, s.status, s.outcome, a.reason, a.responsible
         FROM sittings s LEFT JOIN adjournments a ON a.sitting_id = s.id
         WHERE s.case_id = ? AND s.id <> ? AND s.scheduled_at < ? AND s.status <> 'cancelled'
         ORDER BY s.scheduled_at DESC LIMIT 5",
    )
    .bind(&sitting.case_id)
    .bind(id)
    .bind(sitting.scheduled_at)
    .fetch_all(pool)
    .await?;
    Ok(SittingDetail {
        parties: cases::list_parties(pool, &sitting.case_id).await?,
        exhibits: exhibits::list(pool, &sitting.case_id).await?,
        case,
        appearances,
        notes,
        adjournment,
        previous,
        record: RecordState { signed_at, signed_by, sha256, intact },
        sitting,
    })
}

/// A sitting whose record can still be written: not cancelled, not signed.
async fn writable(conn: &mut SqliteConnection, sitting_id: &str) -> Result<Sitting, DomainError> {
    let sitting = sqlx::query_as::<_, Sitting>("SELECT id, case_id, scheduled_at, purpose, courtroom, status, outcome, closed_at, note, created_at FROM sittings WHERE id = ?")
        .bind(sitting_id)
        .fetch_optional(&mut *conn)
        .await?;
    let Some(sitting) = sitting else { return Err(DomainError::NotFound("Sitting not found.".to_string())) };
    let signed: Option<i64> = sqlx::query_scalar("SELECT record_signed_at FROM sittings WHERE id = ?").bind(sitting_id).fetch_one(&mut *conn).await?;
    if signed.is_some() {
        return invalid("The record of this sitting is signed and cannot be changed.");
    }
    if sitting.status == "cancelled" {
        return invalid("This sitting was cancelled, so it has no record.");
    }
    Ok(sitting)
}

async fn sitting_of(conn: &mut SqliteConnection, table: &str, id: &str) -> Result<String, DomainError> {
    let sql = match table {
        "appearances" => "SELECT sitting_id FROM appearances WHERE id = ?",
        _ => "SELECT sitting_id FROM bench_notes WHERE id = ?",
    };
    let found: Option<String> = sqlx::query_scalar(sql).bind(id).fetch_optional(&mut *conn).await?;
    found.ok_or_else(|| DomainError::NotFound("Not found.".to_string()))
}

/// Puts every person in the case on the sitting's list of appearances, each as
/// `unrecorded`. Safe to repeat: a person already listed is not added twice.
pub async fn take_appearances(pool: &SqlitePool, sitting_id: &str) -> Result<Vec<Appearance>, DomainError> {
    let mut tx = begin_write(pool).await?;
    let sitting = writable(&mut tx, sitting_id).await?;
    let missing = sqlx::query_as::<_, Party>(
        "SELECT id, case_id, role, name, custody, remand_until, custody_place, note, created_at FROM case_parties
         WHERE case_id = ? AND id NOT IN (SELECT party_id FROM appearances WHERE sitting_id = ? AND party_id IS NOT NULL)",
    )
    .bind(&sitting.case_id)
    .bind(sitting_id)
    .fetch_all(&mut *tx)
    .await?;
    for party in &missing {
        sqlx::query("INSERT INTO appearances (id, sitting_id, party_id, name, role) VALUES (?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(sitting_id)
            .bind(&party.id)
            .bind(&party.name)
            .bind(&party.role)
            .execute(&mut *tx)
            .await?;
    }
    if !missing.is_empty() {
        audit::record(&mut tx, Entry::new("appearances_taken").subject("sitting", sitting_id).scope(&sitting.case_id).detail(missing.len().to_string())).await?;
    }
    tx.commit().await?;
    Ok(list_appearances(pool, sitting_id).await?)
}

pub async fn add_appearance(pool: &SqlitePool, sitting_id: &str, input: AppearanceInput) -> Result<Appearance, DomainError> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return invalid("Enter the name of the person.");
    }
    if !ROLES.contains(&input.role.as_str()) {
        return invalid("That is not a role at a sitting.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    writable(&mut tx, sitting_id).await?;
    sqlx::query("INSERT INTO appearances (id, sitting_id, name, role) VALUES (?, ?, ?, ?)").bind(&id).bind(sitting_id).bind(&name).bind(&input.role).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, Appearance>(sqlx::AssertSqlSafe(format!("SELECT {APPEARANCE_COLUMNS} FROM appearances WHERE id = ?"))).bind(&id).fetch_one(pool).await?)
}

pub async fn set_attendance(pool: &SqlitePool, id: &str, input: AttendanceInput) -> Result<Appearance, DomainError> {
    if !ATTENDANCE.contains(&input.attendance.as_str()) {
        return invalid("Choose whether the person was present.");
    }
    let mut tx = begin_write(pool).await?;
    let sitting_id = sitting_of(&mut tx, "appearances", id).await?;
    writable(&mut tx, &sitting_id).await?;
    let role: String = sqlx::query_scalar("SELECT role FROM appearances WHERE id = ?").bind(id).fetch_one(&mut *tx).await?;
    if input.attendance == "not_produced" && role != "accused" {
        return invalid("Only an accused person can be recorded as not produced from custody.");
    }
    sqlx::query("UPDATE appearances SET attendance = ?, note = ? WHERE id = ?").bind(&input.attendance).bind(clean(input.note)).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, Appearance>(sqlx::AssertSqlSafe(format!("SELECT {APPEARANCE_COLUMNS} FROM appearances WHERE id = ?"))).bind(id).fetch_one(pool).await?)
}

pub async fn remove_appearance(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let sitting_id = sitting_of(&mut tx, "appearances", id).await?;
    writable(&mut tx, &sitting_id).await?;
    sqlx::query("DELETE FROM appearances WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

fn check_note(input: &NoteInput) -> Result<String, DomainError> {
    if !NOTE_KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a kind of note.");
    }
    let body = input.body.trim().to_string();
    if body.is_empty() {
        return invalid("A note needs some text.");
    }
    Ok(body)
}

pub async fn add_note(pool: &SqlitePool, sitting_id: &str, input: NoteInput) -> Result<BenchNote, DomainError> {
    let body = check_note(&input)?;
    let id = Uuid::new_v4().to_string();
    let at = input.at.unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
    if at <= 0 {
        return invalid("The time of the note is not valid.");
    }
    let mut tx = begin_write(pool).await?;
    writable(&mut tx, sitting_id).await?;
    sqlx::query("INSERT INTO bench_notes (id, sitting_id, at, kind, speaker, body) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(sitting_id)
        .bind(at)
        .bind(&input.kind)
        .bind(clean(input.speaker))
        .bind(&body)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(get_note(pool, &id).await?)
}

pub async fn update_note(pool: &SqlitePool, id: &str, input: NoteInput) -> Result<BenchNote, DomainError> {
    let body = check_note(&input)?;
    let mut tx = begin_write(pool).await?;
    let sitting_id = sitting_of(&mut tx, "bench_notes", id).await?;
    writable(&mut tx, &sitting_id).await?;
    sqlx::query("UPDATE bench_notes SET kind = ?, speaker = ?, body = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&input.kind)
        .bind(clean(input.speaker))
        .bind(&body)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(get_note(pool, id).await?)
}

pub async fn remove_note(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let sitting_id = sitting_of(&mut tx, "bench_notes", id).await?;
    writable(&mut tx, &sitting_id).await?;
    sqlx::query("DELETE FROM bench_notes WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

async fn get_note(pool: &SqlitePool, id: &str) -> Result<BenchNote, sqlx::Error> {
    sqlx::query_as::<_, BenchNote>("SELECT id, sitting_id, at, kind, speaker, body, created_at, updated_at FROM bench_notes WHERE id = ?").bind(id).fetch_one(pool).await
}

/// The judicial officer signs the record of a sitting that has been closed. It
/// needs the officer's name set (Settings), because a record is signed by
/// someone. From then on the notes and appearances are frozen.
pub async fn sign(pool: &SqlitePool, sitting_id: &str) -> Result<SittingDetail, DomainError> {
    let mut tx = begin_write(pool).await?;
    let sitting = writable(&mut tx, sitting_id).await?;
    if sitting.status == "scheduled" {
        return invalid("Close the sitting as held or adjourned before signing its record.");
    }
    let name: Option<String> = sqlx::query_scalar("SELECT name FROM bench_profile WHERE id = 'default'").fetch_optional(&mut *tx).await?;
    let Some(name) = name else { return invalid("Set your name in Settings first: a record is signed by someone.") };

    let appearances = sqlx::query_as::<_, Appearance>(sqlx::AssertSqlSafe(format!(
        "SELECT {APPEARANCE_COLUMNS} FROM appearances WHERE sitting_id = ?
         ORDER BY CASE role WHEN 'accused' THEN 0 WHEN 'prosecutor' THEN 1 WHEN 'defence_counsel' THEN 2 WHEN 'complainant' THEN 3 ELSE 4 END, created_at, id"
    )))
    .bind(sitting_id)
    .fetch_all(&mut *tx)
    .await?;
    let notes = sqlx::query_as::<_, BenchNote>("SELECT id, sitting_id, at, kind, speaker, body, created_at, updated_at FROM bench_notes WHERE sitting_id = ? ORDER BY at, created_at, id")
        .bind(sitting_id)
        .fetch_all(&mut *tx)
        .await?;
    if appearances.is_empty() && notes.is_empty() {
        return invalid("There is nothing in this record to sign. Take the appearances or add a note first.");
    }
    let hash = hex(&canonical(&sitting, &appearances, &notes));
    sqlx::query("UPDATE sittings SET record_signed_at = cast(unixepoch('subsecond') * 1000 as integer), record_signed_by = ?, record_sha256 = ? WHERE id = ?")
        .bind(&name)
        .bind(&hash)
        .bind(sitting_id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("record_signed").subject("sitting", sitting_id).scope(&sitting.case_id).detail(&hash[..12])).await?;
    tx.commit().await?;
    detail(pool, sitting_id).await
}

