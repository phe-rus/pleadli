//! Court -> law firm exchange, the firm's half (docs/interchange/court-firm.md).
//! A notice (the date of a hearing, the copy of an order) is a claim, not a record:
//! it is kept only from a court registry this firm invited and a person confirmed,
//! sealed to this firm, and not seen before; and even then it waits, held apart
//! from the matters, until a person chooses the matter it belongs to and files it.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{hex, unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{CourtNoticePayload, CourtNoticeReceiptPayload, FirmFilingPayload, FirmFilingReceiptPayload, KIND_COURT_NOTICE, KIND_COURT_NOTICE_RECEIPT, KIND_FIRM_FILING, KIND_FIRM_FILING_RECEIPT};
use pleadli_interchange::pairing::{self, KIND_RESPONSE};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::hearings::{self, HearingInput};
use super::notes::{self, NoteInput};
use super::error::{invalid, DomainError};

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad<T>(message: impl AsRef<str>) -> Result<T, DomainError> {
    invalid(message.as_ref())
}
const DAMAGED: &str = "This firm's identity is damaged.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirmIdentity {
    pub office_id: String,
    pub office_name: String,
    pub jurisdiction: Option<String>,
    pub fingerprint: String,
}

#[derive(FromRow)]
struct IdentityRow {
    office_id: String,
    office_name: String,
    jurisdiction: Option<String>,
    verifying_key: String,
    encryption_key: String,
    signing_secret: String,
    encryption_secret: String,
}

async fn load_identity(pool: &SqlitePool) -> Result<Option<Identity>, DomainError> {
    let row: Option<IdentityRow> = sqlx::query_as("SELECT office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret FROM firm_identity WHERE id = 'default'").fetch_optional(pool).await?;
    let Some(r) = row else { return Ok(None) };
    let public = PublicIdentity { id: r.office_id, kind: IdentityKind::LawFirm, name: r.office_name, jurisdiction: r.jurisdiction, verifying_key: r.verifying_key, encryption_key: r.encryption_key };
    let signing = unhex32(&r.signing_secret).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))?;
    let encryption = unhex32(&r.encryption_secret).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))?;
    Identity::restore(public, signing, encryption).map(Some).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))
}

pub(crate) async fn require_identity(pool: &SqlitePool) -> Result<Identity, DomainError> {
    match load_identity(pool).await? {
        Some(i) => Ok(i),
        None => bad("Set up this firm's identity first."),
    }
}

fn view(i: &Identity) -> FirmIdentity {
    FirmIdentity { office_id: i.public.id.clone(), office_name: i.public.name.clone(), jurisdiction: i.public.jurisdiction.clone(), fingerprint: i.public.fingerprint() }
}

pub async fn get_identity(pool: &SqlitePool) -> Result<Option<FirmIdentity>, DomainError> {
    Ok(load_identity(pool).await?.as_ref().map(view))
}

/// Once: the name is part of the fingerprint every court registry confirms.
pub async fn create_identity(pool: &SqlitePool, name: &str, jurisdiction: Option<&str>) -> Result<FirmIdentity, DomainError> {
    let name = name.trim();
    if name.is_empty() {
        return bad("Name the court, as the court registrys that file to it know it.");
    }
    if load_identity(pool).await?.is_some() {
        return bad("This firm already has an identity. It cannot be changed, because every office has confirmed its fingerprint.");
    }
    let identity = Identity::generate(IdentityKind::LawFirm, name, jurisdiction.map(str::trim).filter(|j| !j.is_empty()));
    sqlx::query("INSERT INTO firm_identity (id, office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)")
        .bind(&identity.public.id)
        .bind(&identity.public.name)
        .bind(&identity.public.jurisdiction)
        .bind(&identity.public.verifying_key)
        .bind(&identity.public.encryption_key)
        .bind(hex(&identity.signing_secret()))
        .bind(hex(&identity.encryption_secret()))
        .execute(pool)
        .await?;
    Ok(view(&identity))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub intended_court: String,
    pub status: String,
    pub court_name: Option<String>,
    pub fingerprint: Option<String>,
    pub invite_expires_at: i64,
    pub responded_at: Option<i64>,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(pool: &SqlitePool) -> Result<Vec<Link>, DomainError> {
    Ok(sqlx::query_as("SELECT id, intended_court, status, court_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM court_links ORDER BY created_at DESC").fetch_all(pool).await?)
}

async fn get_link(pool: &SqlitePool, id: &str) -> Result<Link, DomainError> {
    sqlx::query_as("SELECT id, intended_court, status, court_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM court_links WHERE id = ?").bind(id).fetch_optional(pool).await?.ok_or_else(|| DomainError::NotFound("No such connection.".into()))
}

/// An invitation file for one court registry, open for `valid_days`.
pub async fn create_invite(pool: &SqlitePool, intended_court: &str, valid_days: i64) -> Result<(Link, Vec<u8>), DomainError> {
    let office = intended_court.trim();
    if office.is_empty() {
        return bad("Name the court registry this invitation is for.");
    }
    if !(1..=60).contains(&valid_days) {
        return bad("An invitation stays open for between 1 and 60 days.");
    }
    let me = require_identity(pool).await?;
    let expires = now() + valid_days * 86_400_000;
    let (bytes, invite) = pairing::make_invite(&me, office, expires).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO court_links (id, intended_court, status, invite_nonce, invite_expires_at) VALUES (?, ?, 'invited', ?, ?)")
        .bind(&invite.invite_id)
        .bind(office)
        .bind(&invite.nonce)
        .bind(expires)
        .execute(pool)
        .await?;
    Ok((get_link(pool, &invite.invite_id).await?, bytes))
}

async fn court_public(pool: &SqlitePool, link_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String) = sqlx::query_as("SELECT court_id, court_name, court_jurisdiction, court_verifying_key, court_encryption_key, status FROM court_links WHERE id = ?").bind(link_id).fetch_one(pool).await?;
    match row {
        (Some(id), Some(name), jurisdiction, Some(verifying_key), Some(encryption_key), status) => Ok((PublicIdentity { id, kind: IdentityKind::CourtRegistry, name, jurisdiction, verifying_key, encryption_key }, status)),
        _ => bad("That office has not answered the invitation yet."),
    }
}

fn normal(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

/// A person confirms the court registry by typing the fingerprint it read out.
/// Returns the confirmation file to send back.
pub async fn trust_link(pool: &SqlitePool, id: &str, typed_fingerprint: &str) -> Result<(Link, Vec<u8>), DomainError> {
    let link = get_link(pool, id).await?;
    if link.status != "awaiting_confirmation" {
        return bad("Only an office that has answered can be confirmed.");
    }
    if normal(typed_fingerprint) != normal(link.fingerprint.as_deref().unwrap_or("")) {
        return bad("That is not the code the office read out. Nothing was confirmed.");
    }
    let me = require_identity(pool).await?;
    let (court, _) = court_public(pool, id).await?;
    let bytes = pairing::make_confirmation(&me, &court, id, "trusted", None).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("UPDATE court_links SET status = 'trusted', trusted_at = ? WHERE id = ?").bind(now()).bind(id).execute(pool).await?;
    Ok((get_link(pool, id).await?, bytes))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// A package from a court registry: its answer to an invitation, or a notice.
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    // Whatever carrier brought it, this institution decides for itself whether that kind of sender may send that kind of package.
    if let Err(why) = pleadli_interchange::authorization::check(header.from.kind, pleadli_interchange::identity::IdentityKind::LawFirm, &header.kind) {
        return bad(why);
    }
    if header.created_at > now() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    if header.kind == KIND_RESPONSE {
        let response = pairing::read_response(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        let row: Option<(String, i64, String)> = sqlx::query_as("SELECT status, invite_expires_at, invite_nonce FROM court_links WHERE id = ?").bind(&response.invite_id).fetch_optional(pool).await?;
        let Some((status, expires, nonce)) = row else { return bad("This is an answer to an invitation this firm did not issue.") };
        if status != "invited" {
            return bad("That invitation has already been answered.");
        }
        if expires < now() {
            return bad("That invitation has expired. Issue a new one.");
        }
        if nonce != response.invite_nonce {
            return bad("This answer is not to that invitation.");
        }
        let d = &response.station;
        if d.kind != IdentityKind::CourtRegistry {
            return bad("Only a court registry can answer this invitation.");
        }
        let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE court_id = ? AND status IN ('awaiting_confirmation', 'trusted')").bind(&d.id).fetch_one(pool).await?;
        if in_use > 0 {
            return bad("That office already has a connection to this firm.");
        }
        sqlx::query("UPDATE court_links SET status = 'awaiting_confirmation', court_id = ?, court_name = ?, court_jurisdiction = ?, court_verifying_key = ?, court_encryption_key = ?, fingerprint = ?, responded_at = ? WHERE id = ?")
            .bind(&d.id)
            .bind(&d.name)
            .bind(&d.jurisdiction)
            .bind(&d.verifying_key)
            .bind(&d.encryption_key)
            .bind(d.fingerprint())
            .bind(now())
            .bind(&response.invite_id)
            .execute(pool)
            .await?;
        return Ok(Imported { kind: KIND_RESPONSE.into(), message: format!("{} has answered. Confirm its fingerprint with the office before trusting it.", d.name) });
    }
    if header.kind == KIND_FIRM_FILING_RECEIPT {
        return import_filing_receipt(pool, bytes, peeked, &me).await;
    }
    if header.kind != KIND_COURT_NOTICE {
        return bad(format!("This firm does not receive packages of kind '{}'.", header.kind));
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM court_links WHERE court_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from an office this firm has not connected to. Nothing was kept.") };
    if status != "trusted" {
        return bad("That office is not confirmed as trusted. Nothing was kept.");
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notices_in WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let (court, _) = court_public(pool, &link_id).await?;
    let opened = envelope::open(&me, peeked, &court).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different court.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the office this firm trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let notice: CourtNoticePayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The notice inside the package could not be read.".into()))?;
    if notice.notice_key.trim().is_empty() || notice.court_number.trim().is_empty() || !matches!(notice.kind.as_str(), "hearing" | "order") || (notice.kind == "hearing" && notice.at.is_none()) || (notice.kind == "order" && notice.paragraphs.is_empty()) {
        return bad("The notice is incomplete: it needs the court's key, the case number, a kind, and a date or the order's wording.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO notices_in (id, link_id, kind, seq, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(KIND_COURT_NOTICE)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE court_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Imported { kind: KIND_COURT_NOTICE.into(), message: format!("A notice from {} is waiting for you to read.", court.name) })
}

/// A document counsel files in a matter, sealed to the court registry that is
/// trusted. The matter must carry the court's own case number.
pub async fn file_to_court(pool: &SqlitePool, matter_id: &str, kind: &str, title: &str, paragraphs: &[String], filed_by: Option<&str>) -> Result<(Vec<u8>, String), DomainError> {
    if !matches!(kind, "application" | "notice_of_appeal" | "bail_application" | "defence" | "submissions" | "other") {
        return bad("Choose the kind of document being filed.");
    }
    let paragraphs: Vec<String> = paragraphs.iter().map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect();
    if title.trim().is_empty() || paragraphs.is_empty() {
        return bad("A filing needs a title and its text.");
    }
    let me = require_identity(pool).await?;
    let row: Option<(Option<String>, String, Option<String>)> = sqlx::query_as("SELECT court_number, title, our_ref FROM matters WHERE id = ?").bind(matter_id).fetch_optional(pool).await?;
    let Some((court_number, matter_title, our_ref)) = row else { return Err(DomainError::NotFound("Matter not found.".into())) };
    let Some(court_number) = court_number.filter(|n| !n.trim().is_empty()) else { return bad("This matter has no court case number yet. Put the number the court gave on the matter first.") };
    let link_id: Option<String> = sqlx::query_scalar("SELECT id FROM court_links WHERE status = 'trusted' ORDER BY trusted_at DESC LIMIT 1").fetch_optional(pool).await?;
    let Some(link_id) = link_id else { return bad("No court registry has confirmed this firm yet. Connect to a registry first.") };
    let (court, _) = court_public(pool, &link_id).await?;
    let firm: String = sqlx::query_scalar("SELECT office_name FROM firm_identity").fetch_one(pool).await?;
    let key = uuid::Uuid::new_v4().to_string();
    let payload = FirmFilingPayload { filing_key: key.clone(), kind: kind.to_string(), title: title.trim().to_string(), court_number: court_number.trim().to_string(), firm_name: firm, firm_reference: our_ref, filed_by: filed_by.map(str::to_string), filed_at: now(), paragraphs };
    let json = serde_json::to_value(&payload).map_err(|_| DomainError::Invalid("Could not build the filing.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM court_links WHERE id = ?").bind(&link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE court_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(&link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &court, KIND_FIRM_FILING, seq as u64, None, &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO filings_out (id, link_id, matter_id, kind, title, seq, payload, prepared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(&link_id)
        .bind(matter_id)
        .bind(kind)
        .bind(title.trim())
        .bind(seq)
        .bind(serde_json::to_string(&json).unwrap_or_default())
        .bind(now())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    let _ = matter_title;
    Ok((bytes, format!("filing-{}-{}.pxpkg", kind.replace('_', "-"), seq)))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FilingOut {
    pub id: String,
    pub matter_id: String,
    pub kind: String,
    pub title: String,
    pub prepared_at: i64,
    pub outcome: Option<String>,
    pub reason: Option<String>,
    pub answered_at: Option<i64>,
}

pub async fn list_filings(pool: &SqlitePool, matter_id: &str) -> Result<Vec<FilingOut>, DomainError> {
    Ok(sqlx::query_as("SELECT id, matter_id, kind, title, prepared_at, outcome, reason, answered_at FROM filings_out WHERE matter_id = ? ORDER BY prepared_at DESC").bind(matter_id).fetch_all(pool).await?)
}

/// The court's answer to a filing. Only an answer to a filing this firm sent counts.
async fn import_filing_receipt(pool: &SqlitePool, bytes: &[u8], peeked: envelope::Peeked, me: &Identity) -> Result<Imported, DomainError> {
    let header = peeked.header.clone();
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM court_links WHERE court_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from an office this firm has not connected to. Nothing was kept.") };
    if status != "trusted" {
        return bad("That office is not confirmed as trusted. Nothing was kept.");
    }
    let (court, _) = court_public(pool, &link_id).await?;
    let opened = envelope::open(me, peeked, &court).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different firm.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the office this firm trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let r: FirmFilingReceiptPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The receipt inside the package could not be read.".into()))?;
    let done = sqlx::query("UPDATE filings_out SET outcome = ?, reason = ?, answered_at = ? WHERE id = ? AND link_id = ? AND outcome IS NULL").bind(&r.outcome).bind(&r.reason).bind(now()).bind(&r.filing_package_id).bind(&link_id).execute(pool).await?;
    if done.rows_affected() == 0 {
        return bad("That receipt answers a filing this firm did not send to this court, or was already answered.");
    }
    let _ = bytes;
    let message = if r.outcome == "accepted" { format!("{} accepted the filing.", court.name) } else { format!("{} returned the filing: {}", court.name, r.reason.as_deref().unwrap_or("no reason given")) };
    Ok(Imported { kind: KIND_FIRM_FILING_RECEIPT.into(), message })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IncomingNotice {
    pub id: String,
    pub court_name: Option<String>,
    pub status: String,
    pub sent_at: i64,
    pub received_at: i64,
    pub decided_at: Option<i64>,
    pub return_reason: Option<String>,
    pub matter_id: Option<String>,
    pub payload: String,
}

pub async fn list_incoming(pool: &SqlitePool) -> Result<Vec<IncomingNotice>, DomainError> {
    Ok(sqlx::query_as("SELECT i.id, l.court_name, i.status, i.sent_at, i.received_at, i.decided_at, i.return_reason, i.matter_id, i.payload FROM notices_in i JOIN court_links l ON l.id = i.link_id ORDER BY i.received_at DESC").fetch_all(pool).await?)
}

/// The receipt, sealed to the office and recorded as sent.
async fn seal_receipt(pool: &SqlitePool, link_id: &str, in_reply_to: &str, receipt: &CourtNoticeReceiptPayload) -> Result<Vec<u8>, DomainError> {
    let me = require_identity(pool).await?;
    let (court, _) = court_public(pool, link_id).await?;
    let json = serde_json::to_value(receipt).map_err(|_| DomainError::Invalid("Could not build the receipt.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM court_links WHERE id = ?").bind(link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE court_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &court, KIND_COURT_NOTICE_RECEIPT, seq as u64, Some(in_reply_to), &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO notice_receipts_out (id, link_id, kind, seq, in_reply_to, payload, prepared_at, exported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(link_id)
        .bind(KIND_COURT_NOTICE_RECEIPT)
        .bind(seq)
        .bind(in_reply_to)
        .bind(serde_json::to_string(&json).unwrap_or_default())
        .bind(now())
        .bind(now())
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(bytes)
}

async fn pending(pool: &SqlitePool, package_id: &str) -> Result<(String, CourtNoticePayload, i64), DomainError> {
    let row: Option<(String, String, String, i64)> = sqlx::query_as("SELECT link_id, payload, status, received_at FROM notices_in WHERE id = ?").bind(package_id).fetch_optional(pool).await?;
    let Some((link_id, payload, status, received_at)) = row else { return Err(DomainError::NotFound("No such notice.".into())) };
    if status != "received" {
        return bad("That notice has already been dealt with.");
    }
    let notice = serde_json::from_str(&payload).map_err(|_| DomainError::Invalid("The stored notice could not be read.".into()))?;
    Ok((link_id, notice, received_at))
}

/// A person files the notice against the matter it belongs to: a hearing is
/// put in the diary, an order's wording is kept as a note on the matter. The
/// matter's court number, if it has one, must be the notice's, so a notice is
/// never filed on another case. Returns what was made and the receipt to send back.
pub async fn file_notice(pool: &SqlitePool, package_id: &str, matter_id: &str, decided_by: &str) -> Result<(String, Vec<u8>), DomainError> {
    let (link_id, notice, received_at) = pending(pool, package_id).await?;
    let matter: Option<(Option<String>, String)> = sqlx::query_as("SELECT court_number, status FROM matters WHERE id = ?").bind(matter_id).fetch_optional(pool).await?;
    let Some((court_number, status)) = matter else { return bad("Choose the matter this notice belongs to.") };
    if status != "open" {
        return bad("That matter is closed.");
    }
    if let Some(number) = court_number.filter(|n| !n.trim().is_empty()) {
        if normal(&number) != normal(&notice.court_number) {
            return bad(format!("This notice is for case {}, but that matter is {}.", notice.court_number, number));
        }
    }
    let made = if notice.kind == "hearing" {
        let purpose = notice.purpose.clone().filter(|p| hearings::PURPOSES.contains(&p.as_str())).unwrap_or_else(|| "other".to_string());
        let note = format!("Notice from {}.", notice.court_name);
        hearings::schedule(pool, matter_id, HearingInput { at: notice.at.unwrap_or_default(), purpose, courtroom: notice.courtroom.clone(), note: Some(note) }).await?.id
    } else {
        let mut body = format!("{} ({}), from {}", notice.title, notice.reference.clone().unwrap_or_else(|| notice.court_number.clone()), notice.court_name);
        for p in &notice.paragraphs {
            body.push_str("\n");
            body.push_str(p);
        }
        notes::add_note(pool, matter_id, NoteInput { body }).await?.id
    };
    sqlx::query("UPDATE notices_in SET status = 'filed', decided_at = ?, decided_by = ?, matter_id = ?, outcome_ref = ? WHERE id = ?").bind(now()).bind(decided_by).bind(matter_id).bind(&made).bind(package_id).execute(pool).await?;
    let receipt = CourtNoticeReceiptPayload { notice_package_id: package_id.to_string(), notice_key: notice.notice_key, outcome: "filed".into(), reason: None, received_at, decided_at: now(), decided_by: Some(decided_by.to_string()) };
    Ok((made, seal_receipt(pool, &link_id, package_id, &receipt).await?))
}

pub async fn return_notice(pool: &SqlitePool, package_id: &str, reason: &str, decided_by: &str) -> Result<Vec<u8>, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return bad("Say why the notice is returned, so the court can put it right.");
    }
    let (link_id, notice, received_at) = pending(pool, package_id).await?;
    sqlx::query("UPDATE notices_in SET status = 'returned', decided_at = ?, decided_by = ?, return_reason = ? WHERE id = ?").bind(now()).bind(decided_by).bind(reason).bind(package_id).execute(pool).await?;
    let receipt = CourtNoticeReceiptPayload { notice_package_id: package_id.to_string(), notice_key: notice.notice_key, outcome: "returned".into(), reason: Some(reason.to_string()), received_at, decided_at: now(), decided_by: Some(decided_by.to_string()) };
    seal_receipt(pool, &link_id, package_id, &receipt).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The firm's half with the court played by the shared contract.
    #[tokio::test]
    async fn a_hearing_and_an_order_are_filed_on_a_matter_and_the_court_gets_receipts() {
        let dir = std::env::temp_dir().join(format!("pleadli-lawyers-notices-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        create_identity(&pool, "Notice Test Advocates", Some("Kampala")).await.unwrap();
        assert!(create_identity(&pool, "Again", None).await.is_err(), "identity is set once");

        let court = Identity::generate(IdentityKind::CourtRegistry, "Notice Test Court", Some("Kampala"));
        let (link, invite_file) = create_invite(&pool, "Notice Test Court", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        let answer = pairing::make_response(&court, &invite, None).unwrap();
        assert!(import_package(&pool, &answer).await.is_ok());
        assert!(import_package(&pool, &answer).await.is_err(), "an invitation is answered once");

        let hearing = CourtNoticePayload { notice_key: "s1".into(), kind: "hearing".into(), court_name: "Notice Test Court".into(), court_number: "CO 5/2026".into(), case_title: "Uganda v X".into(), title: "Notice of hearing".into(), at: Some(now() + 7 * 86_400_000), purpose: Some("plea".into()), courtroom: Some("Court 2".into()), issued_at: 1, ..Default::default() };
        let seal = |seq: u64, n: &CourtNoticePayload| envelope::seal(&court, &invite.office, KIND_COURT_NOTICE, seq, None, &Body::new(serde_json::to_value(n).unwrap())).unwrap().0;
        assert!(import_package(&pool, &seal(1, &hearing)).await.is_err(), "not trusted yet");
        assert!(trust_link(&pool, &link.id, "WRONG-CODE").await.is_err());
        let typed = list_links(&pool).await.unwrap()[0].fingerprint.clone().unwrap().to_lowercase();
        let (trusted, confirmation) = trust_link(&pool, &link.id, &typed).await.unwrap();
        assert_eq!(trusted.status, "trusted");
        assert_eq!(pairing::read_confirmation(&court, &invite.office, &confirmation).unwrap().1.outcome, "trusted");

        let sealed = seal(1, &hearing);
        assert_eq!(import_package(&pool, &sealed).await.unwrap().kind, KIND_COURT_NOTICE);
        assert!(import_package(&pool, &sealed).await.is_err(), "replay refused");
        let order = CourtNoticePayload { notice_key: "o1".into(), kind: "order".into(), title: "DIRECTIONS".into(), paragraphs: vec!["Parties to file submissions.".into()], reference: Some("ORD/1".into()), ..hearing.clone() };
        assert_eq!(import_package(&pool, &seal(2, &order)).await.unwrap().kind, KIND_COURT_NOTICE);
        assert!(import_package(&pool, &seal(3, &CourtNoticePayload { at: None, ..hearing.clone() })).await.is_err(), "a hearing with no date is refused");
        let stranger = Identity::generate(IdentityKind::CourtRegistry, "Stranger", None);
        assert!(import_package(&pool, &envelope::seal(&stranger, &invite.office, KIND_COURT_NOTICE, 1, None, &Body::new(serde_json::to_value(&hearing).unwrap())).unwrap().0).await.is_err());

        sqlx::query("INSERT INTO clients (id, name) VALUES ('c1', 'Test Client')").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO matters (id, client_id, title, court_number) VALUES ('m1', 'c1', 'Uganda v X', 'CO 5/2026'), ('m2', 'c1', 'Other', 'CO 9/2026')").execute(&pool).await.unwrap();
        let incoming = list_incoming(&pool).await.unwrap();
        let hearing_id = incoming.iter().find(|i| i.payload.contains("\"hearing\"")).unwrap().id.clone();
        let order_id = incoming.iter().find(|i| i.payload.contains("\"order\"")).unwrap().id.clone();
        assert!(file_notice(&pool, &hearing_id, "m2", "Clerk").await.is_err(), "never on another case");
        assert!(file_notice(&pool, &hearing_id, "nobody", "Clerk").await.is_err());
        let (made, receipt_bytes) = file_notice(&pool, &hearing_id, "m1", "Clerk").await.unwrap();
        assert!(hearings::list_for_matter(&pool, "m1").await.unwrap().iter().any(|h| h.id == made && h.purpose == "plea"));
        assert!(file_notice(&pool, &hearing_id, "m1", "Clerk").await.is_err(), "decided once");
        let (note_id, _) = file_notice(&pool, &order_id, "m1", "Clerk").await.unwrap();
        assert!(notes::list_notes(&pool, "m1").await.unwrap().iter().any(|n| n.id == note_id && n.body.contains("Parties to file submissions.")));

        let opened = envelope::open(&court, envelope::peek(&receipt_bytes).unwrap(), &invite.office).unwrap();
        let receipt: CourtNoticeReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((receipt.outcome.as_str(), receipt.notice_key.as_str()), ("filed", "s1"));

        // The firm files a document in the case; the court answers.
        assert!(file_to_court(&pool, "m1", "poem", "T", &["x".into()], None).await.is_err(), "the kind is checked");
        assert!(file_to_court(&pool, "m1", "application", "Application for bail", &[], None).await.is_err(), "a filing needs text");
        sqlx::query("INSERT INTO matters (id, client_id, title) VALUES ('m3', 'c1', 'No number')").execute(&pool).await.unwrap();
        assert!(file_to_court(&pool, "m3", "application", "T", &["x".into()], None).await.is_err(), "a matter with no court number cannot file");
        let (fb, name) = file_to_court(&pool, "m1", "bail_application", "Application for bail", &["The applicant prays for bail.".into()], Some("Advocate Test")).await.unwrap();
        assert!(name.starts_with("filing-bail-application"));
        let fo = envelope::open(&court, envelope::peek(&fb).unwrap(), &invite.office).unwrap();
        let sent: FirmFilingPayload = serde_json::from_value(fo.body.json).unwrap();
        assert_eq!((sent.court_number.as_str(), sent.kind.as_str(), sent.firm_name.as_str()), ("CO 5/2026", "bail_application", "Notice Test Advocates"));
        let answer = FirmFilingReceiptPayload { filing_package_id: fo.header.id.clone(), filing_key: sent.filing_key.clone(), outcome: "accepted".into(), received_at: 1, decided_at: 2, ..Default::default() };
        let sealr = |seq: u64, r: &FirmFilingReceiptPayload| envelope::seal(&court, &invite.office, KIND_FIRM_FILING_RECEIPT, seq, Some(&fo.header.id), &Body::new(serde_json::to_value(r).unwrap())).unwrap().0;
        assert!(import_package(&pool, &sealr(9, &FirmFilingReceiptPayload { filing_package_id: "never-sent".into(), ..answer.clone() })).await.is_err(), "a receipt for a filing never sent is refused");
        assert_eq!(import_package(&pool, &sealr(10, &answer)).await.unwrap().kind, KIND_FIRM_FILING_RECEIPT);
        assert!(import_package(&pool, &sealr(11, &answer)).await.is_err(), "answered once");
        let listed = list_filings(&pool, "m1").await.unwrap();
        assert_eq!((listed.len(), listed[0].outcome.as_deref()), (1, Some("accepted")));
        pool.close().await;
    }
}
