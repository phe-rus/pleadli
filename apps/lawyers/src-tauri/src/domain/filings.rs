//! Filings: documents put before a court together (a plaint with its
//! affidavit and list of authorities, say), with what the court's registry
//! gave back and service on the other side (docs/lawyers/REVIEW-2026-09-30.md,
//! 4.3 "Filing pack"). Filing seals every draft in it (`documents::seal`), in
//! one transaction, so a pack is filed whole or not at all. No connection to
//! ECCMIS is assumed (D8): the court's reference and the payment reference
//! (PRN) are typed from what the registry or ECCMIS showed.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::documents;
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::matters::require_open;
use pleadli_node_core::db::begin_write;

pub const SERVICE_METHODS: [&str; 5] = ["personal", "advocate", "registered_post", "email", "substituted"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FiledDocument {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub reference: Option<String>,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Filing {
    pub id: String,
    pub matter_id: String,
    pub filed_on: i64,
    pub court: Option<String>,
    pub court_reference: Option<String>,
    pub fee_amount: Option<i64>,
    pub fee_prn: Option<String>,
    pub served_on: Option<i64>,
    pub served_to: Option<String>,
    pub service_method: Option<String>,
    pub service_note: Option<String>,
    pub filed_by: String,
    pub created_at: i64,
    pub documents: Vec<FiledDocument>,
}

#[derive(FromRow)]
struct Row {
    id: String,
    matter_id: String,
    filed_on: i64,
    court: Option<String>,
    court_reference: Option<String>,
    fee_amount: Option<i64>,
    fee_prn: Option<String>,
    served_on: Option<i64>,
    served_to: Option<String>,
    service_method: Option<String>,
    service_note: Option<String>,
    filed_by: String,
    created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilingInput {
    pub document_ids: Vec<String>,
    pub filed_on: i64,
    pub court: Option<String>,
    pub court_reference: Option<String>,
    pub fee_amount: Option<i64>,
    pub fee_prn: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceInput {
    pub served_on: i64,
    pub served_to: String,
    pub method: String,
    pub note: Option<String>,
}

const SELECT: &str = "SELECT id, matter_id, filed_on, court, court_reference, fee_amount, fee_prn, served_on, served_to, service_method, service_note, filed_by, created_at FROM filings";

async fn with_documents(pool: &SqlitePool, row: Row) -> Result<Filing, sqlx::Error> {
    let documents = sqlx::query_as::<_, FiledDocument>(
        "SELECT d.id, d.kind, d.title, d.reference, fd.position FROM filing_documents fd JOIN documents d ON d.id = fd.document_id WHERE fd.filing_id = ? ORDER BY fd.position",
    )
    .bind(&row.id)
    .fetch_all(pool)
    .await?;
    Ok(Filing {
        id: row.id,
        matter_id: row.matter_id,
        filed_on: row.filed_on,
        court: row.court,
        court_reference: row.court_reference,
        fee_amount: row.fee_amount,
        fee_prn: row.fee_prn,
        served_on: row.served_on,
        served_to: row.served_to,
        service_method: row.service_method,
        service_note: row.service_note,
        filed_by: row.filed_by,
        created_at: row.created_at,
        documents,
    })
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Filing>, sqlx::Error> {
    match sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE id = ?"))).bind(id).fetch_optional(pool).await? {
        Some(row) => Ok(Some(with_documents(pool, row).await?)),
        None => Ok(None),
    }
}

pub async fn list(pool: &SqlitePool, matter_id: &str) -> Result<Vec<Filing>, sqlx::Error> {
    let rows = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE matter_id = ? ORDER BY filed_on DESC, created_at DESC"))).bind(matter_id).fetch_all(pool).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(with_documents(pool, row).await?);
    }
    Ok(out)
}

/// Files the documents given, in the order given. Drafts are sealed now;
/// documents filed before (an earlier affidavit re-filed with a new motion)
/// go in as they are.
pub async fn create(pool: &SqlitePool, matter_id: &str, input: FilingInput) -> Result<Filing, DomainError> {
    check_timestamp(input.filed_on, "The day filed")?;
    if input.document_ids.is_empty() {
        return invalid("Choose the documents that were filed.");
    }
    if let Some(fee) = input.fee_amount {
        if fee < 0 {
            return invalid("A fee cannot be negative.");
        }
    }
    let court = clean(input.court);
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, matter_id).await?;
    let id = Uuid::new_v4().to_string();
    let mut filed_by = None;
    for (position, document_id) in input.document_ids.iter().enumerate() {
        if input.document_ids[..position].contains(document_id) {
            return invalid("A document is listed twice.");
        }
        let found: Option<(String, String)> = sqlx::query_as("SELECT matter_id, status FROM documents WHERE id = ?").bind(document_id).fetch_optional(&mut *tx).await?;
        match found {
            None => return Err(DomainError::NotFound("A document in the filing was not found.".to_string())),
            Some((m, _)) if m != matter_id => return invalid("Every document in a filing belongs to this matter."),
            Some((_, status)) if status == "draft" => {
                let (_, by) = documents::seal(&mut tx, document_id, input.filed_on, court.clone()).await?;
                filed_by = Some(by);
            }
            Some(_) => {}
        }
    }
    // Filing is an advocate's act even when every document was filed before.
    let filer = super::request::actor().map(|a| (a.name, a.role));
    let filed_by = match (filed_by, filer) {
        (Some(by), _) => by,
        (None, Some((name, role))) if role == "advocate" => name,
        (None, Some(_)) => return Err(DomainError::Forbidden("Only an advocate can file a document. An advocate in the practice files it under their name.".to_string())),
        (None, None) => return Err(DomainError::Forbidden("Nobody is signed in.".to_string())),
    };
    let court_reference = clean(input.court_reference);
    sqlx::query("INSERT INTO filings (id, matter_id, filed_on, court, court_reference, fee_amount, fee_prn, filed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(matter_id)
        .bind(input.filed_on)
        .bind(&court)
        .bind(&court_reference)
        .bind(input.fee_amount)
        .bind(clean(input.fee_prn))
        .bind(&filed_by)
        .execute(&mut *tx)
        .await?;
    for (position, document_id) in input.document_ids.iter().enumerate() {
        sqlx::query("INSERT INTO filing_documents (filing_id, document_id, position) VALUES (?, ?, ?)").bind(&id).bind(document_id).bind(position as i64).execute(&mut *tx).await?;
    }
    // The registry gives the number when the first pleading is filed: the
    // matter learns it here, so later drafts carry it. Never overwrites.
    if court.is_some() || court_reference.is_some() {
        sqlx::query("UPDATE matters SET court_number = COALESCE(NULLIF(trim(court_number), ''), ?), court_name = COALESCE(NULLIF(trim(court_name), ''), ?), updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
            .bind(&court_reference)
            .bind(&court)
            .bind(matter_id)
            .execute(&mut *tx)
            .await?;
    }
    audit::record(&mut tx, Entry::new("filing_made").subject("filing", &id).scope(matter_id).detail(format!("{} document(s)", input.document_ids.len()))).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Service on the other side, once done. Recorded once; a correction is a
/// new filing of an affidavit of service, not an edit.
pub async fn record_service(pool: &SqlitePool, id: &str, input: ServiceInput) -> Result<Filing, DomainError> {
    check_timestamp(input.served_on, "The day served")?;
    if input.served_to.trim().is_empty() {
        return invalid("Say who was served.");
    }
    if !SERVICE_METHODS.contains(&input.method.as_str()) {
        return invalid("That is not a way of serving.");
    }
    let mut tx = begin_write(pool).await?;
    let found: Option<(String, i64, Option<i64>)> = sqlx::query_as("SELECT matter_id, filed_on, served_on FROM filings WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some((matter_id, filed_on, served)) = found else { return Err(DomainError::NotFound("Filing not found.".to_string())) };
    if served.is_some() {
        return invalid("Service is already recorded for this filing.");
    }
    if input.served_on < filed_on - 86_400_000 {
        return invalid("Service cannot come before the filing.");
    }
    require_open(&mut tx, &matter_id).await?;
    sqlx::query("UPDATE filings SET served_on = ?, served_to = ?, service_method = ?, service_note = ? WHERE id = ?")
        .bind(input.served_on)
        .bind(input.served_to.trim())
        .bind(&input.method)
        .bind(clean(input.note))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("service_recorded").subject("filing", id).scope(&matter_id).detail(&input.method)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
