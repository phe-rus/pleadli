//! One postbox driver for every application (docs/platform/RELAY-DESIGN.md).
//!
//! Police and the DPP each grew their own copy of this loop. Courts, Lawyers and
//! Prisons use this one instead, so a fix to retry, de-duplication, refusal or
//! address binding is made once. It moves opaque bytes and decides nothing about
//! what is in them: the application's `Adapter` opens a package (verifying the
//! signature, the trusted link and the institution's permission) and this
//! module sorts the outcome:
//!
//! - kept: the row is marked imported and its bytes dropped;
//! - the same package arriving again: marked imported, audited, nothing added;
//! - turned away: kept with the reason, and the sender's name never decides it;
//! - the database failed: left to be tried again, not blamed on the package.
//!
//! Two checks only this layer can make: the address the relay says a package
//! came from must be the address that institution answered from (`check_bound`),
//! and a package for an invitation waits for a person (`Adapter::waits`).

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use pleadli_interchange::authorization;
use pleadli_interchange::envelope::{self, Header};
use pleadli_interchange::identity::IdentityKind;
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::orchestra::{Orchestra, RelayAccess};
use crate::postbox::{Arrived, Postbox, PostboxError};

pub type Fut<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// The largest package the relay takes, minus a margin.
pub const MAX_PACKAGE: usize = 24 * 1024 * 1024;
const EVERY: std::time::Duration = std::time::Duration::from_secs(600);
pub const NO_LICENCE: &str = "This computer needs a Pleadli licence for an office before it can use the postbox.";

/// Why an application would not keep a package.
#[derive(Debug)]
pub enum Reject {
    /// Not the package's fault (the database failed). It stays to be tried again.
    Retry(String),
    /// Already received: kept once, nothing is added, not a failure.
    Duplicate,
    /// Turned away, with a reason a person can read.
    Refuse(String),
}

/// What an application supplies. Nothing here seals or opens a package for the hub.
pub trait Adapter: Send + Sync + 'static {
    /// Open one package that arrived, or say why not. Must be safe to call twice for the same package.
    fn open<'a>(&'a self, item: &'a Arrived) -> Fut<'a, Result<(), Reject>>;
    /// A kind of package that waits for a person instead of being opened by itself (an invitation).
    fn waits(&self, kind: &str) -> bool;
    /// What a person is shown about a waiting package, or None if they may not act on it.
    fn describe(&self, item: &Arrived) -> Option<Value>;
    /// A line for the application's own audit trail. Never case content.
    fn audit<'a>(&'a self, action: &'a str, detail: String) -> Fut<'a, ()>;
    /// The link tables this institution issued the invitations for, so it is the one that may end them. Each needs
    /// `status`, `address`, `revoked_at`, `revoked_reason` and `relay_ended_at`. Empty for an institution that only answers.
    fn issued(&self) -> &'static [Links] {
        &[]
    }
    /// Every link table this institution has, so a package sent to an office that ended its link is shown as turned
    /// away rather than delivered. Each needs `status`, `address`, `revoked_at` and `revoked_reason`.
    fn peers(&self) -> &'static [Links] {
        &[]
    }
}

/// A table of connections with a column holding the peer's identity id and one
/// for where it answers on the relay. `table` and `peer_col` are literals in the application,
/// never taken from a request.
#[derive(Clone, Copy, Debug)]
pub struct Links {
    pub table: &'static str,
    pub peer_col: &'static str,
    /// What kind of institution is on the other side of every row of this table.
    pub peer: IdentityKind,
}

/// The address recorded for this peer, and its error if the package came from somewhere else.
pub async fn check_bound(pool: &SqlitePool, links: &[Links], peer_id: &str, from_address: &str) -> Result<(), String> {
    for l in links {
        let sql = format!("SELECT address FROM {} WHERE {} = ? ORDER BY (status = 'trusted') DESC, rowid DESC LIMIT 1", l.table, l.peer_col);
        let row: Option<Option<String>> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(peer_id).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if let Some(Some(address)) = row {
            if address != from_address {
                return Err(format!("This package came from {from_address}, but that institution answered from {address}. Nothing was kept."));
            }
        }
    }
    Ok(())
}

/// Records where a link answers, only if it has no address yet. Returns false when it already has another.
pub async fn bind(pool: &SqlitePool, link: Links, link_id: &str, address: &str) -> Result<bool, sqlx::Error> {
    let sql = format!("UPDATE {} SET address = COALESCE(address, ?) WHERE id = ?", link.table);
    sqlx::query(sqlx::AssertSqlSafe(sql)).bind(address).bind(link_id).execute(pool).await?;
    let sql = format!("SELECT address FROM {} WHERE id = ?", link.table);
    let now: Option<Option<String>> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(link_id).fetch_optional(pool).await?;
    Ok(matches!(now, Some(Some(a)) if a == address))
}

/// The two checks every package passes before an application looks at it: the sender's kind may
/// send this kind to this institution (`authorization`), and it came from the address that
/// sender answered from. Neither opens the package, so neither can be fooled by its content.
pub async fn admit(me: IdentityKind, pool: &SqlitePool, links: &[Links], item: &Arrived) -> Result<Header, Reject> {
    let peeked = envelope::peek(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
    let header = peeked.header;
    // The relay's own label for the kind must be the package's: a package cannot pass as another kind.
    if header.kind != item.kind {
        return Err(Reject::Refuse("The package is labelled as one kind and says it is another. Nothing was kept.".to_string()));
    }
    authorization::check(header.from.kind, me, &header.kind).map_err(Reject::Refuse)?;
    check_bound(pool, links, &header.from.id, &item.from).await.map_err(Reject::Refuse)?;
    Ok(header)
}

/// Marks a link ended, with the reason a person gave, if it is in one of `from` (for the office that ended it: `trusted`;
/// for the one told: `trusted` or `awaiting_confirmation`). Returns true when the link is ended afterwards, so a notice
/// that arrives twice is not an error. The table needs `revoked_at` and `revoked_reason`.
pub async fn set_revoked(pool: &SqlitePool, link: Links, link_id: &str, reason: &str, from: &[&str]) -> Result<bool, sqlx::Error> {
    let marks = from.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!("UPDATE {} SET status = 'revoked', revoked_at = ?, revoked_reason = ? WHERE id = ? AND status IN ({marks})", link.table);
    let mut q = sqlx::query(sqlx::AssertSqlSafe(sql)).bind(chrono::Utc::now().timestamp_millis()).bind(reason).bind(link_id);
    for state in from {
        q = q.bind(*state);
    }
    if q.execute(pool).await?.rows_affected() > 0 {
        return Ok(true);
    }
    let sql = format!("SELECT status FROM {} WHERE id = ?", link.table);
    let now: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(link_id).fetch_optional(pool).await?;
    Ok(now.as_deref() == Some("revoked"))
}

/// Where a link answers on the relay, if anywhere.
pub async fn address_of(pool: &SqlitePool, link: Links, link_id: &str) -> Result<Option<String>, sqlx::Error> {
    let sql = format!("SELECT address FROM {} WHERE id = ?", link.table);
    Ok(sqlx::query_scalar::<_, Option<String>>(sqlx::AssertSqlSafe(sql)).bind(link_id).fetch_optional(pool).await?.flatten())
}

/// Opens everything waiting in the inbox once. Public so it runs in tests without a network.
pub async fn process_inbox(postbox: &Postbox, adapter: &dyn Adapter) -> usize {
    let waiting = match postbox.unread().await {
        Ok(w) => w,
        Err(e) => {
            log::warn!("postbox: inbox unreadable: {e}");
            return 0;
        }
    };
    let mut kept = 0;
    for item in waiting {
        if adapter.waits(&item.kind) {
            continue;
        }
        match adapter.open(&item).await {
            Ok(()) => {
                let _ = postbox.handled(&item.id).await;
                kept += 1;
            }
            Err(Reject::Retry(e)) => log::warn!("postbox: {} not opened yet: {e}", item.id),
            Err(Reject::Duplicate) => {
                adapter.audit("postbox_duplicate", format!("{} from {}", item.kind, item.from)).await;
                let _ = postbox.handled(&item.id).await;
            }
            Err(Reject::Refuse(reason)) => {
                adapter.audit("postbox_refused", format!("{} from {}: {}", item.kind, item.from, truncate(&reason, 200))).await;
                let _ = postbox.refused(&item.id, &reason).await;
            }
        }
    }
    kept
}

fn truncate(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
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
    /// queued, sent, delivered, refused (the office ended its link), attention or expired.
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
    /// What a person may decide on, when this waits for them.
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

/// Addresses whose office ended its link with this one, with when and why. `(revoked_at, a line for a person)`.
async fn ended_peers(pool: &SqlitePool, peers: &[Links]) -> std::collections::HashMap<String, (i64, String)> {
    let mut out = std::collections::HashMap::new();
    for l in peers {
        let sql = format!("SELECT address, COALESCE(revoked_at, 0), revoked_reason FROM {} WHERE status = 'revoked' AND address IS NOT NULL", l.table);
        let rows: Vec<(String, i64, Option<String>)> = sqlx::query_as(sqlx::AssertSqlSafe(sql)).fetch_all(pool).await.unwrap_or_default();
        for (address, at, why) in rows {
            let line = match why.filter(|w| !w.trim().is_empty()) {
                Some(w) => format!("The office ended this connection, so it turned this away. Reason: {}", w.trim()),
                None => "The office ended this connection, so it turned this away.".to_string(),
            };
            out.insert(address, (at, line));
        }
    }
    out
}

/// The relay side of links this institution ended. The relay drops the mail still waiting between two offices when a
/// link ends, so this waits until the other office has collected the signed revocation notice, or a week has passed,
/// whichever is first. Until then the other office's packages reach this one and are refused here.
async fn end_revoked_links(pool: &SqlitePool, postbox: &Postbox, token: &str, issued: &[Links]) {
    const WAIT: i64 = 7 * 24 * 60 * 60 * 1000;
    if issued.is_empty() {
        return;
    }
    let now = chrono::Utc::now().timestamp_millis();
    let sent = postbox.sent().await.unwrap_or_default();
    for l in issued {
        let sql = format!("SELECT id, address, revoked_reason, COALESCE(revoked_at, 0) FROM {} WHERE status = 'revoked' AND address IS NOT NULL AND relay_ended_at IS NULL", l.table);
        let rows: Vec<(String, String, Option<String>, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(sql)).fetch_all(pool).await.unwrap_or_default();
        for (id, address, reason, revoked_at) in rows {
            let told = sent.iter().any(|s| s.to == address && s.kind == pleadli_interchange::pairing::KIND_CONFIRMATION && s.queued_at >= revoked_at && matches!(s.status.as_str(), "delivered" | "acked"));
            if !told && now - revoked_at < WAIT {
                continue;
            }
            let why = reason.filter(|r| !r.trim().is_empty()).unwrap_or_else(|| "This office ended the connection.".to_string());
            match postbox.end_connection(token, &address, &why).await {
                // Ended, or there was no live link left to end: either way the relay will refuse this peer.
                Ok(_) | Err(PostboxError::Api { status: 404, .. }) => {
                    let sql = format!("UPDATE {} SET relay_ended_at = ? WHERE id = ?", l.table);
                    let _ = sqlx::query(sqlx::AssertSqlSafe(sql)).bind(now).bind(&id).execute(pool).await;
                }
                Err(e) => log::warn!("postbox: could not end the relay link with {address}: {}", human(&e)),
            }
        }
    }
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

pub fn human(e: &PostboxError) -> String {
    match e {
        PostboxError::Api { error, message, .. } if error == "not_connected" => format!("Not connected yet: {message}"),
        other => other.to_string(),
    }
}

/// Sends a package a domain call has just sealed, if the institution it is addressed to answers on the relay.
/// The package says who it is for and what it is; this finds the trusted link for that recipient and its
/// relay address. A recipient with no address stays on the file route, and the caller says so.
/// What this institution may not send to that kind of institution is refused here too, so a bug elsewhere
/// cannot send it. The receiving side repeats the check on its own: this only stops a mistake leaving the building.
pub async fn dispatch_to(me: IdentityKind, pool: &SqlitePool, postbox: &Postbox, bytes: &[u8], links: &[Links]) -> Result<Dispatched, String> {
    let header = envelope::peek(bytes).map_err(|e| e.to_string())?.header;
    let recipient = header.to.clone().ok_or_else(|| "A package with no addressee cannot be sent through the postbox.".to_string())?;
    for l in links {
        let sql = format!("SELECT address FROM {} WHERE {} = ? AND status = 'trusted' AND address IS NOT NULL ORDER BY rowid DESC LIMIT 1", l.table, l.peer_col);
        let address: Option<String> = sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(&recipient).fetch_optional(pool).await.map_err(|e| e.to_string())?;
        if let Some(to) = address {
            authorization::check(me, l.peer, &header.kind)?;
            if bytes.len() > MAX_PACKAGE {
                return Err("This package is too large for the postbox (over 24 MB). Send it by file.".to_string());
            }
            postbox.queue(&header.id, &to, &header.kind, bytes).await.map_err(|e| e.to_string())?;
            return Ok(Dispatched::Queued { package_id: header.id, to });
        }
    }
    Ok(Dispatched::FileOnly)
}

/// What became of a package that was just sealed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "route")]
pub enum Dispatched {
    /// Handed to the postbox, to be posted when the relay can be reached.
    Queued { package_id: String, to: String },
    /// That institution has no postbox address: the file is the only carrier.
    FileOnly,
}

pub struct Hub {
    me: IdentityKind,
    pool: SqlitePool,
    orchestra: Arc<Orchestra>,
    postbox: Postbox,
    adapter: Arc<dyn Adapter>,
    last: Mutex<Round>,
}

impl Hub {
    pub fn new(me: IdentityKind, pool: SqlitePool, orchestra: Arc<Orchestra>, adapter: Arc<dyn Adapter>) -> Arc<Hub> {
        let postbox = Postbox::new(pool.clone(), &crate::site::base());
        Arc::new(Hub { me, pool, orchestra, postbox, adapter, last: Mutex::new(Round::default()) })
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
        let why_not = access.is_none().then(|| NO_LICENCE.to_string());
        // Offices that ended their link: what was sent to them after that was turned away, whatever the relay says.
        let ended = ended_peers(&self.pool, self.adapter.peers()).await;
        let sent = self
            .postbox
            .sent()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|s| {
                let turned_away = ended.get(&s.to).filter(|(at, _)| s.queued_at >= *at && s.kind != pleadli_interchange::pairing::KIND_CONFIRMATION && matches!(stage(&s.status), "sent" | "delivered"));
                let (stage, error) = match turned_away {
                    Some((_, why)) => ("refused", Some(why.clone())),
                    None => (stage(&s.status), s.error),
                };
                SentView { stage: stage.to_string(), id: s.id, to: s.to, kind: s.kind, error, attempts: s.attempts, queued_at: s.queued_at, posted_at: s.posted_at, acked_at: s.acked_at }
            })
            .collect();
        let waiting: std::collections::HashMap<String, Arrived> = self.postbox.unread().await.unwrap_or_default().into_iter().map(|a| (a.id.clone(), a)).collect();
        let received = self
            .postbox
            .received()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|r| {
                let invitation = waiting.get(&r.id).filter(|a| self.adapter.waits(&a.kind)).and_then(|a| self.adapter.describe(a));
                ReceivedView { id: r.id, from: r.from, kind: r.kind, size: r.size, status: r.status, reason: r.note, arrived_at: r.arrived_at, handled_at: r.handled_at, invitation }
            })
            .collect();
        Status { ready: access.is_some(), why_not, address: access.as_ref().map(|a| a.address.clone()), name: access.as_ref().and_then(|a| a.name.clone()).filter(|n| !n.is_empty()), site: crate::site::base(), last: self.last.lock().unwrap().clone(), sent, received }
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
        process_inbox(&self.postbox, self.adapter.as_ref()).await;
        let second = self.postbox.flush(&token).await;
        end_revoked_links(&self.pool, &self.postbox, &token, self.adapter.issued()).await;
        match (reset, tick, second) {
            (Some(e), _, _) => Err(e),
            (_, Err(e), _) => Err(human(&e)),
            (_, _, Err(e)) => Err(human(&e)),
            _ => Ok(()),
        }
    }

    /// Queues one sealed package for an address. Too large is refused here, before anything is kept.
    /// Queuing the same package twice is harmless: its own id is the key.
    pub async fn ship(&self, package_id: &str, to: &str, kind: &str, bytes: &[u8]) -> Result<(), String> {
        if self.orchestra.relay_access().await.is_none() {
            return Err(NO_LICENCE.to_string());
        }
        if bytes.len() > MAX_PACKAGE {
            return Err("This package is too large for the postbox (over 24 MB). Send it by file.".to_string());
        }
        self.postbox.queue(package_id, to, kind, bytes).await.map(|_| ()).map_err(|e| e.to_string())
    }

    /// See `dispatch_to`. Needs the licence, as every post does.
    pub async fn dispatch(&self, bytes: &[u8], links: &[Links]) -> Result<Dispatched, String> {
        if self.orchestra.relay_access().await.is_none() {
            return Err(NO_LICENCE.to_string());
        }
        dispatch_to(self.me, &self.pool, &self.postbox, bytes, links).await
    }

    /// Asks the relay to connect this office to another one. The other office's
    /// administrator approves it on Pleadli Account; until then posts are blocked.
    pub async fn introduce(&self, to: &str) -> Result<(), String> {
        let access = self.orchestra.relay_access().await.ok_or_else(|| NO_LICENCE.to_string())?;
        let address = to.trim().to_lowercase();
        if address.is_empty() || address == access.address {
            return Err("Give the other office's postbox address, for example ug.dpp.hoima.office.".to_string());
        }
        match self.postbox.request_connection(&access.token, &address).await {
            Ok(_) => Ok(()),
            Err(PostboxError::Api { status: 404, .. }) => Err("No office has that postbox address.".to_string()),
            Err(e) => Err(human(&e)),
        }
    }

    /// An invitation that arrived and waits for a person. None if there is no such invitation.
    pub async fn waiting(&self, inbox_id: &str) -> Option<Arrived> {
        self.postbox.unread().await.ok()?.into_iter().find(|a| a.id == inbox_id && self.adapter.waits(&a.kind))
    }

    /// The person answered it: the answer is queued for where the invitation came from, and the invitation is done.
    pub async fn answered(&self, inbox_id: &str, answer_id: &str, to: &str, kind: &str, bytes: &[u8]) -> Result<(), String> {
        self.ship(answer_id, to, kind, bytes).await?;
        self.postbox.handled(inbox_id).await.map_err(|e| e.to_string())
    }

    /// Declines an invitation: kept as refused, with the reason, and nothing is sent.
    pub async fn decline(&self, inbox_id: &str, reason: &str) -> Result<(), String> {
        let reason = if reason.trim().is_empty() { "Declined by this office." } else { reason.trim() };
        self.postbox.refused(inbox_id, reason).await.map_err(|e| e.to_string())
    }

    pub async fn retry(&self, id: Option<&str>) -> Result<u64, String> {
        self.postbox.retry_now(id).await.map_err(|e| e.to_string())
    }

    pub async fn reopen(&self, id: &str) -> Result<bool, String> {
        self.postbox.reopen(id).await.map_err(|e| e.to_string())
    }

    pub async fn connections(&self) -> Result<Value, String> {
        let access = self.orchestra.relay_access().await.ok_or_else(|| NO_LICENCE.to_string())?;
        self.postbox.connections(&access.token).await.map_err(|e| human(&e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::raw_sql(crate::postbox::TABLE_SQL).execute(&pool).await.unwrap();
        sqlx::raw_sql("CREATE TABLE dpp_links (id TEXT PRIMARY KEY, dpp_id TEXT, status TEXT, address TEXT)").execute(&pool).await.unwrap();
        pool
    }

    const LINKS: Links = Links { table: "dpp_links", peer_col: "dpp_id", peer: IdentityKind::DppOffice };

    async fn arrive(pool: &SqlitePool, id: &str, kind: &str) {
        sqlx::query("INSERT INTO postbox_inbox (id, from_address, kind, sha256, bytes, arrived_at) VALUES (?, 'ug.dpp.a', ?, 'x', x'0102', 1)").bind(id).bind(kind).execute(pool).await.unwrap();
    }

    struct Fake {
        opened: AtomicUsize,
        mode: Mutex<Vec<&'static str>>,
        audits: Mutex<Vec<String>>,
    }
    impl Adapter for Fake {
        fn open<'a>(&'a self, _: &'a Arrived) -> Fut<'a, Result<(), Reject>> {
            Box::pin(async move {
                self.opened.fetch_add(1, Ordering::SeqCst);
                match self.mode.lock().unwrap().pop().unwrap_or("ok") {
                    "dup" => Err(Reject::Duplicate),
                    "refuse" => Err(Reject::Refuse("not allowed".into())),
                    "retry" => Err(Reject::Retry("database is locked".into())),
                    _ => Ok(()),
                }
            })
        }
        fn waits(&self, kind: &str) -> bool {
            kind == "pairing_invite"
        }
        fn describe(&self, _: &Arrived) -> Option<Value> {
            None
        }
        fn audit<'a>(&'a self, action: &'a str, detail: String) -> Fut<'a, ()> {
            Box::pin(async move { self.audits.lock().unwrap().push(format!("{action}: {detail}")) })
        }
    }

    #[tokio::test]
    async fn each_outcome_is_sorted_the_same_way_for_every_application() {
        let pool = pool().await;
        let pb = Postbox::new(pool.clone(), "http://127.0.0.1:1");
        let fake = Fake { opened: AtomicUsize::new(0), mode: Mutex::new(vec![]), audits: Mutex::new(vec![]) };
        // popped from the end: ok, duplicate, refused, retry
        *fake.mode.lock().unwrap() = vec!["retry", "refuse", "dup", "ok"];
        for (i, id) in ["a", "b", "c", "d"].iter().enumerate() {
            arrive(&pool, id, "referral").await;
            sqlx::query("UPDATE postbox_inbox SET arrived_at = ? WHERE id = ?").bind(i as i64).bind(id).execute(&pool).await.unwrap();
        }
        arrive(&pool, "inv", "pairing_invite").await;
        process_inbox(&pb, &fake).await;
        let rows = pb.received().await.unwrap();
        let st = |id: &str| rows.iter().find(|r| r.id == id).unwrap().status.clone();
        assert_eq!(st("a"), "imported");
        assert_eq!(st("b"), "imported", "a duplicate is not a failure");
        assert_eq!(st("c"), "refused");
        assert_eq!(rows.iter().find(|r| r.id == "c").unwrap().note.as_deref(), Some("not allowed"));
        assert_eq!(st("d"), "new", "a database failure is tried again");
        assert_eq!(st("inv"), "new", "an invitation waits for a person");
        assert_eq!(fake.opened.load(Ordering::SeqCst), 4, "the invitation was never opened by itself");
        let audits = fake.audits.lock().unwrap().join("|");
        assert!(audits.contains("postbox_duplicate") && audits.contains("postbox_refused"));
        // bytes of a kept package are dropped, a refused one keeps its bytes so it can be reopened
        let kept: i64 = sqlx::query_scalar("SELECT length(bytes) FROM postbox_inbox WHERE id = 'a'").fetch_one(&pool).await.unwrap();
        let turned: i64 = sqlx::query_scalar("SELECT length(bytes) FROM postbox_inbox WHERE id = 'c'").fetch_one(&pool).await.unwrap();
        assert_eq!((kept, turned), (0, 2));
        // a second pass changes nothing that is finished and retries the one that was not
        *fake.mode.lock().unwrap() = vec!["ok"];
        process_inbox(&pb, &fake).await;
        assert_eq!(fake.opened.load(Ordering::SeqCst), 5);
        assert!(pb.reopen("c").await.unwrap());
    }

    #[tokio::test]
    async fn a_package_from_another_address_than_the_one_the_peer_answered_from_is_refused() {
        let pool = pool().await;
        sqlx::query("INSERT INTO dpp_links (id, dpp_id, status, address) VALUES ('l1', 'dpp-1', 'trusted', 'ug.dpp.real')").execute(&pool).await.unwrap();
        assert!(check_bound(&pool, &[LINKS], "dpp-1", "ug.dpp.real").await.is_ok());
        assert!(check_bound(&pool, &[LINKS], "dpp-1", "ug.dpp.other").await.unwrap_err().contains("answered from ug.dpp.real"));
        // a peer with no recorded address is not refused here (it is the link table that decides trust)
        assert!(check_bound(&pool, &[LINKS], "dpp-2", "anywhere").await.is_ok());
    }

    #[tokio::test]
    async fn an_address_is_bound_once_and_never_overwritten() {
        let pool = pool().await;
        sqlx::query("INSERT INTO dpp_links (id, dpp_id, status) VALUES ('l1', 'dpp-1', 'invited')").execute(&pool).await.unwrap();
        assert_eq!(address_of(&pool, LINKS, "l1").await.unwrap(), None);
        assert!(bind(&pool, LINKS, "l1", "ug.dpp.a").await.unwrap());
        assert!(!bind(&pool, LINKS, "l1", "ug.dpp.b").await.unwrap(), "a second address must not replace the first");
        assert_eq!(address_of(&pool, LINKS, "l1").await.unwrap().as_deref(), Some("ug.dpp.a"));
    }

    #[tokio::test]
    async fn a_sealed_package_is_queued_only_for_a_trusted_address_and_only_for_a_kind_its_sender_may_send() {
        use pleadli_interchange::envelope::{seal, Body};
        use pleadli_interchange::identity::Identity;
        let pool = pool().await;
        sqlx::raw_sql("CREATE TABLE court_links (id TEXT PRIMARY KEY, court_id TEXT, status TEXT, address TEXT); CREATE TABLE prison_links (id TEXT PRIMARY KEY, prison_id TEXT, status TEXT, address TEXT)").execute(&pool).await.unwrap();
        let pb = Postbox::new(pool.clone(), "http://127.0.0.1:1");
        let courts = Links { table: "court_links", peer_col: "court_id", peer: IdentityKind::CourtRegistry };
        let prisons = Links { table: "prison_links", peer_col: "prison_id", peer: IdentityKind::PrisonFacility };
        let firm = Identity::generate(IdentityKind::LawFirm, "Firm", None);
        let court = Identity::generate(IdentityKind::CourtRegistry, "Court", None);
        let prison = Identity::generate(IdentityKind::PrisonFacility, "Prison", None);
        let body = || Body::new(serde_json::json!({}));
        let filing = seal(&firm, &court.public, "firm_filing", 1, None, &body()).unwrap().0;

        // No link yet: the file is the only carrier.
        assert_eq!(dispatch_to(IdentityKind::LawFirm, &pool, &pb, &filing, &[courts, prisons]).await.unwrap(), Dispatched::FileOnly);
        // A link that is not trusted yet gets nothing.
        sqlx::query("INSERT INTO court_links (id, court_id, status, address) VALUES ('l', ?, 'awaiting_confirmation', 'ug.court.a')").bind(&court.public.id).execute(&pool).await.unwrap();
        assert_eq!(dispatch_to(IdentityKind::LawFirm, &pool, &pb, &filing, &[courts]).await.unwrap(), Dispatched::FileOnly);
        sqlx::query("UPDATE court_links SET status = 'trusted'").execute(&pool).await.unwrap();
        match dispatch_to(IdentityKind::LawFirm, &pool, &pb, &filing, &[prisons, courts]).await.unwrap() {
            Dispatched::Queued { to, .. } => assert_eq!(to, "ug.court.a"),
            other => panic!("{other:?}"),
        }
        let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM postbox_outbox WHERE kind = 'firm_filing' AND to_address = 'ug.court.a'").fetch_one(&pool).await.unwrap();
        assert_eq!(queued, 1);
        // Sending the same package again changes nothing.
        dispatch_to(IdentityKind::LawFirm, &pool, &pb, &filing, &[courts]).await.unwrap();
        let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM postbox_outbox").fetch_one(&pool).await.unwrap();
        assert_eq!(queued, 1);

        // A firm that sealed a custody order to a trusted prison: refused before anything is queued.
        sqlx::query("INSERT INTO prison_links (id, prison_id, status, address) VALUES ('p', ?, 'trusted', 'ug.prison.a')").bind(&prison.public.id).execute(&pool).await.unwrap();
        let order = seal(&firm, &prison.public, "custody_order", 1, None, &body()).unwrap().0;
        let err = dispatch_to(IdentityKind::LawFirm, &pool, &pb, &order, &[courts, prisons]).await.unwrap_err();
        assert!(err.contains("law firm is not allowed"), "{err}");
        let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM postbox_outbox").fetch_one(&pool).await.unwrap();
        assert_eq!(queued, 1);

        // Too large for the relay: refused here, nothing kept.
        let big = seal(&firm, &court.public, "firm_filing", 2, None, &Body { json: serde_json::json!({}), files: vec![pleadli_interchange::envelope::BodyFile { id: "a".into(), name: "a".into(), mime: "x".into(), sha256: crate::postbox::sha256_hex(&vec![0u8; MAX_PACKAGE + 1]), bytes: vec![0u8; MAX_PACKAGE + 1] }] }).unwrap().0;
        assert!(dispatch_to(IdentityKind::LawFirm, &pool, &pb, &big, &[courts]).await.unwrap_err().contains("too large"));
    }
}
