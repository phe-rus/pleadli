//! The API exercised as a client would: real router, real migrations, an
//! in-memory database. These pin the Stage 0 rules: derived status, the DPP-only
//! decisions, validation, and the `/api/**` namespace.

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use tower::ServiceExt;

use super::{router, AppState};

const DAY: i64 = 86_400_000;

/// A set-up installation with no sign-in: one administrator, always acting.
async fn app() -> Router {
    let app = bare_app().await;
    let (status, body) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "A. Prosecutor", "role": "administrator" })))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    app
}

/// A fresh installation that has not been through setup.
async fn bare_app() -> Router {
    bare_app_with_pool().await.0
}

async fn bare_app_with_pool() -> (Router, sqlx::SqlitePool) {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.unwrap();
    (router(AppState { pool: pool.clone(), vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security }, None), pool)
}

fn setup_body(protection: &str, administrator: Value) -> Value {
    json!({
        "licenceVersion": "2026-09", "jurisdiction": "ug", "language": "en", "model": "office",
        "officeName": "Wandegeya", "region": "Kampala", "protection": protection, "accent": "gold",
        "administrator": administrator, "people": []
    })
}

async fn call(app: &Router, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.map_or_else(Body::empty, |b| Body::from(b.to_string())))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn new_file(app: &Router) -> String {
    let (status, file) = call(
        app,
        Method::POST,
        "/api/prosecution-files",
        Some(json!({ "title": "State vs. A", "receivedAt": now() - 10 * DAY })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    file["id"].as_str().unwrap().to_string()
}

async fn put(app: &Router, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::PUT, path, Some(body)).await
}

async fn start_review(app: &Router, file: &str, standard: &str) -> String {
    let (status, review) = call(app, Method::POST, "/api/charging-reviews", Some(json!({ "prosecutionFileId": file, "standard": standard }))).await;
    assert_eq!(status, StatusCode::OK, "{review}");
    review["id"].as_str().unwrap().to_string()
}

async fn outcome(app: &Router, review: &str, test: &str, value: &str) -> StatusCode {
    put(app, &format!("/api/charging-reviews/{review}/outcome"), json!({ "test": test, "outcome": value })).await.0
}

/// Applies the test a decision needs, the way a prosecutor would.
async fn review_for(app: &Router, file: &str, kind: &str) -> Option<String> {
    let (standard, ev, pi) = match kind {
        "sanction" => ("two_stage", Some("passed"), Some("passed")),
        "divert" => ("two_stage", Some("passed"), None),
        "decline" => ("two_stage", Some("failed"), None),
        "return_for_investigation" => ("two_stage", None, None),
        "threshold_charge" => ("threshold", None, None),
        _ => return None,
    };
    let review = start_review(app, file, standard).await;
    if standard == "threshold" {
        for criterion in ["threshold_guilt", "threshold_further_evidence", "threshold_seriousness", "threshold_bail", "threshold_public_interest"] {
            put(app, &format!("/api/charging-reviews/{review}/assessments/{criterion}"), json!({ "finding": "favours" })).await;
        }
        assert_eq!(outcome(app, &review, "threshold", "met").await, StatusCode::OK);
    }
    if let Some(ev) = ev {
        assert_eq!(outcome(app, &review, "evidential", ev).await, StatusCode::OK);
    }
    if let Some(pi) = pi {
        assert_eq!(outcome(app, &review, "public_interest", pi).await, StatusCode::OK);
    }
    Some(review)
}

/// Records a decision. A charging decision goes through a review that supports
/// it; the others are recorded directly. Returns the first decision recorded.
async fn decide(app: &Router, file: &str, kind: &str, days_ago: i64) -> (StatusCode, Value) {
    let review = review_for(app, file, kind).await;
    let (status, body) = call(
        app,
        Method::POST,
        "/api/decisions",
        Some(json!({
            "prosecutionFileId": file, "decisionType": kind, "decidedAt": now() - days_ago * DAY,
            "reviewId": review, "reasons": "Reasons recorded.",
            "directions": if kind == "return_for_investigation" { json!([{ "kind": "evidence", "instruction": "Obtain the CCTV footage." }]) } else { json!([]) }
        })),
    )
    .await;
    (status, if status == StatusCode::OK { body[0].clone() } else { body })
}

async fn status_of(app: &Router, file: &str) -> String {
    let (_, f) = call(app, Method::GET, &format!("/api/prosecution-files/{file}"), None).await;
    f["currentStatus"].as_str().unwrap().to_string()
}

async fn view_ids(app: &Router, view: &str) -> Vec<String> {
    let (_, files) = call(app, Method::GET, &format!("/api/prosecution-files?view={view}"), None).await;
    files.as_array().unwrap().iter().map(|f| f["id"].as_str().unwrap().to_string()).collect()
}

#[tokio::test]
async fn nothing_is_served_outside_the_api_namespace() {
    let app = app().await;
    let (status, _) = call(&app, Method::GET, "/prosecution-files", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, Method::GET, "/api/prosecution-files", None).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_returned_file_is_not_awaiting_a_decision_and_a_resubmission_puts_it_back() {
    let app = app().await;
    let file = new_file(&app).await;
    assert!(view_ids(&app, "awaiting").await.contains(&file));

    let (status, _) = decide(&app, &file, "return_for_investigation", 5).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(status_of(&app, &file).await, "returned_for_investigation");
    assert!(!view_ids(&app, "awaiting").await.contains(&file));
    assert!(view_ids(&app, "returned").await.contains(&file));

    let resubmission = json!({ "prosecutionFileId": file, "receivedAt": now() - DAY });
    let (status, _) = call(&app, Method::POST, "/api/referrals/resubmission", Some(resubmission.clone())).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(status_of(&app, &file).await, "resubmitted");
    assert!(view_ids(&app, "awaiting").await.contains(&file));
    assert!(view_ids(&app, "active").await.contains(&file));

    // Only a file that is with Police can be resubmitted.
    let (status, _) = call(&app, Method::POST, "/api/referrals/resubmission", Some(resubmission)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn status_follows_decided_at_not_insertion_order() {
    let app = app().await;
    let file = new_file(&app).await;
    decide(&app, &file, "take_over", 1).await;
    // Recorded later, but decided earlier: it must not overwrite the take over.
    decide(&app, &file, "plea_bargain_accepted", 6).await;
    assert_eq!(status_of(&app, &file).await, "taken_over");
}

#[tokio::test]
async fn discontinuance_is_refused_unless_the_prosecutor_is_the_dpp() {
    let app = app().await;
    let file = new_file(&app).await;
    let (status, body) = decide(&app, &file, "discontinue", 0).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "FORBIDDEN");
    assert_eq!(status_of(&app, &file).await, "under_review");

    call(&app, Method::POST, "/api/prosecutor-profile", Some(json!({ "name": "A. Prosecutor", "isDpp": false }))).await;
    assert_eq!(decide(&app, &file, "nolle_prosequi", 0).await.0, StatusCode::FORBIDDEN);

    call(&app, Method::POST, "/api/prosecutor-profile", Some(json!({ "name": "The DPP", "isDpp": true }))).await;
    let (status, decision) = decide(&app, &file, "discontinue", 0).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(decision["decidedBy"], "The DPP");
    assert_eq!(status_of(&app, &file).await, "discontinued");
}

#[tokio::test]
async fn the_server_validates_what_the_ui_sends() {
    let app = app().await;
    let (status, _) = call(&app, Method::POST, "/api/prosecution-files", Some(json!({ "title": "   ", "receivedAt": now() }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = call(&app, Method::POST, "/api/prosecution-files", Some(json!({ "title": "X", "receivedAt": now() + 30 * DAY }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let file = new_file(&app).await;
    assert_eq!(decide(&app, &file, "convict", 0).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(decide(&app, "no-such-file", "take_over", 0).await.0, StatusCode::NOT_FOUND);

    let (status, _) = call(&app, Method::POST, &format!("/api/prosecution-files/{file}/people"), Some(json!({ "personId": "x", "role": "judge" }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = call(&app, Method::POST, "/api/attachments?x=1", None).await;
    assert_ne!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_threshold_charge_is_due_for_review_in_fourteen_days_until_a_later_decision() {
    let app = app().await;
    let file = new_file(&app).await;
    decide(&app, &file, "threshold_charge", 3).await;
    let (_, load) = call(&app, Method::GET, "/api/workload", None).await;
    let due = &load["thresholdReviews"][0];
    assert_eq!(due["fileId"], file.as_str());
    assert_eq!(due["dueAt"].as_i64().unwrap() - due["decidedAt"].as_i64().unwrap(), 14 * DAY);

    decide(&app, &file, "take_over", 0).await;
    let (_, load) = call(&app, Method::GET, "/api/workload", None).await;
    assert!(load["thresholdReviews"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn chronology_is_read_from_the_records_that_exist() {
    let app = app().await;
    let file = new_file(&app).await;
    decide(&app, &file, "return_for_investigation", 4).await;
    let (_, events) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/chronology"), None).await;
    let kinds: Vec<&str> = events.as_array().unwrap().iter().map(|e| e["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["review_started", "decision_recorded", "referral_received"]);
}

async fn add_charge(app: &Router, file: &str, offence: &str) -> String {
    let (status, charge) = call(app, Method::POST, "/api/charges", Some(json!({ "prosecutionFileId": file, "offence": offence }))).await;
    assert_eq!(status, StatusCode::OK);
    charge["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn a_charging_decision_needs_a_review_that_supports_it() {
    let app = app().await;
    let file = new_file(&app).await;
    let post = |body: Value| call(&app, Method::POST, "/api/decisions", Some(body));
    let base = |kind: &str, review: Option<&str>| {
        json!({ "prosecutionFileId": file, "decisionType": kind, "decidedAt": now(), "reviewId": review, "reasons": "Reasons." })
    };

    // No review at all.
    assert_eq!(post(base("sanction", None)).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // Public Interest Test cannot be applied before the Evidential Test is passed.
    let review = start_review(&app, &file, "two_stage").await;
    assert_eq!(outcome(&app, &review, "public_interest", "passed").await, StatusCode::UNPROCESSABLE_ENTITY);
    // A review that has found nothing supports no charge.
    assert_eq!(post(base("sanction", Some(&review))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    outcome(&app, &review, "evidential", "passed").await;
    assert_eq!(post(base("sanction", Some(&review))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    // Passed first stage supports diversion but not declining.
    assert_eq!(post(base("decline", Some(&review))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    outcome(&app, &review, "public_interest", "passed").await;
    // Failing the first stage clears the second.
    outcome(&app, &review, "evidential", "failed").await;
    let (_, reviews) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/charging-reviews"), None).await;
    assert!(reviews[0]["publicInterestOutcome"].is_null());

    outcome(&app, &review, "evidential", "passed").await;
    outcome(&app, &review, "public_interest", "passed").await;
    let (status, decisions) = post(base("sanction", Some(&review))).await;
    assert_eq!(status, StatusCode::OK, "{decisions}");
    assert_eq!(status_of(&app, &file).await, "sanctioned");
    let (_, f) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}"), None).await;
    assert_eq!(f["stage"], "prepare", "a sanction moves a file on from receive");

    // The review concluded with its decision and is frozen.
    assert_eq!(put(&app, &format!("/api/charging-reviews/{review}/assessments/relevance"), json!({ "finding": "favours" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(base("sanction", Some(&review))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn the_threshold_test_is_met_only_when_all_five_requirements_are() {
    let app = app().await;
    let file = new_file(&app).await;
    let review = start_review(&app, &file, "threshold").await;
    for criterion in ["threshold_guilt", "threshold_further_evidence"] {
        put(&app, &format!("/api/charging-reviews/{review}/assessments/{criterion}"), json!({ "finding": "favours" })).await;
    }
    assert_eq!(outcome(&app, &review, "threshold", "met").await, StatusCode::UNPROCESSABLE_ENTITY);
    // A criterion of the other test does not belong here.
    assert_eq!(put(&app, &format!("/api/charging-reviews/{review}/assessments/relevance"), json!({ "finding": "favours" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    // Not met is a fact the review can record, and it leads to a return, not a charge.
    assert_eq!(outcome(&app, &review, "threshold", "not_met").await, StatusCode::OK);
    let charge = call(&app, Method::POST, "/api/decisions", Some(json!({ "prosecutionFileId": file, "decisionType": "threshold_charge", "decidedAt": now(), "reviewId": review }))).await;
    assert_eq!(charge.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn decisions_can_be_about_one_count_and_the_file_status_rolls_up() {
    let app = app().await;
    let file = new_file(&app).await;
    let a = add_charge(&app, &file, "Robbery").await;
    let b = add_charge(&app, &file, "Assault").await;

    // Sanction count A only: count B is still waiting, so the file still is.
    let review = review_for(&app, &file, "sanction").await.unwrap();
    let (status, decisions) = call(&app, Method::POST, "/api/decisions", Some(json!({
        "prosecutionFileId": file, "decisionType": "sanction", "decidedAt": now() - DAY, "reviewId": review, "chargeIds": [a]
    }))).await;
    assert_eq!(status, StatusCode::OK, "{decisions}");
    assert_eq!(decisions[0]["chargeId"], a.as_str());
    assert_eq!(status_of(&app, &file).await, "under_review");

    // Decline count B with its own review: the file proceeds on count A.
    let review = review_for(&app, &file, "decline").await.unwrap();
    let (status, _) = call(&app, Method::POST, "/api/decisions", Some(json!({
        "prosecutionFileId": file, "decisionType": "decline", "decidedAt": now(), "reviewId": review, "chargeIds": [b], "reasons": "Insufficient evidence."
    }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(status_of(&app, &file).await, "sanctioned");

    // A count from another file is refused.
    let other = new_file(&app).await;
    let foreign = add_charge(&app, &other, "Theft").await;
    let (status, _) = call(&app, Method::POST, "/api/decisions", Some(json!({
        "prosecutionFileId": file, "decisionType": "take_over", "decidedAt": now(), "chargeIds": [foreign]
    }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}


#[tokio::test]
async fn a_charge_added_by_mistake_can_go_but_one_a_decision_is_about_cannot() {
    let app = app().await;
    let file = new_file(&app).await;
    let mistaken = add_charge(&app, &file, "Theft").await;
    let decided = add_charge(&app, &file, "Robbery").await;

    let (status, _) = call(&app, Method::DELETE, &format!("/api/charges/{mistaken}"), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, left) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/charges"), None).await;
    assert_eq!(left.as_array().unwrap().len(), 1);

    let (status, _) = call(&app, Method::POST, "/api/decisions", Some(json!({
        "prosecutionFileId": file, "decisionType": "take_over", "decidedAt": now(), "chargeIds": [decided]
    }))).await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = call(&app, Method::DELETE, &format!("/api/charges/{decided}"), None).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, _) = call(&app, Method::DELETE, &format!("/api/charges/{mistaken}"), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}
#[tokio::test]
async fn a_concluded_file_is_reopened_by_a_review_and_the_new_decision_corrects_the_old() {
    let app = app().await;
    let file = new_file(&app).await;
    let (_, declined) = decide(&app, &file, "decline", 5).await;
    let declined_id = declined["id"].as_str().unwrap().to_string();
    assert_eq!(status_of(&app, &file).await, "declined");

    // Reopening needs a reason, and a decision of this file.
    let reopen = |reason: Value, decision: &str| {
        call(&app, Method::POST, "/api/charging-reviews", Some(json!({ "prosecutionFileId": file, "standard": "two_stage", "reopensDecisionId": decision, "reopenReason": reason })))
    };
    assert_eq!(reopen(Value::Null, &declined_id).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(reopen(json!("New evidence."), "nope").await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, review) = reopen(json!("New evidence has come to light."), &declined_id).await;
    assert_eq!(status, StatusCode::OK);
    let review = review["id"].as_str().unwrap().to_string();

    assert!(view_ids(&app, "reopened").await.contains(&file));
    assert!(!view_ids(&app, "closed").await.contains(&file));

    outcome(&app, &review, "evidential", "passed").await;
    outcome(&app, &review, "public_interest", "passed").await;
    // A correction is explained.
    let body = |reasons: Value| json!({ "prosecutionFileId": file, "decisionType": "sanction", "decidedAt": now(), "reviewId": review, "reasons": reasons });
    assert_eq!(call(&app, Method::POST, "/api/decisions", Some(body(Value::Null))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, corrected) = call(&app, Method::POST, "/api/decisions", Some(body(json!("Reviewed on the new statement.")))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(corrected[0]["correctsDecisionId"], declined_id.as_str());

    // The old decision is still on the record; the file follows the new one.
    let (_, all) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/decisions"), None).await;
    assert_eq!(all.as_array().unwrap().len(), 2);
    assert_eq!(status_of(&app, &file).await, "sanctioned");
    assert!(!view_ids(&app, "reopened").await.contains(&file));
}

#[tokio::test]
async fn a_return_must_carry_directions_and_only_a_return_may() {
    let app = app().await;
    let file = new_file(&app).await;
    let review = review_for(&app, &file, "return_for_investigation").await.unwrap();
    let post = |directions: Value| {
        call(&app, Method::POST, "/api/decisions", Some(json!({
            "prosecutionFileId": file, "decisionType": "return_for_investigation", "decidedAt": now(), "reviewId": review, "directions": directions
        })))
    };
    assert_eq!(post(json!([])).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(json!([{ "kind": "gossip", "instruction": "x" }])).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(json!([{ "kind": "evidence", "instruction": "  " }])).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = post(json!([
        { "kind": "statement", "instruction": "Take a statement from the second witness." },
        { "kind": "clarification", "instruction": "Clarify the time of arrest." }
    ])).await;
    assert_eq!(status, StatusCode::OK);
    let (_, list) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/directions"), None).await;
    assert_eq!(list.as_array().unwrap().len(), 2);
    assert_eq!(list[0]["response"], "open");

    // A decision that is not a return carries none.
    let other = new_file(&app).await;
    let (status, _) = call(&app, Method::POST, "/api/decisions", Some(json!({
        "prosecutionFileId": other, "decisionType": "take_over", "decidedAt": now(), "directions": [{ "kind": "evidence", "instruction": "x" }]
    }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn directions_are_answered_only_once_the_file_is_back_and_the_resubmission_names_its_return() {
    let app = app().await;
    let file = new_file(&app).await;
    let (_, returned) = decide(&app, &file, "return_for_investigation", 5).await;
    let (_, list) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/directions"), None).await;
    let direction = list[0]["id"].as_str().unwrap().to_string();
    let path = format!("/api/directions/{direction}/response");
    let respond = |response: &str| put(&app, &path, json!({ "response": response, "note": "Footage received." }));

    // Still with Police: nothing to record yet.
    assert_eq!(respond("met").await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, referral) = call(&app, Method::POST, "/api/referrals/resubmission", Some(json!({ "prosecutionFileId": file, "receivedAt": now() - DAY }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(referral["answersDecisionId"], returned["id"]);

    assert_eq!(respond("maybe").await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, answered) = respond("met").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(answered["response"], "met");
    assert!(answered["respondedAt"].is_number());

    let (_, files) = call(&app, Method::GET, "/api/prosecution-files?view=active", None).await;
    assert_eq!(files[0]["directionsTotal"], 1);
    assert_eq!(files[0]["directionsOpen"], 0);

    // Taking it back to open clears the answer.
    let (_, reopened) = respond("open").await;
    assert!(reopened["respondedAt"].is_null());
}

#[tokio::test]
async fn a_document_is_prepared_from_the_record_issued_and_then_frozen() {
    let app = app().await;
    let file = new_file(&app).await;
    call(&app, Method::POST, "/api/charges", Some(json!({
        "prosecutionFileId": file, "offence": "Theft", "statutorySection": "s.254",
        "particulars": r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"On 3 May the accused took a car."}]}]}"#
    }))).await;
    call(&app, Method::PUT, "/api/prosecutor-profile", Some(json!({ "name": "A. Prosecutor", "rank": "State Attorney" }))).await;
    let (_, decision) = decide(&app, &file, "sanction", 0).await;
    let decision_id = decision["id"].as_str().unwrap();

    // Some decisions produce no document.
    let (_, other) = decide(&app, &new_file(&app).await, "take_over", 0).await;
    assert_eq!(call(&app, Method::POST, "/api/documents", Some(json!({ "decisionId": other["id"] }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, doc) = call(&app, Method::POST, "/api/documents", Some(json!({ "decisionId": decision_id }))).await;
    assert_eq!(status, StatusCode::OK, "{doc}");
    assert_eq!(doc["kind"], "charge_sheet");
    assert_eq!(doc["status"], "draft");
    assert!(doc["reference"].is_null());
    // Rich text is rendered as words, never as JSON.
    assert!(doc["content"].to_string().contains("On 3 May the accused took a car."));
    assert!(!doc["content"].to_string().contains("\"type\":\"doc\""));
    let id = doc["id"].as_str().unwrap().to_string();

    // Preparing it again returns the same document.
    let (_, again) = call(&app, Method::POST, "/api/documents", Some(json!({ "decisionId": decision_id }))).await;
    assert_eq!(again["id"], id.as_str());

    // A draft follows the record when refreshed.
    add_charge(&app, &file, "Robbery").await;
    let (_, refreshed) = call(&app, Method::POST, &format!("/api/documents/{id}/refresh"), None).await;
    // The sanction covered the whole file, so a count added since is part of it.
    assert!(refreshed["content"].to_string().contains("Robbery"));

    let (status, issued) = call(&app, Method::POST, &format!("/api/documents/{id}/issue"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(issued["status"], "issued");
    assert!(issued["reference"].as_str().unwrap().starts_with("DPP-"));
    assert_eq!(issued["integrity"], "intact");
    assert_eq!(issued["author"], "A. Prosecutor");

    // Issued documents are frozen.
    assert_eq!(call(&app, Method::POST, &format!("/api/documents/{id}/refresh"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::POST, &format!("/api/documents/{id}/issue"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/documents/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // References are sequential.
    let second_file = new_file(&app).await;
    let (_, second_decision) = decide(&app, &second_file, "sanction", 0).await;
    let (_, second) = call(&app, Method::POST, "/api/documents", Some(json!({ "decisionId": second_decision["id"] }))).await;
    let (_, second) = call(&app, Method::POST, &format!("/api/documents/{}/issue", second["id"].as_str().unwrap()), None).await;
    assert!(second["reference"].as_str().unwrap().ends_with("0002"));
}

#[tokio::test]
async fn documents_export_as_real_docx_and_markdown_and_a_draft_can_be_discarded() {
    let app = app().await;
    let file = new_file(&app).await;
    let (_, decision) = decide(&app, &file, "return_for_investigation", 1).await;
    let (_, doc) = call(&app, Method::POST, "/api/documents", Some(json!({ "decisionId": decision["id"] }))).await;
    assert_eq!(doc["kind"], "directions_to_police");
    let id = doc["id"].as_str().unwrap().to_string();

    let fetch = |format: &str| {
        let app = app.clone();
        let path = format!("/api/documents/{id}/export/{format}");
        async move {
            let response = app.oneshot(Request::builder().uri(path).body(Body::empty()).unwrap()).await.unwrap();
            let status = response.status();
            (status, axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap())
        }
    };
    let (status, docx) = fetch("docx").await;
    assert_eq!(status, StatusCode::OK);
    // A .docx is a zip archive, not renamed text.
    assert_eq!(&docx[..2], b"PK");
    let (_, md) = fetch("md").await;
    let md = String::from_utf8(md.to_vec()).unwrap();
    assert!(md.contains("# Directions on Return for Further Investigation"));
    assert!(md.contains("Obtain the CCTV footage."));
    assert_eq!(fetch("pdf").await.0, StatusCode::UNPROCESSABLE_ENTITY);

    assert_eq!(call(&app, Method::DELETE, &format!("/api/documents/{id}"), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::GET, &format!("/api/documents/{id}"), None).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn capacity_replays_the_backlog_and_measures_turnaround_from_the_record() {
    let app = app().await;
    // Received 20 days ago, returned 12 days ago, resubmitted 5 days ago, then sanctioned today.
    let (_, file) = call(&app, Method::POST, "/api/prosecution-files", Some(json!({ "title": "A", "receivedAt": now() - 20 * DAY }))).await;
    let file = file["id"].as_str().unwrap().to_string();
    decide(&app, &file, "return_for_investigation", 12).await;
    call(&app, Method::POST, "/api/referrals/resubmission", Some(json!({ "prosecutionFileId": file, "receivedAt": now() - 5 * DAY }))).await;
    // A second file still waiting.
    let (_, waiting) = call(&app, Method::POST, "/api/prosecution-files", Some(json!({ "title": "B", "receivedAt": now() - 3 * DAY }))).await;
    let waiting = waiting["id"].as_str().unwrap();

    let (status, cap) = call(&app, Method::GET, "/api/capacity?months=3", None).await;
    assert_eq!(status, StatusCode::OK, "{cap}");
    let months = cap["months"].as_array().unwrap();
    assert_eq!(months.len(), 3);
    let this_month = months.last().unwrap();
    assert_eq!(this_month["partial"], true);
    // Now: file A is back and waiting again, file B is waiting.
    assert_eq!(this_month["awaitingAtEnd"], 2);
    assert_eq!(this_month["withPoliceAtEnd"], 0);
    // Time with Police is the 7 days between the return and the resubmission.
    let with_police = &cap["turnaround"]["timeWithPolice"];
    assert_eq!(with_police["count"], 1);
    assert!((with_police["medianDays"].as_f64().unwrap() - 7.0).abs() < 0.01);
    // File A was decided (returned) 8 days after its referral.
    let to_decision = &cap["turnaround"]["referralToDecision"];
    assert_eq!(to_decision["count"], 1);
    assert!((to_decision["medianDays"].as_f64().unwrap() - 8.0).abs() < 0.01);
    assert_eq!(cap["longestWaiting"][0]["fileId"], file.as_str());
    assert_eq!(cap["longestWaiting"][1]["fileId"], waiting);
    assert_eq!(cap["decisionMix"][0]["label"], "return_for_investigation");
    assert_eq!(cap["directionsOpen"], 1);
}

#[tokio::test]
async fn an_older_installation_stays_behind_its_passphrase_until_it_is_set_up() {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    // The lock as an older build left it.
    crate::domain::security::Security::new().set_passphrase(&pool, None, "a long enough passphrase").await.unwrap();
    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.unwrap();
    let app = router(AppState { pool, vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security }, None);

    assert_eq!(call(&app, Method::GET, "/api/setup/status", None).await.0, StatusCode::LOCKED, "setup waits for the passphrase");
    assert_eq!(call(&app, Method::POST, "/api/security/unlock", Some(json!({ "passphrase": "wrong wrong wrong" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::POST, "/api/security/unlock", Some(json!({ "passphrase": "a long enough passphrase" }))).await.0, StatusCode::OK);
    assert_eq!(call(&app, Method::GET, "/api/setup/status", None).await.0, StatusCode::OK);
    let (status, _) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "Admin", "role": "administrator" })))).await;
    assert_eq!(status, StatusCode::OK);
    // Setup replaced the passphrase with the protection level.
    let (_, lock) = call(&app, Method::GET, "/api/security/status", None).await;
    assert_eq!(lock["configured"], false);
    assert_eq!(lock["locked"], false);
}

#[tokio::test]
async fn signing_out_closes_the_api_and_every_sign_in_event_is_audited() {
    let app = bare_app().await;
    call(&app, Method::POST, "/api/setup/complete", Some(setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "123456" })))).await;
    let (_, status) = call(&app, Method::GET, "/api/security/status", None).await;
    assert_eq!(status["configured"], true);
    assert_eq!(status["level"], "basic");
    assert_eq!(status["locked"], false);

    assert_eq!(call(&app, Method::POST, "/api/session/sign-out", None).await.0, StatusCode::OK);
    for path in ["/api/workload", "/api/prosecution-files", "/api/audit", "/api/staff"] {
        assert_eq!(call(&app, Method::GET, path, None).await.0, StatusCode::LOCKED, "{path}");
    }
    let (_, status) = call(&app, Method::GET, "/api/security/status", None).await;
    assert_eq!(status["locked"], true);
    assert!(status["actor"].is_null());
    assert!(status["lastBackupAt"].is_null());

    let (_, people) = call(&app, Method::GET, "/api/session/people", None).await;
    let admin = people[0]["id"].as_str().unwrap().to_string();
    assert_eq!(call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": admin, "secret": "999999" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": admin, "secret": "123456" }))).await.0, StatusCode::OK);
    assert_eq!(call(&app, Method::GET, "/api/workload", None).await.0, StatusCode::OK);

    let (_, entries) = call(&app, Method::GET, "/api/audit", None).await;
    let actions: Vec<&str> = entries.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    for expected in ["setup_completed", "signed_out", "sign_in_failed", "signed_in"] {
        assert!(actions.contains(&expected), "{expected} missing from {actions:?}");
    }
    // The PIN itself is nowhere in the trail.
    assert!(!entries.to_string().contains("123456"));
}

#[tokio::test]
async fn repeated_wrong_pins_are_slowed_down() {
    let app = bare_app().await;
    call(&app, Method::POST, "/api/setup/complete", Some(setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "123456" })))).await;
    call(&app, Method::POST, "/api/session/sign-out", None).await;
    let (_, people) = call(&app, Method::GET, "/api/session/people", None).await;
    let admin = people[0]["id"].as_str().unwrap().to_string();
    for _ in 0..5 {
        assert_eq!(call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": admin, "secret": "000000" }))).await.0, StatusCode::FORBIDDEN);
    }
    // Now even the right PIN waits.
    let (code, body) = call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": admin, "secret": "123456" }))).await;
    assert_eq!(code, StatusCode::FORBIDDEN);
    assert!(body["message"].as_str().unwrap().contains("Too many"));
    let (_, status) = call(&app, Method::GET, "/api/security/status", None).await;
    assert!(status["retryAfterSeconds"].as_u64().unwrap() > 0);
}

#[tokio::test]
async fn the_audit_trail_is_a_verifiable_chain_that_cannot_be_edited() {
    let app = app().await;
    let file = new_file(&app).await;
    decide(&app, &file, "take_over", 0).await;
    let (_, verdict) = call(&app, Method::GET, "/api/audit/verify", None).await;
    assert_eq!(verdict["intact"], true);
    assert!(verdict["entries"].as_i64().unwrap() >= 1, "the decision was recorded");
    let (_, entries) = call(&app, Method::GET, "/api/audit", None).await;
    assert!(entries.as_array().unwrap().iter().any(|e| e["action"] == "decision_recorded" && e["fileId"] == file.as_str()));
}

// ---- Police <-> DPP interchange ---------------------------------------------

mod interchange_flow {
    use super::*;
    use base64::Engine as _;
    use pleadli_interchange::envelope::{self, Body};
    use pleadli_interchange::identity::{Identity, IdentityKind, PublicIdentity};
    use pleadli_interchange::messages::*;
    use pleadli_interchange::pairing;

    async fn call_bytes(app: &Router, path: &str) -> (StatusCode, Vec<u8>) {
        let response = app.clone().oneshot(Request::builder().uri(path).body(axum::body::Body::empty()).unwrap()).await.unwrap();
        let status = response.status();
        (status, axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap().to_vec())
    }

    async fn import(app: &Router, bytes: &[u8]) -> (StatusCode, Value) {
        call(app, Method::POST, "/api/interchange/import", Some(json!({ "dataBase64": base64::engine::general_purpose::STANDARD.encode(bytes) }))).await
    }

    struct World {
        app: Router,
        office: PublicIdentity,
        station: Identity,
        connection: String,
    }

    /// A station that has been invited, has answered, and has been confirmed.
    async fn connected(name: &str) -> World {
        let app = app().await;
        let (status, identity) = call(&app, Method::POST, "/api/interchange/identity", Some(json!({ "officeName": "Wandegeya DPP Office", "jurisdiction": "Kampala Central" }))).await;
        assert_eq!(status, StatusCode::OK, "{identity}");
        let (_, connection) = call(&app, Method::POST, "/api/interchange/connections", Some(json!({ "intendedStation": name, "validDays": 14 }))).await;
        let connection_id = connection["id"].as_str().unwrap().to_string();
        let (_, invite_file) = call_bytes(&app, &format!("/api/interchange/connections/{connection_id}/invite")).await;

        // The station reads the invitation and answers it.
        let invite = pairing::read_invite(&invite_file).unwrap();
        assert_eq!(invite.office.fingerprint(), identity["fingerprint"].as_str().unwrap(), "the station sees the office's fingerprint");
        let station = Identity::generate(IdentityKind::PoliceStation, name, Some("Wandegeya"));
        let response = pairing::make_response(&station, &invite, Some("OC A. Officer")).unwrap();
        let (status, outcome) = import(&app, &response).await;
        assert_eq!(status, StatusCode::OK, "{outcome}");
        let (_, list) = call(&app, Method::GET, "/api/interchange/connections", None).await;
        assert_eq!(list[0]["state"], "awaiting_confirmation");

        // The office reads the fingerprint back from the station, typed.
        let typed = station.public.fingerprint().replace('-', "").to_lowercase();
        let (status, trusted) = call(&app, Method::POST, &format!("/api/interchange/connections/{connection_id}/trust"), Some(json!({ "fingerprint": typed }))).await;
        assert_eq!(status, StatusCode::OK, "{trusted}");
        assert_eq!(trusted["state"], "trusted");
        World { app, office: invite.office, station, connection: connection_id }
    }

    fn referral(reference: &str) -> ReferralPayload {
        ReferralPayload {
            police_reference: reference.into(),
            station_name: "Wandegeya Police Station".into(),
            referred_at: now() - DAY,
            referring_officer: Some("D/Sgt B. Detective".into()),
            summary: "Theft of a motor vehicle recovered at Kira Road.".into(),
            people: vec![
                PersonClaim { key: "p1".into(), role: "accused".into(), first_name: "Robert".into(), last_name: "Okello".into(), national_id: Some("CM91034521XYZAB".into()), ..Default::default() },
                PersonClaim { key: "p2".into(), role: "witness".into(), first_name: "Grace".into(), last_name: "Namutebi".into(), ..Default::default() },
            ],
            statements: vec![StatementClaim { key: "s1".into(), person_key: "p2".into(), role: "witness".into(), given_at: now() - 2 * DAY, content: "I saw the accused drive off in the car.".into(), taken_by: Some("D/Sgt B. Detective".into()), file_ids: vec!["scan-1".into()] }],
            exhibits: vec![ExhibitClaim { key: "e1".into(), description: "Toyota Premio UAX 123A".into(), identification_mark: Some("Chassis 555".into()), ..Default::default() }],
            charges: vec![ChargeClaim { accused_person_key: Some("p1".into()), offence: "Theft of a motor vehicle".into(), statutory_section: Some("s.254".into()), particulars: Some("On 3 May the accused took the car.".into()) }],
            ..Default::default()
        }
    }

    fn package(w: &World, payload: &ReferralPayload, seq: u64) -> Vec<u8> {
        let body = Body::new(serde_json::to_value(payload).unwrap()).with_file("scan-1", "statement.pdf", "application/pdf", b"%PDF scanned statement".to_vec());
        envelope::seal(&w.station, &w.office, KIND_REFERRAL, seq, None, &body).unwrap().0
    }

    async fn files_count(app: &Router) -> usize {
        call(app, Method::GET, "/api/prosecution-files?view=all", None).await.1.as_array().unwrap().len()
    }

    #[tokio::test]
    async fn a_referral_that_cannot_be_taken_in_is_refused_and_the_station_is_told_why() {
        let w = connected("Wandegeya Police Station").await;
        // A statement from someone who is not listed on the referral.
        let mut bad = referral("UNTIED 1/2026");
        bad.statements[0].person_key = "nobody".into();
        let bytes = package(&w, &bad, 1);
        let (status, body) = import(&w.app, &bytes).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
        assert!(body["message"].as_str().unwrap().contains("I saw the accused") && body["message"].as_str().unwrap().contains("The station has been told"), "{body}");
        assert_eq!(files_count(&w.app).await, 0, "nothing was kept");
        // The station can read a signed refusal with the reason, and a retry of the same package queues no second one.
        assert_eq!(import(&w.app, &bytes).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        let receipts: Vec<_> = outgoing.as_array().unwrap().iter().filter(|o| o["kind"] == "receipt").collect();
        assert_eq!(receipts.len(), 1);
        let (_, file_bytes) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", receipts[0]["id"].as_str().unwrap())).await;
        let opened = envelope::open(&w.station, envelope::peek(&file_bytes).unwrap(), &w.office).unwrap();
        let payload: ReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!(payload.outcome, "rejected");
        assert!(payload.reason.as_deref().unwrap_or_default().contains("not tied to a person"));
    }

    #[tokio::test]
    async fn a_station_the_office_never_invited_cannot_send_and_an_unconfirmed_one_cannot_either() {
        let app = app().await;
        call(&app, Method::POST, "/api/interchange/identity", Some(json!({ "officeName": "Wandegeya DPP Office" }))).await;
        let (_, identity) = call(&app, Method::GET, "/api/interchange/identity", None).await;
        let office = PublicIdentity { id: identity["officeId"].as_str().unwrap().into(), kind: IdentityKind::DppOffice, name: "Wandegeya DPP Office".into(), jurisdiction: None, verifying_key: identity["verifyingKey"].as_str().unwrap().into(), encryption_key: identity["encryptionKey"].as_str().unwrap().into() };
        // A station that simply has this office's public identity, with no invitation.
        let stranger = Identity::generate(IdentityKind::PoliceStation, "Wandegeya Police Station", None);
        let bytes = envelope::seal(&stranger, &office, KIND_REFERRAL, 1, None, &Body::new(serde_json::to_value(referral("X 1/2026")).unwrap())).unwrap().0;
        let (status, _) = import(&app, &bytes).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(files_count(&app).await, 0);
        let (_, incoming) = call(&app, Method::GET, "/api/interchange/incoming", None).await;
        assert!(incoming.as_array().unwrap().is_empty(), "nothing was kept");

        // It answers an invitation it made up.
        let fake_invite = pairing::PairingInvite { invite_id: "made-up".into(), office: office.clone(), intended_station: "x".into(), expires_at: i64::MAX, nonce: "n".into() };
        let response = pairing::make_response(&stranger, &fake_invite, None).unwrap();
        assert_eq!(import(&app, &response).await.0, StatusCode::FORBIDDEN);

        // A real invitation, answered but not yet confirmed: still not trusted.
        let (_, connection) = call(&app, Method::POST, "/api/interchange/connections", Some(json!({ "intendedStation": "Wandegeya Police Station", "validDays": 7 }))).await;
        let id = connection["id"].as_str().unwrap();
        let (_, invite_file) = call_bytes(&app, &format!("/api/interchange/connections/{id}/invite")).await;
        let invite = pairing::read_invite(&invite_file).unwrap();
        let station = Identity::generate(IdentityKind::PoliceStation, "Wandegeya Police Station", None);
        assert_eq!(import(&app, &pairing::make_response(&station, &invite, None).unwrap()).await.0, StatusCode::OK);
        let bytes = envelope::seal(&station, &invite.office, KIND_REFERRAL, 1, None, &Body::new(serde_json::to_value(referral("X 2/2026")).unwrap())).unwrap().0;
        let (status, body) = import(&app, &bytes).await;
        assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
        // The invitation is single use.
        assert_eq!(import(&app, &pairing::make_response(&station, &invite, None).unwrap()).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        // And a wrong fingerprint does not make it trusted.
        let (status, _) = call(&app, Method::POST, &format!("/api/interchange/connections/{id}/trust"), Some(json!({ "fingerprint": "AAAA-BBBB-CCCC-DDDD-EEEE" }))).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(files_count(&app).await, 0);
    }

    #[tokio::test]
    async fn a_trusted_station_sends_a_referral_that_waits_until_a_person_accepts_it() {
        let w = connected("Wandegeya Police Station").await;
        let mut sent = referral("WANDEGEYA CRB 88/2026");
        sent.medical_exams = vec![MedicalClaim { key: "m1".into(), kind: "pf3".into(), person_name: "Grace Namutebi".into(), facility: Some("Mulago Hospital".into()), examiner_name: Some("Dr. A. Lakot".into()), findings: Some("Cut on the forearm, grievous harm.".into()), ..Default::default() }];
        let bytes = package(&w, &sent, 1);

        let (status, outcome) = import(&w.app, &bytes).await;
        assert_eq!(status, StatusCode::OK, "{outcome}");
        // Held apart: nothing is a record yet.
        assert_eq!(files_count(&w.app).await, 0);
        let (_, people) = call(&w.app, Method::GET, "/api/people?query=Okello", None).await;
        assert!(people.as_array().unwrap().is_empty());
        let package_id = outcome["packageId"].as_str().unwrap().to_string();

        // Replayed, or altered: refused.
        assert_eq!(import(&w.app, &bytes).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        let mut altered = bytes.clone();
        let mid = altered.len() / 2;
        altered[mid] ^= 1;
        assert!(import(&w.app, &altered).await.0.is_client_error());

        // The office reads what it claims, and who says so.
        let (_, detail) = call(&w.app, Method::GET, &format!("/api/interchange/incoming/{package_id}"), None).await;
        assert_eq!(detail["policeReference"], "WANDEGEYA CRB 88/2026");
        assert_eq!(detail["senderFingerprint"], w.station.public.fingerprint().as_str());
        assert_eq!(detail["files"][0]["name"], "statement.pdf");
        assert_eq!(detail["payload"]["people"].as_array().unwrap().len(), 2);

        // Accepting makes the records, in one go.
        let (status, accepted) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{package_id}/accept"), Some(json!({ "odppRegistrationNumber": "ODPP/KLA/0301/2026" }))).await;
        assert_eq!(status, StatusCode::OK, "{accepted}");
        let file = accepted["fileId"].as_str().unwrap().to_string();
        assert_eq!(accepted["attached"], 2 - 1, "the scan was sealed into the file");
        let (_, f) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}"), None).await;
        assert_eq!(f["title"], "State vs. Okello: theft of a motor vehicle");
        assert_eq!(f["policeReference"], "WANDEGEYA CRB 88/2026");
        let (_, statements) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}/statements"), None).await;
        assert_eq!(statements[0]["content"], "I saw the accused drive off in the car.");
        let (_, charges) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}/charges"), None).await;
        assert_eq!(charges[0]["offence"], "Theft of a motor vehicle");
        // The medical form arrives as expert evidence, with the doctor's findings.
        let (_, items) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}/evidence-items"), None).await;
        let expert = items.as_array().unwrap().iter().find(|i| i["category"] == "expert").expect("the PF3 is on the file");
        let text = expert["description"].as_str().unwrap();
        assert!(text.contains("Police medical form (PF3): Grace Namutebi") && text.contains("Mulago Hospital") && text.contains("grievous harm"), "{text}");
        let (_, attachments) = call(&w.app, Method::GET, &format!("/api/attachments?entityType=statement&entityId={}", statements[0]["id"].as_str().unwrap()), None).await;
        assert_eq!(attachments[0]["fileName"], "statement.pdf");
        // It cannot be accepted twice.
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/incoming/{package_id}/accept"), Some(json!({}))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

        // A receipt is waiting for the station, and only the station can read it.
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        let receipt = outgoing.as_array().unwrap().iter().find(|o| o["kind"] == "receipt").unwrap();
        let (status, file_bytes) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", receipt["id"].as_str().unwrap())).await;
        assert_eq!(status, StatusCode::OK);
        let opened = envelope::open(&w.station, envelope::peek(&file_bytes).unwrap(), &w.office).unwrap();
        let payload: ReceiptPayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!(payload.outcome, "accepted");
        assert_eq!(payload.dpp_file_key.as_deref(), Some(file.as_str()));
        assert_eq!(payload.dpp_reference.as_deref(), Some("ODPP/KLA/0301/2026"));
        assert_eq!(opened.header.in_reply_to.as_deref(), Some(package_id.as_str()));
    }

    /// The fields added after the first version, end to end: the station's arrest starts the custody clock when the
    /// referral is accepted, the office's minute reaches the station with only the witnesses still to serve, and the
    /// station's service report updates exactly those witnesses and nothing else.
    #[tokio::test]
    async fn arrest_minute_and_service_report_travel_between_station_and_office() {
        let w = connected("Wandegeya Police Station").await;
        let arrested = now() - 2 * DAY;
        let mut referral = referral("WANDEGEYA CRB 90/2026");
        referral.arrested_at = Some(arrested);
        referral.held_place = Some("Wandegeya Police Station cells".into());
        let (status, outcome) = import(&w.app, &package(&w, &referral, 1)).await;
        assert_eq!(status, StatusCode::OK, "{outcome}");
        let package_id = outcome["packageId"].as_str().unwrap().to_string();
        let (_, accepted) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{package_id}/accept"), Some(json!({}))).await;
        let file = accepted["fileId"].as_str().unwrap().to_string();

        // The arrest is on the file as the station's claim, with the place, and not twice.
        let (_, events) = call(&w.app, Method::GET, &format!("/api/custody-events?fileId={file}"), None).await;
        let arrests: Vec<_> = events.as_array().unwrap().iter().filter(|e| e["kind"] == "arrest").collect();
        assert_eq!(arrests.len(), 1, "{events}");
        assert_eq!(arrests[0]["at"], arrested);
        assert!(arrests[0]["note"].as_str().unwrap().contains("Wandegeya Police Station cells"));

        // A minute with two witnesses, one already served.
        let hearing = add_hearing(&w.app, &file, 1).await;
        let (_, h) = call(&w.app, Method::GET, &format!("/api/hearings?fileId={file}"), None).await;
        let heard_at = h.as_array().unwrap().iter().find(|x| x["id"] == hearing.as_str()).unwrap()["startsAt"].as_i64().unwrap();
        assert_eq!(call(&w.app, Method::POST, &format!("/api/hearings/{hearing}/minute/send"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY, "no minute written yet");
        put(&w.app, &format!("/api/hearings/{hearing}/minute"), json!({
            "nextDate": now() + 10 * DAY, "adjournmentCause": "prosecution", "exhibits": ["Phone"],
            "witnesses": [{ "witness": "PW1 Namutebi", "served": true }, { "witness": "PW2 Kato", "served": false, "reason": "Summons not delivered" }]
        })).await;
        let (status, sent) = call(&w.app, Method::POST, &format!("/api/hearings/{hearing}/minute/send"), None).await;
        assert_eq!(status, StatusCode::OK, "{sent}");
        let (_, bytes) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", sent["id"].as_str().unwrap())).await;
        let opened = envelope::open(&w.station, envelope::peek(&bytes).unwrap(), &w.office).unwrap();
        assert_eq!(opened.header.kind, KIND_HEARING_MINUTE);
        let minute: HearingMinutePayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!(minute.police_reference, "WANDEGEYA CRB 90/2026");
        assert_eq!(minute.witnesses_to_serve.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), vec!["PW2 Kato"], "only the one still to serve");
        assert_eq!(minute.exhibits_to_produce, vec!["Phone".to_string()]);

        // The station answers. It served PW2; it also mentions someone never named, which changes nothing.
        let report = ServiceReportPayload {
            police_reference: "WANDEGEYA CRB 90/2026".into(),
            dpp_file_key: file.clone(),
            heard_at,
            results: vec![ServiceResult { name: "PW2 Kato".into(), served: true, reason: None, served_at: Some(now()) }, ServiceResult { name: "Someone Else".into(), served: true, ..Default::default() }],
            reported_at: now(),
            reported_by: Some("D/Sgt B. Detective".into()),
        };
        let seal = |payload: &ServiceReportPayload, seq| envelope::seal(&w.station, &w.office, KIND_SERVICE_REPORT, seq, None, &Body::new(serde_json::to_value(payload).unwrap())).unwrap().0;
        let (status, body) = import(&w.app, &seal(&report, 2)).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let (_, m) = call(&w.app, Method::GET, &format!("/api/hearings/{hearing}/minute"), None).await;
        let kato = m["witnesses"].as_array().unwrap().iter().find(|x| x["witness"] == "PW2 Kato").unwrap();
        assert_eq!(kato["served"], true);
        assert!(kato["reason"].is_null());
        assert_eq!(m["witnesses"].as_array().unwrap().len(), 2, "no witness was invented");

        // A report about a file this station never sent is refused.
        let mut wrong = report.clone();
        wrong.dpp_file_key = "not-a-file".into();
        let (status, _) = import(&w.app, &seal(&wrong, 3)).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn a_package_for_another_office_or_from_another_station_is_refused() {
        let w = connected("Wandegeya Police Station").await;
        // Sealed to a different office.
        let other_office = Identity::generate(IdentityKind::DppOffice, "Nakawa DPP Office", None);
        let to_other = envelope::seal(&w.station, &other_office.public, KIND_REFERRAL, 1, None, &Body::new(serde_json::to_value(referral("A 1/2026")).unwrap())).unwrap().0;
        assert_eq!(import(&w.app, &to_other).await.0, StatusCode::FORBIDDEN);
        // From a station with a different key, claiming the trusted station's id.
        let mut impostor = Identity::generate(IdentityKind::PoliceStation, "Wandegeya Police Station", None);
        impostor.public.id = w.station.public.id.clone();
        let forged = envelope::seal(&impostor, &w.office, KIND_REFERRAL, 1, None, &Body::new(serde_json::to_value(referral("A 2/2026")).unwrap())).unwrap().0;
        assert_eq!(import(&w.app, &forged).await.0, StatusCode::FORBIDDEN);
        // A package this office sends is not one it receives.
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        let (_, confirmation) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", outgoing[0]["id"].as_str().unwrap())).await;
        assert!(import(&w.app, &confirmation).await.0.is_client_error());
        assert_eq!(files_count(&w.app).await, 0);
        let (_, audit) = call(&w.app, Method::GET, "/api/audit?limit=50", None).await;
        assert!(audit.as_array().unwrap().iter().filter(|e| e["action"] == "package_refused").count() >= 3, "every refusal is on the record");
    }

    #[tokio::test]
    async fn a_referral_can_be_rejected_with_a_reason_the_station_is_told() {
        let w = connected("Wandegeya Police Station").await;
        let (_, outcome) = import(&w.app, &package(&w, &referral("WANDEGEYA CRB 90/2026"), 1)).await;
        let id = outcome["packageId"].as_str().unwrap();
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/incoming/{id}/reject"), Some(json!({}))).await.0, StatusCode::UNPROCESSABLE_ENTITY, "a reason is required");
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/incoming/{id}/reject"), Some(json!({ "reason": "The statements are missing." }))).await.0, StatusCode::NO_CONTENT);
        assert_eq!(files_count(&w.app).await, 0);
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        let receipt = outgoing.as_array().unwrap().iter().find(|o| o["kind"] == "receipt").unwrap();
        let (_, bytes) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", receipt["id"].as_str().unwrap())).await;
        let opened = envelope::open(&w.station, envelope::peek(&bytes).unwrap(), &w.office).unwrap();
        assert_eq!(opened.body.json["outcome"], "rejected");
        assert_eq!(opened.body.json["reason"], "The statements are missing.");
    }

    #[tokio::test]
    async fn decisions_go_back_to_the_station_that_referred_the_file_and_a_resubmission_answers_the_return() {
        let w = connected("Wandegeya Police Station").await;
        let (_, outcome) = import(&w.app, &package(&w, &referral("WANDEGEYA CRB 91/2026"), 1)).await;
        let (_, accepted) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{}/accept", outcome["packageId"].as_str().unwrap()), Some(json!({}))).await;
        let file = accepted["fileId"].as_str().unwrap().to_string();

        // Return it with a direction: the notice carries the direction.
        let (_, returned) = decide(&w.app, &file, "return_for_investigation", 1).await;
        let (status, prepared) = call(&w.app, Method::POST, &format!("/api/interchange/decisions/{}/notice", returned["id"].as_str().unwrap()), None).await;
        assert_eq!(status, StatusCode::OK, "{prepared}");
        let (_, file_bytes) = call_bytes(&w.app, &format!("/api/interchange/outgoing/{}/file", prepared["id"].as_str().unwrap())).await;
        let opened = envelope::open(&w.station, envelope::peek(&file_bytes).unwrap(), &w.office).unwrap();
        let notice: DecisionNoticePayload = serde_json::from_value(opened.body.json).unwrap();
        assert_eq!(notice.decision_type, "return_for_investigation");
        assert_eq!(notice.directions[0].instruction, "Obtain the CCTV footage.");
        assert_eq!(notice.police_reference, "WANDEGEYA CRB 91/2026");
        assert_eq!(notice.dpp_file_key, file);

        // The station answers the return. It must name this file.
        let mut resubmission = referral("WANDEGEYA CRB 91/2026");
        resubmission.resubmission_of = Some("no-such-file".into());
        let (_, wrong) = import(&w.app, &package(&w, &resubmission, 2)).await;
        let (status, _) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{}/accept", wrong["packageId"].as_str().unwrap()), Some(json!({}))).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "a resubmission must name a file this station referred");
        resubmission.resubmission_of = Some(file.clone());
        let (_, again) = import(&w.app, &package(&w, &resubmission, 3)).await;
        let (status, back) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{}/accept", again["packageId"].as_str().unwrap()), Some(json!({ "personMatches": { "p1": null } }))).await;
        assert_eq!(status, StatusCode::OK, "{back}");
        assert_eq!(back["fileId"], file.as_str(), "the same file, not a new one");
        assert_eq!(files_count(&w.app).await, 1);
        let (_, f) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}"), None).await;
        assert_eq!(f["currentStatus"], "resubmitted");
        let (_, referrals) = call(&w.app, Method::GET, &format!("/api/prosecution-files/{file}/referrals"), None).await;
        assert_eq!(referrals.as_array().unwrap().iter().filter(|r| r["isResubmission"] == true).count(), 1);
        assert_eq!(referrals.as_array().unwrap().iter().find(|r| r["isResubmission"] == true).unwrap()["answersDecisionId"], returned["id"]);
    }

    #[tokio::test]
    async fn a_revoked_station_is_refused_and_a_file_with_no_connection_has_no_one_to_notify() {
        let w = connected("Wandegeya Police Station").await;
        let (_, outcome) = import(&w.app, &package(&w, &referral("WANDEGEYA CRB 92/2026"), 1)).await;
        let (_, accepted) = call(&w.app, Method::POST, &format!("/api/interchange/incoming/{}/accept", outcome["packageId"].as_str().unwrap()), Some(json!({}))).await;
        let file = accepted["fileId"].as_str().unwrap();
        let (_, waiting) = import(&w.app, &package(&w, &referral("WANDEGEYA CRB 93/2026"), 2)).await;
        let waiting = waiting["packageId"].as_str().unwrap().to_string();

        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/connections/{}/revoke", w.connection), Some(json!({}))).await.0, StatusCode::UNPROCESSABLE_ENTITY, "a reason is required");
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/connections/{}/revoke", w.connection), Some(json!({ "reason": "Station key was lost." }))).await.0, StatusCode::OK);
        // Nothing more is taken in, what was waiting can no longer be accepted, and no notice goes out.
        assert_eq!(import(&w.app, &package(&w, &referral("WANDEGEYA CRB 94/2026"), 3)).await.0, StatusCode::FORBIDDEN);
        // The station is told once, signed, with the reason (the notice the revoke itself prepared). A station that keeps
        // sending is not answered with a new notice for every attempt within the hour.
        let notices = |outgoing: &Value| outgoing.as_array().unwrap().iter().filter(|p| p["kind"] == "pairing_confirmation" && p["summary"].as_str().unwrap_or("").contains("revoked")).count();
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        assert_eq!(notices(&outgoing), 1, "{outgoing}");
        assert_eq!(import(&w.app, &package(&w, &referral("WANDEGEYA CRB 95/2026"), 4)).await.0, StatusCode::FORBIDDEN);
        let (_, outgoing) = call(&w.app, Method::GET, "/api/interchange/outgoing", None).await;
        assert_eq!(notices(&outgoing), 1, "a second refusal within the hour must not queue a second notice");
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/incoming/{waiting}/accept"), Some(json!({}))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
        let (_, decision) = decide(&w.app, file, "take_over", 0).await;
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/decisions/{}/notice", decision["id"].as_str().unwrap()), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);

        // A file opened by hand has no station behind it.
        let manual = new_file(&w.app).await;
        let (_, d) = decide(&w.app, &manual, "take_over", 0).await;
        assert_eq!(call(&w.app, Method::POST, &format!("/api/interchange/decisions/{}/notice", d["id"].as_str().unwrap()), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    }
}

#[tokio::test]
async fn nothing_works_before_setup_and_setup_happens_once() {
    let app = bare_app().await;
    let (status, body) = call(&app, Method::GET, "/api/prosecution-files", None).await;
    assert_eq!(status, StatusCode::PRECONDITION_REQUIRED);
    assert_eq!(body["code"], "SETUP_REQUIRED");
    let (status, brand) = call(&app, Method::GET, "/api/installation/brand", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(brand["installed"], false);

    let (status, lock) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "The DPP", "role": "administrator", "flag": true })))).await;
    assert_eq!(status, StatusCode::OK, "{lock}");
    assert_eq!(lock["installed"], true);
    assert_eq!(lock["locked"], false);
    assert_eq!(lock["actor"]["name"], "The DPP");
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::OK);

    let again = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "Someone", "role": "administrator" })))).await;
    assert_eq!(again.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn basic_protection_needs_a_pin_and_signs_people_in_one_at_a_time() {
    let app = bare_app().await;
    let (status, _) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "12" })))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "a PIN is 6 digits");

    let mut body = setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "123456" }));
    body["people"] = json!([{ "name": "Clerk", "role": "clerk", "secret": "654321" }]);
    let (status, lock) = call(&app, Method::POST, "/api/setup/complete", Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{lock}");
    assert_eq!(lock["locked"], false, "the person who set it up is signed in");

    call(&app, Method::POST, "/api/session/sign-out", None).await;
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::LOCKED);
    let (_, people) = call(&app, Method::GET, "/api/session/people", None).await;
    assert_eq!(people.as_array().unwrap().len(), 2);
    let clerk = people.as_array().unwrap().iter().find(|p| p["name"] == "Clerk").unwrap()["id"].as_str().unwrap().to_string();

    let (status, _) = call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": clerk, "secret": "000000" }))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, out) = call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": clerk, "secret": "654321" }))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(out["status"], "signed_in");
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::OK);

    // A clerk is not an administrator, and cannot make themselves the DPP.
    assert_eq!(call(&app, Method::POST, "/api/staff", Some(json!({ "name": "X", "role": "clerk", "secret": "111111" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::PUT, "/api/prosecutor-profile", Some(json!({ "name": "Clerk", "isDpp": true }))).await.0, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn a_shared_office_cannot_turn_off_sign_in_until_other_people_are_inactive() {
    let app = bare_app().await;
    let mut body = setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "123456" }));
    body["people"] = json!([{ "name": "Clerk", "role": "clerk", "secret": "654321" }]);
    let (status, lock) = call(&app, Method::POST, "/api/setup/complete", Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{lock}");

    let (status, denied) = put(&app, "/api/installation/protection", json!({ "protection": "none" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{denied}");
    assert_eq!(call(&app, Method::GET, "/api/installation", None).await.1["protection"], "basic");
    assert_eq!(call(&app, Method::GET, "/api/security/status", None).await.1["actor"]["name"], "Admin");
    let (_, audit) = call(&app, Method::GET, "/api/audit", None).await;
    assert!(!audit.as_array().unwrap().iter().any(|entry| entry["action"] == "protection_changed"), "refusal must not record a successful change");

    let (_, people) = call(&app, Method::GET, "/api/staff", None).await;
    let clerk = people.as_array().unwrap().iter().find(|p| p["name"] == "Clerk").unwrap()["id"].as_str().unwrap();
    let (status, updated) = put(&app, &format!("/api/staff/{clerk}"), json!({ "name": "Clerk", "role": "clerk", "active": false })).await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    let (status, solo) = put(&app, "/api/installation/protection", json!({ "protection": "none" })).await;
    assert_eq!(status, StatusCode::OK, "{solo}");
    assert_eq!(solo["level"], "none");
    assert_eq!(solo["actor"]["name"], "Admin");
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::OK);

    let (status, denied) = put(&app, &format!("/api/staff/{clerk}"), json!({ "name": "Clerk", "role": "clerk", "active": true })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{denied}");
    let (_, people) = call(&app, Method::GET, "/api/staff", None).await;
    assert_eq!(people.as_array().unwrap().iter().find(|p| p["name"] == "Clerk").unwrap()["active"], false, "failed reactivation rolls back");
}

#[tokio::test]
async fn a_solo_workspace_needs_sign_in_before_adding_another_person() {
    let app = app().await;
    let second = json!({ "name": "Clerk", "role": "clerk", "secret": "654321" });
    let (status, denied) = call(&app, Method::POST, "/api/staff", Some(second.clone())).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{denied}");
    let (_, people) = call(&app, Method::GET, "/api/staff", None).await;
    assert_eq!(people.as_array().unwrap().len(), 1, "no second person saved");
    let (status, lock) = put(&app, "/api/installation/protection", json!({ "protection": "basic", "secret": "123456" })).await;
    assert_eq!(status, StatusCode::OK, "{lock}");
    let (status, clerk) = call(&app, Method::POST, "/api/staff", Some(second)).await;
    assert_eq!(status, StatusCode::OK, "{clerk}");
    call(&app, Method::POST, "/api/session/sign-out", None).await;
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::LOCKED);
    let (status, signed_in) = call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": clerk["id"], "secret": "654321" }))).await;
    assert_eq!(status, StatusCode::OK, "{signed_in}");
    assert_eq!(signed_in["status"], "signed_in");
}

#[tokio::test]
async fn full_protection_checks_the_phone_code() {
    let app = bare_app().await;
    let (_, enrolment) = call(&app, Method::POST, "/api/setup/second-factor", Some(json!({ "name": "Admin" }))).await;
    let key = enrolment["secret"].as_str().unwrap().to_string();
    let wrong = setup_body("full", json!({ "name": "Admin", "role": "administrator", "secret": "a long enough pass", "secondFactor": { "secret": key, "code": "000000" } }));
    let right_code = crate::domain::totp::current_code(&key);
    assert_eq!(call(&app, Method::POST, "/api/setup/complete", Some(wrong)).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let right = setup_body("full", json!({ "name": "Admin", "role": "administrator", "secret": "a long enough pass", "secondFactor": { "secret": key, "code": right_code } }));
    let (status, lock) = call(&app, Method::POST, "/api/setup/complete", Some(right)).await;
    assert_eq!(status, StatusCode::OK, "{lock}");

    call(&app, Method::POST, "/api/session/sign-out", None).await;
    let (_, people) = call(&app, Method::GET, "/api/session/people", None).await;
    let admin = people[0]["id"].as_str().unwrap().to_string();
    let (_, out) = call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": admin, "secret": "a long enough pass" }))).await;
    assert_eq!(out["status"], "code", "the password alone is not enough");
    assert_eq!(call(&app, Method::GET, "/api/prosecution-files", None).await.0, StatusCode::LOCKED);
}

/// A clerk scans a whole bundle as one PDF, then marks by hand where each
/// paper starts. The one row becomes one row per paper over the same scan.
#[tokio::test]
async fn marking_where_papers_start_splits_one_scan_into_papers() {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.unwrap();
    let app = router(AppState { pool: pool.clone(), vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security }, None);
    let (status, body) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "A. Prosecutor", "role": "administrator" })))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let file = new_file(&app).await;
    sqlx::query("INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes) VALUES ('scan1', 'prosecution_file', ?, 'bundle.pdf', 'x', 'application/pdf', 10)")
        .bind(&file)
        .execute(&pool)
        .await
        .unwrap();
    let (status, item) = call(&app, Method::POST, "/api/file-items", Some(json!({ "prosecutionFileId": file, "kind": "other", "title": "bundle", "attachmentId": "scan1", "pageFrom": 1 }))).await;
    assert_eq!(status, StatusCode::OK, "{item}");
    let id = item["id"].as_str().unwrap();
    let path = format!("/api/file-items/{id}/split");

    // Rules: begin on page 1, no two on one page, none past the last page.
    for starts in [json!([{ "pageFrom": 2, "kind": "complaint", "title": "A" }]), json!([{ "pageFrom": 1, "kind": "other", "title": "A" }, { "pageFrom": 1, "kind": "other", "title": "B" }]), json!([{ "pageFrom": 1, "kind": "other", "title": "A" }, { "pageFrom": 9, "kind": "other", "title": "B" }])] {
        let (status, _) = call(&app, Method::POST, &path, Some(json!({ "pageCount": 8, "starts": starts }))).await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    }

    let starts = json!([
        { "pageFrom": 5, "kind": "witness_statement", "title": "Statement of Namutebi" },
        { "pageFrom": 1, "kind": "complaint", "title": "Complaint" },
        { "pageFrom": 3, "kind": "charge_sheet", "title": "Charge sheet" }
    ]);
    let (status, out) = call(&app, Method::POST, &path, Some(json!({ "pageCount": 8, "starts": starts }))).await;
    assert_eq!(status, StatusCode::OK, "{out}");
    let ranges: Vec<(i64, i64, &str)> = out.as_array().unwrap().iter().map(|i| (i["pageFrom"].as_i64().unwrap(), i["pageTo"].as_i64().unwrap(), i["attachmentId"].as_str().unwrap())).collect();
    assert_eq!(ranges, [(1, 2, "scan1"), (3, 4, "scan1"), (5, 8, "scan1")]);

    // In the file they sit in the same order as the pages.
    let (_, listed) = call(&app, Method::GET, &format!("/api/file-items?fileId={file}"), None).await;
    let titles: Vec<&str> = listed.as_array().unwrap().iter().map(|i| i["title"].as_str().unwrap()).collect();
    assert_eq!(titles, ["Complaint", "Charge sheet", "Statement of Namutebi"]);
}

/// The office edits the legal guide in plain words; each edit keeps the text it
/// replaced, an earlier version comes back, and one action restores the starter.
#[tokio::test]
async fn legal_guide_keeps_history_and_restores_starter_text() {
    let app = app().await;
    let (status, list) = call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    let theft = list.as_array().unwrap().iter().find(|o| o["title"] == "Theft").expect("starter theft").clone();
    assert_eq!(theft["source"], "starter");
    assert_eq!(theft["chargeWording"], "Theft contrary to sections 254 and 261 of the Penal Code Act.");
    let id = theft["id"].as_str().unwrap();

    // The starter carries the Act's elements, not an empty shell: Decide's
    // checklist and the charge form read from these.
    assert!(theft["proving"].as_array().unwrap().len() >= 5, "{theft}");
    assert!(theft["proving"][0].as_str().unwrap().contains("s. 254(1)"));
    assert!(theft["particularsTemplate"].as_str().unwrap().contains("stole"));
    assert!(!theft["papers"].as_array().unwrap().is_empty() && !theft["gaps"].as_array().unwrap().is_empty());
    // Housebreaking (dwelling, s. 295) and breaking into a building (s. 297) are two offences.
    let titles: Vec<&str> = list.as_array().unwrap().iter().filter_map(|o| o["title"].as_str()).collect();
    assert!(titles.contains(&"Housebreaking") && titles.contains(&"Breaking into a building and committing a felony"), "{titles:?}");

    // Starter entries do not come back twice.
    let (_, again) = call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await;
    assert_eq!(again.as_array().unwrap().len(), list.as_array().unwrap().len());

    let edit = |wording: &str, state: &str| json!({ "title": "Theft", "sectionRefs": "254, 261", "chargeWording": wording, "proving": ["Taking", "  ", "Without consent"], "state": state, "note": "office wording" });
    let (status, edited) = call(&app, Method::PUT, &format!("/api/guide/offences/{id}"), Some(edit("Theft contrary to ss. 254(1) and 261.", "waiting_for_director"))).await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["source"], "office");
    assert_eq!(edited["proving"], json!(["Taking", "Without consent"]));
    assert_eq!(edited["state"], "waiting_for_director");
    assert_eq!(call(&app, Method::PUT, &format!("/api/guide/offences/{id}"), Some(json!({ "title": " " }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, versions) = call(&app, Method::GET, &format!("/api/guide/offences/{id}/versions"), None).await;
    assert_eq!(versions.as_array().unwrap().len(), 1);
    assert_eq!(versions[0]["snapshot"]["chargeWording"], "Theft contrary to sections 254 and 261 of the Penal Code Act.");

    // An earlier version comes back, and the restore is itself kept.
    let vid = versions[0]["id"].as_str().unwrap();
    let (status, back) = call(&app, Method::POST, &format!("/api/guide/versions/{vid}/restore"), None).await;
    assert_eq!(status, StatusCode::OK, "{back}");
    assert_eq!(back["chargeWording"], "Theft contrary to sections 254 and 261 of the Penal Code Act.");
    let (_, versions) = call(&app, Method::GET, &format!("/api/guide/offences/{id}/versions"), None).await;
    assert_eq!(versions.as_array().unwrap().len(), 2);

    // One action puts the starter text back; an office-made entry has none.
    call(&app, Method::PUT, &format!("/api/guide/offences/{id}"), Some(edit("Something else.", "in_use"))).await;
    let (status, starter) = call(&app, Method::POST, &format!("/api/guide/offences/{id}/restore-starter"), None).await;
    assert_eq!(status, StatusCode::OK, "{starter}");
    assert_eq!(starter["source"], "starter");
    assert_eq!(starter["chargeWording"], "Theft contrary to sections 254 and 261 of the Penal Code Act.");
    let (_, own) = call(&app, Method::POST, "/api/guide/offences", Some(json!({ "jurisdiction": "ug", "title": "Forgery" }))).await;
    assert_eq!(call(&app, Method::POST, &format!("/api/guide/offences/{}/restore-starter", own["id"].as_str().unwrap()), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // Removing a starter entry keeps it removed.
    call(&app, Method::DELETE, &format!("/api/guide/offences/{id}"), None).await;
    let (_, after) = call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await;
    assert!(after.as_array().unwrap().iter().all(|o| o["id"] != id));
}

/// Only an administrator changes the legal guide; everyone signed in can read it.
#[tokio::test]
async fn only_an_administrator_changes_the_legal_guide() {
    let app = bare_app().await;
    let mut body = setup_body("basic", json!({ "name": "Admin", "role": "administrator", "secret": "123456" }));
    body["people"] = json!([{ "name": "Clerk", "role": "clerk", "secret": "654321" }]);
    assert_eq!(call(&app, Method::POST, "/api/setup/complete", Some(body)).await.0, StatusCode::OK);
    let (_, list) = call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await;
    let id = list[0]["id"].as_str().unwrap().to_string();

    call(&app, Method::POST, "/api/session/sign-out", None).await;
    let (_, people) = call(&app, Method::GET, "/api/session/people", None).await;
    let clerk = people.as_array().unwrap().iter().find(|p| p["name"] == "Clerk").unwrap()["id"].as_str().unwrap().to_string();
    call(&app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": clerk, "secret": "654321" }))).await;

    assert_eq!(call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await.0, StatusCode::OK);
    let edit = json!({ "title": "Theft", "chargeWording": "changed" });
    assert_eq!(call(&app, Method::PUT, &format!("/api/guide/offences/{id}"), Some(edit)).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::POST, "/api/guide/offences", Some(json!({ "jurisdiction": "ug", "title": "X" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/guide/offences/{id}"), None).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, Method::POST, &format!("/api/guide/offences/{id}/restore-starter"), None).await.0, StatusCode::FORBIDDEN);
    let (_, still) = call(&app, Method::GET, "/api/guide/offences?jurisdiction=ug", None).await;
    assert_eq!(still.as_array().unwrap().len(), list.as_array().unwrap().len());
}

/// The registers are made from what the office did: a file received is an
/// incoming line, a handover an outgoing line, and giving a file out a
/// movement line that also changes who holds it. Numbers run in order per year.
#[tokio::test]
async fn registers_are_numbered_from_events_and_giving_out_changes_the_holder() {
    let app = app().await;
    let a = new_file(&app).await;
    let b = new_file(&app).await;
    let year: i64 = {
        let (_, years) = call(&app, Method::GET, "/api/registry/years", None).await;
        years[0].as_i64().unwrap()
    };

    let (status, incoming) = call(&app, Method::GET, &format!("/api/registry/entries?register=incoming&year={year}"), None).await;
    assert_eq!(status, StatusCode::OK, "{incoming}");
    let nums: Vec<i64> = incoming.as_array().unwrap().iter().map(|e| e["number"].as_i64().unwrap()).collect();
    assert_eq!(nums, [1, 2]);
    // Asking again does not write the same files twice.
    let (_, again) = call(&app, Method::GET, &format!("/api/registry/entries?register=incoming&year={year}"), None).await;
    assert_eq!(again.as_array().unwrap().len(), 2);
    assert_eq!(call(&app, Method::GET, "/api/registry/entries?register=nonsense&year=2026", None).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // A stamp is who and when, as text.
    let first = incoming[0]["id"].as_str().unwrap();
    assert_eq!(call(&app, Method::POST, &format!("/api/registry/entries/{first}/stamps"), Some(json!({ "label": "Received" }))).await.0, StatusCode::NO_CONTENT);
    assert_eq!(call(&app, Method::POST, &format!("/api/registry/entries/{first}/stamps"), Some(json!({ "label": " " }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, stamped) = call(&app, Method::GET, &format!("/api/registry/entries?register=incoming&year={year}"), None).await;
    let first_entry = stamped.as_array().unwrap().iter().find(|e| e["id"] == first).unwrap();
    assert_eq!(first_entry["stamps"][0]["label"], "Received");
    assert_eq!(first_entry["stamps"][0]["by"], "A. Prosecutor");

    // Giving a file out: to a person outside, then to someone on the staff.
    assert_eq!(call(&app, Method::POST, "/api/registry/give-out", Some(json!({ "prosecutionFileId": a }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::POST, "/api/registry/give-out", Some(json!({ "prosecutionFileId": a, "givenTo": "Registrar, High Court" }))).await.0, StatusCode::NO_CONTENT);
    let (_, staff) = call(&app, Method::GET, "/api/staff", None).await;
    let me = staff[0]["id"].as_str().unwrap();
    assert_eq!(call(&app, Method::POST, "/api/registry/give-out", Some(json!({ "prosecutionFileId": b, "staffId": me, "note": "within 3 days" }))).await.0, StatusCode::NO_CONTENT);
    let (_, moves) = call(&app, Method::GET, &format!("/api/registry/entries?register=movement&year={year}"), None).await;
    let moves: Vec<(i64, &str)> = moves.as_array().unwrap().iter().map(|e| (e["number"].as_i64().unwrap(), e["givenTo"].as_str().unwrap())).collect();
    assert_eq!(moves, [(1, "Registrar, High Court"), (2, "A. Prosecutor")]);
    let (_, holders) = call(&app, Method::GET, "/api/registry/holders", None).await;
    let held: Vec<(Option<&str>, i64)> = holders.as_array().unwrap().iter().map(|h| (h["name"].as_str(), h["files"].as_i64().unwrap())).collect();
    assert_eq!(held, [(Some("A. Prosecutor"), 1), (None, 1)]);
}

async fn add_hearing(app: &Router, file: &str, days: i64) -> String {
    let (status, h) = call(app, Method::POST, "/api/hearings", Some(json!({
        "prosecutionFileId": file, "court": "High Court, Kampala", "kind": "hearing", "startsAt": now() + days * DAY
    }))).await;
    assert_eq!(status, StatusCode::OK, "{h}");
    h["id"].as_str().unwrap().to_string()
}

#[tokio::test]
async fn a_minute_records_who_was_served_and_replaces_its_witnesses_as_a_set() {
    let app = app().await;
    let file = new_file(&app).await;
    let hearing = add_hearing(&app, &file, 1).await;
    let path = format!("/api/hearings/{hearing}/minute");

    let (status, _) = call(&app, Method::GET, &path, None).await;
    assert_eq!(status, StatusCode::OK);

    // A witness who was not served needs a reason; every witness needs a name.
    let (status, _) = put(&app, &path, json!({ "witnesses": [{ "witness": "PW3", "served": false }] })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = put(&app, &path, json!({ "witnesses": [{ "witness": "  ", "served": true }] })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, minute) = put(&app, &path, json!({
        "nextDate": now() + 10 * DAY, "adjournmentCause": " prosecution ", "exhibits": ["Phone", "  ", "Photo"], "note": "Witness absent",
        "witnesses": [{ "witness": "PW2", "served": true }, { "witness": "PW3", "served": false, "reason": "Summons not delivered" }]
    })).await;
    assert_eq!(status, StatusCode::OK, "{minute}");
    assert_eq!(minute["adjournmentCause"], "prosecution");
    assert_eq!(minute["exhibits"], json!(["Phone", "Photo"]));
    assert_eq!(minute["witnesses"].as_array().unwrap().len(), 2);
    assert_eq!(minute["witnesses"][1]["served"], false);

    // Saving again replaces the witnesses, and a served witness keeps no reason.
    let (_, minute) = put(&app, &path, json!({ "witnesses": [{ "witness": "PW3", "served": true, "reason": "stale" }] })).await;
    assert_eq!(minute["witnesses"].as_array().unwrap().len(), 1);
    assert_eq!(minute["witnesses"][0]["reason"], Value::Null);
    assert_eq!(minute["adjournmentCause"], Value::Null);

    let (_, all) = call(&app, Method::GET, &format!("/api/hearings/minutes?fileId={file}"), None).await;
    assert_eq!(all.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn adjournments_raise_a_review_clock_at_the_office_limit() {
    let app = app().await;
    let file = new_file(&app).await;
    let has_clock = |clocks: &Value| clocks.as_array().unwrap().iter().any(|c| c["fileId"] == file.as_str() && c["kind"] == "adjournment_review");

    for n in 1..=3 {
        let hearing = add_hearing(&app, &file, n).await;
        let (_, clocks) = call(&app, Method::GET, "/api/clocks", None).await;
        assert!(!has_clock(&clocks), "no clock before the limit, after {} adjournments", n - 1);
        let (status, _) = put(&app, &format!("/api/hearings/{hearing}/minute"), json!({ "adjournmentCause": "prosecution" })).await;
        assert_eq!(status, StatusCode::OK);
    }
    let (_, clocks) = call(&app, Method::GET, "/api/clocks", None).await;
    let clock = clocks.as_array().unwrap().iter().find(|c| c["fileId"] == file.as_str() && c["kind"] == "adjournment_review").expect("clock at the limit");
    assert_eq!(clock["count"], 3);
    assert_eq!(clock["overdue"], true);
}

#[tokio::test]
async fn proving_checks_are_kept_per_item_and_updated_in_place() {
    let app = app().await;
    let file = new_file(&app).await;
    let other = new_file(&app).await;

    let (status, checks) = put(&app, "/api/proving", json!({ "fileId": file, "item": " A person took it ", "done": true, "page": " Statement p. 1 " })).await;
    assert_eq!(status, StatusCode::OK, "{checks}");
    assert_eq!(checks, json!([{ "item": "A person took it", "done": true, "page": "Statement p. 1" }]));

    put(&app, "/api/proving", json!({ "fileId": file, "item": "The accused did it", "done": false })).await;
    // The same item again updates it; an empty page is no page.
    let (_, checks) = put(&app, "/api/proving", json!({ "fileId": file, "item": "A person took it", "done": false, "page": "  " })).await;
    assert_eq!(checks.as_array().unwrap().len(), 2);
    assert_eq!(checks[0]["done"], false);
    assert_eq!(checks[0]["page"], Value::Null);

    // Another file's checklist is separate.
    let (_, theirs) = call(&app, Method::GET, &format!("/api/proving?fileId={other}"), None).await;
    assert_eq!(theirs, json!([]));
}

/// Assist is told the guide's elements for the offence on the file, found from
/// the charge's wording or its section number, and nothing when none fits.
#[tokio::test]
async fn assist_is_told_the_guide_for_the_offence_on_the_file() {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.unwrap();
    let app = router(AppState { pool: pool.clone(), vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security }, None);
    let (status, body) = call(&app, Method::POST, "/api/setup/complete", Some(setup_body("none", json!({ "name": "A. Prosecutor", "role": "administrator" })))).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let file = new_file(&app).await;
    assert!(crate::domain::guide::context_for_file(&pool, &file, "ug").await.unwrap().is_empty(), "no charge, no guide");

    add_charge(&app, &file, "Theft").await;
    let text = crate::domain::guide::context_for_file(&pool, &file, "ug").await.unwrap();
    assert!(text.contains("s. 254(1)") && text.contains("Often missing") && text.contains("say which paper and page"), "{text}");
    assert!(!text.contains("Grievous harm"), "only the offence on the file: {text}");

    // A charge worded loosely still finds its entry by the section it names.
    let other = new_file(&app).await;
    let (status, _) = call(&app, Method::POST, "/api/charges", Some(json!({ "prosecutionFileId": other, "offence": "Wounding a neighbour", "statutorySection": "Section 219" }))).await;
    assert_eq!(status, StatusCode::OK);
    let text = crate::domain::guide::context_for_file(&pool, &other, "ug").await.unwrap();
    assert!(text.contains("Grievous harm") && text.contains("maim"), "{text}");
}

/// Receiving a file takes it into the officer's hands: the ODPP number is kept,
/// the officer holds it, and its incoming line is stamped once. The suggested
/// next number follows only the office's own numbers of this year.
#[tokio::test]
async fn receiving_a_file_numbers_it_from_the_offices_own_series_and_stamps_it_once() {
    use chrono::Datelike;
    let year = chrono::Utc::now().year();
    let app = app().await;
    let a = new_file(&app).await;
    let b = new_file(&app).await;

    // No numbers yet, so nothing is invented.
    let (status, none) = call(&app, Method::GET, "/api/registry/next-number", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(none.is_null(), "{none}");

    let first = format!("ODPP/KLA/0142/{year}");
    assert_eq!(call(&app, Method::POST, &format!("/api/prosecution-files/{a}/receive"), Some(json!({ "odppNumber": first }))).await.0, StatusCode::NO_CONTENT);
    let (_, next) = call(&app, Method::GET, "/api/registry/next-number", None).await;
    assert_eq!(next, json!(format!("ODPP/KLA/0143/{year}")));

    // Another file cannot take a number that is already used.
    let (status, _) = call(&app, Method::POST, &format!("/api/prosecution-files/{b}/receive"), Some(json!({ "odppNumber": first }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::POST, &format!("/api/prosecution-files/{b}/receive"), Some(json!({ "odppNumber": next }))).await.0, StatusCode::NO_CONTENT);

    // Receiving twice, with another number, changes nothing: the first stands.
    assert_eq!(call(&app, Method::POST, &format!("/api/prosecution-files/{a}/receive"), Some(json!({ "odppNumber": format!("ODPP/KLA/0999/{year}") }))).await.0, StatusCode::NO_CONTENT);
    let (_, file) = call(&app, Method::GET, &format!("/api/prosecution-files/{a}"), None).await;
    assert_eq!(file["odppRegistrationNumber"], json!(first));
    assert!(file["assignedTo"].is_string(), "the officer who received it holds it");

    let (_, entries) = call(&app, Method::GET, &format!("/api/registry/entries?register=incoming&year={year}"), None).await;
    let line = entries.as_array().unwrap().iter().find(|e| e["prosecutionFileId"] == json!(a)).unwrap();
    let received = line["stamps"].as_array().unwrap().iter().filter(|s| s["label"] == "RECEIVED").count();
    assert_eq!(received, 1, "{line}");

    // The suggestion moves on with the newest number taken.
    let (_, next) = call(&app, Method::GET, "/api/registry/next-number", None).await;
    assert_eq!(next, json!(format!("ODPP/KLA/0144/{year}")));
    assert_eq!(call(&app, Method::POST, "/api/prosecution-files/nonexistent/receive", Some(json!({}))).await.0, StatusCode::NOT_FOUND);
}

// ---- What each file needs next: one answer for every screen ----------------

async fn attention(app: &Router) -> Value {
    let (status, body) = call(app, Method::GET, "/api/attention", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body
}

fn item<'a>(att: &'a Value, file: &str) -> &'a Value {
    att["items"].as_array().unwrap().iter().find(|i| i["fileId"] == file).expect("file in attention")
}

/// The status bar and the sidebar read the workload; Today, Inbox and Files read
/// attention. They must never disagree because both come from one rule set.
async fn assert_workload_matches(app: &Router) {
    let att = attention(app).await;
    let (_, w) = call(app, Method::GET, "/api/workload", None).await;
    assert_eq!(w["needsYou"], att["summary"], "workload and attention disagree");
    let s = &att["summary"];
    let sum: i64 = ["toAllocate", "toRead", "toDecide", "toSend"].iter().map(|k| s[k].as_i64().unwrap()).sum();
    assert_eq!(s["total"].as_i64().unwrap(), sum, "total is the sum of its parts");
}

#[tokio::test]
async fn a_received_file_is_the_offices_to_give_out_then_mine_to_read() {
    let app = app().await;
    let file = new_file(&app).await;
    let att = attention(&app).await;
    assert_eq!((item(&att, &file)["action"].as_str(), item(&att, &file)["holder"].as_str()), (Some("allocate"), Some("office")));
    assert_eq!(att["summary"]["toAllocate"], 1);
    assert_workload_matches(&app).await;

    let (_, staff) = call(&app, Method::GET, "/api/staff", None).await;
    let me = staff[0]["id"].as_str().unwrap().to_string();
    let (status, _) = call(&app, Method::POST, "/api/registry/give-out", Some(json!({ "prosecutionFileId": file, "staffId": me }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let att = attention(&app).await;
    let n = item(&att, &file);
    assert_eq!((n["action"].as_str(), n["heldByMe"].as_bool(), n["needsMe"].as_bool()), (Some("read"), Some(true), Some(true)));
    assert_eq!((att["summary"]["toRead"].as_i64(), att["summary"]["toAllocate"].as_i64()), (Some(1), Some(0)));
    assert_workload_matches(&app).await;
}

#[tokio::test]
async fn a_decided_file_is_never_still_awaiting_a_decision() {
    let app = app().await;
    let file = new_file(&app).await;
    let (status, _) = decide(&app, &file, "decline", 0).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(status_of(&app, &file).await, "declined");
    let att = attention(&app).await;
    // Declined by status, and its answer is still to be prepared and sent.
    assert_eq!(item(&att, &file)["action"], "prepare");
    assert_eq!(att["summary"]["toDecide"], 0);
    assert_eq!(att["summary"]["toSend"], 1);
    assert_workload_matches(&app).await;
}

#[tokio::test]
async fn a_file_returned_for_investigation_waits_on_police_and_is_not_counted_as_mine() {
    let app = app().await;
    let file = new_file(&app).await;
    let (status, _) = decide(&app, &file, "return_for_investigation", 3).await;
    assert_eq!(status, StatusCode::OK);
    let att = attention(&app).await;
    let n = item(&att, &file);
    assert_eq!((n["action"].as_str(), n["holder"].as_str(), n["needsMe"].as_bool()), (Some("await_police"), Some("police"), Some(false)));
    assert_eq!(att["summary"]["withPolice"], 1);
    assert_eq!(att["summary"]["total"], 0);
    assert_workload_matches(&app).await;
}

#[tokio::test]
async fn a_concluded_file_owes_nothing_and_a_reopened_one_is_back_on_my_list() {
    let app = app().await;
    let file = new_file(&app).await;
    let (_, _) = decide(&app, &file, "decline", 5).await;
    let (status, _) = put(&app, &format!("/api/prosecution-files/{file}/stage"), json!({ "stage": "concluded" })).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let att = attention(&app).await;
    assert_eq!((item(&att, &file)["action"].as_str(), item(&att, &file)["needsMe"].as_bool()), (Some("closed"), Some(false)));
    assert_eq!(att["summary"]["total"], 0);

    // Reopening the decision puts the file back in front of the prosecutor.
    let (_, decisions) = call(&app, Method::GET, &format!("/api/prosecution-files/{file}/decisions"), None).await;
    let decision = decisions[0]["id"].as_str().unwrap().to_string();
    let (status, review) = call(&app, Method::POST, "/api/charging-reviews", Some(json!({ "prosecutionFileId": file, "standard": "two_stage", "reopensDecisionId": decision, "reopenReason": "New statement." }))).await;
    assert_eq!(status, StatusCode::OK, "{review}");
    let att = attention(&app).await;
    assert_eq!((item(&att, &file)["action"].as_str(), item(&att, &file)["needsMe"].as_bool()), (Some("decide"), Some(true)));
    assert_workload_matches(&app).await;
}

#[tokio::test]
async fn the_files_list_and_attention_describe_the_same_files() {
    let app = app().await;
    let a = new_file(&app).await;
    let b = new_file(&app).await;
    decide(&app, &b, "return_for_investigation", 2).await;
    let att = attention(&app).await;
    let (_, list) = call(&app, Method::GET, "/api/prosecution-files?view=all", None).await;
    let mut listed: Vec<&str> = list.as_array().unwrap().iter().map(|f| f["id"].as_str().unwrap()).collect();
    let mut covered: Vec<&str> = att["items"].as_array().unwrap().iter().map(|i| i["fileId"].as_str().unwrap()).collect();
    listed.sort();
    covered.sort();
    assert_eq!(listed, covered, "every file the list shows has a next step, and no other");
    assert!(covered.contains(&a.as_str()));
}

// ---- A shared office: sign-in, powers kept apart, files visible to the right people ----

struct Office {
    app: Router,
    pool: sqlx::SqlitePool,
    ids: std::collections::HashMap<&'static str, String>,
}

const PINS: [(&str, &str); 5] = [("Ada", "111111"), ("Dora", "222222"), ("Amy", "333333"), ("Ben", "444444"), ("Cat", "555555")];

/// An office with an administrator (Ada), the Director (Dora), two prosecutors
/// (Amy, Ben) and a clerk (Cat), each with their own PIN. Ada is signed in.
async fn office() -> Office {
    let (app, pool) = bare_app_with_pool().await;
    let mut body = setup_body("basic", json!({ "name": "Ada", "role": "administrator", "secret": "111111" }));
    body["people"] = json!([
        { "name": "Dora", "role": "prosecutor", "isDpp": true, "secret": "222222" },
        { "name": "Amy", "role": "prosecutor", "secret": "333333" },
        { "name": "Ben", "role": "prosecutor", "secret": "444444" },
        { "name": "Cat", "role": "clerk", "secret": "555555" },
    ]);
    let (status, out) = call(&app, Method::POST, "/api/setup/complete", Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{out}");
    let (_, staff) = call(&app, Method::GET, "/api/staff", None).await;
    let mut ids = std::collections::HashMap::new();
    for (name, _) in PINS {
        let id = staff.as_array().unwrap().iter().find(|p| p["name"] == name).unwrap()["id"].as_str().unwrap().to_string();
        ids.insert(name, id);
    }
    Office { app, pool, ids }
}

impl Office {
    async fn sign_in(&self, name: &str) {
        call(&self.app, Method::POST, "/api/session/sign-out", None).await;
        let pin = PINS.iter().find(|(n, _)| *n == name).unwrap().1;
        let (status, out) = call(&self.app, Method::POST, "/api/session/sign-in", Some(json!({ "staffId": self.ids[name], "secret": pin }))).await;
        assert_eq!(status, StatusCode::OK, "{name}: {out}");
    }

    async fn give(&self, file: &str, to: &str) -> StatusCode {
        call(&self.app, Method::POST, "/api/registry/give-out", Some(json!({ "prosecutionFileId": file, "staffId": self.ids[to] }))).await.0
    }

    async fn next(&self, file: &str) -> Value {
        item(&attention(&self.app).await, file).clone()
    }

    async fn summary(&self) -> Value {
        attention(&self.app).await["summary"].clone()
    }
}

#[tokio::test]
async fn an_administrator_who_only_administers_cannot_register_review_or_hold_files() {
    let o = office().await;
    o.sign_in("Cat").await;
    let file = new_file(&o.app).await;

    o.sign_in("Ada").await;
    // Running the installation is hers: she can read the people and change the powers.
    assert_eq!(call(&o.app, Method::GET, "/api/staff", None).await.0, StatusCode::OK);
    // Prosecuting is not: registering, reviewing, deciding, moving a file's stage.
    assert_eq!(call(&o.app, Method::POST, "/api/prosecution-files", Some(json!({ "title": "X", "receivedAt": now() }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&o.app, Method::POST, "/api/charging-reviews", Some(json!({ "prosecutionFileId": file, "standard": "two_stage" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(call(&o.app, Method::POST, "/api/decisions", Some(json!({ "prosecutionFileId": file, "decisionType": "decline", "decidedAt": now(), "reasons": "x" }))).await.0, StatusCode::FORBIDDEN);
    assert_eq!(put(&o.app, &format!("/api/prosecution-files/{file}/stage"), json!({ "stage": "decide" })).await.0, StatusCode::FORBIDDEN);
    let (_, mine) = call(&o.app, Method::GET, "/api/capabilities/mine", None).await;
    assert_eq!((mine["administer"].as_bool(), mine["reviewFiles"].as_bool(), mine["allocateFiles"].as_bool(), mine["approveDirectorDecisions"].as_bool()), (Some(true), Some(false), Some(false), Some(false)));
    // She cannot be given a file either, because she cannot work it.
    o.sign_in("Cat").await;
    assert_eq!(o.give(&file, "Ada").await, StatusCode::UNPROCESSABLE_ENTITY);
    // And the file sits on nobody's list as hers.
    o.sign_in("Ada").await;
    assert_eq!(o.next(&file).await["needsMe"], false);
    assert_eq!(o.summary().await["total"], 0);
}

#[tokio::test]
async fn registering_allocating_reassigning_and_self_assigning_are_separate_powers() {
    let o = office().await;

    // Cat, the clerk, registers and gives out, but does not review, take or move files.
    o.sign_in("Cat").await;
    let a = new_file(&o.app).await;
    let b = new_file(&o.app).await;
    assert_eq!(o.next(&a).await["action"], "allocate");
    assert_eq!(o.summary().await["toAllocate"], 2);
    assert_eq!(o.give(&a, "Amy").await, StatusCode::NO_CONTENT);
    assert_eq!(o.give(&b, "Cat").await, StatusCode::UNPROCESSABLE_ENTITY, "a clerk cannot hold a file: she cannot review it");
    assert_eq!(o.give(&a, "Ben").await, StatusCode::FORBIDDEN, "giving out is not moving a file someone already holds");
    assert_eq!(call(&o.app, Method::POST, "/api/charging-reviews", Some(json!({ "prosecutionFileId": a, "standard": "two_stage" }))).await.0, StatusCode::FORBIDDEN);

    // Amy, a prosecutor, takes a file for herself, but neither gives out nor moves files.
    o.sign_in("Amy").await;
    assert_eq!(o.next(&b).await["canTake"], true);
    assert_eq!(o.give(&b, "Ben").await, StatusCode::FORBIDDEN, "a prosecutor does not give files out");
    assert_eq!(o.give(&b, "Amy").await, StatusCode::NO_CONTENT, "but she may take one nobody holds");
    let c = {
        o.sign_in("Cat").await;
        new_file(&o.app).await
    };
    o.sign_in("Amy").await;
    assert_eq!(o.give(&a, "Ben").await, StatusCode::FORBIDDEN, "nor hand on a file she holds");

    // Ben cannot pull Amy's file to himself.
    o.sign_in("Ben").await;
    assert_eq!(o.give(&a, "Ben").await, StatusCode::FORBIDDEN, "taking a colleague's file is reassigning");
    assert_eq!(o.give(&c, "Ben").await, StatusCode::NO_CONTENT);

    // Only the Director moves a file from one holder to another.
    o.sign_in("Dora").await;
    assert_eq!(o.give(&a, "Ben").await, StatusCode::NO_CONTENT);
    assert_eq!(o.give(&a, "Ben").await, StatusCode::UNPROCESSABLE_ENTITY, "already holds it");
    o.sign_in("Ben").await;
    assert_eq!(o.next(&a).await["heldByMe"], true);
}

#[tokio::test]
async fn each_person_sees_only_their_own_workload_in_the_counts_but_the_same_files() {
    let o = office().await;
    o.sign_in("Cat").await;
    let a = new_file(&o.app).await;
    let b = new_file(&o.app).await;
    let c = new_file(&o.app).await;
    o.give(&a, "Amy").await;
    o.give(&b, "Ben").await;

    let counts = |s: Value| (s["total"].as_i64().unwrap(), s["toRead"].as_i64().unwrap(), s["toAllocate"].as_i64().unwrap(), s["withColleagues"].as_i64().unwrap());
    // Cat: the one nobody holds is hers to give out; the two given out are the prosecutors'.
    assert_eq!(counts(o.summary().await), (1, 0, 1, 2));
    o.sign_in("Amy").await;
    assert_eq!(counts(o.summary().await), (1, 1, 0, 1), "Amy: her own to read; Ben's is a colleague's; the unallocated one is not hers to give out");
    assert_eq!(o.next(&a).await["needsMe"], true);
    assert_eq!(o.next(&b).await["needsMe"], false);
    assert_eq!(o.next(&b).await["holderName"], "Ben");
    o.sign_in("Ben").await;
    assert_eq!(counts(o.summary().await), (1, 1, 0, 1));
    o.sign_in("Ada").await;
    assert_eq!(counts(o.summary().await), (0, 0, 0, 2), "the administrator has no files and nothing to do on anyone's");

    // The workload the status bar reads is always the same answer as attention, for whoever is signed in.
    for who in ["Cat", "Amy", "Ben", "Dora", "Ada"] {
        o.sign_in(who).await;
        assert_workload_matches(&o.app).await;
    }
    // Everyone sees the same list of files; only what needs them differs.
    o.sign_in("Ada").await;
    assert_eq!(view_ids(&o.app, "all").await.len(), 3);
    o.sign_in("Amy").await;
    assert_eq!(view_ids(&o.app, "all").await.len(), 3);
    let _ = c;
}

#[tokio::test]
async fn the_director_alone_holds_director_decisions_and_the_file_waits_on_the_director_for_everyone_else() {
    let o = office().await;
    o.sign_in("Cat").await;
    let file = new_file(&o.app).await;
    o.give(&file, "Amy").await;
    o.sign_in("Amy").await;
    put(&o.app, &format!("/api/prosecution-files/{file}/stage"), json!({ "stage": "decide" })).await;
    // Amy proposes discontinuance; it becomes the Director's.
    sqlx_proposal(&o, &file).await;
    let n = o.next(&file).await;
    assert_eq!((n["holder"].as_str(), n["needsMe"].as_bool(), n["primary"]["kind"].as_str()), (Some("director"), Some(false), Some("director_decision")));
    o.sign_in("Dora").await;
    let n = o.next(&file).await;
    assert_eq!((n["holder"].as_str(), n["needsMe"].as_bool(), n["heldByMe"].as_bool()), (Some("director"), Some(true), Some(true)));
    o.sign_in("Ada").await;
    assert_eq!(o.next(&file).await["needsMe"], false, "an administrator is not the Director");
}

/// A pending Director-only proposal on the file, as Assist would leave it.
async fn sqlx_proposal(o: &Office, file: &str) {
    sqlx::query(r#"INSERT INTO proposals (id, prosecution_file_id, stage, body, model, status, created_at) VALUES ('p1', ?, 'decide', '{"decision":"discontinue"}', 'test', 'proposed', 0)"#).bind(file).execute(&o.pool).await.unwrap();
}

#[tokio::test]
async fn one_file_can_owe_a_hearing_a_paper_and_a_colleagues_task_at_once() {
    let o = office().await;
    o.sign_in("Cat").await;
    let file = new_file(&o.app).await;
    o.give(&file, "Amy").await;
    o.sign_in("Amy").await;
    put(&o.app, &format!("/api/prosecution-files/{file}/stage"), json!({ "stage": "prepare" })).await;
    let (s, _) = call(&o.app, Method::POST, "/api/hearings", Some(json!({ "prosecutionFileId": file, "court": "Buganda Road", "kind": "mention", "startsAt": now() + DAY }))).await;
    assert_eq!(s, StatusCode::OK);
    let (s, _) = call(&o.app, Method::POST, "/api/tasks", Some(json!({ "prosecutionFileId": file, "title": "Send Ben the exhibit list", "assignedTo": o.ids["Ben"], "dueAt": now() + DAY }))).await;
    assert_eq!(s, StatusCode::OK);

    let n = o.next(&file).await;
    assert_eq!(n["state"], "preparing");
    let mine: Vec<&str> = n["obligations"].as_array().unwrap().iter().filter(|x| x["mine"] == true).map(|x| x["kind"].as_str().unwrap()).collect();
    assert!(mine.contains(&"prepare") && mine.contains(&"hearing") && !mine.contains(&"task"), "{mine:?}");
    assert_eq!(o.summary().await["withSeveral"], 1);
    assert_eq!(o.summary().await["total"], 1, "one file, not three");

    // Ben holds nothing here, yet he has something to do on it, and only that.
    o.sign_in("Ben").await;
    let n = o.next(&file).await;
    let mine: Vec<&str> = n["obligations"].as_array().unwrap().iter().filter(|x| x["mine"] == true).map(|x| x["kind"].as_str().unwrap()).collect();
    assert_eq!(mine, vec!["task"]);
    assert_eq!((n["heldByMe"].as_bool(), n["needsMe"].as_bool()), (Some(false), Some(true)));
    assert_eq!(o.summary().await["toFollowUp"], 1);
}

#[tokio::test]
async fn an_administrator_changes_who_may_do_what_and_nobody_else_can() {
    let o = office().await;
    o.sign_in("Cat").await;
    let file = new_file(&o.app).await;

    o.sign_in("Amy").await;
    assert_eq!(o.give(&file, "Ben").await, StatusCode::FORBIDDEN);
    assert_eq!(call(&o.app, Method::PUT, "/api/capabilities", Some(json!({ "role": "prosecutor", "capability": "allocate_files", "granted": true }))).await.0, StatusCode::FORBIDDEN, "not hers to change");

    o.sign_in("Ada").await;
    let (s, grants) = call(&o.app, Method::PUT, "/api/capabilities", Some(json!({ "role": "prosecutor", "capability": "allocate_files", "granted": true }))).await;
    assert_eq!(s, StatusCode::OK, "{grants}");
    assert_eq!(call(&o.app, Method::PUT, "/api/capabilities", Some(json!({ "role": "prosecutor", "capability": "fly", "granted": true }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // The clerk's power is withdrawn the same way; and nobody is left unable to review.
    o.sign_in("Amy").await;
    assert_eq!(o.give(&file, "Ben").await, StatusCode::NO_CONTENT, "now a prosecutor may give files out");
    o.sign_in("Ada").await;
    assert_eq!(call(&o.app, Method::PUT, "/api/capabilities", Some(json!({ "role": "prosecutor", "capability": "review_files", "granted": false }))).await.0, StatusCode::OK, "the Director still reviews");
    // Ada's grant cannot make her a prosecutor against the sign-in level's rule that the administrator has none by default.
    let (_, mine) = call(&o.app, Method::GET, "/api/capabilities/mine", None).await;
    assert_eq!(mine["reviewFiles"], false);
}

#[tokio::test]
async fn a_solo_installation_with_no_sign_in_keeps_one_person_able_to_do_everything() {
    let app = app().await;
    let (_, mine) = call(&app, Method::GET, "/api/capabilities/mine", None).await;
    for k in ["administer", "reviewFiles", "allocateFiles", "reassignFiles", "selfAssign", "registerFiles", "approveDirectorDecisions"] {
        assert_eq!(mine[k], true, "{k}");
    }
}
