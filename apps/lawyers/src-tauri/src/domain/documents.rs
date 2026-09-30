//! The practice's own documents. A draft is a working document, written by
//! anyone in the practice. Filing puts it before the court (or sends it), and
//! only an advocate files (Advocates Act ss.64, 66, 67). Filing seals it: the
//! practice's letterhead, the filing advocate's name, signature and practising
//! number, the practice's stamp, the drawer's name and address (s.67), a local
//! reference, a verify code and its QR, and a SHA-256 of exactly what was
//! stored. What was filed is never edited, only replaced by a new document.

use chrono::{DateTime, Datelike, FixedOffset};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

/// The kinds of document, each with its heading. The templates that start them
/// are the frontend's (features/templates), per usage; the headings are the
/// words of the court's own language as the practice files them.
pub const KINDS: [(&str, &str); 21] = [
    ("plaint", "PLAINT"),
    ("written_statement_of_defence", "WRITTEN STATEMENT OF DEFENCE"),
    ("reply", "REPLY TO THE WRITTEN STATEMENT OF DEFENCE"),
    ("affidavit", "AFFIDAVIT"),
    ("affidavit_of_service", "AFFIDAVIT OF SERVICE"),
    ("notice_of_motion", "NOTICE OF MOTION"),
    ("notice_of_appeal", "NOTICE OF APPEAL"),
    ("memorandum_of_appeal", "MEMORANDUM OF APPEAL"),
    ("bail_application", "APPLICATION FOR BAIL"),
    ("submissions", "SUBMISSIONS"),
    ("mitigation", "SUBMISSIONS IN MITIGATION"),
    ("list_of_authorities", "LIST OF AUTHORITIES"),
    ("demand_letter", "NOTICE OF DEMAND"),
    ("government_notice", "NOTICE OF INTENTION TO SUE"),
    ("sale_agreement", "AGREEMENT FOR SALE OF LAND"),
    ("petition", "PETITION"),
    ("legal_opinion", "LEGAL OPINION"),
    ("referral_letter", "LETTER OF REFERRAL"),
    ("letter", "LETTER"),
    ("advice", "ADVICE"),
    ("general", "DOCUMENT"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContent {
    pub advocate: String,
    pub firm: Option<String>,
    pub heading: String,
    pub title: String,
    pub matter_title: String,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub filed_with: Option<String>,
    /// The editor's document as JSON, exactly as filed.
    pub body: String,
    pub filed_on: String,
    /// The letterhead: the practice's address and contacts. Absent on older
    /// documents, filed before they were recorded.
    #[serde(default)]
    pub firm_address: Option<String>,
    #[serde(default)]
    pub firm_phone: Option<String>,
    #[serde(default)]
    pub firm_email: Option<String>,
    #[serde(default)]
    pub practising_number: Option<String>,
    /// "Drawn and filed by ...": the drawer's name and address (Advocates Act s.67).
    #[serde(default)]
    pub drawn_by: Option<String>,
    #[serde(default)]
    pub signature_image: Option<String>,
    #[serde(default)]
    pub stamp_image: Option<String>,
    /// Twelve characters of the SHA-256 of the reference and the sealed
    /// content: typed or scanned to check a printed copy.
    #[serde(default)]
    pub verify_code: Option<String>,
    #[serde(default)]
    pub verify_qr: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub id: String,
    pub matter_id: String,
    pub kind: String,
    pub title: String,
    pub body: String,
    pub status: String,
    pub reference: Option<String>,
    pub content: Option<DocumentContent>,
    pub content_sha256: Option<String>,
    pub intact: Option<bool>,
    pub filed_on: Option<i64>,
    pub filed_with: Option<String>,
    pub filed_at: Option<i64>,
    pub filed_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub matter_title: String,
    pub court_number: Option<String>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub id: String,
    pub matter_id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub reference: Option<String>,
    pub filed_on: Option<i64>,
    pub updated_at: i64,
    pub matter_title: String,
    pub court_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInput {
    pub matter_id: String,
    pub kind: String,
    pub title: String,
    /// A template's starting text, as the editor's JSON.
    #[serde(default)]
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInput {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInput {
    pub filed_on: i64,
    pub filed_with: Option<String>,
}

#[derive(FromRow)]
struct Row {
    id: String,
    matter_id: String,
    kind: String,
    title: String,
    body: String,
    status: String,
    reference: Option<String>,
    content: Option<String>,
    content_sha256: Option<String>,
    filed_on: Option<i64>,
    filed_with: Option<String>,
    filed_at: Option<i64>,
    filed_by: Option<String>,
    created_at: i64,
    updated_at: i64,
    matter_title: String,
    court_number: Option<String>,
}

fn hex(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}

impl Row {
    fn into_document(self) -> Document {
        let intact = match (&self.content, &self.content_sha256) {
            (Some(content), Some(hash)) => Some(&hex(content) == hash),
            _ => None,
        };
        Document {
            content: self.content.as_deref().and_then(|c| serde_json::from_str(c).ok()),
            id: self.id,
            matter_id: self.matter_id,
            kind: self.kind,
            title: self.title,
            body: self.body,
            status: self.status,
            reference: self.reference,
            content_sha256: self.content_sha256,
            intact,
            filed_on: self.filed_on,
            filed_with: self.filed_with,
            filed_at: self.filed_at,
            filed_by: self.filed_by,
            created_at: self.created_at,
            updated_at: self.updated_at,
            matter_title: self.matter_title,
            court_number: self.court_number,
        }
    }
}

const SELECT: &str = "SELECT d.id, d.matter_id, d.kind, d.title, d.body, d.status, d.reference, d.content, d.content_sha256, d.filed_on, d.filed_with, d.filed_at, d.filed_by,
        d.created_at, d.updated_at, m.title AS matter_title, m.court_number
    FROM documents d JOIN matters m ON m.id = d.matter_id";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Document>, sqlx::Error> {
    let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE d.id = ?"))).bind(id).fetch_optional(pool).await?;
    Ok(row.map(Row::into_document))
}

/// `status` is `draft`, `filed` or empty; `matter_id` empty for every matter.
pub async fn list(pool: &SqlitePool, status: &str, matter_id: &str, limit: i64) -> Result<Vec<DocumentSummary>, sqlx::Error> {
    sqlx::query_as::<_, DocumentSummary>(
        "SELECT d.id, d.matter_id, d.kind, d.title, d.status, d.reference, d.filed_on, d.updated_at, m.title AS matter_title, m.court_number
         FROM documents d JOIN matters m ON m.id = d.matter_id
         WHERE (?1 = '' OR d.status = ?1) AND (?2 = '' OR d.matter_id = ?2)
         ORDER BY d.updated_at DESC LIMIT ?3",
    )
    .bind(status)
    .bind(matter_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

pub async fn create(pool: &SqlitePool, input: CreateInput) -> Result<Document, DomainError> {
    if !KINDS.iter().any(|(k, _)| *k == input.kind) {
        return invalid("That is not a kind of document.");
    }
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("Give the document a title.");
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    super::matters::require_open(&mut tx, &input.matter_id).await?;
    sqlx::query("INSERT INTO documents (id, matter_id, kind, title, body) VALUES (?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.matter_id)
        .bind(&input.kind)
        .bind(&title)
        .bind(input.body.unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("document_drafted").subject("document", &id).scope(&input.matter_id).detail(&input.kind)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

async fn draft(conn: &mut sqlx::SqliteConnection, id: &str) -> Result<String, DomainError> {
    let found = sqlx::query_as::<_, (String, String)>("SELECT matter_id, status FROM documents WHERE id = ?").bind(id).fetch_optional(&mut *conn).await?;
    let Some((matter_id, status)) = found else { return Err(DomainError::NotFound("Document not found.".to_string())) };
    if status != "draft" {
        return invalid("A filed document cannot be changed. Write a new one to replace it.");
    }
    Ok(matter_id)
}

/// Saving a draft is frequent, so it is not audited; drafting, filing and
/// discarding are.
pub async fn update(pool: &SqlitePool, id: &str, input: UpdateInput) -> Result<Document, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("Give the document a title.");
    }
    let mut tx = begin_write(pool).await?;
    draft(&mut tx, id).await?;
    sqlx::query("UPDATE documents SET title = ?, body = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(&title).bind(&input.body).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn discard(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let matter_id = draft(&mut tx, id).await?;
    sqlx::query("DELETE FROM documents WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("document_discarded").subject("document", id).scope(&matter_id)).await?;
    tx.commit().await?;
    Ok(())
}

fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("a valid offset")
}

fn eat_time(ms: i64) -> Option<DateTime<FixedOffset>> {
    DateTime::from_timestamp_millis(ms).map(|t| t.with_timezone(&eat()))
}

fn long_date(ms: i64) -> String {
    eat_time(ms).map(|t| t.format("%-d %B %Y").to_string()).unwrap_or_default()
}

/// The words in an editor document, so an empty draft can be told from one with
/// something in it without the server knowing the editor.
pub fn plain_text(body: &str) -> String {
    fn walk(node: &serde_json::Value, out: &mut String) {
        if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
            out.push_str(text);
            out.push(' ');
        }
        if let Some(children) = node.get("content").and_then(|c| c.as_array()) {
            for child in children {
                walk(child, out);
            }
        }
    }
    match serde_json::from_str::<serde_json::Value>(body) {
        Ok(doc) if doc.get("type").and_then(|t| t.as_str()) == Some("doc") => {
            let mut out = String::new();
            walk(&doc, &mut out);
            out
        }
        _ => body.to_string(),
    }
}

fn heading(kind: &str) -> &'static str {
    KINDS.iter().find(|(k, _)| *k == kind).map(|(_, h)| *h).unwrap_or("DOCUMENT")
}

/// Seals and files one draft inside a transaction the caller owns (a filing
/// seals several together). Returns the reference given.
pub(super) async fn seal(tx: &mut sqlx::SqliteConnection, id: &str, filed_on: i64, filed_with: Option<String>) -> Result<(String, String), DomainError> {
    check_timestamp(filed_on, "The day filed")?;
    let found = sqlx::query_as::<_, (String, String, String, String, String)>("SELECT matter_id, kind, title, body, status FROM documents WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    let Some((matter_id, kind, title, body, status)) = found else { return Err(DomainError::NotFound("Document not found.".to_string())) };
    if status != "draft" {
        return invalid("This document is already filed.");
    }
    if plain_text(&body).trim().is_empty() {
        return invalid(&format!("\"{title}\" has no text yet."));
    }
    let firm: Option<String> = sqlx::query_scalar("SELECT office_name FROM installation WHERE id = 'this'").fetch_optional(&mut *tx).await?;
    let profile = super::request::actor().map(|a| (a.id, a.name, firm, a.role));
    let Some((staff_id, advocate, firm, role)) = profile else {
        return Err(DomainError::Forbidden("Nobody is signed in.".to_string()));
    };
    // Only an advocate files in the practice's name, and the drawer's name goes
    // on what is filed (Advocates Act ss.64, 66, 67). Anyone else's draft
    // waits for an advocate to file it.
    if role != "advocate" {
        return Err(DomainError::Forbidden("Only an advocate can file a document. An advocate in the practice files it under their name.".to_string()));
    }
    let (signature, practising_number): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT signature, practising_number FROM staff WHERE id = ?").bind(&staff_id).fetch_one(&mut *tx).await?;
    let (address, phone, email, stamp): (Option<String>, Option<String>, Option<String>, Option<String>) =
        sqlx::query_as("SELECT address, phone, email, stamp FROM installation WHERE id = 'this'").fetch_optional(&mut *tx).await?.unwrap_or((None, None, None, None));
    let (matter_title, court_number, court_name) = sqlx::query_as::<_, (String, Option<String>, Option<String>)>("SELECT title, court_number, court_name FROM matters WHERE id = ?").bind(&matter_id).fetch_one(&mut *tx).await?;
    let now = chrono::Utc::now().timestamp_millis();
    let year = eat_time(now).map(|t| t.year()).unwrap_or(1970);
    let filed_in_year: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM documents WHERE status = 'filed' AND reference LIKE ?").bind(format!("DOC/{year}/%")).fetch_one(&mut *tx).await?;
    let reference = format!("DOC/{year}/{:04}", filed_in_year + 1);
    let filed_with = clean(filed_with).or_else(|| court_name.clone());
    let drawn_by = [Some(advocate.clone()), firm.clone(), address.clone()].into_iter().flatten().collect::<Vec<_>>().join(", ");

    let mut content = DocumentContent {
        advocate: advocate.clone(),
        firm,
        heading: heading(&kind).to_string(),
        title,
        matter_title,
        court_number,
        court_name,
        filed_with: filed_with.clone(),
        body,
        filed_on: long_date(filed_on),
        firm_address: address,
        firm_phone: phone,
        firm_email: email,
        practising_number,
        drawn_by: Some(drawn_by),
        signature_image: signature,
        stamp_image: stamp,
        verify_code: None,
        verify_qr: None,
    };
    // The seals go in first; the code is taken from the sealed content, and
    // the stored content (code and QR included) is what the hash covers.
    let sealed = serde_json::to_string(&content).map_err(|_| DomainError::Invalid("The document could not be prepared.".to_string()))?;
    let code = hex(&format!("{reference}|{sealed}"))[..12].to_uppercase();
    content.verify_qr = qrcode::QrCode::new(format!("PLEADLI {reference} {code}").as_bytes())
        .ok()
        .map(|q| q.render::<qrcode::render::svg::Color>().quiet_zone(false).min_dimensions(96, 96).build());
    content.verify_code = Some(code);
    let text = serde_json::to_string(&content).map_err(|_| DomainError::Invalid("The document could not be prepared.".to_string()))?;
    sqlx::query("UPDATE documents SET status = 'filed', reference = ?, content = ?, content_sha256 = ?, filed_on = ?, filed_with = ?, filed_at = ?, filed_by = ?, updated_at = ? WHERE id = ?")
        .bind(&reference)
        .bind(&text)
        .bind(hex(&text))
        .bind(filed_on)
        .bind(&filed_with)
        .bind(now)
        .bind(&advocate)
        .bind(now)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(tx, Entry::new("document_filed").subject("document", id).scope(&matter_id).detail(&reference)).await?;
    Ok((reference, advocate))
}

/// Files a draft on its own: `filed_on` is the day it was put before the court or sent.
pub async fn file(pool: &SqlitePool, id: &str, input: FileInput) -> Result<Document, DomainError> {
    let mut tx = begin_write(pool).await?;
    seal(&mut tx, id, input.filed_on, input.filed_with).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    /// `genuine`: the reference exists, the code is its own and the stored
    /// content is unchanged; `mismatch`: the reference exists and the code is
    /// not its code; `changed`: the code matches but the stored content no
    /// longer does; `not_found`: no document has that reference.
    pub result: &'static str,
    pub reference: String,
    pub title: Option<String>,
    pub filed_on: Option<i64>,
    pub filed_by: Option<String>,
}

/// Checks a printed copy: its reference and the code on it.
pub async fn verify(pool: &SqlitePool, reference: &str, code: &str) -> Result<Verification, sqlx::Error> {
    let reference = reference.trim().to_uppercase();
    let row: Option<(String, Option<String>, Option<String>, Option<i64>, Option<String>)> =
        sqlx::query_as("SELECT title, content, content_sha256, filed_on, filed_by FROM documents WHERE upper(reference) = ? AND status = 'filed'").bind(&reference).fetch_optional(pool).await?;
    let Some((title, content, sha, filed_on, filed_by)) = row else {
        return Ok(Verification { result: "not_found", reference, title: None, filed_on: None, filed_by: None });
    };
    let parsed: Option<DocumentContent> = content.as_deref().and_then(|c| serde_json::from_str(c).ok());
    let stored_code = parsed.as_ref().and_then(|c| c.verify_code.clone()).unwrap_or_default();
    let intact = matches!((&content, &sha), (Some(c), Some(h)) if &hex(c) == h);
    // Typed off paper: spaces and dashes between groups are not part of the code.
    let typed: String = code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase();
    let result = if stored_code.is_empty() || stored_code != typed {
        "mismatch"
    } else if !intact {
        "changed"
    } else {
        "genuine"
    };
    // A wrong code says nothing about the document it does not belong to.
    if result == "mismatch" {
        return Ok(Verification { result, reference, title: None, filed_on: None, filed_by: None });
    }
    Ok(Verification { result, reference, title: Some(title), filed_on, filed_by })
}
