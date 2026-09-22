//! Orders the court makes, as printable documents. A draft holds the facts of the
//! order (who, until when, why); issuing renders the wording once, gives it a
//! reference and a SHA-256 of exactly what was rendered, and freezes it. The
//! wording lives here, not in the screen, so the page that is printed is the
//! page that was hashed.
//!
//! The wording is a working template, not the Judiciary's prescribed form:
//! that has not been researched yet (docs/courts/PROPOSAL.md, section 12), and
//! the screens say so.

use chrono::{DateTime, Datelike, FixedOffset};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{check_date, clean, invalid, DomainError};
use pleadli_node_core::db::begin_write;

pub const KINDS: [&str; 4] = ["adjournment", "remand", "release", "general"];

/// The facts an order is made from. Which are required depends on the kind.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct OrderFields {
    pub accused: Option<String>,
    pub prison: Option<String>,
    pub remand_until: Option<i64>,
    pub next_date: Option<i64>,
    pub next_purpose: Option<String>,
    pub reason: Option<String>,
    pub body: Option<String>,
}

/// The order as it prints.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderContent {
    pub court: String,
    pub heading: String,
    pub case_number: String,
    pub case_title: String,
    pub paragraphs: Vec<String>,
    pub date: String,
    pub signatory: String,
    pub signatory_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub case_id: String,
    pub sitting_id: Option<String>,
    pub kind: String,
    pub title: String,
    pub fields: OrderFields,
    pub status: String,
    pub reference: Option<String>,
    pub content: Option<OrderContent>,
    pub content_sha256: Option<String>,
    /// Whether the stored wording still hashes to what was recorded at issue.
    pub intact: Option<bool>,
    pub issued_at: Option<i64>,
    pub issued_by: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub court_number: String,
    pub case_title: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OrderSummary {
    pub id: String,
    pub case_id: String,
    pub kind: String,
    pub title: String,
    pub status: String,
    pub reference: Option<String>,
    pub issued_at: Option<i64>,
    pub updated_at: i64,
    pub court_number: String,
    pub case_title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrderInput {
    pub case_id: String,
    pub sitting_id: Option<String>,
    pub kind: String,
    pub title: Option<String>,
    #[serde(default)]
    pub fields: OrderFields,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateOrderInput {
    pub title: Option<String>,
    #[serde(default)]
    pub fields: OrderFields,
}

#[derive(FromRow)]
struct Row {
    id: String,
    case_id: String,
    sitting_id: Option<String>,
    kind: String,
    title: String,
    fields: String,
    status: String,
    reference: Option<String>,
    content: Option<String>,
    content_sha256: Option<String>,
    issued_at: Option<i64>,
    issued_by: Option<String>,
    created_at: i64,
    updated_at: i64,
    court_number: String,
    case_title: String,
}

impl Row {
    fn into_order(self) -> Order {
        let intact = match (&self.content, &self.content_sha256) {
            (Some(content), Some(hash)) => Some(&hex(content.as_bytes()) == hash),
            _ => None,
        };
        Order {
            fields: serde_json::from_str(&self.fields).unwrap_or_default(),
            content: self.content.as_deref().and_then(|c| serde_json::from_str(c).ok()),
            id: self.id,
            case_id: self.case_id,
            sitting_id: self.sitting_id,
            kind: self.kind,
            title: self.title,
            status: self.status,
            reference: self.reference,
            content_sha256: self.content_sha256,
            intact,
            issued_at: self.issued_at,
            issued_by: self.issued_by,
            created_at: self.created_at,
            updated_at: self.updated_at,
            court_number: self.court_number,
            case_title: self.case_title,
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

const SELECT: &str = "SELECT o.id, o.case_id, o.sitting_id, o.kind, o.title, o.fields, o.status, o.reference, o.content, o.content_sha256,
        o.issued_at, o.issued_by, o.created_at, o.updated_at, c.court_number, c.title AS case_title
    FROM orders o JOIN cases c ON c.id = o.case_id";

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Order>, sqlx::Error> {
    let row = sqlx::query_as::<_, Row>(sqlx::AssertSqlSafe(format!("{SELECT} WHERE o.id = ?"))).bind(id).fetch_optional(pool).await?;
    Ok(row.map(Row::into_order))
}

/// `status` is `draft`, `issued` or empty for both.
pub async fn list(pool: &SqlitePool, status: &str, case_id: &str, limit: i64) -> Result<Vec<OrderSummary>, sqlx::Error> {
    sqlx::query_as::<_, OrderSummary>(
        "SELECT o.id, o.case_id, o.kind, o.title, o.status, o.reference, o.issued_at, o.updated_at, c.court_number, c.title AS case_title
         FROM orders o JOIN cases c ON c.id = o.case_id
         WHERE (?1 = '' OR o.status = ?1) AND (?2 = '' OR o.case_id = ?2)
         ORDER BY o.updated_at DESC LIMIT ?3",
    )
    .bind(status)
    .bind(case_id)
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}

fn default_title(kind: &str) -> &'static str {
    match kind {
        "adjournment" => "Order of adjournment",
        "remand" => "Remand order",
        "release" => "Release order",
        _ => "Order",
    }
}

pub async fn create(pool: &SqlitePool, input: CreateOrderInput) -> Result<Order, DomainError> {
    if !KINDS.contains(&input.kind.as_str()) {
        return invalid("That is not a kind of order.");
    }
    let mut fields = input.fields;
    let mut tx = begin_write(pool).await?;
    let known: Option<String> = sqlx::query_scalar("SELECT id FROM cases WHERE id = ?").bind(&input.case_id).fetch_optional(&mut *tx).await?;
    if known.is_none() {
        return Err(DomainError::NotFound("Case not found.".to_string()));
    }
    if let Some(sitting_id) = &input.sitting_id {
        let owner: Option<String> = sqlx::query_scalar("SELECT case_id FROM sittings WHERE id = ?").bind(sitting_id).fetch_optional(&mut *tx).await?;
        if owner.as_deref() != Some(input.case_id.as_str()) {
            return invalid("That sitting is not in this case.");
        }
        // An adjournment order starts from what was recorded when the sitting
        // was adjourned, so the same facts are not typed twice.
        if input.kind == "adjournment" {
            let recorded = sqlx::query_as::<_, (String, Option<String>, Option<i64>, Option<String>)>(
                "SELECT a.reason, a.note, a.next_date, s.purpose FROM adjournments a LEFT JOIN sittings s ON s.id = a.next_sitting_id WHERE a.sitting_id = ?",
            )
            .bind(sitting_id)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some((reason, note, next_date, next_purpose)) = recorded {
                fields.next_date = fields.next_date.or(next_date);
                fields.next_purpose = fields.next_purpose.or(next_purpose);
                fields.reason = fields.reason.or_else(|| Some(reason_phrase(&reason, note.as_deref())));
            }
        }
    }
    let id = Uuid::new_v4().to_string();
    let title = clean(input.title).unwrap_or_else(|| default_title(&input.kind).to_string());
    sqlx::query("INSERT INTO orders (id, case_id, sitting_id, kind, title, fields) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&input.case_id)
        .bind(&input.sitting_id)
        .bind(&input.kind)
        .bind(&title)
        .bind(serde_json::to_string(&fields).unwrap_or_else(|_| "{}".to_string()))
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("order_drafted").subject("order", &id).scope(&input.case_id).detail(&input.kind)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

async fn draft(conn: &mut sqlx::SqliteConnection, id: &str) -> Result<(String, String, String), DomainError> {
    let found = sqlx::query_as::<_, (String, String, String)>("SELECT case_id, kind, status FROM orders WHERE id = ?").bind(id).fetch_optional(&mut *conn).await?;
    let Some((case_id, kind, status)) = found else { return Err(DomainError::NotFound("Order not found.".to_string())) };
    if status != "draft" {
        return invalid("An issued order cannot be changed. Make a new order to replace it.");
    }
    Ok((case_id, kind, status))
}

pub async fn update(pool: &SqlitePool, id: &str, input: UpdateOrderInput) -> Result<Order, DomainError> {
    let mut tx = begin_write(pool).await?;
    let (case_id, kind, _) = draft(&mut tx, id).await?;
    let title = clean(input.title).unwrap_or_else(|| default_title(&kind).to_string());
    sqlx::query("UPDATE orders SET title = ?, fields = ?, updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
        .bind(&title)
        .bind(serde_json::to_string(&input.fields).unwrap_or_else(|_| "{}".to_string()))
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("order_edited").subject("order", id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn discard(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let mut tx = begin_write(pool).await?;
    let (case_id, _, _) = draft(&mut tx, id).await?;
    sqlx::query("DELETE FROM orders WHERE id = ?").bind(id).execute(&mut *tx).await?;
    audit::record(&mut tx, Entry::new("order_discarded").subject("order", id).scope(&case_id)).await?;
    tx.commit().await?;
    Ok(())
}

/// East Africa Time, UTC+3, which Uganda keeps all year.
fn eat() -> FixedOffset {
    FixedOffset::east_opt(3 * 3600).expect("a valid offset")
}

fn eat_time(ms: i64) -> Option<DateTime<FixedOffset>> {
    DateTime::from_timestamp_millis(ms).map(|t| t.with_timezone(&eat()))
}

fn long_date(ms: i64) -> String {
    eat_time(ms).map(|t| t.format("%-d %B %Y").to_string()).unwrap_or_default()
}

fn purpose_phrase(purpose: &str) -> &'static str {
    match purpose {
        "mention" => "mention",
        "plea" => "plea",
        "bail_application" => "a bail application",
        "hearing" => "hearing",
        "ruling" => "ruling",
        "judgment" => "judgment",
        "sentencing" => "sentencing",
        _ => "further directions",
    }
}

fn reason_phrase(reason: &str, note: Option<&str>) -> String {
    match reason {
        "witness_absent" => "a witness was absent",
        "prisoner_not_produced" => "the accused was not produced from custody",
        "file_incomplete" => "the file was not complete",
        "counsel_absent" => "counsel was absent",
        "court_not_sitting" => "the court was not sitting",
        _ => return note.unwrap_or("other cause").to_string(),
    }
    .to_string()
}

fn need(value: &Option<String>, what: &str) -> Result<String, DomainError> {
    match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        Some(v) => Ok(v.to_string()),
        None => Err(DomainError::Invalid(format!("{what} is needed before this order can be issued."))),
    }
}

/// The wording of each kind, or the reason it cannot be issued yet.
fn paragraphs(kind: &str, title: &str, fields: &OrderFields, offence: Option<&str>) -> Result<(String, Vec<String>), DomainError> {
    match kind {
        "adjournment" => {
            let mut out = Vec::new();
            match fields.next_date {
                Some(next) => {
                    check_date(next, "The next date")?;
                    let purpose = purpose_phrase(fields.next_purpose.as_deref().unwrap_or("other"));
                    out.push(format!("This matter is adjourned to {} for {purpose}.", long_date(next)));
                }
                None => out.push("This matter is adjourned. The next date will be fixed by the court.".to_string()),
            }
            if let Some(reason) = fields.reason.as_deref().map(str::trim).filter(|r| !r.is_empty()) {
                out.push(format!("The reason for the adjournment: {reason}."));
            }
            Ok(("ORDER OF ADJOURNMENT".to_string(), out))
        }
        "remand" => {
            let accused = need(&fields.accused, "The name of the accused")?;
            let prison = need(&fields.prison, "The place of custody")?;
            let Some(until) = fields.remand_until else {
                return invalid("The date the remand runs to is needed before this order can be issued.");
            };
            check_date(until, "The remand date")?;
            let mut out = Vec::new();
            if let Some(offence) = offence {
                out.push(format!("{accused} is charged with {offence}."));
            }
            out.push(format!("{accused} is remanded in custody at {prison} until {}.", long_date(until)));
            out.push(format!("{accused} shall be produced before this court on that date."));
            Ok(("REMAND ORDER".to_string(), out))
        }
        "release" => {
            let accused = need(&fields.accused, "The name of the accused")?;
            let reason = need(&fields.reason, "The reason for release")?;
            Ok((
                "RELEASE ORDER".to_string(),
                vec![format!("{accused} is to be released from custody forthwith, unless lawfully held on another matter."), format!("Reason: {reason}.")],
            ))
        }
        _ => {
            let body = need(&fields.body, "The text of the order")?;
            let out: Vec<String> = body.split("\n").map(str::trim).filter(|p| !p.is_empty()).map(str::to_string).collect();
            Ok((title.trim().to_uppercase(), out))
        }
    }
}

/// Renders the wording, references and freezes a draft. A named judicial
/// officer and court are required: an order is signed and headed with them.
pub async fn issue(pool: &SqlitePool, id: &str) -> Result<Order, DomainError> {
    let mut tx = begin_write(pool).await?;
    let found = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT o.case_id, o.kind, o.title, o.fields, o.status FROM orders o WHERE o.id = ?",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((case_id, kind, title, fields_json, status)) = found else { return Err(DomainError::NotFound("Order not found.".to_string())) };
    if status != "draft" {
        return invalid("This order is already issued.");
    }
    let profile = sqlx::query_as::<_, (String, Option<String>, Option<String>)>("SELECT name, title, court_name FROM bench_profile WHERE id = 'default'")
        .fetch_optional(&mut *tx)
        .await?;
    let Some((signatory, signatory_title, court_name)) = profile else {
        return invalid("Set your name and court in Settings first: an order is signed and headed with them.");
    };
    let Some(court) = court_name.filter(|c| !c.trim().is_empty()) else {
        return invalid("Set the name of your court in Settings first: an order is headed with it.");
    };
    let (case_number, case_title, offence) = sqlx::query_as::<_, (String, String, Option<String>)>("SELECT court_number, title, offence FROM cases WHERE id = ?")
        .bind(&case_id)
        .fetch_one(&mut *tx)
        .await?;
    let fields: OrderFields = serde_json::from_str(&fields_json).unwrap_or_default();
    let (heading, paragraphs) = paragraphs(&kind, &title, &fields, offence.as_deref())?;

    let now = chrono::Utc::now().timestamp_millis();
    let year = eat_time(now).map(|t| t.year()).unwrap_or(1970);
    let issued_in_year: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders WHERE status = 'issued' AND reference LIKE ?")
        .bind(format!("ORD/{year}/%"))
        .fetch_one(&mut *tx)
        .await?;
    let reference = format!("ORD/{year}/{:04}", issued_in_year + 1);

    let content = OrderContent { court, heading, case_number, case_title, paragraphs, date: long_date(now), signatory: signatory.clone(), signatory_title };
    let text = serde_json::to_string(&content).map_err(|_| DomainError::Invalid("The order could not be prepared.".to_string()))?;
    sqlx::query("UPDATE orders SET status = 'issued', reference = ?, content = ?, content_sha256 = ?, issued_at = ?, issued_by = ?, updated_at = ? WHERE id = ?")
        .bind(&reference)
        .bind(&text)
        .bind(hex(text.as_bytes()))
        .bind(now)
        .bind(&signatory)
        .bind(now)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    audit::record(&mut tx, Entry::new("order_issued").subject("order", id).scope(&case_id).detail(&reference)).await?;
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}
