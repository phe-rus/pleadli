//! Bills of costs for taxation (docs/lawyers/REVIEW-2026-09-30.md, L4). A new
//! bill proposes its items from the matter's own record, priced by the Sixth
//! Schedule (`costs_scale`): the instruction fee from the value of the subject
//! matter, drawing each filed document, attending each hearing that took
//! place, and the disbursements in the ledger. The advocate edits it; at the
//! pre-taxation meeting the agreed amounts are entered (reg. 13A), and after
//! taxation what was allowed. A taxed bill is kept as it was taxed.

use pleadli_node_core::db::begin_write;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqliteConnection, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::costs_scale::{self as scale, drawing_item};
use super::error::{clean, invalid, DomainError};

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BillItem {
    pub id: String,
    pub position: i64,
    pub on_day: Option<i64>,
    pub item_ref: Option<String>,
    pub particulars: String,
    pub disbursement: bool,
    pub claimed: i64,
    pub agreed: Option<i64>,
    pub taxed: Option<i64>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct BillSummary {
    pub id: String,
    pub matter_id: String,
    pub against: String,
    pub subject_value: Option<i64>,
    pub instruction_basis: String,
    pub status: String,
    pub lodged_on: Option<i64>,
    pub pre_taxation_on: Option<i64>,
    pub taxed_on: Option<i64>,
    pub taxing_officer: Option<String>,
    pub created_by: Option<String>,
    pub created_at: i64,
    pub claimed: i64,
    pub taxed: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bill {
    #[serde(flatten)]
    pub summary: BillSummary,
    pub items: Vec<BillItem>,
    /// What item 1 gives for the value and basis on the bill, for reference.
    pub scale_instruction_fee: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewBill {
    pub against: String,
    pub subject_value: Option<i64>,
    pub instruction_basis: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub on_day: Option<i64>,
    pub item_ref: Option<String>,
    pub particulars: String,
    #[serde(default)]
    pub disbursement: bool,
    pub claimed: i64,
    pub agreed: Option<i64>,
    pub taxed: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BillInput {
    pub subject_value: Option<i64>,
    pub instruction_basis: String,
    pub status: String,
    pub lodged_on: Option<i64>,
    pub pre_taxation_on: Option<i64>,
    pub taxed_on: Option<i64>,
    pub taxing_officer: Option<String>,
    pub items: Vec<ItemInput>,
}

/// 12400000 -> "12,400,000", as a bill writes shillings.
fn grouped(n: i64) -> String {
    let digits = n.to_string();
    let mut out = String::new();
    for (i, c) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(c);
    }
    out
}

const SUMMARY: &str = "b.id, b.matter_id, b.against, b.subject_value, b.instruction_basis, b.status, b.lodged_on, b.pre_taxation_on, b.taxed_on, b.taxing_officer, b.created_by, b.created_at,
    (SELECT COALESCE(SUM(claimed), 0) FROM bill_items WHERE bill_id = b.id) AS claimed,
    (SELECT COALESCE(SUM(taxed), 0) FROM bill_items WHERE bill_id = b.id) AS taxed";

pub async fn list(pool: &SqlitePool, matter_id: &str) -> Result<Vec<BillSummary>, sqlx::Error> {
    let sql = format!("SELECT {SUMMARY} FROM bills_of_costs b WHERE b.matter_id = ? ORDER BY b.created_at DESC");
    sqlx::query_as::<_, BillSummary>(sqlx::AssertSqlSafe(sql)).bind(matter_id).fetch_all(pool).await
}

pub async fn get(pool: &SqlitePool, id: &str) -> Result<Option<Bill>, sqlx::Error> {
    let sql = format!("SELECT {SUMMARY} FROM bills_of_costs b WHERE b.id = ?");
    let Some(summary) = sqlx::query_as::<_, BillSummary>(sqlx::AssertSqlSafe(sql)).bind(id).fetch_optional(pool).await? else {
        return Ok(None);
    };
    let items = sqlx::query_as::<_, BillItem>("SELECT id, position, on_day, item_ref, particulars, disbursement, claimed, agreed, taxed FROM bill_items WHERE bill_id = ? ORDER BY position")
        .bind(id)
        .fetch_all(pool)
        .await?;
    let scale_instruction_fee = summary.subject_value.and_then(|v| scale::instruction_fee_for(v, &summary.instruction_basis));
    Ok(Some(Bill { summary, items, scale_instruction_fee }))
}

async fn push(conn: &mut SqliteConnection, bill_id: &str, position: &mut i64, on_day: Option<i64>, item_ref: Option<&str>, particulars: String, disbursement: bool, claimed: i64) -> Result<(), sqlx::Error> {
    *position += 1;
    sqlx::query("INSERT INTO bill_items (id, bill_id, position, on_day, item_ref, particulars, disbursement, claimed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(bill_id)
        .bind(*position)
        .bind(on_day)
        .bind(item_ref)
        .bind(particulars)
        .bind(disbursement)
        .bind(claimed)
        .execute(&mut *conn)
        .await?;
    Ok(())
}

/// A new bill, its items proposed from the matter's record.
pub async fn create(pool: &SqlitePool, matter_id: &str, input: NewBill, by: &str) -> Result<Bill, DomainError> {
    if !["other_side", "client"].contains(&input.against.as_str()) {
        return invalid("A bill is against the other side or against the client.");
    }
    let basis = input.instruction_basis.unwrap_or_else(|| "1_1".into());
    if scale::basis_percent(&basis).is_none() {
        return invalid("Unknown part of item 1.");
    }
    if input.subject_value.is_some_and(|v| v <= 0) {
        return invalid("Give the value of the subject matter in shillings, or leave it empty.");
    }
    let mut tx = begin_write(pool).await?;
    let found: Option<(String, String)> = sqlx::query_as("SELECT matter_type, COALESCE(offence, '') FROM matters WHERE id = ?").bind(matter_id).fetch_optional(&mut *tx).await?;
    let Some((matter_type, _)) = found else {
        return Err(DomainError::NotFound("No such matter.".into()));
    };
    let jurisdiction: Option<String> = sqlx::query_scalar("SELECT jurisdiction FROM installation WHERE id = 'this'").fetch_optional(&mut *tx).await?;
    if jurisdiction.as_deref().unwrap_or("ug") != "ug" {
        return invalid("The costs scale is Uganda's. This country's scale has not been researched yet.");
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO bills_of_costs (id, matter_id, against, subject_value, instruction_basis, created_by) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(matter_id)
        .bind(&input.against)
        .bind(input.subject_value)
        .bind(&basis)
        .bind(by)
        .execute(&mut *tx)
        .await?;
    let mut position = 0;

    // Instructions: item 1 from the value, or the floor the Schedule sets.
    match input.subject_value {
        Some(value) => {
            let fee = scale::instruction_fee_for(value, &basis).unwrap_or(0);
            let item = format!("1({})", &basis[2..]);
            push(&mut tx, &id, &mut position, None, Some(&item), format!("Instructions to {} (value of the subject matter UGX {})", if matter_type == "appeal" { "present or oppose the appeal" } else { "sue or defend" }, grouped(value)), false, fee).await?;
        }
        None => {
            let floor_item = if matter_type == "criminal_defence" { "8(1)" } else { "9(1)" };
            let floor = scale::FLOORS.iter().find(|f| f.item == floor_item).expect("a listed floor");
            push(&mut tx, &id, &mut position, None, Some(floor.item), format!("{} (reasonable, not less than UGX {})", floor.what, grouped(floor.at_least)), false, floor.at_least).await?;
        }
    }
    // Drawing what was filed.
    let filed: Vec<(String, String, Option<String>, Option<i64>)> =
        sqlx::query_as("SELECT kind, title, reference, filed_on FROM documents WHERE matter_id = ? AND status = 'filed' ORDER BY filed_on").bind(matter_id).fetch_all(&mut *tx).await?;
    for (kind, title, reference, filed_on) in filed {
        if let Some(fixed) = drawing_item(&kind).and_then(scale::fixed) {
            let verb = if fixed.item.starts_with("11") { "Letter" } else { "Drawing" };
            push(&mut tx, &id, &mut position, filed_on, Some(fixed.item), format!("{verb}: {title}{}", reference.map(|r| format!(" ({r})")).unwrap_or_default()), false, fixed.fee).await?;
        }
    }
    // Attending each hearing that took place (an hour each until edited).
    let attended: Vec<(i64, String, String)> =
        sqlx::query_as("SELECT at, purpose, status FROM hearings WHERE matter_id = ? AND status IN ('attended', 'adjourned') ORDER BY at").bind(matter_id).fetch_all(&mut *tx).await?;
    let attend = scale::fixed("12(1)").expect("item 12(1)");
    for (at, purpose, status) in attended {
        push(&mut tx, &id, &mut position, Some(at), Some(attend.item), format!("Attending court: {purpose}{} (1 hour)", if status == "adjourned" { ", adjourned" } else { "" }), false, attend.fee).await?;
    }
    // What was paid out for the client, from the books.
    let paid: Vec<(i64, String, i64)> = sqlx::query_as(
        "SELECT on_day, description, amount FROM ledger_entries e WHERE matter_id = ? AND kind IN ('paid_out', 'disbursement') AND reverses IS NULL
           AND NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r.reverses = e.id) ORDER BY on_day",
    )
    .bind(matter_id)
    .fetch_all(&mut *tx)
    .await?;
    for (on_day, description, amount) in paid {
        push(&mut tx, &id, &mut position, Some(on_day), None, description, true, amount).await?;
    }
    let bill_item = scale::fixed("10(5)").expect("item 10(5)");
    push(&mut tx, &id, &mut position, None, Some(bill_item.item), "Drawing this bill of costs".into(), false, bill_item.fee).await?;
    audit::record(&mut tx, Entry::new("bill_of_costs_drawn").subject("bill_of_costs", &id).scope(matter_id)).await?;
    tx.commit().await?;
    Ok(get(pool, &id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

/// Saves the bill as edited: header, status and every item. What was agreed
/// or allowed never exceeds what was claimed; a taxed bill is not changed.
pub async fn update(pool: &SqlitePool, id: &str, input: BillInput) -> Result<Bill, DomainError> {
    if scale::basis_percent(&input.instruction_basis).is_none() {
        return invalid("Unknown part of item 1.");
    }
    if !["draft", "lodged", "taxed"].contains(&input.status.as_str()) {
        return invalid("Unknown status.");
    }
    if input.status == "taxed" && input.taxed_on.is_none() {
        return invalid("Give the day it was taxed.");
    }
    for item in &input.items {
        if item.particulars.trim().is_empty() {
            return invalid("Every item needs its particulars.");
        }
        if item.claimed < 0 || item.agreed.is_some_and(|a| a < 0) || item.taxed.is_some_and(|t| t < 0) {
            return invalid("Amounts are in shillings, never below nothing.");
        }
        if item.agreed.is_some_and(|a| a > item.claimed) || item.taxed.is_some_and(|t| t > item.claimed) {
            return invalid("Nothing is agreed or allowed above what the bill claims.");
        }
    }
    let mut tx = begin_write(pool).await?;
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM bills_of_costs WHERE id = ?").bind(id).fetch_optional(&mut *tx).await?;
    match status.as_deref() {
        None => return Err(DomainError::NotFound("No such bill of costs.".into())),
        Some("taxed") => return invalid("A taxed bill is kept as it was taxed."),
        _ => {}
    }
    sqlx::query(
        "UPDATE bills_of_costs SET subject_value = ?, instruction_basis = ?, status = ?, lodged_on = ?, pre_taxation_on = ?, taxed_on = ?, taxing_officer = ?,
           updated_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?",
    )
    .bind(input.subject_value)
    .bind(&input.instruction_basis)
    .bind(&input.status)
    .bind(input.lodged_on)
    .bind(input.pre_taxation_on)
    .bind(input.taxed_on)
    .bind(clean(input.taxing_officer.clone()))
    .bind(id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("DELETE FROM bill_items WHERE bill_id = ?").bind(id).execute(&mut *tx).await?;
    for (i, item) in input.items.iter().enumerate() {
        sqlx::query("INSERT INTO bill_items (id, bill_id, position, on_day, item_ref, particulars, disbursement, claimed, agreed, taxed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(Uuid::new_v4().to_string())
            .bind(id)
            .bind(i as i64 + 1)
            .bind(item.on_day)
            .bind(clean(item.item_ref.clone()))
            .bind(item.particulars.trim())
            .bind(item.disbursement)
            .bind(item.claimed)
            .bind(item.agreed)
            .bind(item.taxed)
            .execute(&mut *tx)
            .await?;
    }
    if input.status == "taxed" {
        audit::record(&mut tx, Entry::new("bill_of_costs_taxed").subject("bill_of_costs", id)).await?;
    }
    tx.commit().await?;
    Ok(get(pool, id).await?.ok_or(sqlx::Error::RowNotFound)?)
}

pub async fn delete_draft(pool: &SqlitePool, id: &str) -> Result<(), DomainError> {
    let status: Option<String> = sqlx::query_scalar("SELECT status FROM bills_of_costs WHERE id = ?").bind(id).fetch_optional(pool).await?;
    match status.as_deref() {
        None => Err(DomainError::NotFound("No such bill of costs.".into())),
        Some("draft") => {
            let mut tx = begin_write(pool).await?;
            sqlx::query("DELETE FROM bill_items WHERE bill_id = ?").bind(id).execute(&mut *tx).await?;
            sqlx::query("DELETE FROM bills_of_costs WHERE id = ?").bind(id).execute(&mut *tx).await?;
            tx.commit().await?;
            Ok(())
        }
        Some(_) => invalid("A lodged or taxed bill is kept."),
    }
}
