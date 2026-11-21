//! The postbox for a station: referrals go to a DPP office, and its receipts and
//! decisions come back, through pleadli.com (docs/platform/RELAY-DESIGN.md).
//!
//! Nothing here seals or opens a package: `exchange` does, and it refuses what
//! is not signed by the office this station confirmed. This module moves bytes,
//! keeps every failure visible and recoverable, and adds the checks only the
//! relay can make (the address a package came from must be the one the office
//! answered from).
//!
//! The progress line of a referral is four different facts, never conflated:
//! Sent (pleadli.com holds it), Delivered (the office's computer has collected
//! it), Opened (the office's app verified and read it and said so in a signed
//! receipt), Accepted (a person at the office decided, in a signed receipt).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use pleadli_interchange::envelope;
use pleadli_interchange::pairing::{self, KIND_CONFIRMATION, KIND_INVITE, KIND_RESPONSE};
use pleadli_interchange::messages::{KIND_DECISION_NOTICE, KIND_RECEIPT, KIND_REFERRAL};
use pleadli_node_core::audit::{self as chain, Entry};
use pleadli_node_core::orchestra::{Orchestra, RelayAccess};
use pleadli_node_core::postbox::{Arrived, Postbox, PostboxError};
use serde::Serialize;
use sqlx::SqlitePool;

use super::error::DomainError;
use super::exchange;

const EVERY: std::time::Duration = std::time::Duration::from_secs(600);
/// A little under the relay's 25 MB, for the envelope.
const MAX_PACKAGE: usize = 24 * 1024 * 1024;

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
    pub office: Option<String>,
    pub kind: String,
    pub police_reference: Option<String>,
    /// queued, sent, delivered, opened, accepted, rejected, attention or expired.
    pub stage: String,
    /// What the office wrote, when it rejected: its reason.
    pub reason: Option<String>,
    pub dpp_reference: Option<String>,
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
    /// For an invitation still waiting for an administrator: who it is from.
    pub invitation: Option<Invitation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Invitation {
    pub office_name: String,
    pub fingerprint: String,
    pub intended_station: String,
    pub expires_at: i64,
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

fn human(e: &PostboxError) -> String {
    match e {
        PostboxError::Api { error, message, .. } if error == "not_connected" => format!("Not connected yet: {message}"),
        other => other.to_string(),
    }
}

const NO_LICENCE: &str = "This computer needs a Pleadli licence for a station before it can use the postbox.";

async fn note(pool: &SqlitePool, action: &str, subject: Option<(&str, &str)>) {
    let mut entry = Entry::new(action);
    if let Some((kind, id)) = subject {
        entry.subject_type = Some(kind);
        entry.subject_id = Some(id);
    }
    let _ = chain::log(pool, Some("postbox"), entry).await;
}

impl Relay {
    pub fn new(pool: SqlitePool, vault_root: PathBuf, orchestra: Arc<Orchestra>) -> Arc<Relay> {
        let postbox = Postbox::new(pool.clone(), &pleadli_node_core::site::base());
        Arc::new(Relay { pool, vault_root, orchestra, postbox, last: Mutex::new(Round::default()) })
    }

    pub async fn run(self: Arc<Self>) {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        loop {
            let _ = self.sync().await;
            tokio::time::sleep(EVERY).await;
        }
    }

    pub async fn status(&self) -> Status {
        let access = self.orchestra.relay_access().await;
        let why_not = access.is_none().then(|| NO_LICENCE.to_string());

        // What each referral is, and what the office has said about it so far.
        let referrals: HashMap<String, (String, Option<String>)> = sqlx::query_as::<_, (String, String, Option<String>)>(
            "SELECT o.id, c.office_name, json_extract(o.payload, '$.policeReference') FROM exchange_outgoing o JOIN dpp_connections c ON c.id = o.connection_id WHERE o.kind = 'referral'",
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, office, reference)| (id, (office, reference)))
        .collect();
        let mut answers: HashMap<String, (String, Option<String>, Option<String>)> = HashMap::new();
        let receipts: Vec<(String, Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
            "SELECT in_reply_to, json_extract(payload, '$.outcome'), json_extract(payload, '$.reason'), json_extract(payload, '$.dppReference') FROM exchange_incoming WHERE kind = 'receipt' AND in_reply_to IS NOT NULL ORDER BY received_at",
        )
        .fetch_all(&self.pool)
        .await
        .unwrap_or_default();
        for (reply_to, outcome, reason, dpp_reference) in receipts {
            let Some(outcome) = outcome else { continue };
            // A decision is stronger than "opened", and never goes back.
            let decided = matches!(answers.get(&reply_to), Some((o, _, _)) if o == "accepted" || o == "rejected");
            if !decided {
                answers.insert(reply_to, (outcome, reason, dpp_reference));
            }
        }

        let sent = self
            .postbox
            .sent()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|s| {
                let answer = answers.get(&s.id);
                let transport = match s.status.as_str() {
                    "queued" => "queued",
                    "posted" => "sent",
                    "delivered" | "acked" => "delivered",
                    "expired" => "expired",
                    _ => "attention",
                };
                let stage = match answer.map(|a| a.0.as_str()) {
                    Some("accepted") => "accepted",
                    Some("rejected") => "rejected",
                    // The office's own signed word that it read the referral beats the relay's guess.
                    Some("received") => "opened",
                    _ => transport,
                };
                let (office, police_reference) = referrals.get(&s.id).cloned().unwrap_or((String::new(), None));
                SentView {
                    stage: stage.to_string(),
                    reason: answer.and_then(|a| a.1.clone()),
                    dpp_reference: answer.and_then(|a| a.2.clone()),
                    office: (!office.is_empty()).then_some(office),
                    police_reference,
                    id: s.id,
                    to: s.to,
                    kind: s.kind,
                    error: s.error,
                    attempts: s.attempts,
                    queued_at: s.queued_at,
                    posted_at: s.posted_at,
                    acked_at: s.acked_at,
                }
            })
            .collect();

        let waiting: HashMap<String, Arrived> = self.postbox.unread().await.unwrap_or_default().into_iter().map(|a| (a.id.clone(), a)).collect();
        let received = self
            .postbox
            .received()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| {
                let invitation = waiting.get(&r.id).filter(|a| a.kind == KIND_INVITE).and_then(|a| pairing::read_invite(&a.bytes).ok()).map(|i| Invitation {
                    fingerprint: i.office.fingerprint(),
                    office_name: i.office.name,
                    intended_station: i.intended_station,
                    expires_at: i.expires_at,
                });
                ReceivedView { id: r.id, from: r.from, kind: r.kind, size: r.size, status: r.status, reason: r.note, arrived_at: r.arrived_at, handled_at: r.handled_at, invitation }
            })
            .collect();
        Status { ready: access.is_some(), why_not, address: access.as_ref().map(|a| a.address.clone()), site: pleadli_node_core::site::base(), last: self.last.lock().unwrap().clone(), sent, received }
    }

    pub async fn sync(&self) -> Result<(), String> {
        let result = self.round().await;
        *self.last.lock().unwrap() = Round { at: Some(chrono::Utc::now().timestamp_millis()), error: result.as_ref().err().cloned() };
        result
    }

    async fn round(&self) -> Result<(), String> {
        let Some(RelayAccess { token, .. }) = self.orchestra.relay_access().await else { return Err("licence_needed".to_string()) };
        // A person asked for this round, or the timer did: either way anything waiting is due now.
        let reset = self.postbox.retry_now(None).await.map_err(|e| e.to_string()).err();
        let tick = self.postbox.tick(&token).await;
        self.process_inbox().await;
        let second = self.postbox.flush(&token).await;
        match (reset, tick, second) {
            (Some(e), _, _) => Err(e),
            (_, Err(e), _) => Err(human(&e)),
            (_, _, Err(e)) => Err(human(&e)),
            _ => Ok(()),
        }
    }

    async fn process_inbox(&self) {
        let waiting = match self.postbox.unread().await {
            Ok(w) => w,
            Err(e) => return log::warn!("postbox: inbox unreadable: {e}"),
        };
        for item in waiting {
            // An invitation is a person's decision, made in the window; it waits.
            if item.kind == KIND_INVITE {
                continue;
            }
            match self.open(&item).await {
                Ok(()) => {
                    let _ = self.postbox.handled(&item.id).await;
                }
                Err(DomainError::Db(e)) => log::warn!("postbox: {} not opened yet: {e}", item.id),
                // The same package arriving twice is not an attack and not a failure: it is already kept.
                Err(DomainError::Invalid(m)) if m.contains("already been received") => {
                    note(&self.pool, "postbox_duplicate", Some(("package", &item.id))).await;
                    let _ = self.postbox.handled(&item.id).await;
                }
                Err(e) => {
                    note(&self.pool, &format!("postbox_refused {} from {}", item.kind, item.from), Some(("package", &item.id))).await;
                    let _ = self.postbox.refused(&item.id, &e.to_string()).await;
                }
            }
        }
    }

    async fn open(&self, item: &Arrived) -> Result<(), DomainError> {
        match item.kind.as_str() {
            KIND_CONFIRMATION | KIND_RECEIPT | KIND_DECISION_NOTICE => {
                let peeked = envelope::peek(&item.bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
                let bound: Option<Option<String>> = sqlx::query_scalar("SELECT office_address FROM dpp_connections WHERE office_id = ? ORDER BY (status = 'trusted') DESC, created_at DESC LIMIT 1").bind(&peeked.header.from.id).fetch_optional(&self.pool).await?;
                if let Some(Some(address)) = bound {
                    if address != item.from {
                        return Err(DomainError::Invalid(format!("This package came from {}, but that office answered from {address}. Nothing was kept.", item.from)));
                    }
                }
                exchange::import_package(&self.pool, &item.bytes).await.map(|_| ())
            }
            other => Err(DomainError::Invalid(format!("This station does not receive packages of kind '{other}' through the postbox."))),
        }
    }

    /// An administrator answers an invitation that arrived: the answer is sealed
    /// by the exchange, bound to the address the invitation came from, and posted.
    pub async fn answer_invitation(&self, inbox_id: &str, officer_in_charge: Option<&str>) -> Result<(), DomainError> {
        let item = self.postbox.unread().await.map_err(|e| DomainError::Invalid(e.to_string()))?.into_iter().find(|a| a.id == inbox_id && a.kind == KIND_INVITE).ok_or_else(|| DomainError::NotFound("No such invitation is waiting.".into()))?;
        let (_, response) = exchange::accept_invite(&self.pool, &item.bytes, officer_in_charge).await?;
        let invite = pairing::read_invite(&item.bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
        sqlx::query("UPDATE dpp_connections SET office_address = ? WHERE id = ?").bind(&item.from).bind(&invite.invite_id).execute(&self.pool).await?;
        let package_id = envelope::peek(&response).map(|p| p.header.id.clone()).map_err(|e| DomainError::Invalid(e.to_string()))?;
        self.postbox.queue(&package_id, &item.from, KIND_RESPONSE, &response).await.map_err(|e| DomainError::Invalid(e.to_string()))?;
        self.postbox.handled(&item.id).await.map_err(|e| DomainError::Invalid(e.to_string()))?;
        note(&self.pool, "postbox_invitation_answered", Some(("connection", &invite.invite_id))).await;
        Ok(())
    }

    /// Declines an invitation: it is kept as refused, with the reason, and nothing is sent.
    pub async fn decline_invitation(&self, inbox_id: &str, reason: &str) -> Result<(), DomainError> {
        let reason = if reason.trim().is_empty() { "Declined by this station." } else { reason.trim() };
        self.postbox.refused(inbox_id, reason).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }

    /// Seals a referral for the confirmed office and queues it. Nothing is
    /// claimed as sent until the relay has it, and a failure stays visible.
    pub async fn send_referral(&self, referral_id: &str) -> Result<String, DomainError> {
        if self.orchestra.relay_access().await.is_none() {
            return Err(DomainError::Invalid(NO_LICENCE.into()));
        }
        let address: Option<Option<String>> = sqlx::query_scalar("SELECT office_address FROM dpp_connections WHERE status = 'trusted' ORDER BY trusted_at DESC LIMIT 1").fetch_optional(&self.pool).await?;
        let Some(Some(to)) = address else {
            return Err(DomainError::Invalid("The confirmed DPP office has not been reached through the postbox. Answer its invitation there first, or send the file by hand.".into()));
        };
        let (bytes, _) = exchange::export_referral(&self.pool, &self.vault_root, referral_id, "postbox").await?;
        let package_id = envelope::peek(&bytes).map(|p| p.header.id.clone()).map_err(|e| DomainError::Invalid(e.to_string()))?;
        if bytes.len() > MAX_PACKAGE {
            sqlx::query("UPDATE exchange_outgoing SET exported_at = NULL, route = NULL WHERE id = ?").bind(&package_id).execute(&self.pool).await?;
            return Err(DomainError::Invalid("This referral is too large for the postbox (over 24 MB). Send fewer or smaller files, or send it by hand.".into()));
        }
        if let Err(e) = self.postbox.queue(&package_id, &to, KIND_REFERRAL, &bytes).await {
            sqlx::query("UPDATE exchange_outgoing SET exported_at = NULL, route = NULL WHERE id = ?").bind(&package_id).execute(&self.pool).await?;
            return Err(DomainError::Invalid(e.to_string()));
        }
        Ok(package_id)
    }

    pub async fn retry(&self, id: Option<&str>) -> Result<u64, DomainError> {
        self.postbox.retry_now(id).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }

    pub async fn reopen(&self, id: &str) -> Result<bool, DomainError> {
        self.postbox.reopen(id).await.map_err(|e| DomainError::Invalid(e.to_string()))
    }
}
