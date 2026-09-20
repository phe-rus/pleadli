//! Instruments: the legal authority chain (docs/prisons/product-map/02 F2.2,
//! W1, W18). An instrument is received, authenticated, verified and
//! versioned. Nothing is overwritten: a correction supersedes with a reason.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Instrument {
    pub id: String,
    pub prisoner_id: String,
    pub kind: String,
    pub issuing_authority: Option<String>,
    pub reference: Option<String>,
    pub issued_on: Option<i64>,
    pub received_at: Option<i64>,
    pub authenticated: bool,
    pub verification_note: Option<String>,
    pub verified_by: Option<String>,
    /// verified | pending | rectification_pending | superseded
    pub status: String,
    pub superseded_by: Option<String>,
    pub supersede_reason: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordInstrumentInput {
    pub prisoner_id: String,
    pub kind: String,
    pub issuing_authority: Option<String>,
    pub reference: Option<String>,
    pub issued_on: Option<i64>,
    pub received_at: i64,
    pub authenticated: bool,
    pub verification_note: Option<String>,
    /// A pending instrument this one fulfils.
    pub resolves_instrument_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectInstrumentInput {
    pub prisoner_id: String,
    pub kind: String,
}

pub async fn list_for_prisoner(pool: &SqlitePool, prisoner_id: &str) -> Result<Vec<Instrument>, sqlx::Error> {
    sqlx::query_as::<_, Instrument>("SELECT * FROM instruments WHERE prisoner_id = ? ORDER BY created_at DESC")
        .bind(prisoner_id)
        .fetch_all(pool)
        .await
}

async fn get_conn(conn: &mut SqliteConnection, id: &str) -> Result<Instrument, sqlx::Error> {
    sqlx::query_as::<_, Instrument>("SELECT * FROM instruments WHERE id = ?").bind(id).fetch_one(&mut *conn).await
}

/// Keeps `prisoners.documents_pending` (read by search, reports and the
/// roster) true exactly while an instrument is still awaited or awaiting
/// rectification. The instruments are the fact; the flag is derived.
pub async fn sync_pending_flag(conn: &mut SqliteConnection, prisoner_id: &str) -> Result<(), sqlx::Error> {
    let first_pending: Option<String> = sqlx::query_scalar(
        "SELECT kind FROM instruments WHERE prisoner_id = ? AND status IN ('pending', 'rectification_pending') ORDER BY created_at ASC LIMIT 1",
    )
    .bind(prisoner_id)
    .fetch_optional(&mut *conn)
    .await?;
    sqlx::query("UPDATE prisoners SET documents_pending = ?, pending_document_type = ? WHERE id = ?")
        .bind(first_pending.is_some())
        .bind(&first_pending)
        .bind(prisoner_id)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// An instrument that is owed and has not arrived (accept-with-document-
/// pending at reception, s.58(4) rectification).
pub async fn expect_instrument(conn: &mut SqliteConnection, actor: &Actor, input: ExpectInstrumentInput) -> Result<Instrument, DomainError> {
    if input.kind.trim().is_empty() {
        return Err(DomainError::rejected("Say which document is awaited."));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO instruments (id, prisoner_id, kind, status) VALUES (?, ?, ?, 'pending')")
        .bind(&id)
        .bind(&input.prisoner_id)
        .bind(&input.kind)
        .execute(&mut *conn)
        .await?;
    sync_pending_flag(conn, &input.prisoner_id).await?;
    let instrument = get_conn(conn, &id).await?;
    audit::record(conn, actor, AuditEntry::new("instrument.expected", "instrument", Some(&id)).after(&instrument)).await?;
    Ok(instrument)
}

/// Records an instrument that has arrived. If it fulfils a pending one, that
/// is superseded in the same step, so the chain shows what replaced what.
pub async fn record_instrument(conn: &mut SqliteConnection, actor: &Actor, input: RecordInstrumentInput) -> Result<Instrument, DomainError> {
    if input.kind.trim().is_empty() {
        return Err(DomainError::rejected("Choose the instrument type."));
    }
    let id = Uuid::new_v4().to_string();
    let status = if input.authenticated { "verified" } else { "rectification_pending" };
    sqlx::query(
        "INSERT INTO instruments
            (id, prisoner_id, kind, issuing_authority, reference, issued_on, received_at, authenticated,
             verification_note, verified_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&input.prisoner_id)
    .bind(&input.kind)
    .bind(&input.issuing_authority)
    .bind(&input.reference)
    .bind(input.issued_on)
    .bind(input.received_at)
    .bind(input.authenticated)
    .bind(&input.verification_note)
    .bind(&actor.name)
    .bind(status)
    .execute(&mut *conn)
    .await?;

    if let Some(pending_id) = &input.resolves_instrument_id {
        sqlx::query(
            "UPDATE instruments SET status = 'superseded', superseded_by = ?, supersede_reason = 'received'
             WHERE id = ? AND prisoner_id = ? AND status IN ('pending', 'rectification_pending')",
        )
        .bind(&id)
        .bind(pending_id)
        .bind(&input.prisoner_id)
        .execute(&mut *conn)
        .await?;
    }
    sync_pending_flag(conn, &input.prisoner_id).await?;
    let instrument = get_conn(conn, &id).await?;
    audit::record(conn, actor, AuditEntry::new("instrument.received", "instrument", Some(&id)).after(&instrument)).await?;
    Ok(instrument)
}

/// Correction of an erroneous legal record (W18): the original is kept and
/// marked superseded, never overwritten. A reason is mandatory.
pub async fn supersede_instrument(conn: &mut SqliteConnection, actor: &Actor, id: &str, reason: &str) -> Result<Instrument, DomainError> {
    if reason.trim().is_empty() {
        return Err(DomainError::rejected("A reason is required to correct a legal instrument."));
    }
    let before = get_conn(conn, id).await?;
    if before.status == "superseded" {
        return Err(DomainError::conflict("ALREADY_SUPERSEDED", "That instrument has already been superseded."));
    }
    sqlx::query("UPDATE instruments SET status = 'superseded', supersede_reason = ? WHERE id = ?")
        .bind(reason.trim())
        .bind(id)
        .execute(&mut *conn)
        .await?;
    sync_pending_flag(conn, &before.prisoner_id).await?;
    let after = get_conn(conn, id).await?;
    audit::record(
        conn,
        actor,
        AuditEntry::new("instrument.superseded", "instrument", Some(id)).before(&before).after(&after).reason(reason.trim()),
    )
    .await?;
    Ok(after)
}
