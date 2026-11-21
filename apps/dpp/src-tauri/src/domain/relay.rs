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
use pleadli_interchange::messages::KIND_REFERRAL;
use pleadli_interchange::pairing::{self, KIND_INVITE, KIND_RESPONSE};
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
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub ready: bool,
    pub why_not: Option<String>,
    pub address: Option<String>,
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
        let received = self
            .postbox
            .received()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| ReceivedView { id: r.id, from: r.from, kind: r.kind, size: r.size, status: r.status, reason: r.note, arrived_at: r.arrived_at, handled_at: r.handled_at })
            .collect();
        Status { ready: access.is_some(), why_not, address: access.as_ref().map(|a| a.address.clone()), site: pleadli_node_core::site::base(), last: self.last.lock().unwrap().clone(), sent, received }
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
        match (first, tick, second) {
            (Some(e), _, _) => Err(e),
            (_, Err(e), _) => Err(human(&e)),
            (_, _, Err(e)) => Err(human(&e)),
            _ => Ok(()),
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

