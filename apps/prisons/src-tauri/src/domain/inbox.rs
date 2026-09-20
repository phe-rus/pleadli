//! The legal and operational inbox: actionable items addressed to the
//! facility, to those holding a permission, or to one officer. Not a chat: an
//! item has a source, a subject, a related record, a status, an unread state
//! per officer, and an audit trail of who opened and who acted.
//!
//! Some items are recorded as they happen (a court communication typed in by
//! an officer, "disconnected from Head Office"). Others are derived from the
//! facility's current state (an obligation that has fallen due, a backup that
//! is overdue, Head Office being unreachable): they carry a `dedupe_key`,
//! refreshing never duplicates them, and they close themselves when the
//! condition ends.

use std::sync::atomic::{AtomicI64, Ordering};

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, AuditEntry};
use super::authz::{perm, Actor};
use super::error::DomainError;
use super::time::now_ms;
use super::{connectivity, obligations};

const LIMIT: i64 = 300;
const REFRESH_EVERY_MS: i64 = 45_000;
static LAST_REFRESH: AtomicI64 = AtomicI64::new(0);

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct InboxRow {
    pub id: String,
    pub kind: String,
    pub origin: String,
    pub source: String,
    pub subject: String,
    pub body: Option<String>,
    pub related_type: Option<String>,
    pub related_id: Option<String>,
    pub related_route: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub actioned_at: Option<i64>,
    pub resolution: Option<String>,
    pub actioned_by_name: Option<String>,
    pub recorded_by_name: Option<String>,
    /// The named officer, or the whole facility.
    pub recipient: String,
    /// Has the signed-in officer opened it.
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ReadRow {
    pub officer_name: String,
    pub read_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InboxDetail {
    #[serde(flatten)]
    pub item: InboxRow,
    pub reads: Vec<ReadRow>,
}

const ROW_SELECT: &str = "SELECT i.id, i.kind, i.origin, i.source, i.subject, i.body, i.related_type, i.related_id, i.related_route,
        i.status, i.created_at, i.actioned_at, i.resolution,
        (SELECT name FROM officers WHERE id = i.actioned_by) AS actioned_by_name,
        (SELECT name FROM officers WHERE id = i.recorded_by) AS recorded_by_name,
        COALESCE((SELECT name FROM officers WHERE id = i.recipient_officer_id), 'This facility') AS recipient,
        EXISTS (SELECT 1 FROM inbox_reads r WHERE r.item_id = i.id AND r.officer_id = ?1) AS read
     FROM inbox_items i";

/// What this officer may see: items for the whole facility or for them, whose
/// required permission (if any) they hold.
const VISIBLE: &str = "(i.recipient_officer_id IS NULL OR i.recipient_officer_id = ?1)
     AND (i.required_permission IS NULL OR i.required_permission IN (SELECT value FROM json_each(?2)))";

fn permissions_json(actor: &Actor) -> String {
    serde_json::to_string(&actor.permissions().collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string())
}

pub async fn list(pool: &SqlitePool, actor: &Actor) -> Result<Vec<InboxRow>, sqlx::Error> {
    refresh_local(pool, false).await?;
    let sql = format!("{ROW_SELECT} WHERE {VISIBLE} ORDER BY (i.status IN ('new', 'acknowledged')) DESC, i.created_at DESC LIMIT {LIMIT}");
    sqlx::query_as::<_, InboxRow>(sqlx::AssertSqlSafe(sql))
        .bind(actor.officer_id.as_deref())
        .bind(permissions_json(actor))
        .fetch_all(pool)
        .await
}

/// Items that still need attention and that this officer has not opened.
pub async fn unread_count(pool: &SqlitePool, actor: &Actor) -> Result<i64, sqlx::Error> {
    refresh_local(pool, false).await?;
    let sql = format!(
        "SELECT COUNT(*) FROM inbox_items i WHERE {VISIBLE} AND i.status IN ('new', 'acknowledged')
         AND NOT EXISTS (SELECT 1 FROM inbox_reads r WHERE r.item_id = i.id AND r.officer_id = ?1)"
    );
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql)).bind(actor.officer_id.as_deref()).bind(permissions_json(actor)).fetch_one(pool).await
}

async fn visible_row(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<Option<InboxRow>, sqlx::Error> {
    let sql = format!("{ROW_SELECT} WHERE i.id = ?3 AND {VISIBLE}");
    sqlx::query_as::<_, InboxRow>(sqlx::AssertSqlSafe(sql))
        .bind(actor.officer_id.as_deref())
        .bind(permissions_json(actor))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
}

pub async fn get(pool: &SqlitePool, actor: &Actor, id: &str) -> Result<Option<InboxDetail>, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    let Some(item) = visible_row(&mut conn, actor, id).await? else { return Ok(None) };
    let reads = sqlx::query_as::<_, ReadRow>(
        "SELECT COALESCE(o.name, r.officer_id) AS officer_name, r.read_at FROM inbox_reads r LEFT JOIN officers o ON o.id = r.officer_id
         WHERE r.item_id = ? ORDER BY r.read_at",
    )
    .bind(id)
    .fetch_all(&mut *conn)
    .await?;
    Ok(Some(InboxDetail { item, reads }))
}

/// Records that this officer opened the item. Audited the first time only.
pub async fn mark_read(conn: &mut SqliteConnection, actor: &Actor, id: &str) -> Result<(), DomainError> {
    let officer = actor.officer_id.as_deref().ok_or_else(|| DomainError::rejected("Only a signed-in officer can open an item."))?;
    visible_row(conn, actor, id).await?.ok_or(DomainError::NotFound("That inbox item"))?;
    let inserted = sqlx::query("INSERT OR IGNORE INTO inbox_reads (item_id, officer_id, read_at) VALUES (?, ?, ?)")
        .bind(id)
        .bind(officer)
        .bind(now_ms())
        .execute(&mut *conn)
        .await?
        .rows_affected();
    if inserted > 0 {
        audit::record(conn, actor, AuditEntry::new("inbox.read", "inbox_item", Some(id))).await?;
    }
    Ok(())
}

/// Acknowledge, mark actioned, or dismiss. Opening is implied: whoever acts on
/// an item has seen it. An item that is already closed stays closed.
pub async fn set_status(conn: &mut SqliteConnection, actor: &Actor, id: &str, status: &str, note: Option<&str>) -> Result<(), DomainError> {
    if !matches!(status, "acknowledged" | "actioned" | "dismissed") {
        return Err(DomainError::rejected("An item can be acknowledged, marked as actioned, or dismissed."));
    }
    let item = visible_row(conn, actor, id).await?.ok_or(DomainError::NotFound("That inbox item"))?;
    if matches!(item.status.as_str(), "actioned" | "dismissed") {
        return Err(DomainError::conflict("INBOX_CLOSED", "That item is already closed."));
    }
    let closing = status != "acknowledged";
    sqlx::query("UPDATE inbox_items SET status = ?, actioned_at = ?, actioned_by = ?, resolution = ? WHERE id = ?")
        .bind(status)
        .bind(closing.then(now_ms))
        .bind(closing.then(|| actor.officer_id.clone()).flatten())
        .bind(note.map(str::trim).filter(|n| !n.is_empty()))
        .bind(id)
        .execute(&mut *conn)
        .await?;
    mark_read(conn, actor, id).await?;
    audit::record(conn, actor, AuditEntry::new(&format!("inbox.{status}"), "inbox_item", Some(id)).reason(note.unwrap_or(""))).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualInput {
    /// Who it came from, in the officer's words ("High Court, Kampala").
    pub source: String,
    pub subject: String,
    pub body: Option<String>,
    pub related_prisoner_id: Option<String>,
}

/// An official communication received on paper, by phone or in person and
/// recorded by an officer, so the offline path is the same as the connected
/// one.
pub async fn record_manual(conn: &mut SqliteConnection, actor: &Actor, input: ManualInput) -> Result<String, DomainError> {
    let (source, subject) = (input.source.trim(), input.subject.trim());
    if source.is_empty() || subject.is_empty() {
        return Err(DomainError::rejected("Say who it came from and what it is about."));
    }
    let route = input.related_prisoner_id.as_deref().filter(|p| !p.is_empty()).map(|p| format!("/prisoners/{p}"));
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO inbox_items (id, kind, origin, source, subject, body, related_type, related_id, related_route, required_permission, created_at, recorded_by)
         VALUES (?, 'communication', 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(source)
    .bind(subject)
    .bind(input.body.as_deref().map(str::trim).filter(|b| !b.is_empty()))
    .bind(route.as_ref().map(|_| "prisoner"))
    .bind(input.related_prisoner_id.as_deref().filter(|p| !p.is_empty()))
    .bind(&route)
    .bind(perm::PRISONER_READ)
    .bind(now_ms())
    .bind(actor.officer_id.as_deref())
    .execute(&mut *conn)
    .await?;
    audit::record(conn, actor, AuditEntry::new("inbox.recorded", "inbox_item", Some(&id)).reason(subject)).await?;
    Ok(id)
}

/// An item that happened once. Recorded on the caller's transaction so it
/// commits with the change that caused it.
pub struct Event<'a> {
    pub kind: &'a str,
    pub origin: &'a str,
    pub source: &'a str,
    pub subject: &'a str,
    pub body: Option<&'a str>,
    pub route: Option<&'a str>,
    pub permission: Option<&'a str>,
}

pub async fn notify(conn: &mut SqliteConnection, event: Event<'_>) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO inbox_items (id, kind, origin, source, subject, body, related_route, required_permission, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(event.kind)
    .bind(event.origin)
    .bind(event.source)
    .bind(event.subject)
    .bind(event.body)
    .bind(event.route)
    .bind(event.permission)
    .bind(now_ms())
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// A condition that is true right now.
struct Derived {
    key: String,
    kind: &'static str,
    source: &'static str,
    subject: String,
    body: Option<String>,
    route: Option<String>,
    permission: &'static str,
}

const RESOLVED: &str = "No longer applies";

/// Brings the derived items in line with the facility's current state:
/// conditions that now hold are opened (or re-opened), and open items whose
/// condition has ended are closed with "No longer applies". At most once every
/// 45 seconds unless forced, so polling the unread count stays cheap.
pub async fn refresh_local(pool: &SqlitePool, force: bool) -> Result<(), sqlx::Error> {
    let now = now_ms();
    let last = LAST_REFRESH.load(Ordering::Relaxed);
    if !force && now - last < REFRESH_EVERY_MS {
        return Ok(());
    }
    LAST_REFRESH.store(now, Ordering::Relaxed);

    let head_office: bool = sqlx::query_scalar("SELECT is_head_office FROM hq_config WHERE id = 'default'").fetch_optional(pool).await?.unwrap_or(false);
    let mut live: Vec<Derived> = Vec::new();

    if !head_office {
        for o in obligations::derive(pool, now).await? {
            if o.group != "exception" && o.due_at.is_none_or(|due| due > now) {
                continue;
            }
            live.push(Derived {
                key: format!("obligation:{}", o.key),
                kind: "obligation",
                source: "Obligations",
                subject: o.title.clone(),
                body: o.detail.clone(),
                route: o.prisoner_id.as_ref().map(|id| format!("/prisoners/{id}")).or_else(|| Some("/".to_string())),
                permission: perm::PRISONER_READ,
            });
        }
        if let Some(status) = connectivity::status(pool).await.ok() {
            match status.state.as_str() {
                "offline" => live.push(Derived {
                    key: "connection:offline".into(),
                    kind: "connection",
                    source: "Head Office connection",
                    subject: "Head Office cannot be reached".into(),
                    body: Some(format!(
                        "Work here carries on. {} to send will go out by themselves when the connection returns.",
                        match status.pending.total {
                            1 => "1 change".to_string(),
                            n => format!("{n} changes"),
                        }
                    )),
                    route: Some("/settings?tab=network".into()),
                    permission: perm::NODE_MANAGE,
                }),
                "needs_attention" | "rejected" => live.push(Derived {
                    key: "connection:attention".into(),
                    kind: "connection",
                    source: "Head Office connection",
                    subject: "The Head Office connection needs attention".into(),
                    body: status.last_error.clone(),
                    route: Some("/settings?tab=network".into()),
                    permission: perm::NODE_MANAGE,
                }),
                _ => {}
            }
        }
        let backup: Option<(Option<String>, i64, Option<i64>, Option<String>)> = sqlx::query_as(
            "SELECT backup_dir, backup_interval_hours, last_backup_at, last_backup_status FROM node_config WHERE id = 'default'",
        )
        .fetch_optional(pool)
        .await?;
        if let Some((Some(_dir), interval, last_at, status)) = backup {
            let overdue = last_at.is_none_or(|at| now - at > interval * 2 * 3_600_000);
            if status.as_deref() == Some("error") || overdue {
                live.push(Derived {
                    key: "backup:overdue".into(),
                    kind: "backup",
                    source: "Backups",
                    subject: if status.as_deref() == Some("error") { "The last backup failed".into() } else { "The scheduled backup is overdue".into() },
                    body: Some("A facility's records are only as safe as its latest backup.".into()),
                    route: Some("/settings?tab=node".into()),
                    permission: perm::NODE_MANAGE,
                });
            }
        }
    } else {
        let requests: Vec<(String, String)> = sqlx::query_as(
            "SELECT r.id, COALESCE(f.name, 'A facility') FROM facility_connection_requests r LEFT JOIN facilities f ON f.id = r.facility_id WHERE r.status = 'pending'",
        )
        .fetch_all(pool)
        .await?;
        for (id, name) in requests {
            live.push(Derived {
                key: format!("connection-request:{id}"),
                kind: "facility_request",
                source: "Facilities",
                subject: format!("{name} asks to connect"),
                body: Some("Review the request and approve or reject it.".into()),
                route: Some("/facilities".into()),
                permission: perm::HQ_NETWORK_MANAGE,
            });
        }
    }

    let mut tx = crate::db::begin_write(pool).await?;
    for item in &live {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO inbox_items (id, kind, origin, source, subject, body, related_route, required_permission, dedupe_key, created_at)
             VALUES (?, ?, 'local', ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (dedupe_key) DO UPDATE SET subject = excluded.subject, body = excluded.body, related_route = excluded.related_route",
        )
        .bind(&id)
        .bind(item.kind)
        .bind(item.source)
        .bind(&item.subject)
        .bind(&item.body)
        .bind(&item.route)
        .bind(item.permission)
        .bind(&item.key)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        // A condition that came back after it was closed for ending is a new
        // occurrence: open it again as unread for everyone.
        let reopened = sqlx::query(
            "UPDATE inbox_items SET status = 'new', actioned_at = NULL, actioned_by = NULL, resolution = NULL, created_at = ?
             WHERE dedupe_key = ? AND status = 'actioned' AND resolution = ? AND actioned_by IS NULL",
        )
        .bind(now)
        .bind(&item.key)
        .bind(RESOLVED)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if reopened > 0 {
            sqlx::query("DELETE FROM inbox_reads WHERE item_id = (SELECT id FROM inbox_items WHERE dedupe_key = ?)").bind(&item.key).execute(&mut *tx).await?;
        }
    }
    let keys = serde_json::to_string(&live.iter().map(|d| d.key.as_str()).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".into());
    sqlx::query(
        "UPDATE inbox_items SET status = 'actioned', actioned_at = ?, resolution = ?
         WHERE dedupe_key IS NOT NULL AND status IN ('new', 'acknowledged') AND dedupe_key NOT IN (SELECT value FROM json_each(?))",
    )
    .bind(now)
    .bind(RESOLVED)
    .bind(keys)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::officers::{self, CreateOfficerInput, Officer, ProfileInput};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        pool
    }

    async fn officer(pool: &SqlitePool, admin: Option<&Actor>, badge: &str, role: &str) -> (Officer, Actor) {
        let mut tx = pool.begin().await.unwrap();
        let created = match admin {
            None => officers::create_first_admin(&mut tx, badge, badge, "correct-horse").await.unwrap(),
            Some(actor) => officers::create_officer(
                &mut tx,
                actor,
                CreateOfficerInput { badge_number: badge.into(), name: badge.into(), password: "another-password".into(), role: role.into(), profile: ProfileInput::default(), ..Default::default() },
            )
            .await
            .unwrap(),
        };
        tx.commit().await.unwrap();
        let actor = Actor::officer(created.id.clone(), created.badge_number.clone(), created.name.clone(), created.role.clone(), created.is_admin, None);
        (created, actor)
    }

    async fn record(pool: &SqlitePool, actor: &Actor, subject: &str) -> String {
        let mut tx = pool.begin().await.unwrap();
        let id = record_manual(&mut tx, actor, ManualInput { source: "High Court, Kampala".into(), subject: subject.into(), body: None, related_prisoner_id: None }).await.unwrap();
        tx.commit().await.unwrap();
        id
    }

    #[tokio::test]
    async fn an_item_is_unread_per_officer_and_opening_it_is_audited_once() {
        let pool = pool().await;
        let (_, oic) = officer(&pool, None, "OIC-1", "oic").await;
        let (_, clerk) = officer(&pool, Some(&oic), "R-1", "records").await;
        let id = record(&pool, &oic, "Production order").await;

        assert_eq!(unread_count(&pool, &oic).await.unwrap(), 1);
        assert_eq!(unread_count(&pool, &clerk).await.unwrap(), 1, "each officer has their own unread state");

        for _ in 0..2 {
            let mut tx = pool.begin().await.unwrap();
            mark_read(&mut tx, &clerk, &id).await.unwrap();
            tx.commit().await.unwrap();
        }
        assert_eq!(unread_count(&pool, &clerk).await.unwrap(), 0);
        assert_eq!(unread_count(&pool, &oic).await.unwrap(), 1, "the other officer still has it unread");

        let reads = audit::list(&pool, &audit::AuditFilter { entity_id: Some(id.clone()), ..Default::default() }).await.unwrap();
        assert_eq!(reads.iter().filter(|r| r.action == "inbox.read").count(), 1, "the first opening is audited, not every one");
        let detail = get(&pool, &oic, &id).await.unwrap().unwrap();
        assert_eq!(detail.reads.len(), 1);
    }

    #[tokio::test]
    async fn an_item_is_invisible_to_an_officer_without_its_permission() {
        let pool = pool().await;
        let (_, oic) = officer(&pool, None, "OIC-1", "oic").await;
        let (_, admin_only) = officer(&pool, Some(&oic), "ADM-1", "facility_admin").await;
        let id = record(&pool, &oic, "Production order").await;

        assert!(list(&pool, &admin_only).await.unwrap().iter().all(|i| i.id != id));
        assert!(get(&pool, &admin_only, &id).await.unwrap().is_none());
        let mut tx = pool.begin().await.unwrap();
        assert!(mark_read(&mut tx, &admin_only, &id).await.is_err(), "an item that is not visible cannot be opened");
    }

    #[tokio::test]
    async fn acting_on_an_item_closes_it_and_a_closed_item_stays_closed() {
        let pool = pool().await;
        let (_, oic) = officer(&pool, None, "OIC-1", "oic").await;
        let id = record(&pool, &oic, "Production order").await;

        let mut tx = pool.begin().await.unwrap();
        set_status(&mut tx, &oic, &id, "acknowledged", None).await.unwrap();
        set_status(&mut tx, &oic, &id, "actioned", Some("Prisoner produced")).await.unwrap();
        assert!(set_status(&mut tx, &oic, &id, "dismissed", None).await.is_err());
        assert!(set_status(&mut tx, &oic, &id, "nonsense", None).await.is_err());
        tx.commit().await.unwrap();

        let item = get(&pool, &oic, &id).await.unwrap().unwrap().item;
        assert_eq!(item.status, "actioned");
        assert_eq!(item.actioned_by_name.as_deref(), Some("OIC-1"));
        assert_eq!(item.resolution.as_deref(), Some("Prisoner produced"));
        assert_eq!(unread_count(&pool, &oic).await.unwrap(), 0, "a closed item no longer counts");
    }

    #[tokio::test]
    async fn a_derived_item_opens_with_its_condition_and_closes_when_it_ends() {
        let pool = pool().await;
        let (_, oic) = officer(&pool, None, "OIC-1", "oic").await;
        // A backup schedule that has never produced a backup.
        sqlx::query("UPDATE node_config SET backup_dir = '/somewhere', backup_interval_hours = 24, last_backup_at = NULL WHERE id = 'default'").execute(&pool).await.unwrap();

        refresh_local(&pool, true).await.unwrap();
        refresh_local(&pool, true).await.unwrap();
        let open: Vec<_> = list(&pool, &oic).await.unwrap().into_iter().filter(|i| i.kind == "backup").collect();
        assert_eq!(open.len(), 1, "refreshing never duplicates a derived item");
        assert_eq!(open[0].status, "new");

        sqlx::query("UPDATE node_config SET last_backup_at = ?, last_backup_status = 'ok' WHERE id = 'default'").bind(now_ms()).execute(&pool).await.unwrap();
        refresh_local(&pool, true).await.unwrap();
        let closed = list(&pool, &oic).await.unwrap().into_iter().find(|i| i.kind == "backup").unwrap();
        assert_eq!((closed.status.as_str(), closed.resolution.as_deref()), ("actioned", Some("No longer applies")));
        assert_eq!(unread_count(&pool, &oic).await.unwrap(), 0);

        // The condition returns: a new occurrence, unread again.
        sqlx::query("UPDATE node_config SET last_backup_at = 1 WHERE id = 'default'").execute(&pool).await.unwrap();
        refresh_local(&pool, true).await.unwrap();
        assert_eq!(unread_count(&pool, &oic).await.unwrap(), 1);
    }
}
