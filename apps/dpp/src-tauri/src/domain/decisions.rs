use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::error::{check_timestamp, clean, invalid, DomainError};
use super::audit::{self, Entry};
use super::directions::{self, DirectionInput};
use super::{charging_reviews, prosecution_files, prosecutor_profile};

/// The confirmed decision-type set (docs/dpp/PRODUCT.md, RESEARCH.md §4).
pub const DECISION_TYPES: &[&str] = &[
    "sanction",
    "threshold_charge",
    "decline",
    "divert",
    "return_for_investigation",
    "take_over",
    "discontinue",
    "nolle_prosequi",
    "plea_bargain_accepted",
    "committal_venue_high_court",
    "amend_charge",
];

/// Not delegable: Constitution Art. 120(3)(d) and Trial on Indictments Act
/// s.135 reserve these to the Director of Public Prosecutions personally.
pub const DPP_ONLY: &[&str] = &["discontinue", "nolle_prosequi"];

/// Append-only by convention (docs/dpp/PRODUCT.md §Decisions & Reviews): no
/// update/delete command is ever exposed for this table. A correction is a
/// new decision row, never a mutation of history.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub id: String,
    pub prosecution_file_id: String,
    pub decision_type: String,
    pub decided_by: Option<String>,
    pub decided_at: i64,
    pub reasons: Option<String>,
    pub created_at: i64,
    /// The count this decision is about, or `None` for the whole file. The
    /// accused is the count's own accused.
    pub charge_id: Option<String>,
    /// The charging review it was the outcome of.
    pub review_id: Option<String>,
    /// The earlier decision this one corrects. The earlier row stays.
    pub corrects_decision_id: Option<String>,
}

/// A decision as the decisions log shows it, with the file it belongs to.
#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DecisionRow {
    #[sqlx(flatten)]
    #[serde(flatten)]
    pub decision: Decision,
    pub file_title: String,
    pub file_reference: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDecisionInput {
    pub prosecution_file_id: String,
    pub decision_type: String,
    pub decided_by: Option<String>,
    pub decided_at: i64,
    pub reasons: Option<String>,
    /// The counts decided. Empty means the whole file; several means one
    /// decision row per count (for example every count against one accused).
    #[serde(default)]
    pub charge_ids: Vec<String>,
    /// The review this decision is the outcome of. Required for the decisions
    /// that are the result of applying a test.
    pub review_id: Option<String>,
    pub corrects_decision_id: Option<String>,
    /// A review is concluded by the decision it produces unless told otherwise
    /// (more counts may still be decided from the same review).
    #[serde(default = "default_true")]
    pub conclude_review: bool,
    /// The directions to Police that a return for investigation carries. A
    /// return needs at least one; no other decision may have any.
    #[serde(default)]
    pub directions: Vec<DirectionInput>,
}

fn default_true() -> bool {
    true
}

pub async fn create_decision(pool: &SqlitePool, input: CreateDecisionInput) -> Result<Vec<Decision>, DomainError> {
    if !DECISION_TYPES.contains(&input.decision_type.as_str()) {
        return invalid("That is not a decision the office can record.");
    }
    check_timestamp(input.decided_at, "The date of the decision")?;
    if prosecution_files::get_prosecution_file(pool, &input.prosecution_file_id).await?.is_none() {
        return Err(DomainError::NotFound("File not found.".to_string()));
    }
    let reasons = clean(input.reasons);

    directions::validate(&input.directions)?;
    let returning = input.decision_type == "return_for_investigation";
    if returning && input.directions.is_empty() {
        return invalid("A return for further investigation must say what Police are to do: add at least one direction.");
    }
    if !returning && !input.directions.is_empty() {
        return invalid("Only a return for further investigation carries directions.");
    }

    let profile = prosecutor_profile::get_prosecutor_profile(pool).await?;
    if DPP_ONLY.contains(&input.decision_type.as_str()) && !profile.as_ref().is_some_and(|p| p.is_dpp) {
        return Err(DomainError::Forbidden(
            "Only the Director of Public Prosecutions may record this decision. Mark this installation's prosecutor as the DPP in Settings if that is who is deciding."
                .to_string(),
        ));
    }
    let decided_by = clean(input.decided_by).or_else(|| profile.map(|p| p.name));

    // Scope: the whole file, or specific counts of it, each counted once.
    let mut charge_ids = input.charge_ids.clone();
    charge_ids.sort();
    charge_ids.dedup();
    for charge_id in &charge_ids {
        let on_file: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM charges WHERE id = ? AND prosecution_file_id = ?")
            .bind(charge_id)
            .bind(&input.prosecution_file_id)
            .fetch_one(pool)
            .await?;
        if on_file == 0 {
            return invalid("One of the counts is not on this file.");
        }
    }

    // The review behind a charging decision.
    let gated = charging_reviews::charging_decision_types().contains(&input.decision_type.as_str());
    let mut corrects = clean(input.corrects_decision_id);
    let review = if gated {
        let Some(review_id) = clean(input.review_id) else {
            return invalid("This decision is the outcome of a charging review. Start the review and record its findings first.");
        };
        let review = charging_reviews::get_review(pool, &review_id).await?;
        if review.prosecution_file_id != input.prosecution_file_id {
            return invalid("That review belongs to another file.");
        }
        if review.concluded_at.is_some() {
            return invalid("That review has already concluded. Start another to decide again.");
        }
        charging_reviews::permits(&review, &input.decision_type, reasons.is_some())?;
        // A review that reopens a decision produces the correction of it.
        if let Some(reopened) = &review.reopens_decision_id {
            corrects = Some(reopened.clone());
        }
        Some(review)
    } else {
        None
    };

    // A correction is a new decision that follows the one it corrects, says
    // why, and covers the same ground.
    if let Some(corrected_id) = &corrects {
        let corrected: Option<(String, i64, Option<String>)> =
            sqlx::query_as("SELECT prosecution_file_id, decided_at, charge_id FROM decisions WHERE id = ?")
                .bind(corrected_id)
                .fetch_optional(pool)
                .await?;
        let Some((file_id, corrected_at, corrected_charge)) = corrected else {
            return Err(DomainError::NotFound("The decision to correct was not found.".to_string()));
        };
        if file_id != input.prosecution_file_id {
            return invalid("The decision to correct is on another file.");
        }
        if input.decided_at < corrected_at {
            return invalid("A correction cannot be dated before the decision it corrects.");
        }
        if reasons.is_none() {
            return invalid("A correction needs reasons.");
        }
        match corrected_charge {
            Some(charge) if charge_ids != [charge.clone()] => {
                return invalid("A correction of a decision about one count must be about that same count.");
            }
            None if !charge_ids.is_empty() => return invalid("A correction of a decision about the whole file must be about the whole file."),
            _ => {}
        }
    }

    let scopes: Vec<Option<String>> = if charge_ids.is_empty() { vec![None] } else { charge_ids.into_iter().map(Some).collect() };
    let mut ids = Vec::with_capacity(scopes.len());
    let mut tx = pool.begin().await?;
    for scope in &scopes {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO decisions
                (id, prosecution_file_id, decision_type, decided_by, decided_at, reasons, charge_id, review_id, corrects_decision_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(&input.decision_type)
        .bind(&decided_by)
        .bind(input.decided_at)
        .bind(&reasons)
        .bind(scope)
        .bind(review.as_ref().map(|r| &r.id))
        .bind(&corrects)
        .execute(&mut *tx)
        .await?;
        ids.push(id);
    }
    // The directions belong to the act, held on its first row.
    directions::insert_for_decision(&mut tx, &input.prosecution_file_id, &ids[0], &input.directions).await?;
    audit::record(
        &mut tx,
        Entry::new(if corrects.is_some() { "decision_corrected" } else { "decision_recorded" })
            .subject("decision", &ids[0])
            .file(&input.prosecution_file_id)
            .detail(format!("{}, {} record(s)", input.decision_type, ids.len())),
    )
    .await?;
    if let (Some(review), true) = (&review, input.conclude_review) {
        sqlx::query("UPDATE charging_reviews SET concluded_at = cast(unixepoch('subsecond') * 1000 as integer) WHERE id = ?")
            .bind(&review.id)
            .execute(&mut *tx)
            .await?;
    }
    prosecution_files::recompute_status(&mut tx, &input.prosecution_file_id).await?;
    tx.commit().await?;

    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        out.push(sqlx::query_as::<_, Decision>("SELECT * FROM decisions WHERE id = ?").bind(&id).fetch_one(pool).await?);
    }
    Ok(out)
}

pub async fn list_for_file(pool: &SqlitePool, prosecution_file_id: &str) -> Result<Vec<Decision>, sqlx::Error> {
    sqlx::query_as::<_, Decision>(
        "SELECT * FROM decisions WHERE prosecution_file_id = ? ORDER BY decided_at DESC, created_at DESC, rowid DESC",
    )
    .bind(prosecution_file_id)
    .fetch_all(pool)
    .await
}

/// Every decision on every file, newest first: the decisions log.
pub async fn list_all(pool: &SqlitePool, limit: i64) -> Result<Vec<DecisionRow>, sqlx::Error> {
    sqlx::query_as::<_, DecisionRow>(
        "SELECT d.*, f.title AS file_title,
                COALESCE(f.odpp_registration_number, f.police_reference) AS file_reference
           FROM decisions d JOIN prosecution_files f ON f.id = d.prosecution_file_id
          ORDER BY d.decided_at DESC, d.created_at DESC, d.rowid DESC LIMIT ?",
    )
    .bind(limit.clamp(1, 500))
    .fetch_all(pool)
    .await
}
