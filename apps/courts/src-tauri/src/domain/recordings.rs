//! Audio recording of a sitting, kept separate from transcription so that if
//! speech recognition is absent or fails the record of the sitting is not lost.
//!
//! The recorder (in the webview) sends short chunks as they are captured. Each
//! chunk is sealed into the vault under an id made from the recording and its
//! number, hashed, and chained to the previous one (`chain = sha256(previous
//! chain, chunk hash)`), and its row is immutable. So:
//! - a power cut loses at most the chunk in flight, and what was saved stays;
//! - a chunk sent twice (a retry) is accepted once, and a *different* chunk under
//!   a number already used is refused;
//! - a chunk cannot be dropped, reordered or swapped without `verify` naming it.
//!
//! A recording still marked running when the application starts was cut short:
//! `mark_interrupted` closes it as `interrupted`, keeping everything saved.

use std::path::Path;

use base64::Engine;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};
use pleadli_node_core::db::begin_write;
use pleadli_node_core::vault;

/// The largest single chunk accepted: a few seconds of audio is tens of
/// kilobytes, so this is generous and still bounds one request.
const MAX_CHUNK_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub sitting_id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub status: String,
    pub mime_type: String,
    pub final_chain_sha256: Option<String>,
    pub created_by: Option<String>,
    pub chunks: i64,
    pub bytes: i64,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub id: String,
    pub recording_id: String,
    pub seq: i64,
    pub offset_ms: i64,
    pub duration_ms: i64,
    pub bytes: i64,
    pub sha256: String,
    pub chain_sha256: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartInput {
    pub mime_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInput {
    pub seq: i64,
    pub offset_ms: i64,
    pub duration_ms: i64,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audio {
    pub mime_type: String,
    pub data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    pub intact: bool,
    pub chunks: i64,
    pub broken_at: Option<i64>,
    pub reason: Option<String>,
}

const SELECT: &str = "SELECT r.id, r.sitting_id, r.started_at, r.ended_at, r.status, r.mime_type, r.final_chain_sha256, r.created_by,
        (SELECT COUNT(*) FROM recording_chunks c WHERE c.recording_id = r.id) AS chunks,
        (SELECT COALESCE(SUM(c.bytes), 0) FROM recording_chunks c WHERE c.recording_id = r.id) AS bytes,
        (SELECT COALESCE(MAX(c.offset_ms + c.duration_ms), 0) FROM recording_chunks c WHERE c.recording_id = r.id) AS duration_ms
    FROM recordings r";

fn genesis(recording_id: &str) -> String {
    vault::sha256_hex(format!("pleadli-recording/v1/{recording_id}").as_bytes())
}

fn chain(previous: &str, chunk_sha: &str) -> String {
    vault::sha256_hex(format!("{previous}|{chunk_sha}").as_bytes())
}

fn stored_path(recording_id: &str, seq: i64) -> String {
    format!("recordings/{recording_id}/{seq:08}.enc")
}

fn chunk_id(recording_id: &str, seq: i64) -> String {
    format!("{recording_id}-{seq}")
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Recording>, sqlx::Error> {
    sqlx::query_as::<_, Recording>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE r.id = ?"))).bind(id).fetch_optional(pool).await
}

pub async fn list_for_sitting(pool: &SqlitePool, sitting_id: &str) -> Result<Vec<Recording>, sqlx::Error> {
    sqlx::query_as::<_, Recording>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE r.sitting_id = ? ORDER BY r.started_at"))).bind(sitting_id).fetch_all(pool).await
}

/// Starts a recording of a sitting. One at a time per sitting: a second start
/// while one is running is refused, so two recorders never write over each other.
pub async fn start(pool: &SqlitePool, sitting_id: &str, input: StartInput) -> Result<Recording, DomainError> {
    let mime = input.mime_type.trim().to_string();
    if !mime.starts_with("audio/") || mime.len() > 100 {
        return invalid("That is not an audio format.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let sitting = sqlx::query_as::<_, (String, String)>("SELECT case_id, status FROM sittings WHERE id = ?").bind(sitting_id).fetch_optional(&mut *tx).await?;
    let Some((case_id, status)) = sitting else { return Err(DomainError::NotFound("Sitting not found.".to_string())) };
    if status == "cancelled" {
        return invalid("This sitting was cancelled, so it cannot be recorded.");
    }
    let running: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM recordings WHERE sitting_id = ? AND status = 'recording'").bind(sitting_id).fetch_one(&mut *tx).await?;
    if running > 0 {
        return invalid("This sitting is already being recorded.");
    }
    let by: Option<String> = sqlx::query_scalar("SELECT name FROM bench_profile WHERE id = 'default'").fetch_optional(&mut *tx).await?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("INSERT INTO recordings (id, sitting_id, started_at, mime_type, created_by) VALUES (?, ?, ?, ?, ?)").bind(&id).bind(sitting_id).bind(now).bind(&mime).bind(&by).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("recording_started").subject("recording", &id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Saves one chunk. The file is sealed and synced before its row is written, so
/// a row never points at a file that is not there.
pub async fn append_chunk(pool: &SqlitePool, vault_root: &Path, recording_id: &str, input: ChunkInput) -> Result<Chunk, DomainError> {
    if input.seq < 0 || input.offset_ms < 0 || input.duration_ms < 0 {
        return invalid("The chunk's numbers are not valid.");
    }
    let data = base64::engine::general_purpose::STANDARD.decode(input.data_base64.as_bytes()).map_err(|_| DomainError::Invalid("The audio chunk is not valid.".to_string()))?;
    if data.is_empty() || data.len() > MAX_CHUNK_BYTES {
        return invalid("The audio chunk is empty or too large.");
    }
    let sha = vault::sha256_hex(&data);

    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM recordings WHERE id = ?").bind(recording_id).fetch_optional(&mut *tx).await?;
    match status.as_deref() {
        None => return Err(DomainError::NotFound("Recording not found.".to_string())),
        Some("recording") => {}
        Some(_) => return invalid("This recording has finished."),
    }
    let last = sqlx::query_as::<_, (i64, String)>("SELECT seq, chain_sha256 FROM recording_chunks WHERE recording_id = ? ORDER BY seq DESC LIMIT 1").bind(recording_id).fetch_optional(&mut *tx).await?;
    let next = last.as_ref().map(|(seq, _)| seq + 1).unwrap_or(0);

    if input.seq < next {
        // A retry of a chunk already saved is accepted; a different chunk under
        // a number already used is not.
        let existing = sqlx::query_as::<_, Chunk>("SELECT id, recording_id, seq, offset_ms, duration_ms, bytes, sha256, chain_sha256, created_at FROM recording_chunks WHERE recording_id = ? AND seq = ?")
            .bind(recording_id)
            .bind(input.seq)
            .fetch_one(&mut *tx)
            .await?;
        if existing.sha256 == sha {
            return Ok(existing);
        }
        return invalid("A different chunk was already saved under that number.");
    }
    if input.seq > next {
        return invalid("A chunk is missing before this one. Send the earlier chunks first.");
    }

    let previous = last.map(|(_, chain)| chain).unwrap_or_else(|| genesis(recording_id));
    let chain_sha = chain(&previous, &sha);
    let id = chunk_id(recording_id, input.seq);
    let path = stored_path(recording_id, input.seq);
    vault::write_at(vault_root, &path, &id, &data).map_err(|e| {
        log::error!("recording chunk could not be sealed: {e:?}");
        DomainError::Invalid("The audio chunk could not be stored.".to_string())
    })?;
    sqlx::query("INSERT INTO recording_chunks (id, recording_id, seq, offset_ms, duration_ms, bytes, sha256, chain_sha256, stored_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(recording_id)
        .bind(input.seq)
        .bind(input.offset_ms)
        .bind(input.duration_ms)
        .bind(data.len() as i64)
        .bind(&sha)
        .bind(&chain_sha)
        .bind(&path)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(sqlx::query_as::<_, Chunk>("SELECT id, recording_id, seq, offset_ms, duration_ms, bytes, sha256, chain_sha256, created_at FROM recording_chunks WHERE id = ?").bind(&id).fetch_one(pool).await?)
}

/// Ends a recording the clerk stopped. Its final chain hash is the last chunk's,
/// so one value stands for every chunk in order.
pub async fn stop(pool: &SqlitePool, recording_id: &str) -> Result<Recording, DomainError> {
    let mut tx = begin_write(pool).await?;
    let found = sqlx::query_as::<_, (String, String)>("SELECT r.status, s.case_id FROM recordings r JOIN sittings s ON s.id = r.sitting_id WHERE r.id = ?").bind(recording_id).fetch_optional(&mut *tx).await?;
    let Some((status, case_id)) = found else { return Err(DomainError::NotFound("Recording not found.".to_string())) };
    if status != "recording" {
        return invalid("This recording has already finished.");
    }
    let last: Option<String> = sqlx::query_scalar("SELECT chain_sha256 FROM recording_chunks WHERE recording_id = ? ORDER BY seq DESC LIMIT 1").bind(recording_id).fetch_optional(&mut *tx).await?;
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE recordings SET status = 'stopped', ended_at = ?, final_chain_sha256 = ? WHERE id = ?").bind(now).bind(&last).bind(recording_id).execute(&mut *tx).await?;
    let detail = last.as_deref().map(|h| h[..12].to_string()).unwrap_or_else(|| "no audio".to_string());
    audit::record(&mut tx, Entry::new("recording_stopped").subject("recording", recording_id).scope(&case_id).detail(detail)).await?;
    tx.commit().await?;
    Ok(get(pool, recording_id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Run at every start: a recording still running was cut short (a power cut, a
/// crash). It is closed as `interrupted` with everything that was saved, and the
/// audit trail says so. Returns how many were found.
pub async fn mark_interrupted(pool: &SqlitePool) -> Result<usize, sqlx::Error> {
    let mut tx = begin_write(pool).await?;
    let open = sqlx::query_as::<_, (String, i64, String)>("SELECT r.id, r.started_at, s.case_id FROM recordings r JOIN sittings s ON s.id = r.sitting_id WHERE r.status = 'recording'").fetch_all(&mut *tx).await?;
    for (id, started, case_id) in &open {
        let last = sqlx::query_as::<_, (String, i64)>("SELECT chain_sha256, created_at FROM recording_chunks WHERE recording_id = ? ORDER BY seq DESC LIMIT 1").bind(id).fetch_optional(&mut *tx).await?;
        let (chain_sha, ended) = match last {
            Some((chain_sha, at)) => (Some(chain_sha), at),
            None => (None, *started),
        };
        sqlx::query("UPDATE recordings SET status = 'interrupted', ended_at = ?, final_chain_sha256 = ? WHERE id = ?").bind(ended).bind(&chain_sha).bind(id).execute(&mut *tx).await?;
        audit::record(&mut tx, Entry::new("recording_interrupted").subject("recording", id).scope(case_id)).await?;
    }
    tx.commit().await?;
    Ok(open.len())
}

async fn chunks_of(pool: &SqlitePool, recording_id: &str) -> Result<Vec<(Chunk, String)>, sqlx::Error> {
    let rows = sqlx::query_as::<_, Chunk>("SELECT id, recording_id, seq, offset_ms, duration_ms, bytes, sha256, chain_sha256, created_at FROM recording_chunks WHERE recording_id = ? ORDER BY seq")
        .bind(recording_id)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|c| (c.clone(), stored_path(recording_id, c.seq))).collect())
}

/// Recomputes every chunk from the vault and the chain from the start. Names the
/// first chunk that does not hold: missing or altered file, wrong hash, or a
/// chain that does not follow.
pub async fn verify(pool: &SqlitePool, vault_root: &Path, recording_id: &str) -> Result<Check, DomainError> {
    let recording = get(pool, recording_id).await?.ok_or_else(|| DomainError::NotFound("Recording not found.".to_string()))?;
    let chunks = chunks_of(pool, recording_id).await?;
    let mut previous = genesis(recording_id);
    for (index, (chunk, path)) in chunks.iter().enumerate() {
        let broken = |reason: &str| Check { intact: false, chunks: chunks.len() as i64, broken_at: Some(chunk.seq), reason: Some(reason.to_string()) };
        if chunk.seq != index as i64 {
            return Ok(broken("A chunk is missing before this one."));
        }
        let bytes = match vault::read(vault_root, path, &chunk.id) {
            Ok(bytes) => bytes,
            Err(_) => return Ok(broken("The stored file is missing or cannot be opened.")),
        };
        if vault::sha256_hex(&bytes) != chunk.sha256 {
            return Ok(broken("The stored audio no longer matches its hash."));
        }
        let expected = chain(&previous, &chunk.sha256);
        if expected != chunk.chain_sha256 {
            return Ok(broken("The chain does not follow from the chunk before."));
        }
        previous = expected;
    }
    if let Some(final_hash) = &recording.final_chain_sha256 {
        if *final_hash != previous {
            return Ok(Check { intact: false, chunks: chunks.len() as i64, broken_at: None, reason: Some("The final hash does not match the chunks.".to_string()) });
        }
    }
    Ok(Check { intact: true, chunks: chunks.len() as i64, broken_at: None, reason: None })
}

/// The whole recording as one file: the chunks in order, each checked against
/// its hash as it is read. MediaRecorder's chunks join into one playable file.
pub async fn audio(pool: &SqlitePool, vault_root: &Path, recording_id: &str) -> Result<Audio, DomainError> {
    let recording = get(pool, recording_id).await?.ok_or_else(|| DomainError::NotFound("Recording not found.".to_string()))?;
    let chunks = chunks_of(pool, recording_id).await?;
    if chunks.is_empty() {
        return invalid("Nothing was recorded.");
    }
    let mut out = Vec::new();
    for (chunk, path) in &chunks {
        let bytes = vault::read(vault_root, path, &chunk.id).map_err(|_| DomainError::Invalid(format!("Chunk {} could not be read. Check the recording.", chunk.seq)))?;
        if vault::sha256_hex(&bytes) != chunk.sha256 {
            return invalid(&format!("Chunk {} no longer matches its hash. Check the recording.", chunk.seq));
        }
        out.extend_from_slice(&bytes);
    }
    Ok(Audio { mime_type: recording.mime_type, data_base64: base64::engine::general_purpose::STANDARD.encode(out) })
}
