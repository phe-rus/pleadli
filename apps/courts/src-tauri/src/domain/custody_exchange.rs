//! Court -> prison exchange, the court's half (docs/interchange/court-prison.md).
//! A facility invites the registry; the registry answers, is confirmed, and then
//! sends the remand and release orders it has issued, sealed to that facility.
//! The facility's receipt says whether it recorded the order. Nothing here
//! changes an order: the receipt is kept beside it.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{IdentityKind, PublicIdentity};
use pleadli_interchange::identity::Identity;
use pleadli_interchange::messages::{CustodyOrderPayload, CustodyReceiptPayload, CustodyReportPayload, KIND_CUSTODY_ORDER, KIND_CUSTODY_RECEIPT, KIND_CUSTODY_REPORT};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION};
use serde::Serialize;
use sqlx::{FromRow, SqlitePool};

use super::error::DomainError;
use super::exchange::require_identity;
use super::orders;

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn bad<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::Invalid(message.into()))
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrisonLink {
    pub id: String,
    pub prison_name: String,
    pub prison_jurisdiction: Option<String>,
    pub fingerprint: String,
    pub status: String,
    pub reason: Option<String>,
    pub responded_at: i64,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(pool: &SqlitePool) -> Result<Vec<PrisonLink>, DomainError> {
    Ok(sqlx::query_as("SELECT id, prison_name, prison_jurisdiction, fingerprint, status, CASE WHEN status = 'revoked' THEN revoked_reason ELSE reason END AS reason, responded_at, trusted_at FROM prison_links ORDER BY created_at DESC").fetch_all(pool).await?)
}

/// Reads a facility's invitation file and answers it. The facility becomes
/// trusted only when it confirms this registry back.
pub async fn accept_invite(pool: &SqlitePool, invite_file: &[u8], contact: Option<&str>) -> Result<(PrisonLink, Vec<u8>), DomainError> {
    let me = require_identity(pool).await?;
    let invite = pairing::read_invite(invite_file).map_err(|e| DomainError::Invalid(e.to_string()))?;
    if invite.expires_at < now() {
        return bad("That invitation has expired. Ask the facility for a new one.");
    }
    if invite.office.kind != IdentityKind::PrisonFacility {
        return bad("That invitation is not from a prison facility.");
    }
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prison_links WHERE id = ? OR (prison_id = ? AND status IN ('answered', 'trusted'))").bind(&invite.invite_id).bind(&invite.office.id).fetch_one(pool).await?;
    if taken > 0 {
        return bad("This registry already has a connection to that facility.");
    }
    let response = pairing::make_response(&me, &invite, contact.map(str::trim).filter(|c| !c.is_empty())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let p = &invite.office;
    sqlx::query("INSERT INTO prison_links (id, prison_id, prison_name, prison_jurisdiction, prison_verifying_key, prison_encryption_key, fingerprint, status, responded_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'answered', ?)")
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
    let link = sqlx::query_as("SELECT id, prison_name, prison_jurisdiction, fingerprint, status, reason, responded_at, trusted_at FROM prison_links WHERE id = ?").bind(&invite.invite_id).fetch_one(pool).await?;
    Ok((link, response))
}

async fn prison_public(pool: &SqlitePool, link_id: &str) -> Result<(PublicIdentity, String), DomainError> {
    let row: (String, String, Option<String>, String, String, String) = sqlx::query_as("SELECT prison_id, prison_name, prison_jurisdiction, prison_verifying_key, prison_encryption_key, status FROM prison_links WHERE id = ?").bind(link_id).fetch_one(pool).await?;
    let (id, name, jurisdiction, verifying_key, encryption_key, status) = row;
    Ok((PublicIdentity { id, kind: IdentityKind::PrisonFacility, name, jurisdiction, verifying_key, encryption_key }, status))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// What a facility sends back: its confirmation, or the receipt for an order.
pub async fn import_package(pool: &SqlitePool, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(pool).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    let header = peeked.header.clone();
    // Whatever carrier brought it, this institution decides for itself whether that kind of sender may send that kind of package.
    if let Err(why) = pleadli_interchange::authorization::check(header.from.kind, pleadli_interchange::identity::IdentityKind::CourtRegistry, &header.kind) {
        return bad(why);
    }
    if header.created_at > now() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM prison_links WHERE prison_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(pool).await?;
    let Some((link_id, status)) = row else { return bad("This package is from a facility this registry has not connected to. Nothing was kept.") };
    let (prison, _) = prison_public(pool, &link_id).await?;

    if header.kind == KIND_CONFIRMATION {
        let (_, confirmation) = pairing::read_confirmation(&me, &prison, bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        // The other side ending the connection. Signed by it, so it is taken as its word; ending twice changes nothing.
        if confirmation.outcome == "revoked" {
            let why = confirmation.reason.clone().unwrap_or_default();
            if !pleadli_node_core::hub::set_revoked(pool, super::relay::PRISONS, &link_id, &why, &["trusted", "answered"]).await? {
                return bad("That connection is not active.");
            }
            return Ok(Imported { kind: KIND_CONFIRMATION.into(), message: format!("{} has ended its connection with this registry. Nothing more will be accepted from it.", prison.name) });
        }
        if status != "answered" {
            return bad("That connection is not waiting for a confirmation.");
        }
        let trusted = confirmation.outcome == "trusted";
        sqlx::query("UPDATE prison_links SET status = ?, reason = ?, trusted_at = CASE WHEN ? THEN ? ELSE NULL END WHERE id = ?").bind(if trusted { "trusted" } else { "declined" }).bind(&confirmation.reason).bind(trusted).bind(now()).bind(&link_id).execute(pool).await?;
        let message = if trusted { format!("{} has confirmed this registry. Orders can now be sent to it.", prison.name) } else { format!("{} declined this registry's answer.", prison.name) };
        return Ok(Imported { kind: KIND_CONFIRMATION.into(), message });
    }
    if header.kind == KIND_CUSTODY_REPORT {
        return import_report(pool, bytes, peeked, &me, &prison, &link_id, &status).await;
    }
    if header.kind != KIND_CUSTODY_RECEIPT {
        return bad(format!("This registry does not receive packages of kind '{}' from a facility.", header.kind));
    }
    if status != "trusted" {
        return bad(if status == "revoked" { "That facility has ended its connection with this registry. Nothing was kept." } else { "That facility is not confirmed as trusted. Nothing was kept." });
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prison_incoming WHERE id = ?").bind(&header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let opened = envelope::open(&me, peeked, &prison).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different registry.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the facility this registry trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let receipt: CustodyReceiptPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The receipt inside the package could not be read.".into()))?;
    // Only a receipt for an order this registry sent to this facility counts.
    let sent: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prison_outgoing WHERE id = ? AND link_id = ? AND order_id = ?").bind(&receipt.order_package_id).bind(&link_id).bind(&receipt.order_key).fetch_one(pool).await?;
    if sent == 0 {
        return bad("That receipt answers an order this registry did not send to this facility.");
    }
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO prison_incoming (id, link_id, order_id, order_package_id, outcome, reason, seq, sent_at, received_at, package_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(&receipt.order_key)
        .bind(&receipt.order_package_id)
        .bind(&receipt.outcome)
        .bind(&receipt.reason)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE prison_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *tx).await?;
    tx.commit().await?;
    let message = if receipt.outcome == "recorded" { format!("{} recorded the order.", prison.name) } else { format!("{} returned the order: {}", prison.name, receipt.reason.as_deref().unwrap_or("no reason given")) };
    Ok(Imported { kind: KIND_CUSTODY_RECEIPT.into(), message })
}

/// A facility reports what happened to a person this registry committed.
async fn import_report(pool: &SqlitePool, bytes: &[u8], peeked: envelope::Peeked, me: &Identity, prison: &PublicIdentity, link_id: &str, status: &str) -> Result<Imported, DomainError> {
    if status != "trusted" {
        return bad(if status == "revoked" { "That facility has ended its connection with this registry. Nothing was kept." } else { "That facility is not confirmed as trusted. Nothing was kept." });
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prison_reports WHERE id = ?").bind(&peeked.header.id).fetch_one(pool).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let opened = envelope::open(me, peeked, prison).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::Invalid("This package is addressed to a different registry.".into()),
        envelope::PackageError::BadSignature => DomainError::Invalid("The signature does not match the facility this registry trusts. Nothing was kept.".into()),
        other => DomainError::Invalid(other.to_string()),
    })?;
    let r: CustodyReportPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::Invalid("The report inside the package could not be read.".into()))?;
    // Only a report about an order this registry sent to this facility counts.
    let case_id: Option<String> = sqlx::query_scalar("SELECT o.case_id FROM prison_outgoing p JOIN orders o ON o.id = p.order_id WHERE p.link_id = ? AND p.order_id = ? LIMIT 1").bind(link_id).bind(&r.order_key).fetch_optional(pool).await?;
    let Some(case_id) = case_id else { return bad("That report is about an order this registry did not send to this facility.") };
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    sqlx::query("INSERT INTO prison_reports (id, link_id, order_id, case_id, court_number, accused, event, occurred_at, note, reported_by, seq, sent_at, received_at, package_sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(link_id)
        .bind(&r.order_key)
        .bind(&case_id)
        .bind(&r.court_number)
        .bind(&r.accused)
        .bind(&r.event)
        .bind(r.occurred_at)
        .bind(&r.note)
        .bind(&r.reported_by)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now())
        .bind(envelope::sha256_hex(bytes))
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE prison_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(link_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Imported { kind: KIND_CUSTODY_REPORT.into(), message: format!("{} reports on {}: {}.", prison.name, r.accused, r.event.replace('_', " ")) })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PrisonReport {
    pub id: String,
    pub case_id: Option<String>,
    pub prison_name: String,
    pub court_number: String,
    pub accused: String,
    pub event: String,
    pub occurred_at: i64,
    pub note: Option<String>,
    pub reported_by: Option<String>,
    pub received_at: i64,
}

/// Reports from facilities, newest first; for one case when given.
pub async fn list_reports(pool: &SqlitePool, case_id: Option<&str>) -> Result<Vec<PrisonReport>, DomainError> {
    Ok(sqlx::query_as("SELECT r.id, r.case_id, l.prison_name, r.court_number, r.accused, r.event, r.occurred_at, r.note, r.reported_by, r.received_at FROM prison_reports r JOIN prison_links l ON l.id = r.link_id WHERE (? IS NULL OR r.case_id = ?) ORDER BY r.received_at DESC").bind(case_id).bind(case_id).fetch_all(pool).await?)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub order_id: String,
    pub prison_name: String,
    pub prepared_at: i64,
    pub outcome: Option<String>,
    pub reason: Option<String>,
}

/// Where each order stands with the facilities it was sent to.
pub async fn list_deliveries(pool: &SqlitePool, order_id: &str) -> Result<Vec<Delivery>, DomainError> {
    Ok(sqlx::query_as("SELECT o.order_id, l.prison_name, o.prepared_at, r.outcome, r.reason FROM prison_outgoing o JOIN prison_links l ON l.id = o.link_id LEFT JOIN prison_incoming r ON r.order_package_id = o.id WHERE (? = '' OR o.order_id = ?) ORDER BY o.prepared_at DESC").bind(order_id).bind(order_id).fetch_all(pool).await?)
}

/// Seals an issued remand or release order to one confirmed facility. Sending
/// again makes a new package, never an overwrite.
pub async fn export_order(pool: &SqlitePool, order_id: &str, link_id: &str) -> Result<(Vec<u8>, String), DomainError> {
    let me = require_identity(pool).await?;
    let order = orders::get(pool, order_id).await?.ok_or_else(|| DomainError::NotFound("No such order.".into()))?;
    if !matches!(order.kind.as_str(), "remand" | "release" | "committal") {
        return bad("Only remand, release and committal orders go to a prison.");
    }
    if order.status != "issued" {
        return bad("Only an issued order can be sent. Issue it first.");
    }
    let Some(content) = order.content.as_ref() else { return bad("This order has no recorded wording.") };
    let (prison, status) = prison_public(pool, link_id).await.map_err(|_| DomainError::NotFound("No such facility.".into()))?;
    if status != "trusted" {
        return bad(if status == "revoked" { "That facility has ended its connection with this registry. Nothing can be sent to it." } else { "That facility has not confirmed this registry yet." });
    }
    let payload = CustodyOrderPayload {
        order_key: order.id.clone(),
        kind: order.kind.clone(),
        court_name: me.public.name.clone(),
        court_number: order.court_number.clone(),
        case_title: order.case_title.clone(),
        reference: order.reference.clone(),
        accused: order.fields.accused.clone().unwrap_or_default(),
        prison: order.fields.prison.clone().unwrap_or_default(),
        remand_until: order.fields.remand_until,
        term_years: order.fields.term_years,
        term_months: order.fields.term_months,
        term_days: order.fields.term_days,
        is_life: order.fields.is_life.unwrap_or(false),
        offence: None,
        reason: order.fields.reason.clone(),
        issued_at: order.issued_at.unwrap_or_default(),
        issued_by: order.issued_by.clone(),
        paragraphs: content.paragraphs.clone(),
        content_sha256: order.content_sha256.clone(),
    };
    let json = serde_json::to_value(&payload).map_err(|_| DomainError::Invalid("Could not build the order.".into()))?;
    let mut tx = pleadli_node_core::db::begin_write(pool).await?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM prison_links WHERE id = ?").bind(link_id).fetch_one(&mut *tx).await?;
    sqlx::query("UPDATE prison_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(link_id).execute(&mut *tx).await?;
    let (bytes, header) = envelope::seal(&me, &prison, KIND_CUSTODY_ORDER, seq as u64, None, &Body::new(json.clone())).map_err(|e| DomainError::Invalid(e.to_string()))?;
    sqlx::query("INSERT INTO prison_outgoing (id, link_id, order_id, seq, payload, prepared_at) VALUES (?, ?, ?, ?, ?, ?)").bind(&header.id).bind(link_id).bind(order_id).bind(seq).bind(serde_json::to_string(&json).unwrap_or_default()).bind(now()).execute(&mut *tx).await?;
    tx.commit().await?;
    let safe: String = order.court_number.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    Ok((bytes, format!("{}-order-{}-{}.pxpkg", order.kind, safe.trim_matches('-').to_lowercase(), seq)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::cases::{self, CaseInput};
    use crate::domain::orders::{CreateOrderInput, OrderFields};
    use pleadli_interchange::identity::Identity;

    /// A remand order goes to a facility and its receipt comes back, with the
    /// facility played by the shared contract. Local data only.
    #[tokio::test]
    async fn an_issued_remand_order_reaches_the_facility_and_the_receipt_returns() {
        let dir = std::env::temp_dir().join(format!("pleadli-courts-custody-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        super::super::exchange::create_identity(&pool, "Custody Test Magistrates Court", Some("Kampala")).await.unwrap();
        sqlx::query("INSERT OR REPLACE INTO bench_profile (id, name, title, court_name) VALUES ('default', 'Magistrate Test', 'Magistrate Grade I', 'Custody Test Magistrates Court')").execute(&pool).await.ok();

        let prison = Identity::generate(IdentityKind::PrisonFacility, "Custody Test Prison", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&prison, "Custody Test Magistrates Court", i64::MAX).unwrap();
        let (link, answer) = accept_invite(&pool, &invite_file, None).await.unwrap();
        let response = pairing::read_response(&answer).unwrap();

        let case = cases::create(&pool, CaseInput { court_number: "CO 99/2026".into(), title: "Uganda v Test".into(), court_level: "magistrate".into(), offence: Some("Theft".into()), registered_on: Some(now()), notes: None }).await.unwrap();
        let fields = OrderFields { accused: Some("Test Accused".into()), prison: Some("Luzira".into()), remand_until: Some(now() + 14 * 86_400_000), ..Default::default() };
        let order = orders::create(&pool, CreateOrderInput { case_id: case.id.clone(), sitting_id: None, kind: "remand".into(), title: None, fields }).await.unwrap();
        assert!(export_order(&pool, &order.id, &link.id).await.is_err(), "a draft is not sent");
        orders::issue(&pool, &order.id).await.unwrap();
        assert!(export_order(&pool, &order.id, &link.id).await.is_err(), "not before the facility confirms");

        let confirmation = pairing::make_confirmation(&prison, &response.station, &invite.invite_id, "trusted", None).unwrap();
        assert_eq!(import_package(&pool, &confirmation).await.unwrap().kind, KIND_CONFIRMATION);

        let (bytes, name) = export_order(&pool, &order.id, &link.id).await.unwrap();
        assert!(name.ends_with(".pxpkg"));
        let opened = envelope::open(&prison, envelope::peek(&bytes).unwrap(), &response.station).unwrap();
        let sent: CustodyOrderPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((sent.kind.as_str(), sent.accused.as_str(), sent.court_number.as_str()), ("remand", "Test Accused", "CO 99/2026"));
        assert!(!sent.paragraphs.is_empty() && sent.content_sha256.is_some(), "the signed wording travels");

        let receipt = CustodyReceiptPayload { order_package_id: opened.header.id.clone(), order_key: order.id.clone(), outcome: "recorded".into(), received_at: 1, decided_at: 2, ..Default::default() };
        let seal = |seq: u64, r: &CustodyReceiptPayload| envelope::seal(&prison, &response.station, KIND_CUSTODY_RECEIPT, seq, Some(&opened.header.id), &Body::new(serde_json::to_value(r).unwrap())).unwrap().0;
        let receipt_bytes = seal(1, &receipt);
        assert_eq!(import_package(&pool, &receipt_bytes).await.unwrap().kind, KIND_CUSTODY_RECEIPT);
        assert!(import_package(&pool, &receipt_bytes).await.is_err(), "replay refused");
        assert!(import_package(&pool, &seal(2, &CustodyReceiptPayload { order_package_id: "never-sent".into(), ..receipt.clone() })).await.is_err(), "a receipt for an order never sent is refused");
        let deliveries = list_deliveries(&pool, &order.id).await.unwrap();
        assert_eq!((deliveries.len(), deliveries[0].outcome.as_deref()), (1, Some("recorded")));
        // A sentence goes as a warrant of committal carrying the term.
        let cf = OrderFields { accused: Some("Test Accused".into()), prison: Some("Luzira".into()), term_years: Some(2), term_months: Some(6), ..Default::default() };
        let warrant = orders::create(&pool, CreateOrderInput { case_id: case.id.clone(), sitting_id: None, kind: "committal".into(), title: None, fields: cf }).await.unwrap();
        orders::issue(&pool, &warrant.id).await.unwrap();
        let (wb, _) = export_order(&pool, &warrant.id, &link.id).await.unwrap();
        let wo = envelope::open(&prison, envelope::peek(&wb).unwrap(), &response.station).unwrap();
        let w: CustodyOrderPayload = serde_json::from_value(wo.body.json).unwrap();
        assert_eq!((w.kind.as_str(), w.term_years, w.term_months, w.is_life), ("committal", Some(2), Some(6), false));
        assert!(w.paragraphs.iter().any(|p| p.contains("2 years, 6 months")), "{:?}", w.paragraphs);
        // The facility reports what happened to the person; the registry keeps it as a claim.
        let report = CustodyReportPayload { order_key: order.id.clone(), court_number: "CO 99/2026".into(), accused: "Test Accused".into(), event: "hospitalised".into(), occurred_at: 9, note: Some("Taken to Mulago".into()), reported_by: Some("Officer in charge".into()) };
        let rb = envelope::seal(&prison, &response.station, KIND_CUSTODY_REPORT, 5, Some(&opened.header.id), &Body::new(serde_json::to_value(&report).unwrap())).unwrap().0;
        assert_eq!(import_package(&pool, &rb).await.unwrap().kind, KIND_CUSTODY_REPORT);
        assert!(import_package(&pool, &rb).await.is_err(), "replay refused");
        let bogus = envelope::seal(&prison, &response.station, KIND_CUSTODY_REPORT, 6, None, &Body::new(serde_json::to_value(&CustodyReportPayload { order_key: "never-sent".into(), ..report.clone() }).unwrap())).unwrap().0;
        assert!(import_package(&pool, &bogus).await.is_err(), "a report about an order never sent is refused");
        let reports = list_reports(&pool, Some(&case.id)).await.unwrap();
        assert_eq!((reports.len(), reports[0].event.as_str()), (1, "hospitalised"));
        pool.close().await;
    }
}
