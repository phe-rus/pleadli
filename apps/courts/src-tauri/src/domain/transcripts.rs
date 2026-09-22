//! The transcript of a recording, as segments, and the seam a transcription
//! engine sits behind.
//!
//! A transcript is only ever an aid. The law makes the judicial officer's signed
//! record the record of proceedings, so a segment is `draft` (an engine wrote it
//! and no one has looked), `edited` (a person wrote or corrected it) or `adopted`
//! (taken into the bench record as a note, which is where it becomes the
//! officer's own). An adopted segment is frozen with the note it became.
//!
//! No engine ships with this version. `engine()` says so, and asking it to
//! transcribe returns `Unavailable`, which the API turns into an honest refusal:
//! nothing is ever made up. When an engine exists (measured on real courtroom
//! audio first, per docs/courts/PROPOSAL.md section 6) it implements `Engine`.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::sitting_record::NOTE_KINDS;
use pleadli_node_core::db::begin_write;

#[derive(Debug)]
pub enum TranscribeError {
    /// There is no engine, or it cannot run here. The message is shown as it is.
    Unavailable(String),
}

/// A transcription engine: audio in, draft segments out. Nothing else in the
/// application depends on which engine it is.
pub trait Engine: Send + Sync {
    fn name(&self) -> &str;
}

struct NoEngine;

impl Engine for NoEngine {
    fn name(&self) -> &str {
        "none"
    }
}

pub fn engine() -> &'static dyn Engine {
    static NONE: NoEngine = NoEngine;
    &NONE
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub available: bool,
    pub engine: Option<String>,
    pub reason: String,
}

pub fn status() -> Status {
    let engine = engine();
    if engine.name() == "none" {
        Status {
            available: false,
            engine: None,
            reason: "No transcription engine is installed on this computer. The recording is kept in full, and a person can type the transcript against it.".to_string(),
        }
    } else {
        Status { available: true, engine: Some(engine.name().to_string()), reason: String::new() }
    }
}

/// Asks the engine to transcribe a recording. Today it always says it cannot.
pub async fn transcribe(pool: &SqlitePool, recording_id: &str) -> Result<Vec<Segment>, TranscribeError> {
    // Whether or not the recording exists, with no engine the answer is the same.
    let _ = (pool, recording_id);
    Err(TranscribeError::Unavailable(status().reason))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub recording_id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker: Option<String>,
    pub channel: Option<String>,
    pub text: String,
    pub state: String,
    pub source: String,
    pub engine: Option<String>,
    pub adopted_note_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SegmentInput {
    pub start_ms: i64,
    pub end_ms: i64,
    pub speaker: Option<String>,
    pub channel: Option<String>,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptInput {
    pub kind: String,
}

const COLUMNS: &str = "id, recording_id, start_ms, end_ms, speaker, channel, text, state, source, engine, adopted_note_id, created_at, updated_at";

pub async fn list(pool: &SqlitePool, recording_id: &str) -> Result<Vec<Segment>, sqlx::Error> {
    sqlx::query_as::<_, Segment>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM transcript_segments WHERE recording_id = ? ORDER BY start_ms, created_at"))).bind(recording_id).fetch_all(pool).await
}

async fn get(pool: &SqlitePool, id: &str) -> Result<Segment, sqlx::Error> {
    sqlx::query_as::<_, Segment>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM transcript_segments WHERE id = ?"))).bind(id).fetch_one(pool).await
}

struct Checked {
    text: String,
}

fn check(input: &SegmentInput) -> Result<Checked, DomainError> {
    if input.start_ms < 0 || input.end_ms < input.start_ms {
        return invalid("The passage must end after it starts.");
    }
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return invalid("A passage needs some text.");
    }
    Ok(Checked { text })
}

/// A passage typed by a person against the recording. It is `edited` from the
/// start, because a person wrote it.
pub async fn add(pool: &SqlitePool, recording_id: &str, input: SegmentInput) -> Result<Segment, DomainError> {
    let checked = check(&input)?;
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let known: Option<String> = sqlx::query_scalar("SELECT id FROM recordings WHERE id = ?").bind(recording_id).fetch_optional(&mut *tx).await?;
    if known.is_none() {
        return Err(DomainError::NotFound("Recording not found.".to_string()));
    }
    sqlx::query("INSERT INTO transcript_segments (id, recording_id, start_ms, end_ms, speaker, channel, text, state, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'edited', 'manual')")
        .bind(&id)
        .bind(recording_id)
        .bind(input.start_ms)
        .bind(input.end_ms)
        .bind(clean(input.speaker))
        .bind(clean(input.channel))
        .bind(&checked.text)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?)
}

/// Correcting a passage. Whoever corrects it, it is `edited` from then on.
pub async fn update(pool: &SqlitePool, id: &str, input: SegmentInput) -> Result<Segment, DomainError> {
    let checked = check(&input)?;
    let mut tx = begin_write(pool).await?;
    let state: Option<String> = sqlx::query_scalar("SELECT state FROM transcript_segments WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match state.as_deref() {
        None => return Err(DomainError::NotFound("Passage not found.".to_string())),
        Some("adopted") => return invalid("This passage is part of the bench record and cannot be changed here."),
        Some(_) => {}
    }
    sqlx::query("UPDATE transcript_segments SET start_ms = ?, end_ms = ?, speaker = ?, channel = ?, text = ?, state = 'edited', updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(input.start_ms)
        .bind(input.end_ms)
        .bind(clean(input.speaker))
        .bind(clean(input.channel))
        .bind(&checked.text)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(get(pool, id).await?)
}

pub async fn remove(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let state: Option<String> = sqlx::query_scalar("SELECT state FROM transcript_segments WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match state.as_deref() {
        None => return Err(DomainError::NotFound("Passage not found.".to_string())),
        Some("adopted") => return invalid("This passage is part of the bench record and cannot be removed."),
        Some(_) => {}
    }
    sqlx::query("DELETE FROM transcript_segments WHERE id = ?").bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

/// Takes a passage into the bench record as a note, stamped with the moment in
/// the sitting it was said (the recording's start plus the passage's offset).
/// Only a passage a person has written or corrected can be adopted: a machine
/// draft nobody has read is not put into the officer's record. The sitting's
/// record must still be unsigned.
pub async fn adopt(pool: &SqlitePool, id: &str, input: AdoptInput) -> Result<Segment, DomainError> {
    if !NOTE_KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a kind of note.");
    }
    let mut tx = begin_write(pool).await?;
    let found = sqlx::query_as::<_, (String, String, i64, Option<String>, String, String)>(
        "SELECT g.recording_id, g.state, g.start_ms, g.speaker, g.text, r.sitting_id FROM transcript_segments g JOIN recordings r ON r.id = g.recording_id WHERE g.id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((recording_id, state, start_ms, speaker, text, sitting_id)) = found else { return Err(DomainError::NotFound("Passage not found.".to_string())) };
    match state.as_str() {
        "adopted" => return invalid("This passage is already in the bench record."),
        "draft" => return invalid("A machine draft has to be read and corrected by a person before it is adopted."),
        _ => {}
    }
    let (signed, status, case_id): (Option<i64>, String, String) = sqlx::query_as("SELECT record_signed_at, status, case_id FROM sittings WHERE id = ?").bind(&sitting_id).fetch_one(&mut *tx).await?;
    if signed.is_some() {
        return invalid("The record of this sitting is signed and cannot take a new note.");
    }
    if status == "cancelled" {
        return invalid("This sitting was cancelled, so it has no record.");
    }
    let started: i64 = sqlx::query_scalar("SELECT started_at FROM recordings WHERE id = ?").bind(&recording_id).fetch_one(&mut *tx).await?;
    let note_id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO bench_notes (id, sitting_id, at, kind, speaker, body) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&note_id)
        .bind(&sitting_id)
        .bind(started + start_ms)
        .bind(&input.kind)
        .bind(&speaker)
        .bind(&text)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE transcript_segments SET state = 'adopted', adopted_note_id = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(&note_id).bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("passage_adopted").subject("recording", &recording_id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?)
}
