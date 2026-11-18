//! Court orders arriving as files, the facility's half of the court to prison
//! exchange (docs/interchange/court-prison.md). The facility invites a court
//! registry, a person confirms the registry's fingerprint, and then the orders
//! it sends are read here as claims. An order becomes a record only when a
//! person chooses the prisoner it is about and records it, as an instrument
//! with the court's own wording; the receipt then goes back. A release order is
//! recorded but never executes a release: discharge stays a person's act.

use pleadli_interchange::envelope::{self, Body};
use pleadli_interchange::identity::{hex, unhex32, Identity, IdentityKind, PublicIdentity};
use pleadli_interchange::messages::{CustodyOrderPayload, CustodyReceiptPayload, KIND_CUSTODY_ORDER, KIND_CUSTODY_RECEIPT};
use pleadli_interchange::pairing::{self, KIND_RESPONSE};
use serde::Serialize;
use sqlx::{FromRow, SqliteConnection};

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::error::DomainError;
use super::instruments::{self, RecordInstrumentInput};
use super::time::now_ms;

fn bad<T>(message: impl Into<String>) -> Result<T, DomainError> {
    Err(DomainError::rejected(message))
}
const DAMAGED: &str = "This facility's exchange identity is damaged.";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FacilityIdentity {
    pub facility_id: String,
    pub facility_name: String,
    pub jurisdiction: Option<String>,
    pub fingerprint: String,
}

#[derive(FromRow)]
struct IdentityRow {
    facility_id: String,
    facility_name: String,
    jurisdiction: Option<String>,
    verifying_key: String,
    encryption_key: String,
    signing_secret: String,
    encryption_secret: String,
}

async fn load_identity(conn: &mut SqliteConnection) -> Result<Option<Identity>, DomainError> {
    let row: Option<IdentityRow> = sqlx::query_as("SELECT facility_id, facility_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret FROM court_identity WHERE id = 'default'").fetch_optional(&mut *conn).await?;
    let Some(r) = row else { return Ok(None) };
    let public = PublicIdentity { id: r.facility_id, kind: IdentityKind::PrisonFacility, name: r.facility_name, jurisdiction: r.jurisdiction, verifying_key: r.verifying_key, encryption_key: r.encryption_key };
    let signing = unhex32(&r.signing_secret).ok_or_else(|| DomainError::rejected(DAMAGED))?;
    let encryption = unhex32(&r.encryption_secret).ok_or_else(|| DomainError::rejected(DAMAGED))?;
    Identity::restore(public, signing, encryption).map(Some).ok_or_else(|| DomainError::rejected(DAMAGED))
}

async fn require_identity(conn: &mut SqliteConnection) -> Result<Identity, DomainError> {
    match load_identity(conn).await? {
        Some(i) => Ok(i),
        None => bad("Set up this facility's identity first."),
    }
}

fn view(i: &Identity) -> FacilityIdentity {
    FacilityIdentity { facility_id: i.public.id.clone(), facility_name: i.public.name.clone(), jurisdiction: i.public.jurisdiction.clone(), fingerprint: i.public.fingerprint() }
}

pub async fn get_identity(conn: &mut SqliteConnection) -> Result<Option<FacilityIdentity>, DomainError> {
    Ok(load_identity(conn).await?.as_ref().map(view))
}

/// Once: the name is part of the fingerprint every registry confirms.
pub async fn create_identity(conn: &mut SqliteConnection, actor: &Actor, name: &str, jurisdiction: Option<&str>) -> Result<FacilityIdentity, DomainError> {
    let name = name.trim();
    if name.is_empty() {
        return bad("Name the facility, as the courts that send to it know it.");
    }
    if load_identity(conn).await?.is_some() {
        return bad("This facility already has an exchange identity. It cannot be changed, because every registry has confirmed its fingerprint.");
    }
    let identity = Identity::generate(IdentityKind::PrisonFacility, name, jurisdiction.map(str::trim).filter(|j| !j.is_empty()));
    sqlx::query("INSERT INTO court_identity (id, facility_id, facility_name, jurisdiction, verifying_key, encryption_key, signing_secret, encryption_secret) VALUES ('default', ?, ?, ?, ?, ?, ?, ?)")
        .bind(&identity.public.id)
        .bind(&identity.public.name)
        .bind(&identity.public.jurisdiction)
        .bind(&identity.public.verifying_key)
        .bind(&identity.public.encryption_key)
        .bind(hex(&identity.signing_secret()))
        .bind(hex(&identity.encryption_secret()))
        .execute(&mut *conn)
        .await?;
    let shown = view(&identity);
    audit::record(conn, actor, AuditEntry::new("court_exchange.identity_created", "court_identity", Some(&shown.facility_id)).after(&shown)).await?;
    Ok(shown)
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CourtLink {
    pub id: String,
    pub intended_court: String,
    pub status: String,
    pub court_name: Option<String>,
    pub fingerprint: Option<String>,
    pub invite_expires_at: i64,
    pub responded_at: Option<i64>,
    pub trusted_at: Option<i64>,
}

pub async fn list_links(conn: &mut SqliteConnection) -> Result<Vec<CourtLink>, DomainError> {
    Ok(sqlx::query_as("SELECT id, intended_court, status, court_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM court_links ORDER BY created_at DESC").fetch_all(&mut *conn).await?)
}

async fn get_link(conn: &mut SqliteConnection, id: &str) -> Result<CourtLink, DomainError> {
    sqlx::query_as("SELECT id, intended_court, status, court_name, fingerprint, invite_expires_at, responded_at, trusted_at FROM court_links WHERE id = ?").bind(id).fetch_optional(&mut *conn).await?.ok_or(DomainError::NotFound("No such connection."))
}

/// An invitation file for one court registry, open for `valid_days`.
pub async fn create_invite(conn: &mut SqliteConnection, actor: &Actor, intended_court: &str, valid_days: i64) -> Result<(CourtLink, Vec<u8>), DomainError> {
    let court = intended_court.trim();
    if court.is_empty() {
        return bad("Name the court registry this invitation is for.");
    }
    if !(1..=60).contains(&valid_days) {
        return bad("An invitation stays open for between 1 and 60 days.");
    }
    let me = require_identity(conn).await?;
    let expires = now_ms() + valid_days * 86_400_000;
    let (bytes, invite) = pairing::make_invite(&me, court, expires).map_err(|e| DomainError::rejected(e.to_string()))?;
    sqlx::query("INSERT INTO court_links (id, intended_court, status, invite_nonce, invite_expires_at) VALUES (?, ?, 'invited', ?, ?)").bind(&invite.invite_id).bind(court).bind(&invite.nonce).bind(expires).execute(&mut *conn).await?;
    let link = get_link(conn, &invite.invite_id).await?;
    audit::record(conn, actor, AuditEntry::new("court_exchange.invited", "court_link", Some(&link.id)).after(&link)).await?;
    Ok((link, bytes))
}

async fn court_public(conn: &mut SqliteConnection, link_id: &str) -> Result<PublicIdentity, DomainError> {
    let row: (Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = sqlx::query_as("SELECT court_id, court_name, court_jurisdiction, court_verifying_key, court_encryption_key FROM court_links WHERE id = ?").bind(link_id).fetch_one(&mut *conn).await?;
    match row {
        (Some(id), Some(name), jurisdiction, Some(verifying_key), Some(encryption_key)) => Ok(PublicIdentity { id, kind: IdentityKind::CourtRegistry, name, jurisdiction, verifying_key, encryption_key }),
        _ => bad("That registry has not answered the invitation yet."),
    }
}

fn normal(code: &str) -> String {
    code.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

/// A person confirms the registry by typing the fingerprint it read out.
/// Returns the confirmation file to send back.
pub async fn trust_link(conn: &mut SqliteConnection, actor: &Actor, id: &str, typed_fingerprint: &str) -> Result<(CourtLink, Vec<u8>), DomainError> {
    let link = get_link(conn, id).await?;
    if link.status != "awaiting_confirmation" {
        return bad("Only a registry that has answered can be confirmed.");
    }
    if normal(typed_fingerprint) != normal(link.fingerprint.as_deref().unwrap_or("")) {
        return bad("That is not the code the registry read out. Nothing was confirmed.");
    }
    let me = require_identity(conn).await?;
    let court = court_public(conn, id).await?;
    let bytes = pairing::make_confirmation(&me, &court, id, "trusted", None).map_err(|e| DomainError::rejected(e.to_string()))?;
    sqlx::query("UPDATE court_links SET status = 'trusted', trusted_at = ? WHERE id = ?").bind(now_ms()).bind(id).execute(&mut *conn).await?;
    let trusted = get_link(conn, id).await?;
    audit::record(conn, actor, AuditEntry::new("court_exchange.trusted", "court_link", Some(id)).after(&trusted)).await?;
    Ok((trusted, bytes))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub kind: String,
    pub message: String,
}

/// A package from a court registry: its answer to an invitation, or an order.
pub async fn import_package(conn: &mut SqliteConnection, bytes: &[u8]) -> Result<Imported, DomainError> {
    let me = require_identity(conn).await?;
    let peeked = envelope::peek(bytes).map_err(|e| DomainError::rejected(e.to_string()))?;
    let header = peeked.header.clone();
    if header.created_at > now_ms() + 86_400_000 {
        return bad("This package is dated in the future. Check the clock of the computer that sent it.");
    }
    if header.kind == KIND_RESPONSE {
        let response = pairing::read_response(bytes).map_err(|e| DomainError::rejected(e.to_string()))?;
        let row: Option<(String, i64, String)> = sqlx::query_as("SELECT status, invite_expires_at, invite_nonce FROM court_links WHERE id = ?").bind(&response.invite_id).fetch_optional(&mut *conn).await?;
        let Some((status, expires, nonce)) = row else { return bad("This is an answer to an invitation this facility did not issue.") };
        if status != "invited" {
            return bad("That invitation has already been answered.");
        }
        if expires < now_ms() {
            return bad("That invitation has expired. Issue a new one.");
        }
        if nonce != response.invite_nonce {
            return bad("This answer is not to that invitation.");
        }
        let c = &response.station;
        if c.kind != IdentityKind::CourtRegistry {
            return bad("Only a court registry can answer this invitation.");
        }
        let in_use: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE court_id = ? AND status IN ('awaiting_confirmation', 'trusted')").bind(&c.id).fetch_one(&mut *conn).await?;
        if in_use > 0 {
            return bad("That registry already has a connection to this facility.");
        }
        sqlx::query("UPDATE court_links SET status = 'awaiting_confirmation', court_id = ?, court_name = ?, court_jurisdiction = ?, court_verifying_key = ?, court_encryption_key = ?, fingerprint = ?, responded_at = ? WHERE id = ?")
            .bind(&c.id)
            .bind(&c.name)
            .bind(&c.jurisdiction)
            .bind(&c.verifying_key)
            .bind(&c.encryption_key)
            .bind(c.fingerprint())
            .bind(now_ms())
            .bind(&response.invite_id)
            .execute(&mut *conn)
            .await?;
        return Ok(Imported { kind: KIND_RESPONSE.into(), message: format!("{} has answered. Confirm its fingerprint with the registry before trusting it.", c.name) });
    }
    if header.kind != KIND_CUSTODY_ORDER {
        return bad(format!("This facility does not receive packages of kind '{}'.", header.kind));
    }
    let row: Option<(String, String)> = sqlx::query_as("SELECT id, status FROM court_links WHERE court_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&header.from.id).fetch_optional(&mut *conn).await?;
    let Some((link_id, status)) = row else { return bad("This package is from a registry this facility has not connected to. Nothing was kept.") };
    if status != "trusted" {
        return bad("That registry is not confirmed as trusted. Nothing was kept.");
    }
    let seen: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM custody_orders_in WHERE id = ?").bind(&header.id).fetch_one(&mut *conn).await?;
    if seen > 0 {
        return bad("This package has already been received.");
    }
    let court = court_public(conn, &link_id).await?;
    let opened = envelope::open(&me, peeked, &court).map_err(|e| match e {
        envelope::PackageError::NotForThisRecipient => DomainError::rejected("This package is addressed to a different facility."),
        envelope::PackageError::BadSignature => DomainError::rejected("The signature does not match the registry this facility trusts. Nothing was kept."),
        other => DomainError::rejected(other.to_string()),
    })?;
    let order: CustodyOrderPayload = serde_json::from_value(opened.body.json.clone()).map_err(|_| DomainError::rejected("The order inside the package could not be read."))?;
    if !matches!(order.kind.as_str(), "remand" | "release" | "committal") || order.accused.trim().is_empty() || order.paragraphs.is_empty() || order.order_key.trim().is_empty() {
        return bad("The order is incomplete: it needs a kind, the accused's name, its wording and the court's key.");
    }
    sqlx::query("INSERT INTO custody_orders_in (id, link_id, seq, sent_at, received_at, package_sha256, payload) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&opened.header.id)
        .bind(&link_id)
        .bind(opened.header.seq as i64)
        .bind(opened.header.created_at)
        .bind(now_ms())
        .bind(envelope::sha256_hex(bytes))
        .bind(serde_json::to_string(&opened.body.json).unwrap_or_default())
        .execute(&mut *conn)
        .await?;
    sqlx::query("UPDATE court_links SET last_seq_in = MAX(last_seq_in, ?) WHERE id = ?").bind(opened.header.seq as i64).bind(&link_id).execute(&mut *conn).await?;
    Ok(Imported { kind: KIND_CUSTODY_ORDER.into(), message: format!("An order from {} is waiting for you to read.", court.name) })
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IncomingOrder {
    pub id: String,
    pub court_name: Option<String>,
    pub status: String,
    pub sent_at: i64,
    pub received_at: i64,
    pub decided_at: Option<i64>,
    pub decided_by: Option<String>,
    pub reason: Option<String>,
    pub prisoner_id: Option<String>,
    pub payload: String,
}

pub async fn list_incoming(conn: &mut SqliteConnection) -> Result<Vec<IncomingOrder>, DomainError> {
    Ok(sqlx::query_as("SELECT i.id, l.court_name, i.status, i.sent_at, i.received_at, i.decided_at, i.decided_by, i.reason, i.prisoner_id, i.payload FROM custody_orders_in i JOIN court_links l ON l.id = i.link_id ORDER BY i.received_at DESC").fetch_all(&mut *conn).await?)
}

async fn pending(conn: &mut SqliteConnection, package_id: &str) -> Result<(String, CustodyOrderPayload, i64, String), DomainError> {
    let row: Option<(String, String, String, i64)> = sqlx::query_as("SELECT link_id, payload, status, received_at FROM custody_orders_in WHERE id = ?").bind(package_id).fetch_optional(&mut *conn).await?;
    let Some((link_id, payload, status, received_at)) = row else { return Err(DomainError::NotFound("No such order.")) };
    if status != "received" {
        return bad("That order has already been dealt with.");
    }
    let order = serde_json::from_str(&payload).map_err(|_| DomainError::rejected("The stored order could not be read."))?;
    let court_name: String = sqlx::query_scalar("SELECT COALESCE(court_name, '') FROM court_links WHERE id = ?").bind(&link_id).fetch_one(&mut *conn).await?;
    Ok((link_id, order, received_at, court_name))
}

/// The receipt, sealed to the registry and kept as sent.
async fn seal_receipt(conn: &mut SqliteConnection, link_id: &str, in_reply_to: &str, receipt: &CustodyReceiptPayload) -> Result<Vec<u8>, DomainError> {
    let me = require_identity(conn).await?;
    let court = court_public(conn, link_id).await?;
    let json = serde_json::to_value(receipt).map_err(|_| DomainError::rejected("Could not build the receipt."))?;
    let seq: i64 = sqlx::query_scalar("SELECT next_seq_out FROM court_links WHERE id = ?").bind(link_id).fetch_one(&mut *conn).await?;
    sqlx::query("UPDATE court_links SET next_seq_out = next_seq_out + 1 WHERE id = ?").bind(link_id).execute(&mut *conn).await?;
    let (bytes, header) = envelope::seal(&me, &court, KIND_CUSTODY_RECEIPT, seq as u64, Some(in_reply_to), &Body::new(json.clone())).map_err(|e| DomainError::rejected(e.to_string()))?;
    sqlx::query("INSERT INTO custody_receipts_out (id, link_id, in_reply_to, seq, payload, prepared_at) VALUES (?, ?, ?, ?, ?, ?)").bind(&header.id).bind(link_id).bind(in_reply_to).bind(seq).bind(serde_json::to_string(&json).unwrap_or_default()).bind(now_ms()).execute(&mut *conn).await?;
    Ok(bytes)
}

/// A person records the order against the prisoner it is about, as an
/// instrument carrying the court's wording, and the receipt is sealed.
pub async fn record_order(conn: &mut SqliteConnection, actor: &Actor, package_id: &str, prisoner_id: &str) -> Result<(String, Vec<u8>), DomainError> {
    let (link_id, order, received_at, court_name) = pending(conn, package_id).await?;
    let exists: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prisoners WHERE id = ?").bind(prisoner_id).fetch_one(&mut *conn).await?;
    if exists == 0 {
        return bad("Choose the prisoner this order is about.");
    }
    let kind = match order.kind.as_str() {
        "release" => "release_order",
        "committal" => "committal_warrant",
        _ => "remand_order",
    };
    let term = if order.kind == "committal" {
        let t = if order.is_life { "life".to_string() } else { format!("{} years, {} months, {} days", order.term_years.unwrap_or(0), order.term_months.unwrap_or(0), order.term_days.unwrap_or(0)) };
        format!(" Sentence stated by the court: {t}. Apply it from the sentence screen.")
    } else {
        String::new()
    };
    let note = format!("Received sealed from {court_name}; signature verified. Court case {}, accused named as {}.{term} The court's wording: {}", order.court_number, order.accused, order.paragraphs.join(" "));
    let instrument = instruments::record_instrument(
        conn,
        actor,
        RecordInstrumentInput { prisoner_id: prisoner_id.to_string(), kind: kind.into(), issuing_authority: Some(court_name), reference: order.reference.clone().or(Some(order.court_number.clone())), issued_on: Some(order.issued_at), received_at: received_at, authenticated: true, verification_note: Some(note), resolves_instrument_id: None },
    )
    .await?;
    sqlx::query("UPDATE custody_orders_in SET status = 'recorded', decided_at = ?, decided_by = ?, prisoner_id = ?, instrument_id = ? WHERE id = ?").bind(now_ms()).bind(&actor.name).bind(prisoner_id).bind(&instrument.id).bind(package_id).execute(&mut *conn).await?;
    let receipt = CustodyReceiptPayload { order_package_id: package_id.to_string(), order_key: order.order_key, outcome: "recorded".into(), reason: None, received_at, decided_at: now_ms(), decided_by: Some(actor.name.clone()) };
    Ok((instrument.id, seal_receipt(conn, &link_id, package_id, &receipt).await?))
}

/// The order cannot be recorded (no such prisoner here, unreadable, not ours).
pub async fn return_order(conn: &mut SqliteConnection, actor: &Actor, package_id: &str, reason: &str) -> Result<Vec<u8>, DomainError> {
    let reason = reason.trim();
    if reason.is_empty() {
        return bad("Say why the order is returned, so the court can put it right.");
    }
    let (link_id, order, received_at, _) = pending(conn, package_id).await?;
    sqlx::query("UPDATE custody_orders_in SET status = 'returned', decided_at = ?, decided_by = ?, reason = ? WHERE id = ?").bind(now_ms()).bind(&actor.name).bind(reason).bind(package_id).execute(&mut *conn).await?;
    audit::record(conn, actor, AuditEntry::new("court_exchange.order_returned", "custody_order", Some(package_id)).after(&serde_json::json!({ "reason": reason }))).await?;
    let receipt = CustodyReceiptPayload { order_package_id: package_id.to_string(), order_key: order.order_key, outcome: "returned".into(), reason: Some(reason.to_string()), received_at, decided_at: now_ms(), decided_by: Some(actor.name.clone()) };
    seal_receipt(conn, &link_id, package_id, &receipt).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The facility's half with the court played by the shared contract.
    #[tokio::test]
    async fn an_order_is_recorded_against_a_prisoner_and_the_court_gets_a_receipt() {
        let dir = std::env::temp_dir().join(format!("pleadli-prisons-court-orders-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = match crate::db::startup(&dir, &dir.join("vault"), None).await {
            Ok(s) => s.pool,
            Err(_) => panic!("startup"),
        };
        let mut c = pool.acquire().await.unwrap();
        let actor = Actor::system("court order test");
        create_identity(&mut c, &actor, "Order Test Prison", Some("Kampala")).await.unwrap();
        assert!(create_identity(&mut c, &actor, "Again", None).await.is_err(), "identity is set once");

        let court = Identity::generate(IdentityKind::CourtRegistry, "Order Test Court", Some("Kampala"));
        let (link, invite_file) = create_invite(&mut c, &actor, "Order Test Court", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        let answer = pairing::make_response(&court, &invite, None).unwrap();
        assert!(import_package(&mut c, &answer).await.is_ok());
        assert!(import_package(&mut c, &answer).await.is_err(), "an invitation is answered once");

        let order = CustodyOrderPayload { order_key: "o1".into(), kind: "remand".into(), court_name: "Order Test Court".into(), court_number: "CO 5/2026".into(), case_title: "Uganda v X".into(), accused: "Test Accused".into(), prison: "Order Test Prison".into(), remand_until: Some(now_ms() + 14 * 86_400_000), issued_at: 1, paragraphs: vec!["Test Accused is remanded in custody.".into()], content_sha256: Some("abc".into()), ..Default::default() };
        let seal_order = |seq: u64, o: &CustodyOrderPayload| envelope::seal(&court, &invite.office, KIND_CUSTODY_ORDER, seq, None, &Body::new(serde_json::to_value(o).unwrap())).unwrap().0;
        assert!(import_package(&mut c, &seal_order(1, &order)).await.is_err(), "not trusted yet");

        assert!(trust_link(&mut c, &actor, &link.id, "WRONG-CODE").await.is_err());
        let typed = list_links(&mut c).await.unwrap()[0].fingerprint.clone().unwrap().to_lowercase();
        let (trusted, confirmation) = trust_link(&mut c, &actor, &link.id, &typed).await.unwrap();
        assert_eq!(trusted.status, "trusted");
        assert_eq!(pairing::read_confirmation(&court, &invite.office, &confirmation).unwrap().1.outcome, "trusted");

        let sealed = seal_order(1, &order);
        assert_eq!(import_package(&mut c, &sealed).await.unwrap().kind, KIND_CUSTODY_ORDER);
        assert!(import_package(&mut c, &sealed).await.is_err(), "replay refused");
        assert!(import_package(&mut c, &seal_order(2, &CustodyOrderPayload { paragraphs: vec![], ..order.clone() })).await.is_err(), "an order with no wording is refused");
        let stranger = Identity::generate(IdentityKind::CourtRegistry, "Stranger", None);
        assert!(import_package(&mut c, &envelope::seal(&stranger, &invite.office, KIND_CUSTODY_ORDER, 1, None, &Body::new(serde_json::to_value(&order).unwrap())).unwrap().0).await.is_err());

        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, admission_instrument_type, admitted_at, status, current_status) VALUES ('p1', 'Test', 'Accused', 'warrant', 1, 'unconvicted', 'in_custody')").execute(&mut *c).await.unwrap();
        let package_id = list_incoming(&mut c).await.unwrap()[0].id.clone();
        assert!(record_order(&mut c, &actor, &package_id, "nobody").await.is_err(), "the prisoner must exist here");
        let (instrument_id, receipt_bytes) = record_order(&mut c, &actor, &package_id, "p1").await.unwrap();
        let recorded = instruments::list_for_prisoner(&pool, "p1").await.unwrap();
        assert!(recorded.iter().any(|i| i.id == instrument_id && i.kind == "remand_order" && i.authenticated));
        assert!(record_order(&mut c, &actor, &package_id, "p1").await.is_err(), "decided once");

        let opened = envelope::open(&court, envelope::peek(&receipt_bytes).unwrap(), &invite.office).unwrap();
        let receipt: CustodyReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!((receipt.outcome.as_str(), receipt.order_key.as_str()), ("recorded", "o1"));
        drop(c);
        pool.close().await;
    }
}
