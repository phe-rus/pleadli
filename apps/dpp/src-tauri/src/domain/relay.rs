//! The postbox for the DPP office: the same sealed packages the file route
//! carries, sent and collected through pleadli.com (docs/platform/RELAY-DESIGN.md).
//!
//! Nothing here seals or opens a package. `interchange` does that, and refuses
//! what is not signed by a station this office confirmed. This module only
//! moves bytes, and adds two checks that only the relay can make: the address
//! the relay says a package came from must be the one that station answered
//! from, and a package it cannot read is kept with the reason, never dropped.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use pleadli_interchange::envelope;
use pleadli_interchange::identity::IdentityKind;
use pleadli_interchange::messages::{KIND_FILING_RECEIPT, KIND_REFERRAL};
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION, KIND_INVITE, KIND_RESPONSE};
use pleadli_node_core::hub::{self, Dispatched, Links, Reject};
use pleadli_node_core::orchestra::{Orchestra, RelayAccess};
use pleadli_node_core::postbox::{Arrived, Postbox, PostboxError};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::error::DomainError;
use super::interchange;

/// Poll every ten minutes, and straight after something is posted or a person presses Check now.
const EVERY: std::time::Duration = std::time::Duration::from_secs(600);

/// The court registries this office exchanges filings with: where each answers on the relay.
pub const COURTS: Links = Links { table: "court_links", peer_col: "court_id", peer: IdentityKind::CourtRegistry };

pub struct Relay {
    pool: SqlitePool,
    vault_root: PathBuf,
    orchestra: Arc<Orchestra>,
    postbox: Postbox,
    last: Mutex<Round>,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Round {
    pub at: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SentView {
    pub id: String,
    pub to: String,
    pub kind: String,
    /// queued, sent, delivered, attention, expired: the DPP's own receipts do not go further.
    pub stage: String,
    pub error: Option<String>,
    pub attempts: i64,
    pub queued_at: i64,
    pub posted_at: Option<i64>,
    pub acked_at: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceivedView {
    pub id: String,
    pub from: String,
    pub kind: String,
    pub size: i64,
    /// new, imported or refused.
    pub status: String,
    pub reason: Option<String>,
    pub arrived_at: i64,
    pub handled_at: Option<i64>,
    /// What a person may decide on, when an invitation waits for them.
    pub invitation: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub ready: bool,
    pub why_not: Option<String>,
    pub address: Option<String>,
    /// The office and institution that address belongs to, as the relay knows them.
    pub name: Option<String>,
    pub site: String,
    pub last: Round,
    pub sent: Vec<SentView>,
    pub received: Vec<ReceivedView>,
}

fn stage(status: &str) -> &'static str {
    match status {
        "queued" => "queued",
        "posted" => "sent",
        "delivered" | "acked" => "delivered",
        "expired" => "expired",
        _ => "attention",
    }
}

fn human(e: &PostboxError) -> String {
    match e {
        PostboxError::Api { error, message, .. } if error == "not_connected" => format!("Not connected yet: {message}"),
        other => other.to_string(),
    }
}

impl Relay {
    pub fn new(pool: SqlitePool, vault_root: PathBuf, orchestra: Arc<Orchestra>) -> Arc<Relay> {
        let postbox = Postbox::new(pool.clone(), &pleadli_node_core::site::base());
        Arc::new(Relay { pool, vault_root, orchestra, postbox, last: Mutex::new(Round::default()) })
    }

    /// For the life of the application: a round every ten minutes.
    pub async fn run(self: Arc<Self>) {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            let _ = self.sync().await;
            tokio::time::sleep(EVERY).await;
        }
    }

    pub async fn status(&self) -> Status {
        let access = self.orchestra.relay_access().await;
        let why_not = if access.is_none() { Some("This computer needs a Pleadli licence for an office before it can use the postbox.".to_string()) } else { None };
        let sent = self.postbox.sent().await.unwrap_or_default().into_iter().map(|s| SentView { stage: stage(&s.status).to_string(), id: s.id, to: s.to, kind: s.kind, error: s.error, attempts: s.attempts, queued_at: s.queued_at, posted_at: s.posted_at, acked_at: s.acked_at }).collect();
        let waiting: std::collections::HashMap<String, Arrived> = self.postbox.unread().await.unwrap_or_default().into_iter().map(|a| (a.id.clone(), a)).collect();
        let received = self
            .postbox
            .received()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| {
                let invitation = waiting.get(&r.id).filter(|a| a.kind == KIND_INVITE).and_then(describe_court_invite);
                ReceivedView { id: r.id, from: r.from, kind: r.kind, size: r.size, status: r.status, reason: r.note, arrived_at: r.arrived_at, handled_at: r.handled_at, invitation }
            })
            .collect();
        Status { ready: access.is_some(), why_not, address: access.as_ref().map(|a| a.address.clone()), name: access.as_ref().and_then(|a| a.name.clone()).filter(|n| !n.is_empty()), site: pleadli_node_core::site::base(), last: self.last.lock().unwrap().clone(), sent, received }
    }

    /// One round: send what is waiting, collect what has come, open it, send
    /// what opening it produced (the "received" receipt), update progress.
    pub async fn sync(&self) -> Result<(), String> {
        let result = self.round().await;
        *self.last.lock().unwrap() = Round { at: Some(chrono::Utc::now().timestamp_millis()), error: result.as_ref().err().cloned() };
        result
    }

    async fn round(&self) -> Result<(), String> {
        let Some(RelayAccess { token, .. }) = self.orchestra.relay_access().await else { return Err("licence_needed".to_string()) };
        self.queue_outgoing().await.map_err(|e| e.to_string())?;
        let first = self.postbox.retry_now(None).await.map_err(|e| e.to_string()).err();
        let tick = self.postbox.tick(&token).await;
        self.process_inbox().await;
        self.queue_outgoing().await.map_err(|e| e.to_string())?;
        let second = self.postbox.flush(&token).await;
        self.end_revoked_links(&token).await;
        match (first, tick, second) {
            (Some(e), _, _) => Err(e),
            (_, Err(e), _) => Err(human(&e)),
            (_, _, Err(e)) => Err(human(&e)),
            _ => Ok(()),
        }
    }

    /// A station this office revoked is also cut off at the relay, so the relay itself refuses its posts. The relay
    /// drops the mail still waiting between two offices when a link ends, so this waits until the station has
    /// collected the signed revocation notice, or a week has passed, whichever is first. Until then the station's
    /// referrals reach this office and are refused here, and each refusal says again that the connection ended.
    async fn end_revoked_links(&self, token: &str) {
        const WAIT: i64 = 7 * 24 * 60 * 60 * 1000;
        let rows: Vec<(String, String, Option<String>, Option<i64>)> = sqlx::query_as("SELECT id, station_address, revoked_reason, revoked_at FROM police_connections WHERE status = 'revoked' AND station_address IS NOT NULL AND relay_ended_at IS NULL")
            .fetch_all(&self.pool)
            .await
            .unwrap_or_default();
        if rows.is_empty() {
            return;
        }
        let sent = self.postbox.sent().await.unwrap_or_default();
        let now = chrono::Utc::now().timestamp_millis();
        for (id, address, reason, revoked_at) in rows {
            let revoked_at = revoked_at.unwrap_or(0);
            let told = sent.iter().any(|s| s.to == address && s.kind == KIND_CONFIRMATION && s.queued_at >= revoked_at && matches!(s.status.as_str(), "delivered" | "acked"));
            if !told && now - revoked_at < WAIT {
                continue;
            }
            let why = reason.filter(|r| !r.trim().is_empty()).unwrap_or_else(|| "This office ended the connection.".to_string());
            match self.postbox.end_connection(token, &address, &why).await {
                // Ended, or there was no live link left to end: either way the relay will refuse this station.
                Ok(_) | Err(PostboxError::Api { status: 404, .. }) => {
                    let _ = sqlx::query("UPDATE police_connections SET relay_ended_at = ? WHERE id = ?").bind(now).bind(&id).execute(&self.pool).await;
                }
                Err(e) => log::warn!("postbox: could not end the relay link with {address}: {}", human(&e)),
            }
        }
    }

    /// Anything this office prepared for a station that answers on the relay is
    /// sealed now and handed to the outbox. A package prepared for a station
    /// with no relay address stays for the file route.
    async fn queue_outgoing(&self) -> Result<(), DomainError> {
        let rows: Vec<(String, String, String)> = sqlx::query_as(
            "SELECT o.id, o.kind, c.station_address FROM outgoing_packages o JOIN police_connections c ON c.id = o.connection_id
              WHERE o.exported_at IS NULL AND c.station_address IS NOT NULL ORDER BY o.prepared_at, o.rowid",
        )
        .fetch_all(&self.pool)
        .await?;
        for (id, kind, to) in rows {
            let (bytes, _) = match interchange::export_outgoing(&self.pool, &id).await {
                Ok(done) => done,
                Err(e) => {
                    // A station no longer trusted gets nothing more: leave it for a person.
                    log::info!("postbox: {kind} {id} not sent: {e}");
                    continue;
                }
            };
            let package_id = envelope::peek(&bytes).map(|p| p.header.id.clone()).map_err(|e| DomainError::Invalid(e.to_string()))?;
            if bytes.len() > 24 * 1024 * 1024 {
                sqlx::query("UPDATE outgoing_packages SET exported_at = NULL WHERE id = ?").bind(&id).execute(&self.pool).await?;
                return Err(DomainError::Invalid("A package is too large for the postbox (over 24 MB).".to_string()));
            }
            sqlx::query("UPDATE outgoing_packages SET relay_package_id = ? WHERE id = ?").bind(&package_id).bind(&id).execute(&self.pool).await?;
            if let Err(e) = self.postbox.queue(&package_id, &to, &kind, &bytes).await {
                // Not queued: put it back so the next round seals and queues it again.
                sqlx::query("UPDATE outgoing_packages SET exported_at = NULL WHERE id = ?").bind(&id).execute(&self.pool).await?;
                return Err(DomainError::Invalid(e.to_string()));
            }
        }
        Ok(())
    }

    async fn process_inbox(&self) {
        let waiting = match self.postbox.unread().await {
            Ok(w) => w,
            Err(e) => return log::warn!("postbox: inbox unreadable: {e}"),
        };
        for item in waiting {
            // An invitation from a court registry is a person's decision, made in the window; it waits.
            // Any other invitation is turned away below, with a reason.
            if item.kind == KIND_INVITE && describe_court_invite(&item).is_some() {
                continue;
            }
            match self.open(&item).await {
                Ok(()) => {
                    let _ = self.postbox.handled(&item.id).await;
                }
                // The database failed: not the package's fault, so it stays to be tried again.
                Err(DomainError::Db(e)) => log::warn!("postbox: {} not opened yet: {e}", item.id),
                // The same package arriving again is not a failure: it is already kept, and no second case is made.
                Err(DomainError::Invalid(m)) if m.contains("already been received") => {
                    let _ = audit::log(&self.pool, Entry::new("postbox_duplicate").detail(format!("{} from {}", item.kind, item.from))).await;
                    let _ = self.postbox.handled(&item.id).await;
                }
                Err(e) => {
                    let _ = audit::log(&self.pool, Entry::new("postbox_refused").detail(format!("{} from {}: {e}", item.kind, item.from))).await;
                    let _ = self.postbox.refused(&item.id, &e.to_string()).await;
                }
            }
        }
    }

    async fn open(&self, item: &Arrived) -> Result<(), DomainError> {
        // A package from a court registry has its own links, its own permission, and its own import.
        if envelope::peek(&item.bytes).is_ok_and(|p| p.header.from.kind == IdentityKind::CourtRegistry) {
            return self.open_court(item).await;
        }
        match item.kind.as_str() {
            KIND_RESPONSE => {
                // The answer must come from the address the invitation went to.
                let response = pairing::read_response(&item.bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
                let sent_to: Option<Option<String>> = sqlx::query_scalar("SELECT station_address FROM police_connections WHERE id = ?").bind(&response.invite_id).fetch_optional(&self.pool).await?;
                match sent_to {
                    Some(Some(address)) if address != item.from => {
                        return Err(DomainError::Forbidden(format!("This answer came from {}, but the invitation was sent to {address}. Nothing was kept.", item.from)));
                    }
                    _ => {}
                }
                let done = interchange::import_package(&self.pool, &self.vault_root, &item.bytes).await?;
                sqlx::query("UPDATE police_connections SET station_address = COALESCE(station_address, ?) WHERE id = ?").bind(&item.from).bind(&done.connection_id).execute(&self.pool).await?;
                Ok(())
            }
            KIND_REFERRAL => {
                let peeked = envelope::peek(&item.bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
                let bound: Option<Option<String>> = sqlx::query_scalar("SELECT station_address FROM police_connections WHERE station_id = ? AND status = 'trusted'").bind(&peeked.header.from.id).fetch_optional(&self.pool).await?;
                if let Some(Some(address)) = bound {
                    if address != item.from {
                        return Err(DomainError::Forbidden(format!("This referral came from {}, but that station answered from {address}. Nothing was kept.", item.from)));
                    }
                }
                let done = interchange::import_package(&self.pool, &self.vault_root, &item.bytes).await?;
                if let Some(package_id) = &done.package_id {
                    interchange::acknowledge_opened(&self.pool, package_id).await?;
                }
                Ok(())
            }
            other => Err(DomainError::Invalid(format!("This office does not receive packages of kind '{other}' through the postbox."))),
        }
    }

    /// Offers an invitation to a station through the postbox. The station's
    /// administrator answers it in their own app.
    pub async fn send_invite(&self, connection_id: &str, station_address: &str) -> Result<(), DomainError> {
        let access = self.orchestra.relay_access().await.ok_or_else(|| DomainError::Invalid("This computer needs a Pleadli licence for an office before it can use the postbox.".to_string()))?;
        let address = station_address.trim().to_lowercase();
        if address.is_empty() || address == access.address {
            return Err(DomainError::Invalid("Give the station's postbox address, for example ug.police.hoima.central.".to_string()));
        }
        let bytes = interchange::invite_file(&self.pool, connection_id).await?;
        // The relay's introduction rule: an office must be connected before it can post to it.
        match self.postbox.request_connection(&access.token, &address).await {
            Ok(_) => {}
            Err(PostboxError::Api { status: 404, .. }) => return Err(DomainError::NotFound("No office has that postbox address.".to_string())),
            Err(e) => return Err(DomainError::Invalid(human(&e))),
        }
        let package_id = envelope::peek(&bytes).map(|p| p.header.id.clone()).map_err(|e| DomainError::Invalid(e.to_string()))?;
        sqlx::query("UPDATE police_connections SET station_address = ? WHERE id = ?").bind(&address).bind(connection_id).execute(&self.pool).await?;
        self.postbox.queue(&package_id, &address, KIND_INVITE, &bytes).await.map_err(|e| DomainError::Invalid(e.to_string()))?;
        audit::log(&self.pool, Entry::new("postbox_invite_queued").subject("connection", connection_id).detail(address)).await.ok();
        Ok(())
    }

    pub async fn retry(&self, id: Option<&str>) -> Result<u64, DomainError> {
        self.postbox.retry_now(id).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }

    pub async fn reopen(&self, id: &str) -> Result<bool, DomainError> {
        self.postbox.reopen(id).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }

    pub async fn connections(&self) -> Result<Value, DomainError> {
        let access = self.orchestra.relay_access().await.ok_or_else(|| DomainError::Invalid("This computer needs a Pleadli licence for an office before it can use the postbox.".to_string()))?;
        self.postbox.connections(&access.token).await.map_err(|e| DomainError::Invalid(human(&e)))
    }
}


/// What a person is shown about an invitation from a court registry, or None if it is anything else.
pub fn describe_court_invite(item: &Arrived) -> Option<Value> {
    let invite = pairing::read_invite(&item.bytes).ok()?;
    if invite.office.kind != IdentityKind::CourtRegistry {
        return None;
    }
    pleadli_interchange::authorization::check(invite.office.kind, IdentityKind::DppOffice, KIND_INVITE).ok()?;
    Some(serde_json::json!({
        "fingerprint": invite.office.fingerprint(),
        "name": invite.office.name,
        "kind": pleadli_interchange::authorization::label(invite.office.kind),
        "intendedFor": invite.intended_station,
        "expiresAt": invite.expires_at,
    }))
}

/// The court registries: what they may send this office, checked on this computer.
impl Relay {
    /// A package that came from a court registry: its sender kind may send that kind of package here
    /// (`authorization`), it came from the address that registry answered from, and only then is it handed to
    /// the same import the file route uses, which checks the signature, the trusted link, and the content.
    async fn open_court(&self, item: &Arrived) -> Result<(), DomainError> {
        open_court_package(&self.pool, item).await
    }

    /// The administrator answers a court registry's invitation that arrived: the answer is sealed by the exchange,
    /// bound to the address the invitation came from, and posted.
    pub async fn answer_court_invitation(&self, inbox_id: &str, contact: Option<&str>) -> Result<(), DomainError> {
        let item = self.postbox.unread().await.map_err(|e| DomainError::Invalid(e.to_string()))?.into_iter().find(|a| a.id == inbox_id && a.kind == KIND_INVITE && describe_court_invite(a).is_some()).ok_or_else(|| DomainError::NotFound("No such invitation is waiting.".into()))?;
        let (link, response) = super::court_exchange::accept_invite(&self.pool, &item.bytes, contact).await?;
        hub::bind(&self.pool, COURTS, &link.id, &item.from).await?;
        let package_id = envelope::peek(&response).map(|p| p.header.id.clone()).map_err(|e| DomainError::Invalid(e.to_string()))?;
        self.postbox.queue(&package_id, &item.from, KIND_RESPONSE, &response).await.map_err(|e| DomainError::Invalid(e.to_string()))?;
        self.postbox.handled(&item.id).await.map_err(|e| DomainError::Invalid(e.to_string()))?;
        audit::log(&self.pool, Entry::new("postbox_court_invitation_answered").subject("court_link", &link.id)).await.ok();
        Ok(())
    }

    pub async fn decline_court_invitation(&self, inbox_id: &str, reason: &str) -> Result<(), DomainError> {
        let reason = if reason.trim().is_empty() { "Declined by this office." } else { reason.trim() };
        self.postbox.refused(inbox_id, reason).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }

    /// Hands a filing or a withdrawal the exchange has just sealed to the postbox, if the registry it is for answers on the
    /// relay. The registry's answer to an invitation is not sent this way, only after it is trusted.
    pub async fn dispatch_court(&self, bytes: &[u8]) -> serde_json::Value {
        if self.orchestra.relay_access().await.is_none() {
            return serde_json::json!({ "route": "fileOnly" });
        }
        match hub::dispatch_to(IdentityKind::DppOffice, &self.pool, &self.postbox, bytes, &[COURTS]).await {
            Ok(Dispatched::Queued { package_id, to }) => serde_json::json!({ "route": "queued", "packageId": package_id, "to": to }),
            Ok(Dispatched::FileOnly) => serde_json::json!({ "route": "fileOnly" }),
            Err(e) => serde_json::json!({ "route": "refused", "reason": e }),
        }
    }
}

/// The work of `open_court`, apart from the licence, so it is tested without one.
pub async fn open_court_package(pool: &SqlitePool, item: &Arrived) -> Result<(), DomainError> {
    match hub::admit(IdentityKind::DppOffice, pool, &[COURTS], item).await {
        Ok(_) => {}
        Err(Reject::Refuse(m)) => return Err(DomainError::Forbidden(m)),
        Err(Reject::Duplicate) => return Err(DomainError::Invalid("This package has already been received.".to_string())),
        Err(Reject::Retry(m)) => return Err(DomainError::Db(sqlx::Error::Protocol(m))),
    }
    match item.kind.as_str() {
        KIND_CONFIRMATION | KIND_FILING_RECEIPT => super::court_exchange::import_package(pool, &item.bytes).await.map(|_| ()),
        other => Err(DomainError::Invalid(format!("This office does not receive packages of kind '{other}' from a court registry through the postbox."))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_interchange::envelope::Body;
    use pleadli_interchange::identity::Identity;
    use pleadli_interchange::messages::*;
    use pleadli_node_core::postbox::Postbox;

    fn arrived(kind: &str, from: &str, bytes: Vec<u8>) -> Arrived {
        Arrived { id: uuid::Uuid::new_v4().to_string(), from: from.to_string(), kind: kind.to_string(), sha256: String::new(), bytes, arrived_at: 1 }
    }

    /// The court path of the DPP's postbox: the registry's confirmation and receipts are taken in only from the
    /// address the registry invited from, a registry cannot send what its kind has no path for even with a valid
    /// signature, and a filing is queued for the registry's address only once the registry is trusted.
    #[tokio::test]
    async fn the_court_path_checks_address_and_permission_and_queues_filings_only_for_a_trusted_registry() {
        let dir = std::env::temp_dir().join(format!("pleadli-dpp-courtpostbox-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir, None).await.ok().unwrap().pool;
        interchange::create_identity(&pool, "Court Postbox Test DPP", Some("Kampala".to_string())).await.unwrap();
        let me_identity = interchange::require_identity(&pool).await.unwrap();
        let me = me_identity.public.clone();
        let postbox = Postbox::new(pool.clone(), "http://127.0.0.1:1");

        let court = Identity::generate(IdentityKind::CourtRegistry, "Court Postbox Test Registry", Some("Kampala"));
        let (invite_file, invite) = pairing::make_invite(&court, "Court Postbox Test DPP", i64::MAX).unwrap();
        let (link, answer) = super::super::court_exchange::accept_invite(&pool, &invite_file, None).await.unwrap();
        hub::bind(&pool, COURTS, &link.id, "ug.court.real").await.unwrap();
        let response = pairing::read_response(&answer).unwrap();

        // Not trusted yet: nothing is queued, the file is the only carrier.
        let filing_for_court = || envelope::seal(&me_identity, &court.public, KIND_FILING, 1, None, &Body::new(serde_json::to_value(FilingPayload::default()).unwrap())).unwrap().0;
        assert_eq!(hub::dispatch_to(IdentityKind::DppOffice, &pool, &postbox, &filing_for_court(), &[COURTS]).await.unwrap(), Dispatched::FileOnly);

        let confirmation = pairing::make_confirmation(&court, &response.station, &invite.invite_id, "trusted", None).unwrap();
        let from_elsewhere = open_court_package(&pool, &arrived(KIND_CONFIRMATION, "ug.court.impostor", confirmation.clone())).await.unwrap_err();
        assert!(matches!(from_elsewhere, DomainError::Forbidden(ref m) if m.contains("answered from ug.court.real")), "{from_elsewhere}");
        let status = || sqlx::query_scalar::<_, String>("SELECT status FROM court_links WHERE id = ?").bind(link.id.clone()).fetch_one(&pool);
        assert_eq!(status().await.unwrap(), "answered", "a confirmation from the wrong address changed nothing");
        open_court_package(&pool, &arrived(KIND_CONFIRMATION, "ug.court.real", confirmation)).await.unwrap();
        assert_eq!(status().await.unwrap(), "trusted");

        // A trusted registry: the filing is queued for its relay address, and sending it again adds nothing.
        let sent = filing_for_court();
        match hub::dispatch_to(IdentityKind::DppOffice, &pool, &postbox, &sent, &[COURTS]).await.unwrap() {
            Dispatched::Queued { to, .. } => assert_eq!(to, "ug.court.real"),
            other => panic!("{other:?}"),
        }
        hub::dispatch_to(IdentityKind::DppOffice, &pool, &postbox, &sent, &[COURTS]).await.unwrap();
        let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM postbox_outbox WHERE kind = 'case_filing'").fetch_one(&pool).await.unwrap();
        assert_eq!(queued, 1);

        // This office never sends what it has no path to send to a registry: a referral is not for a court.
        let referral = envelope::seal(&me_identity, &court.public, KIND_REFERRAL, 2, None, &Body::new(serde_json::json!({}))).unwrap().0;
        let err = hub::dispatch_to(IdentityKind::DppOffice, &pool, &postbox, &referral, &[COURTS]).await.unwrap_err();
        assert!(err.contains("DPP office is not allowed"), "{err}");

        // The trusted registry, validly signed, sends what a registry has no path to send a DPP office.
        let order = envelope::seal(&court, &me, KIND_CUSTODY_ORDER, 7, None, &Body::new(serde_json::json!({}))).unwrap().0;
        let refused = open_court_package(&pool, &arrived(KIND_CUSTODY_ORDER, "ug.court.real", order.clone())).await.unwrap_err();
        assert!(matches!(refused, DomainError::Forbidden(ref m) if m.contains("court registry is not allowed")), "{refused}");
        // ... and by calling the import directly, as a modified client of the file route would.
        assert!(super::super::court_exchange::import_package(&pool, &order).await.is_err());

        // A receipt from the registry for a filing this office never sent is refused, not applied.
        let stray = FilingReceiptPayload { filing_package_id: "never-sent".into(), dpp_file_key: "f".into(), outcome: "accepted".into(), court_number: Some("X".into()), ..Default::default() };
        let receipt = envelope::seal(&court, &me, KIND_FILING_RECEIPT, 8, None, &Body::new(serde_json::to_value(stray).unwrap())).unwrap().0;
        assert!(open_court_package(&pool, &arrived(KIND_FILING_RECEIPT, "ug.court.real", receipt)).await.is_err());
        pool.close().await;
    }
}
