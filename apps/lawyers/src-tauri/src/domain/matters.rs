use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_timestamp, clean, invalid, DomainError};
use super::matter_types;
use super::tasks;
use pleadli_node_core::db::begin_write;

pub const ENGAGEMENTS: [&str; 4] = ["private", "state_appointed", "pro_bono", "legal_aid_clinic"];
pub const LEVELS: [&str; 4] = ["magistrate", "high", "appeal", "other"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Matter {
    pub id: String,
    pub client_id: String,
    pub title: String,
    pub our_ref: Option<String>,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub court_level: Option<String>,
    pub offence: Option<String>,
    pub engagement: String,
    pub appointed_on: Option<i64>,
    pub matter_type: String,
    pub stage: String,
    pub status: String,
    pub outcome: Option<String>,
    pub closed_at: Option<i64>,
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A row of the matters list: the matter, its client, and what is next.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct MatterSummary {
    pub id: String,
    pub client_id: String,
    pub client_name: String,
    pub title: String,
    pub our_ref: Option<String>,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub court_level: Option<String>,
    pub offence: Option<String>,
    pub engagement: String,
    pub matter_type: String,
    pub stage: String,
    pub status: String,
    pub outcome: Option<String>,
    pub next_hearing_at: Option<i64>,
    pub open_tasks: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatterInput {
    pub client_id: String,
    pub title: String,
    pub our_ref: Option<String>,
    pub court_number: Option<String>,
    pub court_name: Option<String>,
    pub court_level: Option<String>,
    pub offence: Option<String>,
    pub engagement: String,
    pub appointed_on: Option<i64>,
    pub notes: Option<String>,
    /// Chosen when the matter is opened and fixed after: a matter's stages
    /// belong to its type. Defaults to criminal defence for older callers.
    #[serde(default)]
    pub matter_type: Option<String>,
}

struct Checked {
    title: String,
    our_ref: Option<String>,
    level: Option<String>,
    appointed_on: Option<i64>,
}

fn check(input: &MatterInput) -> Result<Checked, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return invalid("A matter needs a title, for example the State against your client.");
    }
    if !ENGAGEMENTS.contains(&input.engagement.as_str()) {
        return invalid("Say how you came to act: privately, appointed by the state, pro bono, or through a legal aid clinic.");
    }
    let level = clean(input.court_level.clone());
    if let Some(l) = &level {
        if !LEVELS.contains(&l.as_str()) {
            return invalid("That is not a level of court.");
        }
    }
    let appointed_on = if input.engagement == "state_appointed" { input.appointed_on } else { None };
    if let Some(day) = appointed_on {
        check_timestamp(day, "The date of appointment")?;
    }
    Ok(Checked { title, our_ref: clean(input.our_ref.clone()), level, appointed_on })
}

const COLUMNS: &str = "id, client_id, title, our_ref, court_number, court_name, court_level, offence, engagement, appointed_on, matter_type, stage, status, outcome, closed_at, notes, created_at, updated_at";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Matter>, sqlx::Error> {
    sqlx::query_as::<_, Matter>(sqlx::AssertSqlSafe(format!("SELECT {COLUMNS} FROM matters WHERE id = ?"))).bind(id).fetch_optional(pool).await
}

/// `view` is `open`, `no_hearing` (open, with no hearing listed), `closed`, or
/// empty for every matter. `query` matches the title, references, court number,
/// offence or the client's name.
pub async fn list(pool: &SqlitePool, query: &str, view: &str, matter_type: &str, limit: i64) -> Result<Vec<MatterSummary>, sqlx::Error> {
    let filter = match view {
        "open" => "AND m.status = 'open'",
        "closed" => "AND m.status = 'closed'",
        "no_hearing" => "AND m.status = 'open' AND m.matter_type NOT IN ('land_transaction', 'company_matter', 'advice') AND NOT EXISTS (SELECT 1 FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled')",
        _ => "",
    };
    let like = format!("%{}%", query.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    sqlx::query_as::<_, MatterSummary>(sqlx::AssertSqlSafe(format!(
        "SELECT m.id, m.client_id, c.name AS client_name, m.title, m.our_ref, m.court_number, m.court_name, m.court_level, m.offence, m.engagement, m.matter_type, m.stage, m.status, m.outcome,
            (SELECT MIN(h.at) FROM hearings h WHERE h.matter_id = m.id AND h.status = 'scheduled') AS next_hearing_at,
            (SELECT COUNT(*) FROM tasks t WHERE t.matter_id = m.id AND t.done_at IS NULL) AS open_tasks,
            m.created_at
         FROM matters m JOIN clients c ON c.id = m.client_id
         WHERE (m.title LIKE ?1 ESCAPE '\\' OR COALESCE(m.our_ref, '') LIKE ?1 ESCAPE '\\' OR COALESCE(m.court_number, '') LIKE ?1 ESCAPE '\\'
                OR COALESCE(m.offence, '') LIKE ?1 ESCAPE '\\' OR c.name LIKE ?1 ESCAPE '\\')
         AND (?3 = '' OR m.matter_type = ?3)
         {filter}
         ORDER BY m.created_at DESC LIMIT ?2"
    )))
    .bind(like)
    .bind(limit.clamp(1, 500))
    .bind(matter_type)
    .fetch_all(pool)
    .await
}

async fn ref_is_free(pool: &SqlitePool, our_ref: &str, except: Option<&str>) -> Result<bool, sqlx::Error> {
    let taken: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM matters WHERE our_ref = ? COLLATE NOCASE AND id <> ?").bind(our_ref).bind(except.unwrap_or("")).fetch_one(pool).await?;
    Ok(taken == 0)
}

pub async fn create(pool: &SqlitePool, input: MatterInput) -> Result<Matter, DomainError> {
    let c = check(&input)?;
    let kind = matter_types::find(input.matter_type.as_deref().unwrap_or("criminal_defence")).ok_or_else(|| DomainError::Invalid("That kind of matter is not known.".to_string()))?;
    let enabled: Option<String> = sqlx::query_scalar("SELECT usage FROM usages WHERE usage = ?").bind(kind.usage).fetch_optional(pool).await?;
    if enabled.is_none() {
        return invalid("This practice does not do that kind of work yet. Switch it on in Settings, Practice.");
    }
    if let Some(r) = &c.our_ref {
        if !ref_is_free(pool, r, None).await? {
            return invalid("Another matter already has that reference.");
        }
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = begin_write(pool).await?;
    let client: Option<String> = sqlx::query_scalar("SELECT id FROM clients WHERE id = ?").bind(&input.client_id).fetch_optional(&mut *tx).await?;
    if client.is_none() {
        return Err(DomainError::NotFound("Client not found.".to_string()));
    }
    sqlx::query("INSERT INTO matters (id, client_id, title, our_ref, court_number, court_name, court_level, offence, engagement, appointed_on, notes, matter_type, stage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.client_id)
        .bind(&c.title)
        .bind(&c.our_ref)
        .bind(clean(input.court_number))
        .bind(clean(input.court_name))
        .bind(&c.level)
        .bind(clean(input.offence))
        .bind(&input.engagement)
        .bind(c.appointed_on)
        .bind(clean(input.notes))
        .bind(kind.id)
        .bind(kind.stages[0])
        .execute(&mut *tx)
        .await?;
    tasks::apply_engagement_rules(&mut tx, &id, &input.engagement, c.appointed_on).await?;
    audit::record(&mut tx, Entry::new("matter_opened").subject("matter", &id).scope(&id).detail(format!("{} {}", kind.id, input.engagement))).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn update(pool: &SqlitePool, id: &str, input: MatterInput) -> Result<Matter, DomainError> {
    let c = check(&input)?;
    if let Some(r) = &c.our_ref {
        if !ref_is_free(pool, r, Some(id)).await? {
            return invalid("Another matter already has that reference.");
        }
    }
    let mut tx = begin_write(pool).await?;
    let client: Option<String> = sqlx::query_scalar("SELECT id FROM clients WHERE id = ?").bind(&input.client_id).fetch_optional(&mut *tx).await?;
    if client.is_none() {
        return Err(DomainError::NotFound("Client not found.".to_string()));
    }
    let done = sqlx::query(
        "UPDATE matters SET client_id = ?, title = ?, our_ref = ?, court_number = ?, court_name = ?, court_level = ?, offence = ?, engagement = ?, appointed_on = ?, notes = ?,
            updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(&input.client_id)
    .bind(&c.title)
    .bind(&c.our_ref)
    .bind(clean(input.court_number))
    .bind(clean(input.court_name))
    .bind(&c.level)
    .bind(clean(input.offence))
    .bind(&input.engagement)
    .bind(c.appointed_on)
    .bind(clean(input.notes))
    .bind(id)
    .execute(&mut *tx)
    .await?;
    if done.rows_affected() == 0 {
        return Err(DomainError::NotFound("Matter not found.".to_string()));
    }
    tasks::apply_engagement_rules(&mut tx, id, &input.engagement, c.appointed_on).await?;
    audit::record(&mut tx, Entry::new("matter_updated").subject("matter", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// A closed matter is a closed record: it takes no hearing, note or time until
/// it is reopened.
pub(super) async fn require_open(conn: &mut sqlx::SqliteConnection, matter_id: &str) -> Result<(String, Option<i64>), DomainError> {
    let found = sqlx::query_as::<_, (String, String, Option<i64>)>("SELECT status, engagement, appointed_on FROM matters WHERE id = ?").bind(matter_id).fetch_optional(&mut *conn).await?;
    match found {
        None => Err(DomainError::NotFound("Matter not found.".to_string())),
        Some((status, engagement, appointed)) if status == "open" => Ok((engagement, appointed)),
        Some(_) => invalid("This matter is closed. Reopen it to change it."),
    }
}

pub async fn close(pool: &SqlitePool, id: &str, outcome: &str) -> Result<Matter, DomainError> {
    let outcome = outcome.trim();
    if outcome.is_empty() {
        return invalid("Record how the matter ended.");
    }
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, id).await?;
    let waiting: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hearings WHERE matter_id = ? AND status = 'scheduled'").bind(id).fetch_one(&mut *tx).await?;
    if waiting > 0 {
        return invalid("Close or cancel the hearings still listed before closing the matter.");
    }
    sqlx::query("UPDATE matters SET status = 'closed', outcome = ?, closed_at = cast(unixepoch('subsecond') * 1000 as integer), updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(outcome)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("matter_closed").subject("matter", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn reopen(pool: &SqlitePool, id: &str) -> Result<Matter, DomainError> {
    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM matters WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match status.as_deref() {
        None => return Err(DomainError::NotFound("Matter not found.".to_string())),
        Some("closed") => {}
        Some(_) => return invalid("This matter is already open."),
    }
    sqlx::query("UPDATE matters SET status = 'open', outcome = NULL, closed_at = NULL, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("matter_reopened").subject("matter", id).scope(id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Moves an open matter to another stage of its own type (the board). Any
/// stage, forward or back: the record says where the work stands, not a
/// one-way pipeline.
pub async fn set_stage(pool: &SqlitePool, id: &str, stage: &str) -> Result<Matter, DomainError> {
    let mut tx = begin_write(pool).await?;
    require_open(&mut tx, id).await?;
    let current: (String, String) = sqlx::query_as("SELECT matter_type, stage FROM matters WHERE id = ?").bind(id).fetch_one(&mut *tx).await?;
    let kind = matter_types::find(&current.0).ok_or_else(|| DomainError::Invalid("This matter's kind is not known.".to_string()))?;
    if !kind.stages.contains(&stage) {
        return invalid("That is not a stage of this kind of matter.");
    }
    if current.1 != stage {
        sqlx::query("UPDATE matters SET stage = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?").bind(stage).bind(id).execute(&mut *tx).await?;
        audit::record(&mut tx, Entry::new("stage_changed").subject("matter", id).scope(id).detail(format!("{} -> {stage}", current.1))).await?;
    }
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
