//! DPP -> Court exchange, the registry's half (docs/interchange/dpp-court.md).
//! A filing is a claim, not a case: it is accepted only from a DPP office this
//! registry invited and a person confirmed, sealed to this registry, and not
//! seen before; and even then it waits, held apart from the register, until a
//! person gives it the court's own number. The court answers with a receipt.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{hex, unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{FilingPayload, FilingReceiptPayload, WithdrawalPayload, KIND_FILING, KIND_FILING_RECEIPT, KIND_WITHDRAWAL};
use pleadli_interchange::pairing::{self, KIND_RESPONSE};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::cases::{self, CaseInput, PartyInput};
use super::error::{invalid, DomainError};

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad<T>(message: impl AsRef<str>) -> Result<T, DomainError> {
    invalid(message.as_ref())
}
const DAMAGED: &str = "This registry's identity is damaged.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryIdentity {
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
    let row: Option<IdentityRow> = sqlx::query_as("SELECT office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret FROM exchange_identity WHERE id = 'default'").fetch_optional(pool).await?;
    let Some(r) = row else { return Ok(None) };
    let public = PublicIdentity { id: r.office_id, kind: IdentityKind::CourtRegistry, name: r.office_name, jurisdiction: r.jurisdiction, verifying_key: r.verifying_key, encryption_key: r.encryption_key };
    let signing = unhex32(&r.signing_secret).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))?;
    let encryption = unhex32(&r.encryption_secret).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))?;
    Identity::restore(public, signing, encryption).map(Some).ok_or_else(|| DomainError::Invalid(DAMAGED.into()))
}

pub(crate) async fn require_identity(pool: &SqlitePool) -> Result<Identity, DomainError> {
    match load_identity(pool).await? {
        Some(i) => Ok(i),
        None => bad("Set up this registry's identity first."),
    }
}

fn view(i: &Identity) -> RegistryIdentity {
    RegistryIdentity { office_id: i.public.id.clone(), office_name: i.public.name.clone(), jurisdiction: i.public.jurisdiction.clone(), fingerprint: i.public.fingerprint() }
}

pub async fn get_identity(pool: &SqlitePool) -> Result<Option<RegistryIdentity>, DomainError> {
    Ok(load_identity(pool).await?.as_ref().map(view))
}

/// Once: the name is part of the fingerprint every DPP office confirms.
pub async fn create_identity(pool: &SqlitePool, name: &str, jurisdiction: Option<&str>) -> Result<RegistryIdentity, DomainError> {
    let name = name.trim();
    if name.is_empty() {
        return bad("Name the registry, as the DPP offices that file to it know it.");
    }
    if load_identity(pool).await?.is_some() {
        return bad("This registry already has an identity. It cannot be changed, because every office has confirmed its fingerprint.");
    }
    let identity = Identity::generate(IdentityKind::CourtRegistry, name, jurisdiction.map(str::trim).filter(|j| !j.is_empty()));
    sqlx::query("INSERT INTO exchange_identity (id, office_id, office_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)")
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
    pub intended_office: String,
    pub status: String,
    pub dpp_name: Option<String>,
    pub fingerprint: Option<String>,
    pub invite_expires_at: i64,
    pub responded_at: Option<i64>,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(pool: &SqlitePool) -> Result<Vec<Link>, DomainError> {
    Ok(sqlx::query_as("SELECT id, intended_office, status, dpp_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM dpp_links ORDER BY created_at DESC").fetch_all(pool).await?)
}

async fn get_link(pool: &SqlitePool, id: &str) -> Result<Link, DomainError> {
    sqlx::query_as("SELECT id, intended_office, status, dpp_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM dpp_links WHERE id = ?").bind(id).fetch_optional(pool).await?.ok_or_else(|| DomainError::NotFound("No such connection.".into()))
}

/// An invitation file for one DPP office, open for `valid_days`.
pub async fn create_invite(pool: &SqlitePool, intended_office: &str, valid_days: i64) -> Result<(Link, Vec<u8>), DomainError> {
    let office = intended_office.trim();
    if office.is_empty() {
        return bad("Name the DPP office this invitation is for.");
    }
    if !(1..=60).contains(&valid_days) {
        return bad("An invitation stays open for between 1 and 60 days.");
    }
    let me = require_identity(pool).await?;
    let expires = now() + valid_days * 86_400_000;
    let (bytes, invite) = pairing::make_invite(&me, office, expires).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO dpp_links (id, intended_office, status, invite_nonce, invite_expires_at) VALUES (?, ?, 'invited', ?, ?)")
        .bind(&invite.invite_id)
        .bind(office)
        .bind(&invite.nonce)
        .bind(expires)
        .execute(pool)
        .await?;
    Ok((get_link(pool, &invite.invite_id).await?, bytes))
}

async fn dpp_public(pool: &SqlitePool, link_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String) = sqlx::query_as("SELECT dpp_id, dpp_name, dpp_jurisdiction, dpp_verifying_key, dpp_encryption_key, status FROM dpp_links WHERE id = ?").bind(link_id).fetch_one(pool).await?;
    match row {
        (Some(id), Some(name), jurisdiction, Some(verifying_key), Some(encryption_key), status) => Ok((PublicIdentity { id, kind: IdentityKind::DppOffice, name, jurisdiction, verifying_key, encryption_key }, status)),
        _ => bad("That office has not answered the invitation yet."),
    }
}

fn normal(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

/// A person confirms the DPP office by typing the fingerprint it read out.
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
    let (dpp, _) = dpp_public(pool, id).await?;
    let bytes = pairing::make_confirmation(&me, &dpp, id, "trusted", None).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("UPDATE dpp_links SET status = 'trusted', trusted_at = ? WHERE id = ?").bind(now()).bind(id).execute(pool).await?;
    Ok((get_link(pool, id).await?, bytes))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// A package from a DPP office: its answer to an invitation, or a filing.
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    if header.created_at > now() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    if header.kind == KIND_RESPONSE {
        let response = pairing::read_response(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        let row: Option<(String, i64, String)> = sqlx::query_as("SELECT status, invite_expires_at, invite_nonce FROM dpp_links WHERE id = ?").bind(&response.invite_id).fetch_optional(pool).await?;
        let Some((status, expires, nonce)) = row else { return bad("This is an answer to an invitation this registry did not issue.") };
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
        if d.kind != IdentityKind::DppOffice {
            return bad("Only a DPP office can answer this invitation.");
        }
        let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM dpp_links WHERE dpp_id = ? AND status IN ('awaiting_confirmation', 'trusted')").bind(&d.id).fetch_one(pool).await?;
        if in_use > 0 {
            return bad("That office already has a connection to this registry.");
        }
        sqlx::query("UPDATE dpp_links SET status = 'awaiting_confirmation', dpp_id = ?, dpp_name = ?, dpp_jurisdiction = ?, dpp_verifying_key = ?, dpp_encryption_key = ?, fingerprint = ?, responded_at = ? WHERE id = ?")
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
    if header.kind != KIND_FILING && header.kind != KIND_WITHDRAWAL {
        return bad(format!("This registry does not receive packages of kind '{}'.", header.kind));
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM dpp_links WHERE dpp_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from an office this registry has not connected to. Nothing was kept.") };
    if status != "trusted" {
        return bad("That office is not confirmed as trusted. Nothing was kept.");
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM exchange_incoming WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let (dpp, _) = dpp_public(pool, &link_id).await?;
    let opened = envelope::open(&me, peeked, &dpp).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different registry.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the office this registry trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    if header.kind == KIND_WITHDRAWAL {
        let w: WithdrawalPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The withdrawal inside the package could not be read.".into()))?;
        if w.court_number.trim().is_empty() || w.dpp_file_key.trim().is_empty() || !matches!(w.decision.as_str(), "nolle_prosequi" | "discontinue") {
            return bad("The withdrawal is incomplete: it needs the court's case number, the office's file key and the kind of withdrawal.");
        }
        sqlx::query("INSERT INTO exchange_incoming (id, link_id, kind, seq, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&opened.header.id)
            .bind(&link_id)
            .bind(KIND_WITHDRAWAL)
            .bind(opened.header.seq as i64)
            .bind(opened.header.created_at)
            .bind(now())
            .bind(envelope::sha256_hex(bytes))
            .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
            .execute(pool)
            .await?;
        sqlx::query("UPDATE dpp_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(pool).await?;
        return Ok(Imported { kind: KIND_WITHDRAWAL.into(), message: format!("{} has withdrawn case {}. It waits for you to record.", dpp.name, w.court_number) });
    }
    let filing: FilingPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The filing inside the package could not be read.".into()))?;
    if filing.dpp_file_key.trim().is_empty() || filing.title.trim().is_empty() || !matches!(filing.court_level.as_str(), "magistrate" | "high") || filing.parties.iter().all(|p| p.role != "accused") {
        return bad("The filing is incomplete: it needs the office's file key, a title, a court level and at least one accused.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO exchange_incoming (id, link_id, kind, seq, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(KIND_FILING)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE dpp_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Imported { kind: KIND_FILING.into(), message: format!("A filing from {} is waiting for you to read.", dpp.name) })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub id: String,
    pub kind: String,
    pub dpp_name: Option<String>,
    pub status: String,
    pub sent_at: i64,
    pub received_at: i64,
    pub decided_at: Option<i64>,
    pub reject_reason: Option<String>,
    pub case_id: Option<String>,
    pub payload: String,
}

pub async fn list_incoming(pool: &SqlitePool) -> Result<Vec<Incoming>, DomainError> {
    Ok(sqlx::query_as("SELECT i.id, i.kind, l.dpp_name, i.status, i.sent_at, i.received_at, i.decided_at, i.reject_reason, i.case_id, i.payload FROM exchange_incoming i JOIN dpp_links l ON l.id = i.link_id ORDER BY i.received_at DESC").fetch_all(pool).await?)
}

/// The receipt, sealed to the office and recorded as sent.
async fn seal_receipt(pool: &SqlitePool, link_id: &str, in_reply_to: &str, receipt: &FilingReceiptPayload) -> Result<Vec<u8>, DomainError> {
    let me = require_identity(pool).await?;
    let (dpp, _) = dpp_public(pool, link_id).await?;
    let json = serde_json::to_value(receipt).map_err(|_| DomainError::Invalid("Could not build the receipt.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM dpp_links WHERE id = ?").bind(link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE dpp_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &dpp, KIND_FILING_RECEIPT, seq as u64, Some(in_reply_to), &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO exchange_outgoing (id, link_id, kind, seq, in_reply_to, payload, prepared_at, exported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&header.id)
        .bind(link_id)
        .bind(KIND_FILING_RECEIPT)
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

async fn pending(pool: &SqlitePool, package_id: &str) -> Result<(String, FilingPayload, i64), DomainError> {
    let row: Option<(String, String, String, i64)> = sqlx::query_as("SELECT link_id, payload, status, received_at FROM exchange_incoming WHERE id = ?").bind(package_id).fetch_optional(pool).await?;
    let Some((link_id, payload, status, received_at)) = row else { return Err(DomainError::NotFound("No such filing.".into())) };
    if status != "received" {
        return bad("That filing has already been dealt with.");
    }
    let filing = serde_json::from_str(&payload).map_err(|_| DomainError::Invalid("The stored filing could not be read.".into()))?;
    Ok((link_id, filing, received_at))
}

/// A person gives the filing the court's own number and registers the case.
/// Returns the case id and the receipt file to send back.
pub async fn accept_filing(pool: &SqlitePool, package_id: &str, court_number: &str, decided_by: &str) -> Result<(String, Vec<u8>), DomainError> {
    let (link_id, filing, received_at) = pending(pool, package_id).await?;
    let offence = filing.charges.first().map(|c| c.offence.clone());
    let note = format!("Filed by the DPP. File {}{}{}.", filing.dpp_file_key, filing.dpp_reference.as_deref().map(|r| format!(", reference {r}")).unwrap_or_default(), filing.police_reference.as_deref().map(|r| format!(", police {r}")).unwrap_or_default());
    let case = cases::create(pool, CaseInput { court_number: court_number.to_string(), title: filing.title.clone(), court_level: filing.court_level.clone(), offence, registered_on: Some(now()), notes: Some(note) }).await?;
    for p in filing.parties.iter().filter(|p| p.role == "accused" || p.role == "complainant") {
        // The prosecution's word about custody is a claim: the court records its own.
        let note = p.custody.as_deref().map(|c| format!("The prosecution reports: {c}{}", p.custody_place.as_deref().map(|w| format!(", {w}")).unwrap_or_default()));
        cases::add_party(pool, &case.id, PartyInput { role: p.role.clone(), name: p.name.clone(), custody: None, remand_until: None, custody_place: None, note }).await?;
    }
    sqlx::query("UPDATE exchange_incoming SET status = 'accepted', decided_at = ?, decided_by = ?, case_id = ? WHERE id = ?").bind(now()).bind(decided_by).bind(&case.id).bind(package_id).execute(pool).await?;
    let receipt = FilingReceiptPayload { filing_package_id: package_id.to_string(), dpp_file_key: filing.dpp_file_key, outcome: "accepted".into(), court_number: Some(court_number.trim().to_string()), reason: None, received_at, decided_at: now(), decided_by: Some(decided_by.to_string()) };
    Ok((case.id, seal_receipt(pool, &link_id, package_id, &receipt).await?))
}

/// A person records that the prosecution has withdrawn a case this registry
/// numbered. The case is concluded with the withdrawal as its outcome, unless a
/// sitting is still scheduled: the court deals with its own diary first.
pub async fn record_withdrawal(pool: &SqlitePool, package_id: &str, decided_by: &str) -> Result<(String, Vec<u8>), DomainError> {
    let row: Option<(String, String, String, String, i64)> = sqlx::query_as("SELECT link_id, payload, status, kind, received_at FROM exchange_incoming WHERE id = ?").bind(package_id).fetch_optional(pool).await?;
    let Some((link_id, payload, status, kind, received_at)) = row else { return Err(DomainError::NotFound("No such withdrawal.".into())) };
    if kind != KIND_WITHDRAWAL {
        return bad("That is not a withdrawal.");
    }
    if status != "received" {
        return bad("That withdrawal has already been dealt with.");
    }
    let w: WithdrawalPayload = serde_json::from_str(&payload).map_err(|_| DomainError::Invalid("The stored withdrawal could not be read.".into()))?;
    let case_id: Option<String> = sqlx::query_scalar(
        "SELECT i.case_id FROM exchange_incoming i JOIN cases c ON c.id = i.case_id
         WHERE i.kind = ? AND i.status = 'accepted' AND i.link_id = ? AND json_extract(i.payload, '$.dppFileKey') = ? AND c.court_number = ?",
    )
    .bind(KIND_FILING)
    .bind(&link_id)
    .bind(&w.dpp_file_key)
    .bind(w.court_number.trim())
    .fetch_optional(pool)
    .await?;
    let Some(case_id) = case_id else { return bad("This registry has no case with that number registered from that office's file, so there is nothing to withdraw.") };
    let outcome = format!("{}{}", if w.decision == "nolle_prosequi" { "Withdrawn by the prosecution (nolle prosequi)" } else { "Discontinued by the prosecution" }, w.reason.as_deref().map(|r| format!(": {r}")).unwrap_or_default());
    cases::conclude(pool, &case_id, &outcome).await?;
    sqlx::query("UPDATE exchange_incoming SET status = 'accepted', decided_at = ?, decided_by = ?, case_id = ? WHERE id = ?").bind(now()).bind(decided_by).bind(&case_id).bind(package_id).execute(pool).await?;
    let receipt = FilingReceiptPayload { filing_package_id: package_id.to_string(), dpp_file_key: w.dpp_file_key, outcome: "withdrawal_recorded".into(), court_number: Some(w.court_number), reason: None, received_at, decided_at: now(), decided_by: Some(decided_by.to_string()) };
    Ok((case_id, seal_receipt(pool, &link_id, package_id, &receipt).await?))
}

pub async fn reject_filing(pool: &SqlitePool, package_id: &str, reason: &str, decided_by: &str) -> Result<Vec<u8>, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return bad("Say why the filing is returned, so the office can put it right.");
    }
    let (link_id, filing, received_at) = pending(pool, package_id).await?;
    sqlx::query("UPDATE exchange_incoming SET status = 'rejected', decided_at = ?, decided_by = ?, reject_reason = ? WHERE id = ?").bind(now()).bind(decided_by).bind(reason).bind(package_id).execute(pool).await?;
    let receipt = FilingReceiptPayload { filing_package_id: package_id.to_string(), dpp_file_key: filing.dpp_file_key, outcome: "rejected".into(), court_number: None, reason: Some(reason.to_string()), received_at, decided_at: now(), decided_by: Some(decided_by.to_string()) };
    seal_receipt(pool, &link_id, package_id, &receipt).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_interchange::messages::{FilingCharge, FilingParty};

    async fn test_pool() -> SqlitePool {
        let dir = std::env::temp_dir().join(format!("pleadli-courts-exchange-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        crate::db::startup(&dir).await.ok().unwrap().pool
    }

    /// The whole hand-over with the DPP played by the shared contract: invite,
    /// answer, confirm, file, accept into the register, receipt. Local data only.
    #[tokio::test]
    async fn a_filing_is_accepted_into_the_register_and_the_dpp_gets_a_receipt() {
        let pool = test_pool().await;
        let registry = create_identity(&pool, "Exchange Test Chief Magistrates Court", Some("Kampala")).await.unwrap();
        assert!(create_identity(&pool, "Another", None).await.is_err(), "identity is set once");

        let dpp = Identity::generate(IdentityKind::DppOffice, "Exchange Test DPP Office", Some("Kampala"));
        let (link, invite_file) = create_invite(&pool, "Exchange Test DPP Office", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        assert_eq!(invite.office.fingerprint(), registry.fingerprint);
        let answer = pairing::make_response(&dpp, &invite, None).unwrap();
        assert!(import_package(&pool, &answer).await.is_ok());
        assert!(import_package(&pool, &answer).await.is_err(), "an invitation is answered once");

        // Nothing from the office is kept before a person confirms it.
        let filing = FilingPayload {
            dpp_file_key: "FILE-9".into(),
            dpp_reference: Some("DPP 7/2026".into()),
            police_reference: Some("EXCH CRB 1/2026".into()),
            title: "Uganda v Ssekandi".into(),
            court_level: "magistrate".into(),
            summary: "Theft".into(),
            parties: vec![FilingParty { key: "a".into(), role: "accused".into(), name: "Ssekandi Moses".into(), custody: Some("remanded".into()), custody_place: Some("Luzira".into()) }, FilingParty { key: "c".into(), role: "complainant".into(), name: "Nakato Grace".into(), ..Default::default() }],
            charges: vec![FilingCharge { accused_key: Some("a".into()), offence: "Theft".into(), statutory_section: Some("Penal Code Act, section 254".into()), particulars: None }],
            filed_at: 1,
            filed_by: Some("State Attorney".into()),
            notes: None,
        };
        let seal_filing = |seq: u64, payload: &FilingPayload| envelope::seal(&dpp, &invite.office, KIND_FILING, seq, None, &Body::new(serde_json::to_value(payload).unwrap())).unwrap().0;
        assert!(import_package(&pool, &seal_filing(1, &filing)).await.is_err(), "not trusted yet");

        assert!(trust_link(&pool, &link.id, "WRONG-CODE").await.is_err());
        let typed = list_links(&pool).await.unwrap()[0].fingerprint.clone().unwrap().to_lowercase();
        let (trusted, confirmation) = trust_link(&pool, &link.id, &typed).await.unwrap();
        assert_eq!(trusted.status, "trusted");
        let (_, read) = pairing::read_confirmation(&dpp, &invite.office, &confirmation).unwrap();
        assert_eq!(read.outcome, "trusted");

        let filed = seal_filing(1, &filing);
        assert_eq!(import_package(&pool, &filed).await.unwrap().kind, KIND_FILING);
        assert!(import_package(&pool, &filed).await.is_err(), "replay refused");
        assert!(import_package(&pool, &seal_filing(2, &FilingPayload { parties: vec![], ..filing.clone() })).await.is_err(), "no accused is refused");
        let stranger = Identity::generate(IdentityKind::DppOffice, "Stranger", None);
        let forged = envelope::seal(&stranger, &invite.office, KIND_FILING, 1, None, &Body::new(serde_json::to_value(&filing).unwrap())).unwrap().0;
        assert!(import_package(&pool, &forged).await.is_err());

        // Nothing is in the register until a person accepts it with the court's own number.
        let before = cases::list(&pool, "", "all", 500).await.unwrap().len();
        let package_id = list_incoming(&pool).await.unwrap()[0].id.clone();
        let (case_id, receipt_bytes) = accept_filing(&pool, &package_id, "CO 12/2026", "Registrar").await.unwrap();
        let case = cases::get(&pool, &case_id).await.unwrap().unwrap();
        assert_eq!(case.court_number, "CO 12/2026");
        assert_eq!(cases::list_parties(&pool, &case_id).await.unwrap().len(), 2);
        assert!(accept_filing(&pool, &package_id, "CO 13/2026", "Registrar").await.is_err(), "decided once");
        assert_eq!(cases::list(&pool, "", "all", 500).await.unwrap().len(), before + 1, "exactly one case was registered");

        // The DPP reads the receipt, sealed to it alone.
        let opened = envelope::open(&dpp, envelope::peek(&receipt_bytes).unwrap(), &invite.office).unwrap();
        let receipt: FilingReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((receipt.outcome.as_str(), receipt.court_number.as_deref()), ("accepted", Some("CO 12/2026")));
        assert_eq!(receipt.dpp_file_key, "FILE-9");

        // The prosecution withdraws the case. The court records it and the case concludes.
        let wd = WithdrawalPayload { dpp_file_key: "FILE-9".into(), court_number: "CO 12/2026".into(), decision: "nolle_prosequi".into(), reason: Some("Complainant withdrew".into()), decided_at: 5, decided_by: Some("State Attorney".into()) };
        let seal_wd = |seq: u64, p: &WithdrawalPayload| envelope::seal(&dpp, &invite.office, KIND_WITHDRAWAL, seq, None, &Body::new(serde_json::to_value(p).unwrap())).unwrap().0;
        let wrong = seal_wd(3, &WithdrawalPayload { court_number: "CO 99/2026".into(), ..wd.clone() });
        assert_eq!(import_package(&pool, &wrong).await.unwrap().kind, KIND_WITHDRAWAL);
        let wrong_id = list_incoming(&pool).await.unwrap().into_iter().find(|i| i.kind == KIND_WITHDRAWAL).unwrap().id;
        assert!(record_withdrawal(&pool, &wrong_id, "Registrar").await.is_err(), "a number this registry never gave is refused");
        let good = seal_wd(4, &wd);
        import_package(&pool, &good).await.unwrap();
        assert!(import_package(&pool, &good).await.is_err(), "replay refused");
        let good_id = list_incoming(&pool).await.unwrap().into_iter().find(|i| i.kind == KIND_WITHDRAWAL && i.id != wrong_id).unwrap().id;
        let (closed, wd_receipt) = record_withdrawal(&pool, &good_id, "Registrar").await.unwrap();
        assert_eq!(closed, case_id);
        let case = cases::get(&pool, &case_id).await.unwrap().unwrap();
        assert_eq!(case.status, "concluded");
        assert!(case.outcome.unwrap().contains("nolle prosequi"));
        let opened = envelope::open(&dpp, envelope::peek(&wd_receipt).unwrap(), &invite.office).unwrap();
        let r: FilingReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((r.outcome.as_str(), r.filing_package_id.as_str()), ("withdrawal_recorded", good_id.as_str()));
        pool.close().await;
    }
}
