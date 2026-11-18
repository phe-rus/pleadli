//! Court -> firm exchange, the court's half (docs/interchange/court-firm.md).
//! A firm invites the registry; the registry answers, is confirmed, and then
//! sends the notices it makes (the date of a sitting, the copy of an order), sealed to that firm.
//! The firm's receipt says whether it filed the notice. Nothing here
//! changes a case: the receipt is kept beside the notice.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{CourtNoticePayload, CourtNoticeReceiptPayload, KIND_COURT_NOTICE, KIND_COURT_NOTICE_RECEIPT};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::error::DomainError;
use super::exchange::require_identity;
use super::{cases, orders, sittings};


fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::Invalid(message.into()))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct FirmLink {
    pub id: String,
    pub firm_name: String,
    pub firm_jurisdiction: Option<String>,
    pub fingerprint: String,
    pub status: String,
    pub reason: Option<String>,
    pub responded_at: i64,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(pool: &SqlitePool) -> Result<Vec<FirmLink>, DomainError> {
    Ok(sqlx::query_as("SELECT id, firm_name, firm_jurisdiction, fingerprint, status, reason, responded_at, trusted_at FROM firm_links ORDER BY created_at DESC").fetch_all(pool).await?)
}

/// Reads a firm's invitation file and answers it. The firm becomes
/// trusted only when it confirms this registry back.
pub async fn accept_invite(pool: &SqlitePool, invite_file: &[u8], contact: Option<&str>) -> Result<(FirmLink, Vec<u8>), DomainError> {
    let me = require_identity(pool).await?;
    let invite = pairing::read_invite(invite_file).map_err(|e| DomainError::Invalid(e.to_string()))?;
    if invite.expires_at < now() {
        return bad("That invitation has expired. Ask the firm for a new one.");
    }
    if invite.office.kind != IdentityKind::LawFirm {
        return bad("That invitation is not from a firm firm.");
    }
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM firm_links WHERE id = ? OR (firm_id = ? AND status IN ('answered', 'trusted'))").bind(&invite.invite_id).bind(&invite.office.id).fetch_one(pool).await?;
    if taken > 0 {
        return bad("This registry already has a connection to that firm.");
    }
    let response = pairing::make_response(&me, &invite, contact.map(str::trim).filter(|c| !c.is_empty())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let p = &invite.office;
    sqlx::query("INSERT INTO firm_links (id, firm_id, firm_name, firm_jurisdiction, firm_verifying_key, firm_encryption_key, fingerprint, status, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'answered', ?)")
        .bind(&invite.invite_id)
        .bind(&p.id)
        .bind(&p.name)
        .bind(&p.jurisdiction)
        .bind(&p.verifying_key)
        .bind(&p.encryption_key)
        .bind(p.fingerprint())
        .bind(now())
        .execute(pool)
        .await?;
    let link = sqlx::query_as("SELECT id, firm_name, firm_jurisdiction, fingerprint, status, reason, responded_at, trusted_at FROM firm_links WHERE id = ?").bind(&invite.invite_id).fetch_one(pool).await?;
    Ok((link, response))
}

async fn firm_public(pool: &SqlitePool, link_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: (String, String, Option<String>, String, String, String) = sqlx::query_as("SELECT firm_id, firm_name, firm_jurisdiction, firm_verifying_key, firm_encryption_key, status FROM firm_links WHERE id = ?").bind(link_id).fetch_one(pool).await?;
    let (id, name, jurisdiction, verifying_key, encryption_key, status) = row;
    Ok((PublicIdentity { id, kind: IdentityKind::LawFirm, name, jurisdiction, verifying_key, encryption_key }, status))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// What a firm sends back: its confirmation, or the receipt for an order.
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    if header.created_at > now() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM firm_links WHERE firm_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from a firm this registry has not connected to. Nothing was kept.") };
    let (firm, _) = firm_public(pool, &link_id).await?;

    if header.kind == KIND_CONFIRMATION {
        if status != "answered" {
            return bad("That connection is not waiting for a confirmation.");
        }
        let (_, confirmation) = pairing::read_confirmation(&me, &firm, bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        let trusted = confirmation.outcome == "trusted";
        sqlx::query("UPDATE firm_links SET status = ?, reason = ?, trusted_at = CASE WHEN ? THEN ? ELSE NULL END WHERE id = ?").bind(if trusted { "trusted" } else { "declined" }).bind(&confirmation.reason).bind(trusted).bind(now()).bind(&link_id).execute(pool).await?;
        let message = if trusted { format!("{} has confirmed this registry. Notices can now be sent to it.", firm.name) } else { format!("{} declined this registry's answer.", firm.name) };
        return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
    }
    if header.kind != KIND_COURT_NOTICE_RECEIPT {
        return bad(format!("This registry does not receive packages of kind '{}' from a firm.", header.kind));
    }
    if status != "trusted" {
        return bad("That firm is not confirmed as trusted. Nothing was kept.");
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM firm_incoming WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let opened = envelope::open(&me, peeked, &firm).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different registry.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the firm this registry trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let receipt: CourtNoticeReceiptPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The receipt inside the package could not be read.".into()))?;
    // Only a receipt for a notice this registry sent to this firm counts.
    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM firm_outgoing WHERE id = ? AND link_id = ? AND notice_key = ?").bind(&receipt.notice_package_id).bind(&link_id).bind(&receipt.notice_key).fetch_one(pool).await?;
    if sent == 0 {
        return bad("That receipt answers a notice this registry did not send to this firm.");
    }
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT INTO firm_incoming (id, link_id, notice_key, notice_package_id, outcome, reason, seq, sent_at, received_at, package_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(&receipt.notice_key)
        .bind(&receipt.notice_package_id)
        .bind(&receipt.outcome)
        .bind(&receipt.reason)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE firm_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *tx).await?;
    tx.commit().await?;
    let message = if receipt.outcome == "filed" { format!("{} filed the notice.", firm.name) } else { format!("{} returned the order: {}", firm.name, receipt.reason.as_deref().unwrap_or("no reason given")) };
    Ok(Imported { kind: KIND_COURT_NOTICE_RECEIPT.into(), message })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub notice_key: String,
    pub firm_name: String,
    pub prepared_at: i64,
    pub outcome: Option<String>,
    pub reason: Option<String>,
}

/// Where each order stands with the firms it was sent to.
pub async fn list_deliveries(pool: &SqlitePool, notice_key: &str) -> Result<Vec<Delivery>, DomainError> {
    Ok(sqlx::query_as("SELECT o.notice_key, l.firm_name, o.prepared_at, r.outcome, r.reason FROM firm_outgoing o JOIN firm_links l ON l.id = o.link_id LEFT JOIN firm_incoming r ON r.notice_package_id = o.id WHERE (? = '' OR o.notice_key = ?) ORDER BY o.prepared_at DESC").bind(notice_key).bind(notice_key).fetch_all(pool).await?)
}


async fn trusted_firm(pool: &SqlitePool, link_id: &str) -> Result<PublicIdentity, DomainError> {
    let (firm, status) = firm_public(pool, link_id).await.map_err(|_| DomainError::NotFound("No such firm.".into()))?;
    if status != "trusted" {
        return bad("That firm has not confirmed this registry yet.");
    }
    Ok(firm)
}

/// Seals one notice to one confirmed firm. Sending again makes a new package.
async fn seal_notice(pool: &SqlitePool, link_id: &str, payload: &CourtNoticePayload, label: &str) -> Result<(Vec<u8>, String), DomainError> {
    let me = require_identity(pool).await?;
    let firm = trusted_firm(pool, link_id).await?;
    let json = serde_json::to_value(payload).map_err(|_| DomainError::Invalid("Could not build the notice.".into()))?;
    let mut tx = pool.begin().await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM firm_links WHERE id = ?").bind(link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE firm_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &firm, KIND_COURT_NOTICE, seq as u64, None, &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO firm_outgoing (id, link_id, notice_key, seq, payload, prepared_at) VALUES (?, ?, ?, ?, ?, ?)").bind(&header.id).bind(link_id).bind(&payload.notice_key).bind(seq).bind(serde_json::to_string(&json).unwrap_or_default()).bind(now()).execute(&mut *tx).await?;
    tx.commit().await?;
    let safe: String = payload.court_number.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("{label}-{}-{seq}.pxpkg", safe.trim_matches('-').to_lowercase())))
}

/// The date of a sitting, as a notice to counsel.
pub async fn export_hearing(pool: &SqlitePool, sitting_id: &str, link_id: &str) -> Result<(Vec<u8>, String), DomainError> {
    let me = require_identity(pool).await?;
    let sitting = sittings::get(pool, sitting_id).await?.ok_or_else(|| DomainError::NotFound("No such sitting.".into()))?;
    if sitting.status != "scheduled" {
        return bad("Only a sitting that is still to be held can be noticed.");
    }
    let case = cases::get(pool, &sitting.case_id).await?.ok_or_else(|| DomainError::NotFound("No such case.".into()))?;
    let payload = CourtNoticePayload { notice_key: sitting.id.clone(), kind: "hearing".into(), court_name: me.public.name.clone(), court_number: case.court_number.clone(), case_title: case.title.clone(), title: "Notice of hearing".into(), at: Some(sitting.scheduled_at), purpose: Some(sitting.purpose.clone()), courtroom: sitting.courtroom.clone(), issued_at: now(), ..Default::default() };
    seal_notice(pool, link_id, &payload, "hearing").await
}

/// An issued order of any kind, as a copy to counsel with the signed wording.
pub async fn export_order_copy(pool: &SqlitePool, order_id: &str, link_id: &str) -> Result<(Vec<u8>, String), DomainError> {
    let me = require_identity(pool).await?;
    let order = orders::get(pool, order_id).await?.ok_or_else(|| DomainError::NotFound("No such order.".into()))?;
    if order.status != "issued" {
        return bad("Only an issued order can be sent. Issue it first.");
    }
    let Some(content) = order.content.as_ref() else { return bad("This order has no recorded wording.") };
    let payload = CourtNoticePayload { notice_key: order.id.clone(), kind: "order".into(), court_name: me.public.name.clone(), court_number: order.court_number.clone(), case_title: order.case_title.clone(), title: content.heading.clone(), paragraphs: content.paragraphs.clone(), reference: order.reference.clone(), issued_at: order.issued_at.unwrap_or_default(), issued_by: order.issued_by.clone(), ..Default::default() };
    seal_notice(pool, link_id, &payload, "order").await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::cases::CaseInput;
    use crate::domain::orders::{CreateOrderInput, OrderFields};
    use pleadli_interchange::identity::Identity;

    /// A hearing notice and an order copy reach a firm and receipts return, with
    /// the firm played by the shared contract. Local data only.
    #[tokio::test]
    async fn notices_reach_the_firm_and_receipts_return() {
        let dir = std::env::temp_dir().join(format!("pleadli-courts-firm-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        super::super::exchange::create_identity(&pool, "Firm Test Magistrates Court", Some("Kampala")).await.unwrap();
        sqlx::query("INSERT OR REPLACE INTO bench_profile (id, name, title, court_name) VALUES ('default', 'Magistrate Test', 'Magistrate Grade I', 'Firm Test Magistrates Court')").execute(&pool).await.ok();
        let firm = Identity::generate(IdentityKind::LawFirm, "Firm Test Advocates", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&firm, "Firm Test Magistrates Court", i64::MAX).unwrap();
        let (link, answer) = accept_invite(&pool, &invite_file, None).await.unwrap();
        let response = pairing::read_response(&answer).unwrap();

        let case = cases::create(&pool, CaseInput { court_number: "CO 77/2026".into(), title: "Uganda v Firm Test".into(), court_level: "magistrate".into(), offence: Some("Theft".into()), registered_on: Some(now()), notes: None }).await.unwrap();
        let sitting = sittings::schedule(&pool, &case.id, sittings::SittingInput { scheduled_at: now() + 7 * 86_400_000, purpose: "hearing".into(), courtroom: Some("Court 2".into()), note: None }).await.unwrap();
        assert!(export_hearing(&pool, &sitting.id, &link.id).await.is_err(), "not before the firm confirms");
        let confirmation = pairing::make_confirmation(&firm, &response.station, &invite.invite_id, "trusted", None).unwrap();
        assert_eq!(import_package(&pool, &confirmation).await.unwrap().kind, KIND_CONFIRMATION);

        let (bytes, name) = export_hearing(&pool, &sitting.id, &link.id).await.unwrap();
        assert!(name.ends_with(".pxpkg"));
        let opened = envelope::open(&firm, envelope::peek(&bytes).unwrap(), &response.station).unwrap();
        let notice: CourtNoticePayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((notice.kind.as_str(), notice.court_number.as_str(), notice.courtroom.as_deref()), ("hearing", "CO 77/2026", Some("Court 2")));

        let order = orders::create(&pool, CreateOrderInput { case_id: case.id.clone(), sitting_id: None, kind: "general".into(), title: Some("Directions".into()), fields: OrderFields { body: Some("Parties to file submissions.".into()), ..Default::default() } }).await.unwrap();
        assert!(export_order_copy(&pool, &order.id, &link.id).await.is_err(), "a draft is not sent");
        orders::issue(&pool, &order.id).await.unwrap();
        let (order_bytes, _) = export_order_copy(&pool, &order.id, &link.id).await.unwrap();
        let sent: CourtNoticePayload = serde_json::from_value(envelope::open(&firm, envelope::peek(&order_bytes).unwrap(), &response.station).unwrap().body.json).unwrap();
        assert_eq!(sent.kind, "order");
        assert!(!sent.paragraphs.is_empty());

        let receipt = CourtNoticeReceiptPayload { notice_package_id: opened.header.id.clone(), notice_key: sitting.id.clone(), outcome: "filed".into(), received_at: 1, decided_at: 2, ..Default::default() };
        let seal = |seq: u64, r: &CourtNoticeReceiptPayload| envelope::seal(&firm, &response.station, KIND_COURT_NOTICE_RECEIPT, seq, Some(&opened.header.id), &Body::new(serde_json::to_value(r).unwrap())).unwrap().0;
        let receipt_bytes = seal(1, &receipt);
        assert_eq!(import_package(&pool, &receipt_bytes).await.unwrap().kind, KIND_COURT_NOTICE_RECEIPT);
        assert!(import_package(&pool, &receipt_bytes).await.is_err(), "replay refused");
        assert!(import_package(&pool, &seal(2, &CourtNoticeReceiptPayload { notice_package_id: "never-sent".into(), ..receipt.clone() })).await.is_err());
        let d = list_deliveries(&pool, &sitting.id).await.unwrap();
        assert_eq!((d.len(), d[0].outcome.as_deref()), (1, Some("filed")));
        pool.close().await;
    }
}
