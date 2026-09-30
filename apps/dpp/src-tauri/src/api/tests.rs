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
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let security = std::sync::Arc::new(crate::domain::security::Security::new());
    security.load(&pool).await.unwrap();
    router(AppState { pool, vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security })
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
    let app = router(AppState { pool, vault_root: std::env::temp_dir(), data_dir: std::env::temp_dir(), security });

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
        let bytes = package(&w, &referral("WANDEGEYA CRB 88/2026"), 1);

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
