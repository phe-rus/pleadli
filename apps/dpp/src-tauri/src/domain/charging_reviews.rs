//! The charging review: applying the Two-Stage Test or the Threshold Test to a
//! file and recording what was found. The criteria are the named ones in the
//! ODPP Decision to Charge Guidelines (docs/dpp/RESEARCH.md §3); nothing here
//! is invented. What the outcomes permit is decided in `permits`, and the
//! decision code asks it, so no client can record a charge the review does not
//! support.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

use super::audit::{self, Entry};
use super::error::{clean, invalid, DomainError};
use super::{prosecution_files, prosecutor_profile};

pub const EVIDENTIAL: &[&str] = &["relevance", "admissibility", "reliability", "credibility", "availability", "defence"];
pub const PUBLIC_INTEREST: &[&str] = &[
    "seriousness",
    "culpability",
    "harm",
    "age",
    "proportionality",
    "out_of_court_disposal",
    "sensitive_information",
];
/// The five requirements that must all be met (RESEARCH.md §3).
pub const THRESHOLD: &[&str] = &[
    "threshold_guilt",
    "threshold_further_evidence",
    "threshold_seriousness",
    "threshold_bail",
    "threshold_public_interest",
];

const FINDINGS: &[&str] = &["favours", "against", "unresolved"];

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Assessment {
    pub id: String,
    pub review_id: String,
    pub test: String,
    pub criterion: String,
    pub finding: String,
    pub note: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChargingReview {
    pub id: String,
    pub prosecution_file_id: String,
    pub standard: String,
    pub evidential_outcome: Option<String>,
    pub public_interest_outcome: Option<String>,
    pub threshold_outcome: Option<String>,
    pub started_by: Option<String>,
    pub started_at: i64,
    pub concluded_at: Option<i64>,
    pub reopens_decision_id: Option<String>,
    pub reopen_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewWithAssessments {
    #[serde(flatten)]
    pub review: ChargingReview,
    pub assessments: Vec<Assessment>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartReviewInput {
    pub prosecution_file_id: String,
    pub standard: String,
    /// Reopening a concluded file: the decision being reopened, and why.
    pub reopens_decision_id: Option<String>,
    pub reopen_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentInput {
    pub finding: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeInput {
    /// `evidential`, `public_interest` or `threshold`.
    pub test: String,
    /// `passed` or `failed` (the two-stage tests); `met` or `not_met` (threshold).
    /// `null` withdraws a recorded outcome.
    pub outcome: Option<String>,
}

fn test_of(criterion: &str) -> Option<&'static str> {
    if EVIDENTIAL.contains(&criterion) {
        Some("evidential")
    } else if PUBLIC_INTEREST.contains(&criterion) {
        Some("public_interest")
    } else if THRESHOLD.contains(&criterion) {
        Some("threshold")
    } else {
        None
    }
}

pub async fn get_review(pool: &SqlitePool, id: &str) -> Result<ChargingReview, DomainError> {
    sqlx::query_as::<_, ChargingReview>("SELECT * FROM charging_reviews WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| DomainError::NotFound("Review not found.".to_string()))
}

async fn with_assessments(pool: &SqlitePool, review: ChargingReview) -> Result<ReviewWithAssessments, sqlx::Error> {
    let assessments = sqlx::query_as::<_, Assessment>("SELECT * FROM review_assessments WHERE review_id = ? ORDER BY rowid ASC")
        .bind(&review.id)
        .fetch_all(pool)
        .await?;
    Ok(ReviewWithAssessments { review, assessments })
}

pub async fn get_with_assessments(pool: &SqlitePool, id: &str) -> Result<ReviewWithAssessments, DomainError> {
    let review = get_review(pool, id).await?;
    Ok(with_assessments(pool, review).await?)
}

pub async fn list_for_file(pool: &SqlitePool, file_id: &str) -> Result<Vec<ReviewWithAssessments>, sqlx::Error> {
    let reviews = sqlx::query_as::<_, ChargingReview>(
        "SELECT * FROM charging_reviews WHERE prosecution_file_id = ? ORDER BY started_at DESC, rowid DESC",
    )
    .bind(file_id)
    .fetch_all(pool)
    .await?;
    let mut out = Vec::with_capacity(reviews.len());
    for review in reviews {
        out.push(with_assessments(pool, review).await?);
    }
    Ok(out)
}

pub async fn start_review(pool: &SqlitePool, input: StartReviewInput) -> Result<ReviewWithAssessments, DomainError> {
    if !["two_stage", "threshold"].contains(&input.standard.as_str()) {
        return invalid("A review applies the Two-Stage Test or the Threshold Test.");
    }
    let file = prosecution_files::get_prosecution_file(pool, &input.prosecution_file_id)
        .await?
        .ok_or_else(|| DomainError::NotFound("File not found.".to_string()))?;
    let reopens = clean(input.reopens_decision_id);
    let reopen_reason = clean(input.reopen_reason);
    if let Some(decision_id) = &reopens {
        let on_file: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM decisions WHERE id = ? AND prosecution_file_id = ?")
            .bind(decision_id)
            .bind(&input.prosecution_file_id)
            .fetch_one(pool)
            .await?;
        if on_file == 0 {
            return invalid("That decision is not on this file.");
        }
        if reopen_reason.is_none() {
            return invalid("Say why the decision is being reopened.");
        }
    } else if !["under_review", "resubmitted"].contains(&file.current_status.as_str()) {
        return invalid("Only a file that is waiting on a charging decision can be reviewed. To bring a concluded file back, reopen the decision.");
    }
    let open: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM charging_reviews WHERE prosecution_file_id = ? AND concluded_at IS NULL")
        .bind(&input.prosecution_file_id)
        .fetch_one(pool)
        .await?;
    if open > 0 {
        return invalid("This file already has a review open.");
    }

    let profile = prosecutor_profile::get_prosecutor_profile(pool).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO charging_reviews (id, prosecution_file_id, standard, started_by, reopens_decision_id, reopen_reason)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
        .bind(&id)
        .bind(&input.prosecution_file_id)
        .bind(&input.standard)
        .bind(profile.map(|p| p.name))
        .bind(&reopens)
        .bind(&reopen_reason)
        .execute(pool)
        .await?;
    audit::log(
        pool,
        Entry::new(if reopens.is_some() { "review_reopened" } else { "review_started" }).subject("charging_review", &id).file(&input.prosecution_file_id).detail(input.standard.clone()),
    )
    .await?;
    get_with_assessments(pool, &id).await
}

fn ensure_open(review: &ChargingReview) -> Result<(), DomainError> {
    if review.concluded_at.is_some() {
        return invalid("This review has concluded and can no longer be changed.");
    }
    Ok(())
}

/// The criteria belonging to the standard a review applies.
fn criteria_for(standard: &str) -> Vec<&'static str> {
    if standard == "threshold" {
        THRESHOLD.to_vec()
    } else {
        EVIDENTIAL.iter().chain(PUBLIC_INTEREST.iter()).copied().collect()
    }
}

pub async fn set_assessment(pool: &SqlitePool, review_id: &str, criterion: &str, input: AssessmentInput) -> Result<ReviewWithAssessments, DomainError> {
    let review = get_review(pool, review_id).await?;
    ensure_open(&review)?;
    if !FINDINGS.contains(&input.finding.as_str()) {
        return invalid("A finding is for the charge, against it, or unresolved.");
    }
    let test = test_of(criterion).filter(|_| criteria_for(&review.standard).contains(&criterion));
    let Some(test) = test else {
        return invalid("That criterion does not belong to the test this review applies.");
    };
    sqlx::query(
        "INSERT INTO review_assessments (id, review_id, test, criterion, finding, note) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (review_id, criterion) DO UPDATE SET finding = excluded.finding, note = excluded.note,
             updated_at = cast(unixepoch('subsecond') * 1000 as integer)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(review_id)
    .bind(test)
    .bind(criterion)
    .bind(&input.finding)
    .bind(clean(input.note))
    .execute(pool)
    .await?;
    get_with_assessments(pool, review_id).await
}

pub async fn set_outcome(pool: &SqlitePool, review_id: &str, input: OutcomeInput) -> Result<ReviewWithAssessments, DomainError> {
    let review = get_review(pool, review_id).await?;
    ensure_open(&review)?;
    let outcome = input.outcome.as_deref();

    match (input.test.as_str(), review.standard.as_str()) {
        ("evidential", "two_stage") => {
            if !matches!(outcome, None | Some("passed") | Some("failed")) {
                return invalid("The Evidential Test is passed or failed.");
            }
            // The Public Interest Test is only reached once the first is passed.
            let clear_public_interest = outcome != Some("passed");
            sqlx::query(
                "UPDATE charging_reviews SET evidential_outcome = ?,
                        public_interest_outcome = CASE WHEN ? THEN NULL ELSE public_interest_outcome END WHERE id = ?",
            )
            .bind(outcome)
            .bind(clear_public_interest)
            .bind(review_id)
            .execute(pool)
            .await?;
        }
        ("public_interest", "two_stage") => {
            if !matches!(outcome, None | Some("passed") | Some("failed")) {
                return invalid("The Public Interest Test is passed or failed.");
            }
            if outcome.is_some() && review.evidential_outcome.as_deref() != Some("passed") {
                return invalid("The Public Interest Test is only applied once the Evidential Test is passed.");
            }
            sqlx::query("UPDATE charging_reviews SET public_interest_outcome = ? WHERE id = ?")
                .bind(outcome)
                .bind(review_id)
                .execute(pool)
                .await?;
        }
        ("threshold", "threshold") => {
            if !matches!(outcome, None | Some("met") | Some("not_met")) {
                return invalid("The Threshold Test is met or not met.");
            }
            if outcome == Some("met") {
                let favourable: i64 = sqlx::query_scalar(
                    "SELECT COUNT(*) FROM review_assessments WHERE review_id = ? AND test = 'threshold' AND finding = 'favours'",
                )
                .bind(review_id)
                .fetch_one(pool)
                .await?;
                if favourable < THRESHOLD.len() as i64 {
                    return invalid("All five requirements of the Threshold Test must be met before it can be recorded as met.");
                }
            }
            sqlx::query("UPDATE charging_reviews SET threshold_outcome = ? WHERE id = ?")
                .bind(outcome)
                .bind(review_id)
                .execute(pool)
                .await?;
        }
        _ => return invalid("That test does not belong to the standard this review applies."),
    }
    get_with_assessments(pool, review_id).await
}

/// What a review's recorded outcomes allow the prosecutor to decide. Only the
/// decisions that are the result of a charging review are gated: the others
/// (take over, discontinue, plea, venue, amend) are not outcomes of applying
/// the test and are not listed here.
pub fn charging_decision_types() -> &'static [&'static str] {
    &["sanction", "threshold_charge", "decline", "divert", "return_for_investigation"]
}

pub fn permits(review: &ChargingReview, decision_type: &str, has_reasons: bool) -> Result<(), DomainError> {
    let ev = review.evidential_outcome.as_deref();
    let pi = review.public_interest_outcome.as_deref();
    let two = review.standard == "two_stage";
    let refuse = |m: &str| Err(DomainError::Invalid(m.to_string()));

    match decision_type {
        "sanction" if !(two && ev == Some("passed") && pi == Some("passed")) => {
            refuse("A charge is sanctioned only when the review has passed both the Evidential Test and the Public Interest Test.")
        }
        "divert" if !(two && ev == Some("passed")) => refuse("Diversion needs the Evidential Test to have been passed."),
        "decline" if !(two && (ev == Some("failed") || (ev == Some("passed") && pi == Some("failed")))) => {
            refuse("Declining to charge needs a test the review has failed: the Evidential Test, or the Public Interest Test after passing the first.")
        }
        "decline" if !has_reasons => refuse("Written reasons are required for this decision."),
        "threshold_charge" if review.threshold_outcome.as_deref() != Some("met") => {
            refuse("A Threshold Test charge needs a review that applied the Threshold Test and found it met.")
        }
        _ => Ok(()),
    }
}
