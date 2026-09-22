//! The API exercised as a client would: real router, real migrations, an
//! in-memory database. These pin the rules that live in the domain layer: a
//! sitting is never closed by silence, an adjournment carries a structured
//! reason, an issued order is frozen, and the audit chain stays intact.

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use tower::ServiceExt;

use super::{router, AppState};

const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;

async fn app() -> Router {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    router(AppState { pool, vault_root: std::env::temp_dir().join(format!("courts-vault-{}", uuid::Uuid::new_v4())) })
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

async fn post(app: &Router, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::POST, path, Some(body)).await
}

async fn get(app: &Router, path: &str) -> (StatusCode, Value) {
    call(app, Method::GET, path, None).await
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

async fn new_case(app: &Router, number: &str) -> String {
    let (status, case) = post(app, "/api/cases", json!({ "courtNumber": number, "title": "Uganda v. Okello", "courtLevel": "magistrate", "offence": "Theft" })).await;
    assert_eq!(status, StatusCode::OK, "{case}");
    case["id"].as_str().unwrap().to_string()
}

async fn new_sitting(app: &Router, case: &str, at: i64) -> String {
    let (status, sitting) = post(app, &format!("/api/cases/{case}/sittings"), json!({ "scheduledAt": at, "purpose": "hearing" })).await;
    assert_eq!(status, StatusCode::OK, "{sitting}");
    sitting["id"].as_str().unwrap().to_string()
}

async fn set_profile(app: &Router) {
    let (status, _) = call(app, Method::PUT, "/api/profile", Some(json!({ "name": "Hon. A. Nabirye", "title": "Magistrate Grade I", "courtName": "Buganda Road Chief Magistrate's Court", "courtLevel": "magistrate" }))).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn every_route_is_under_api_and_nothing_else_answers() {
    let app = app().await;
    assert_eq!(get(&app, "/cases").await.0, StatusCode::NOT_FOUND);
    assert_eq!(get(&app, "/api/cases").await.0, StatusCode::OK);
    assert_eq!(get(&app, "/api/system/status").await.1["state"], "ready");
}

#[tokio::test]
async fn a_case_needs_a_number_and_a_title_and_the_number_is_unique() {
    let app = app().await;
    assert_eq!(post(&app, "/api/cases", json!({ "courtNumber": " ", "title": "x", "courtLevel": "magistrate" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/cases", json!({ "courtNumber": "CRB 1/2026", "title": " ", "courtLevel": "magistrate" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/cases", json!({ "courtNumber": "CRB 1/2026", "title": "x", "courtLevel": "tribunal" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    new_case(&app, "CRB 1/2026").await;
    let (status, error) = post(&app, "/api/cases", json!({ "courtNumber": "crb 1/2026", "title": "y", "courtLevel": "magistrate" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("already registered"));
}

#[tokio::test]
async fn custody_is_recorded_for_an_accused_person_only_and_a_remand_date_needs_a_remand() {
    let app = app().await;
    let case = new_case(&app, "CRB 2/2026").await;
    let path = format!("/api/cases/{case}/parties");
    let (status, _) = post(&app, &path, json!({ "role": "complainant", "name": "Nakato", "custody": "remanded" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = post(&app, &path, json!({ "role": "accused", "name": "Okello", "custody": "on_bail", "remandUntil": now() + DAY })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, party) = post(&app, &path, json!({ "role": "accused", "name": "Okello", "custody": "remanded", "remandUntil": now() + 9 * DAY, "custodyPlace": "Kampala Remand Prison" })).await;
    assert_eq!(status, StatusCode::OK, "{party}");
    assert_eq!(party["custody"], "remanded");
    let (status, _) = post(&app, &path, json!({ "role": "accused", "name": "  " })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn a_sitting_cannot_be_held_without_saying_what_was_done() {
    let app = app().await;
    let case = new_case(&app, "CRB 3/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "  " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, held) = post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "Plea taken. Not guilty." })).await;
    assert_eq!(status, StatusCode::OK, "{held}");
    assert_eq!(held["status"], "held");
    // Closed is closed.
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "again" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/cancel"), json!({})).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn an_adjournment_needs_a_reason_and_a_responsible_party_and_other_needs_words() {
    let app = app().await;
    let case = new_case(&app, "CRB 4/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let path = format!("/api/sittings/{sitting}/adjourn");
    assert_eq!(post(&app, &path, json!({ "reason": "tired", "responsible": "court" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "reason": "witness_absent", "responsible": "nobody" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "reason": "other", "responsible": "court" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    // Nothing above changed the sitting.
    let (_, detail) = get(&app, &format!("/api/cases/{case}")).await;
    assert_eq!(detail["sittings"][0]["status"], "scheduled");
    assert_eq!(detail["adjournments"].as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn adjourning_with_a_next_date_schedules_the_next_sitting_in_the_same_step() {
    let app = app().await;
    let case = new_case(&app, "CRB 5/2026").await;
    let at = now() + DAY;
    let sitting = new_sitting(&app, &case, at).await;
    let (status, out) = post(&app, &format!("/api/sittings/{sitting}/adjourn"), json!({ "reason": "prisoner_not_produced", "responsible": "prisons", "nextDate": at + 14 * DAY, "nextPurpose": "plea" })).await;
    assert_eq!(status, StatusCode::OK, "{out}");
    assert_eq!(out["nextSitting"]["purpose"], "plea");
    assert_eq!(out["nextSitting"]["scheduledAt"], at + 14 * DAY);
    assert_eq!(out["adjournment"]["nextSittingId"], out["nextSitting"]["id"]);

    let (_, detail) = get(&app, &format!("/api/cases/{case}")).await;
    assert_eq!(detail["sittings"].as_array().unwrap().len(), 2);
    let closed = detail["sittings"].as_array().unwrap().iter().find(|s| s["id"] == json!(sitting)).unwrap();
    assert_eq!(closed["status"], "adjourned");
    assert_eq!(detail["adjournments"][0]["reason"], "prisoner_not_produced");
    assert_eq!(detail["adjournments"][0]["responsible"], "prisons");
    // A sitting cannot be adjourned twice.
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/adjourn"), json!({ "reason": "other", "responsible": "court", "note": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn the_next_date_must_come_after_the_sitting() {
    let app = app().await;
    let case = new_case(&app, "CRB 6/2026").await;
    let at = now() + 3 * DAY;
    let sitting = new_sitting(&app, &case, at).await;
    let (status, _) = post(&app, &format!("/api/sittings/{sitting}/adjourn"), json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": at - DAY })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn the_cause_list_is_the_sittings_of_a_day_earliest_first_without_cancelled_ones() {
    let app = app().await;
    let day = (now() / DAY + 30) * DAY;
    let a = new_case(&app, "CRB 7/2026").await;
    let b = new_case(&app, "CRB 8/2026").await;
    let c = new_case(&app, "CRB 9/2026").await;
    new_sitting(&app, &a, day + 11 * HOUR).await;
    new_sitting(&app, &b, day + 9 * HOUR).await;
    let cancelled = new_sitting(&app, &c, day + 10 * HOUR).await;
    new_sitting(&app, &c, day + DAY + 9 * HOUR).await;
    post(&app, &format!("/api/sittings/{cancelled}/cancel"), json!({ "note": "Magistrate on leave" })).await;

    let (status, list) = get(&app, &format!("/api/cause-list?from={day}&to={}", day + DAY)).await;
    assert_eq!(status, StatusCode::OK);
    let numbers: Vec<&str> = list.as_array().unwrap().iter().map(|r| r["courtNumber"].as_str().unwrap()).collect();
    assert_eq!(numbers, ["CRB 8/2026", "CRB 7/2026"]);
}

#[tokio::test]
async fn a_case_with_a_sitting_still_scheduled_cannot_be_concluded_and_a_concluded_case_is_closed() {
    let app = app().await;
    let case = new_case(&app, "CRB 10/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    assert_eq!(post(&app, &format!("/api/cases/{case}/conclude"), json!({ "outcome": "Convicted" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "Judgment delivered" })).await;
    assert_eq!(post(&app, &format!("/api/cases/{case}/conclude"), json!({ "outcome": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, closed) = post(&app, &format!("/api/cases/{case}/conclude"), json!({ "outcome": "Convicted and sentenced" })).await;
    assert_eq!(status, StatusCode::OK, "{closed}");
    assert_eq!(closed["status"], "concluded");
    // No new sitting or person until it is reopened.
    assert_eq!(post(&app, &format!("/api/cases/{case}/sittings"), json!({ "scheduledAt": now() + DAY, "purpose": "mention" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/cases/{case}/parties"), json!({ "role": "accused", "name": "X" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, open) = post(&app, &format!("/api/cases/{case}/reopen"), json!({})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(open["status"], "open");
    assert!(open["outcome"].is_null());
}

#[tokio::test]
async fn a_scheduled_sitting_in_the_past_and_a_case_with_no_next_date_are_open_items_on_today() {
    let app = app().await;
    let day = (now() / DAY) * DAY;

    let lapsed = new_case(&app, "CRB 11/2026").await;
    new_sitting(&app, &lapsed, day - 2 * DAY).await;

    let undated = new_case(&app, "CRB 12/2026").await;
    let sitting = new_sitting(&app, &undated, now() + DAY).await;
    post(&app, &format!("/api/sittings/{sitting}/adjourn"), json!({ "reason": "file_incomplete", "responsible": "prosecution" })).await;

    let remand = new_case(&app, "CRB 13/2026").await;
    new_sitting(&app, &remand, now() + 30 * DAY).await;
    post(&app, &format!("/api/cases/{remand}/parties"), json!({ "role": "accused", "name": "Mugisha", "custody": "remanded", "remandUntil": now() + 2 * DAY })).await;
    post(&app, &format!("/api/cases/{remand}/parties"), json!({ "role": "accused", "name": "Otim", "custody": "remanded" })).await;

    let (status, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    assert_eq!(status, StatusCode::OK, "{today}");
    let kinds: Vec<(String, String)> = today["attention"].as_array().unwrap().iter().map(|a| (a["kind"].as_str().unwrap().to_string(), a["courtNumber"].as_str().unwrap().to_string())).collect();
    assert!(kinds.contains(&("not_closed".into(), "CRB 11/2026".into())), "{kinds:?}");
    assert!(kinds.contains(&("no_next_date".into(), "CRB 12/2026".into())), "{kinds:?}");
    assert!(kinds.contains(&("remand_ending".into(), "CRB 13/2026".into())), "{kinds:?}");
    assert!(kinds.contains(&("remand_undated".into(), "CRB 13/2026".into())), "{kinds:?}");
    assert_eq!(today["counts"]["openCases"], 3);
    assert_eq!(today["counts"]["unscheduled"], 1, "the lapsed case still has a sitting scheduled: it is a sitting to close, not a missing date");
    assert_eq!(today["counts"]["notClosed"], 1);
    assert_eq!(today["recentAdjournments"].as_array().unwrap().len(), 1);
    assert_eq!(today["reasonCounts"][0]["reason"], "file_incomplete");
}

#[tokio::test]
async fn an_order_cannot_be_issued_until_the_judicial_officer_and_court_are_set() {
    let app = app().await;
    let case = new_case(&app, "CRB 14/2026").await;
    let (status, order) = post(&app, "/api/orders", json!({ "caseId": case, "kind": "general", "title": "Directions", "fields": { "body": "The State shall file its list of witnesses." } })).await;
    assert_eq!(status, StatusCode::OK, "{order}");
    assert_eq!(order["status"], "draft");
    let id = order["id"].as_str().unwrap();
    let (status, error) = post(&app, &format!("/api/orders/{id}/issue"), json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("Settings"));
}

#[tokio::test]
async fn an_order_is_complete_before_it_is_issued_and_frozen_after() {
    let app = app().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 15/2026").await;
    let (_, order) = post(&app, "/api/orders", json!({ "caseId": case, "kind": "remand", "fields": { "accused": "Okello John" } })).await;
    let id = order["id"].as_str().unwrap().to_string();
    // Incomplete: no place of custody, no date.
    assert_eq!(post(&app, &format!("/api/orders/{id}/issue"), json!({})).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let until = now() + 14 * DAY;
    let (status, edited) = call(&app, Method::PUT, &format!("/api/orders/{id}"), Some(json!({ "fields": { "accused": "Okello John", "prison": "Kampala Remand Prison", "remandUntil": until } }))).await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    let (status, issued) = post(&app, &format!("/api/orders/{id}/issue"), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{issued}");
    assert_eq!(issued["status"], "issued");
    assert_eq!(issued["intact"], true);
    assert_eq!(issued["issuedBy"], "Hon. A. Nabirye");
    let year = chrono::Utc::now().format("%Y").to_string();
    assert_eq!(issued["reference"], format!("ORD/{year}/0001"));
    assert_eq!(issued["content"]["heading"], "REMAND ORDER");
    assert_eq!(issued["content"]["court"], "Buganda Road Chief Magistrate's Court");
    let text = issued["content"]["paragraphs"].to_string();
    assert!(text.contains("Okello John is remanded in custody at Kampala Remand Prison"), "{text}");
    assert!(text.contains("charged with Theft"), "{text}");

    // Frozen: no edit, no discard, no second issue, and the database refuses too.
    assert_eq!(call(&app, Method::PUT, &format!("/api/orders/{id}"), Some(json!({ "fields": {} }))).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/orders/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/orders/{id}/issue"), json!({})).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // The next order gets the next number.
    let (_, second) = post(&app, "/api/orders", json!({ "caseId": case, "kind": "release", "fields": { "accused": "Okello John", "reason": "Bail granted" } })).await;
    let (_, second) = post(&app, &format!("/api/orders/{}/issue", second["id"].as_str().unwrap()), json!({})).await;
    assert_eq!(second["reference"], format!("ORD/{year}/0002"));
}

#[tokio::test]
async fn an_adjournment_order_starts_from_what_was_recorded_when_the_sitting_was_adjourned() {
    let app = app().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 16/2026").await;
    let at = now() + DAY;
    let sitting = new_sitting(&app, &case, at).await;
    post(&app, &format!("/api/sittings/{sitting}/adjourn"), json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": at + 21 * DAY, "nextPurpose": "hearing" })).await;

    let (status, order) = post(&app, "/api/orders", json!({ "caseId": case, "sittingId": sitting, "kind": "adjournment" })).await;
    assert_eq!(status, StatusCode::OK, "{order}");
    assert_eq!(order["fields"]["nextDate"], at + 21 * DAY);
    let (status, issued) = post(&app, &format!("/api/orders/{}/issue", order["id"].as_str().unwrap()), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{issued}");
    let text = issued["content"]["paragraphs"].to_string();
    assert!(text.contains("adjourned to"), "{text}");
    assert!(text.contains("a witness was absent"), "{text}");
}

#[tokio::test]
async fn an_order_for_a_sitting_in_another_case_is_refused() {
    let app = app().await;
    let a = new_case(&app, "CRB 17/2026").await;
    let b = new_case(&app, "CRB 18/2026").await;
    let sitting = new_sitting(&app, &b, now() + DAY).await;
    let (status, _) = post(&app, "/api/orders", json!({ "caseId": a, "sittingId": sitting, "kind": "adjournment" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn the_audit_trail_records_what_happened_who_did_it_and_stays_intact() {
    let app = app().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 19/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "Mention. Fixed for hearing." })).await;
    // A refused request leaves nothing behind.
    post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "again" })).await;

    let (_, entries) = get(&app, &format!("/api/audit?caseId={case}")).await;
    let actions: Vec<&str> = entries.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    assert_eq!(actions, ["sitting_held", "sitting_scheduled", "case_registered"]);
    assert!(entries.as_array().unwrap().iter().all(|e| e["actor"] == "Hon. A. Nabirye"));
    let (_, verdict) = get(&app, "/api/audit/verify").await;
    assert_eq!(verdict["intact"], true);
    assert_eq!(verdict["entries"], 4, "the profile save, then the three above");
}

#[tokio::test]
async fn the_register_can_be_searched_by_number_title_or_a_persons_name() {
    let app = app().await;
    let a = new_case(&app, "CRB 20/2026").await;
    new_case(&app, "CRB 21/2026").await;
    post(&app, &format!("/api/cases/{a}/parties"), json!({ "role": "accused", "name": "Kiiza Robert" })).await;
    let (_, by_name) = get(&app, "/api/cases?query=kiiza").await;
    assert_eq!(by_name.as_array().unwrap().len(), 1);
    assert_eq!(by_name[0]["accused"], "Kiiza Robert");
    let (_, by_number) = get(&app, "/api/cases?query=21%2F2026").await;
    assert_eq!(by_number.as_array().unwrap().len(), 1);
    let (_, unscheduled) = get(&app, "/api/cases?view=unscheduled").await;
    assert_eq!(unscheduled.as_array().unwrap().len(), 2);
    let (_, wildcard) = get(&app, "/api/cases?query=%25").await;
    assert_eq!(wildcard.as_array().unwrap().len(), 0, "a percent sign is searched for, not treated as a wildcard");
}

// ---------------------------------------------------------------- Stage 2

async fn put(app: &Router, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::PUT, path, Some(body)).await
}

async fn accused(app: &Router, case: &str, name: &str) -> Value {
    let (status, party) = post(app, &format!("/api/cases/{case}/parties"), json!({ "role": "accused", "name": name, "custody": "remanded", "remandUntil": now() + 9 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{party}");
    party
}

/// A case with one accused, and a sitting already closed as held.
async fn held_sitting(app: &Router, number: &str) -> (String, String) {
    let case = new_case(app, number).await;
    accused(app, &case, "Okello John").await;
    let sitting = new_sitting(app, &case, now() + DAY).await;
    let (status, _) = post(app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "Evidence of PW1 heard." })).await;
    assert_eq!(status, StatusCode::OK);
    (case, sitting)
}

#[tokio::test]
async fn taking_appearances_lists_everyone_in_the_case_as_unrecorded_and_is_safe_to_repeat() {
    let app = app().await;
    let case = new_case(&app, "CRB 30/2026").await;
    accused(&app, &case, "Okello John").await;
    post(&app, &format!("/api/cases/{case}/parties"), json!({ "role": "complainant", "name": "Nakato" })).await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;

    let (status, list) = post(&app, &format!("/api/sittings/{sitting}/appearances/take"), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list.as_array().unwrap().len(), 2);
    assert!(list.as_array().unwrap().iter().all(|a| a["attendance"] == "unrecorded"), "presence is never assumed");
    let (_, again) = post(&app, &format!("/api/sittings/{sitting}/appearances/take"), json!({})).await;
    assert_eq!(again.as_array().unwrap().len(), 2, "no one is listed twice");

    // A witness who is not a party can be added by hand.
    let (status, witness) = post(&app, &format!("/api/sittings/{sitting}/appearances"), json!({ "name": "Opio Charles", "role": "witness" })).await;
    assert_eq!(status, StatusCode::OK, "{witness}");
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/appearances"), json!({ "name": " ", "role": "witness" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/appearances"), json!({ "name": "X", "role": "judge" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn only_an_accused_person_can_be_recorded_as_not_produced() {
    let app = app().await;
    let case = new_case(&app, "CRB 31/2026").await;
    accused(&app, &case, "Okello John").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let (_, list) = post(&app, &format!("/api/sittings/{sitting}/appearances/take"), json!({})).await;
    let accused_id = list[0]["id"].as_str().unwrap();
    let (_, witness) = post(&app, &format!("/api/sittings/{sitting}/appearances"), json!({ "name": "Opio", "role": "witness" })).await;

    let (status, row) = put(&app, &format!("/api/appearances/{accused_id}"), json!({ "attendance": "not_produced", "note": "Prison had no transport" })).await;
    assert_eq!(status, StatusCode::OK, "{row}");
    assert_eq!(row["attendance"], "not_produced");
    assert_eq!(put(&app, &format!("/api/appearances/{}", witness["id"].as_str().unwrap()), json!({ "attendance": "not_produced" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(put(&app, &format!("/api/appearances/{accused_id}"), json!({ "attendance": "asleep" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn a_note_needs_text_and_a_cancelled_sitting_has_no_record() {
    let app = app().await;
    let case = new_case(&app, "CRB 32/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let path = format!("/api/sittings/{sitting}/notes");
    assert_eq!(post(&app, &path, json!({ "kind": "note", "body": "  " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "kind": "gossip", "body": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, note) = post(&app, &path, json!({ "kind": "evidence", "speaker": "PW1 Opio", "body": "Says he saw the accused." })).await;
    assert_eq!(status, StatusCode::OK, "{note}");
    assert!(note["at"].as_i64().unwrap() > 0, "the moment it was written is kept");

    let (status, edited) = put(&app, &format!("/api/notes/{}", note["id"].as_str().unwrap()), json!({ "kind": "evidence", "speaker": "PW1 Opio", "body": "Says he saw the accused at the market." })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(edited["body"], "Says he saw the accused at the market.");

    let cancelled = new_sitting(&app, &case, now() + 2 * DAY).await;
    post(&app, &format!("/api/sittings/{cancelled}/cancel"), json!({})).await;
    assert_eq!(post(&app, &format!("/api/sittings/{cancelled}/notes"), json!({ "kind": "note", "body": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn a_record_is_signed_only_after_the_sitting_is_closed_and_by_a_named_officer() {
    let app = app().await;
    let case = new_case(&app, "CRB 33/2026").await;
    accused(&app, &case, "Okello John").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    post(&app, &format!("/api/sittings/{sitting}/notes"), json!({ "kind": "note", "body": "Court opened at 9." })).await;

    let (status, error) = post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("Close the sitting"));

    post(&app, &format!("/api/sittings/{sitting}/hold"), json!({ "outcome": "Heard." })).await;
    let (status, error) = post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("Settings"));

    set_profile(&app).await;
    let (status, signed) = post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{signed}");
    assert_eq!(signed["record"]["signedBy"], "Hon. A. Nabirye");
    assert_eq!(signed["record"]["intact"], true);
    assert_eq!(signed["record"]["sha256"].as_str().unwrap().len(), 64);
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await.0, StatusCode::UNPROCESSABLE_ENTITY, "signed once");
}

#[tokio::test]
async fn nothing_to_sign_is_refused_and_a_signed_record_is_frozen_all_the_way_down() {
    let app = app().await;
    set_profile(&app).await;
    let (case, empty) = held_sitting(&app, "CRB 34/2026").await;
    let (status, error) = post(&app, &format!("/api/sittings/{empty}/sign"), json!({})).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("nothing"));

    let (_, list) = post(&app, &format!("/api/sittings/{empty}/appearances/take"), json!({})).await;
    let appearance = list[0]["id"].as_str().unwrap().to_string();
    let (_, note) = post(&app, &format!("/api/sittings/{empty}/notes"), json!({ "kind": "evidence", "body": "PW1 testified." })).await;
    let note = note["id"].as_str().unwrap().to_string();
    assert_eq!(post(&app, &format!("/api/sittings/{empty}/sign"), json!({})).await.0, StatusCode::OK);
    let _ = case;

    // The API refuses every change, and so does the database behind it.
    assert_eq!(put(&app, &format!("/api/notes/{note}"), json!({ "kind": "note", "body": "changed" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/notes/{note}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/sittings/{empty}/notes"), json!({ "kind": "note", "body": "late" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(put(&app, &format!("/api/appearances/{appearance}"), json!({ "attendance": "present" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/appearances/{appearance}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, detail) = get(&app, &format!("/api/sittings/{empty}")).await;
    assert_eq!(detail["record"]["intact"], true);
    assert_eq!(detail["notes"][0]["body"], "PW1 testified.");
}

#[tokio::test]
async fn the_database_itself_refuses_to_change_a_signed_record() {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    sqlx::query("INSERT INTO cases (id, court_number, title) VALUES ('c', 'CRB 1/2026', 't')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO sittings (id, case_id, scheduled_at, purpose, status) VALUES ('s', 'c', 1, 'hearing', 'held')").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO bench_notes (id, sitting_id, at, body) VALUES ('n', 's', 1, 'x')").execute(&pool).await.unwrap();
    sqlx::query("UPDATE sittings SET record_signed_at = 5, record_signed_by = 'A', record_sha256 = 'h' WHERE id = 's'").execute(&pool).await.unwrap();

    assert!(sqlx::query("UPDATE bench_notes SET body = 'y'").execute(&pool).await.is_err());
    assert!(sqlx::query("DELETE FROM bench_notes").execute(&pool).await.is_err());
    assert!(sqlx::query("INSERT INTO bench_notes (id, sitting_id, at, body) VALUES ('m', 's', 2, 'z')").execute(&pool).await.is_err());
    assert!(sqlx::query("UPDATE sittings SET record_sha256 = 'other' WHERE id = 's'").execute(&pool).await.is_err());
    assert!(sqlx::query("UPDATE sittings SET record_signed_at = NULL WHERE id = 's'").execute(&pool).await.is_err());
}

#[tokio::test]
async fn an_unsigned_record_with_notes_is_an_open_item_on_today_until_it_is_signed() {
    let app = app().await;
    set_profile(&app).await;
    let (_, sitting) = held_sitting(&app, "CRB 35/2026").await;
    post(&app, &format!("/api/sittings/{sitting}/notes"), json!({ "kind": "note", "body": "Heard." })).await;
    let day = (now() / DAY) * DAY;
    let kinds = |today: &Value| today["attention"].as_array().unwrap().iter().map(|a| a["kind"].as_str().unwrap().to_string()).collect::<Vec<_>>();

    let (_, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    assert!(kinds(&today).contains(&"record_unsigned".to_string()));
    assert_eq!(today["counts"]["unsignedRecords"], 1);
    post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await;
    let (_, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    assert!(!kinds(&today).contains(&"record_unsigned".to_string()));
}

#[tokio::test]
async fn a_sitting_shows_what_happened_at_the_earlier_ones() {
    let app = app().await;
    let case = new_case(&app, "CRB 36/2026").await;
    let first = new_sitting(&app, &case, now() + DAY).await;
    let (_, out) = post(&app, &format!("/api/sittings/{first}/adjourn"), json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": now() + 20 * DAY })).await;
    let next = out["nextSitting"]["id"].as_str().unwrap().to_string();

    let (status, detail) = get(&app, &format!("/api/sittings/{next}")).await;
    assert_eq!(status, StatusCode::OK, "{detail}");
    assert_eq!(detail["case"]["courtNumber"], "CRB 36/2026");
    assert_eq!(detail["previous"][0]["reason"], "witness_absent");
    assert_eq!(detail["previous"][0]["responsible"], "prosecution");
    assert_eq!(get(&app, "/api/sittings/nope").await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn exhibits_are_labelled_by_side_and_a_ruled_on_exhibit_stays_on_the_register() {
    let app = app().await;
    let case = new_case(&app, "CRB 37/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let path = format!("/api/cases/{case}/exhibits");
    assert_eq!(post(&app, &path, json!({ "producedBy": "nobody", "description": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "producedBy": "prosecution", "description": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, p1) = post(&app, &path, json!({ "sittingId": sitting, "producedBy": "prosecution", "description": "A panga", "witness": "PW1" })).await;
    let (_, p2) = post(&app, &path, json!({ "producedBy": "prosecution", "description": "Medical form" })).await;
    let (_, d1) = post(&app, &path, json!({ "producedBy": "defence", "description": "Alibi letter" })).await;
    assert_eq!((p1["label"].as_str().unwrap(), p2["label"].as_str().unwrap(), d1["label"].as_str().unwrap()), ("P1", "P2", "D1"));

    // Taking back the first mark does not let a later exhibit reuse P2.
    assert_eq!(call(&app, Method::DELETE, &format!("/api/exhibits/{}", p1["id"].as_str().unwrap()), None).await.0, StatusCode::NO_CONTENT);
    let (_, p3) = post(&app, &path, json!({ "producedBy": "prosecution", "description": "Photograph" })).await;
    assert_eq!(p3["label"], "P3");

    let (status, admitted) = put(&app, &format!("/api/exhibits/{}", p2["id"].as_str().unwrap()), json!({ "description": "Medical form", "status": "admitted" })).await;
    assert_eq!(status, StatusCode::OK, "{admitted}");
    assert_eq!(call(&app, Method::DELETE, &format!("/api/exhibits/{}", p2["id"].as_str().unwrap()), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(put(&app, &format!("/api/exhibits/{}", p2["id"].as_str().unwrap()), json!({ "description": "x", "status": "lost" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, detail) = get(&app, &format!("/api/cases/{case}")).await;
    assert_eq!(detail["exhibits"].as_array().unwrap().len(), 3);
    let (_, audit) = get(&app, &format!("/api/audit?caseId={case}")).await;
    assert!(audit.as_array().unwrap().iter().any(|e| e["action"] == "exhibit_ruled_on" && e["detail"] == "P2 admitted"));
}

fn doc(text: &str) -> String {
    json!({ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": text }] }] }).to_string()
}

#[tokio::test]
async fn a_decision_is_drafted_edited_and_then_delivered_once_with_a_reference() {
    let app = app().await;
    let case = new_case(&app, "CRB 38/2026").await;
    assert_eq!(post(&app, "/api/rulings", json!({ "caseId": case, "kind": "verdict", "title": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/rulings", json!({ "caseId": case, "kind": "ruling", "title": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, ruling) = post(&app, "/api/rulings", json!({ "caseId": case, "kind": "ruling", "title": "Ruling on the bail application" })).await;
    assert_eq!(status, StatusCode::OK, "{ruling}");
    let id = ruling["id"].as_str().unwrap().to_string();
    let today = now();

    // Nothing to deliver yet, and no officer or court set.
    assert_eq!(post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": today })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, saved) = put(&app, &format!("/api/rulings/{id}"), json!({ "title": "Ruling on the bail application", "body": doc("The application is granted on the following terms."), "reservedOn": null })).await;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let (status, error) = post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": today })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("Settings"));

    set_profile(&app).await;
    assert_eq!(post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": today + 3 * DAY })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not a future date");
    let (status, delivered) = post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": today })).await;
    assert_eq!(status, StatusCode::OK, "{delivered}");
    let year = chrono::Utc::now().format("%Y").to_string();
    assert_eq!(delivered["reference"], format!("RUL/{year}/0001"));
    assert_eq!(delivered["intact"], true);
    assert_eq!(delivered["content"]["heading"], "RULING");
    assert!(delivered["content"]["body"].as_str().unwrap().contains("granted on the following terms"));

    // Frozen.
    assert_eq!(put(&app, &format!("/api/rulings/{id}"), json!({ "title": "x", "body": doc("changed"), "reservedOn": null })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/rulings/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": today })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // A judgment is numbered on its own line.
    let (_, j) = post(&app, "/api/rulings", json!({ "caseId": case, "kind": "judgment", "title": "Judgment" })).await;
    let jid = j["id"].as_str().unwrap();
    put(&app, &format!("/api/rulings/{jid}"), json!({ "title": "Judgment", "body": doc("The accused is convicted."), "reservedOn": null })).await;
    let (_, jd) = post(&app, &format!("/api/rulings/{jid}/deliver"), json!({ "deliveredOn": today })).await;
    assert_eq!(jd["reference"], format!("JDG/{year}/0001"));
}

#[tokio::test]
async fn a_reserved_decision_stays_on_today_until_it_is_delivered_and_cannot_predate_its_reservation() {
    let app = app().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 39/2026").await;
    let reserved = now() - 30 * DAY;
    let (_, j) = post(&app, "/api/rulings", json!({ "caseId": case, "kind": "judgment", "title": "Judgment", "reservedOn": reserved })).await;
    let id = j["id"].as_str().unwrap().to_string();
    put(&app, &format!("/api/rulings/{id}"), json!({ "title": "Judgment", "body": doc("Reasons."), "reservedOn": reserved })).await;
    let day = (now() / DAY) * DAY;

    let (_, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    let item = today["attention"].as_array().unwrap().iter().find(|a| a["kind"] == "reserved").expect("a reserved decision is an open item");
    assert_eq!(item["at"], reserved);
    assert_eq!(item["refId"], id.as_str());
    assert_eq!(today["counts"]["draftRulings"], 1);

    assert_eq!(post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": reserved - DAY })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/rulings/{id}/deliver"), json!({ "deliveredOn": now() })).await.0, StatusCode::OK);
    let (_, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    assert!(today["attention"].as_array().unwrap().iter().all(|a| a["kind"] != "reserved"));
}

#[tokio::test]
async fn the_library_keeps_texts_someone_added_and_searches_them_without_wildcards() {
    let app = app().await;
    let path = "/api/library";
    assert_eq!(post(&app, path, json!({ "kind": "statute", "title": " ", "body": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, path, json!({ "kind": "statute", "title": "t", "body": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, path, json!({ "kind": "gossip", "title": "t", "body": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(get(&app, "/api/library").await.1.as_array().unwrap().len(), 0, "nothing is bundled");

    let (status, item) = post(&app, path, json!({ "kind": "statute", "title": "Magistrates Courts Act", "citation": "Cap 19", "source": "ULII", "licence": "CC-BY", "body": "Section 138. Evidence to be taken down in writing by the magistrate in the language of the court." })).await;
    assert_eq!(status, StatusCode::OK, "{item}");
    post(&app, path, json!({ "kind": "note", "title": "Bail notes", "body": "The court considers the seriousness of the offence. See the Magistrates Courts Act too." })).await;

    let (_, by_body) = get(&app, "/api/library?query=IN%20THE%20LANGUAGE").await;
    assert_eq!(by_body.as_array().unwrap().len(), 1);
    assert!(by_body[0]["snippet"].as_str().unwrap().to_lowercase().contains("in the language of the court"));
    let (_, both) = get(&app, "/api/library?query=magistrates%20courts%20act").await;
    assert_eq!(both[0]["title"], "Magistrates Courts Act", "a title match comes before a body-only match");
    assert_eq!(both.as_array().unwrap().len(), 2);
    assert_eq!(get(&app, "/api/library?query=%25").await.1.as_array().unwrap().len(), 0, "a percent sign is searched for, not a wildcard");
    assert_eq!(get(&app, "/api/library?kind=note").await.1.as_array().unwrap().len(), 1);

    let id = item["id"].as_str().unwrap();
    let (status, edited) = put(&app, &format!("/api/library/{id}"), json!({ "kind": "statute", "title": "Magistrates Courts Act", "citation": "Cap 19 (2023 edition)", "body": "Section 138." })).await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(get(&app, &format!("/api/library/{id}")).await.1["citation"], "Cap 19 (2023 edition)");
    assert_eq!(call(&app, Method::DELETE, &format!("/api/library/{id}"), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(get(&app, "/api/library").await.1.as_array().unwrap().len(), 1);
    let (_, verdict) = get(&app, "/api/audit/verify").await;
    assert_eq!(verdict["intact"], true);
}

// ------------------------------------------------- Stage 3, 4 and 7

async fn app_with_parts() -> (Router, sqlx::SqlitePool, std::path::PathBuf) {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let vault_root = std::env::temp_dir().join(format!("courts-vault-{}", uuid::Uuid::new_v4()));
    (router(AppState { pool: pool.clone(), vault_root: vault_root.clone() }), pool, vault_root)
}

fn b64(bytes: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)
}

async fn start_recording(app: &Router, sitting: &str) -> String {
    let (status, rec) = post(app, &format!("/api/sittings/{sitting}/recordings"), json!({ "mimeType": "audio/webm;codecs=opus" })).await;
    assert_eq!(status, StatusCode::OK, "{rec}");
    rec["id"].as_str().unwrap().to_string()
}

async fn send_chunk(app: &Router, rec: &str, seq: i64, bytes: &[u8]) -> (StatusCode, Value) {
    post(app, &format!("/api/recordings/{rec}/chunks"), json!({ "seq": seq, "offsetMs": seq * 5000, "durationMs": 5000, "dataBase64": b64(bytes) })).await
}

#[tokio::test]
async fn a_recording_is_saved_in_chained_chunks_and_can_be_played_back_whole() {
    let (app, _pool, _vault) = app_with_parts().await;
    let case = new_case(&app, "CRB 40/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/recordings"), json!({ "mimeType": "text/plain" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let rec = start_recording(&app, &sitting).await;
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/recordings"), json!({ "mimeType": "audio/webm" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "one recorder at a time");

    let (status, c0) = send_chunk(&app, &rec, 0, b"first-chunk-bytes").await;
    assert_eq!(status, StatusCode::OK, "{c0}");
    // A retry of the same chunk is accepted once; a different chunk under that number is not.
    let (status, again) = send_chunk(&app, &rec, 0, b"first-chunk-bytes").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(again["chainSha256"], c0["chainSha256"]);
    assert_eq!(send_chunk(&app, &rec, 0, b"something-else").await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(send_chunk(&app, &rec, 2, b"skipped-one").await.0, StatusCode::UNPROCESSABLE_ENTITY, "no gaps");
    let (_, c1) = send_chunk(&app, &rec, 1, b"second-chunk-bytes").await;
    assert_ne!(c1["chainSha256"], c0["chainSha256"]);

    let (status, stopped) = post(&app, &format!("/api/recordings/{rec}/stop"), json!({})).await;
    assert_eq!(status, StatusCode::OK, "{stopped}");
    assert_eq!(stopped["status"], "stopped");
    assert_eq!(stopped["chunks"], 2);
    assert_eq!(stopped["finalChainSha256"], c1["chainSha256"]);
    assert_eq!(post(&app, &format!("/api/recordings/{rec}/stop"), json!({})).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(send_chunk(&app, &rec, 2, b"too-late").await.0, StatusCode::UNPROCESSABLE_ENTITY, "a finished recording takes no more");

    let (_, check) = get(&app, &format!("/api/recordings/{rec}/verify")).await;
    assert_eq!(check["intact"], true);
    let (status, audio) = get(&app, &format!("/api/recordings/{rec}/audio")).await;
    assert_eq!(status, StatusCode::OK, "{audio}");
    let joined = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, audio["dataBase64"].as_str().unwrap()).unwrap();
    assert_eq!(joined, b"first-chunk-bytesecond-chunk-bytes");

    // A new recording can follow (a pause and a restart).
    start_recording(&app, &sitting).await;
    let (_, list) = get(&app, &format!("/api/sittings/{sitting}/recordings")).await;
    assert_eq!(list.as_array().unwrap().len(), 2);
}

#[tokio::test]
async fn a_chunk_changed_on_disk_is_named_by_the_check() {
    let (app, _pool, vault) = app_with_parts().await;
    let case = new_case(&app, "CRB 41/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let rec = start_recording(&app, &sitting).await;
    send_chunk(&app, &rec, 0, b"aaaa").await;
    send_chunk(&app, &rec, 1, b"bbbb").await;
    post(&app, &format!("/api/recordings/{rec}/stop"), json!({})).await;

    // Swap chunk 1's file for another sealed under a different id.
    let target = vault.join(format!("recordings/{rec}/00000001.enc"));
    let other = vault.join(format!("recordings/{rec}/00000000.enc"));
    std::fs::copy(&other, &target).unwrap();
    let (_, check) = get(&app, &format!("/api/recordings/{rec}/verify")).await;
    assert_eq!(check["intact"], false);
    assert_eq!(check["brokenAt"], 1);
    assert_eq!(get(&app, &format!("/api/recordings/{rec}/audio")).await.0, StatusCode::UNPROCESSABLE_ENTITY, "damaged audio is not handed out as if it were whole");
}

#[tokio::test]
async fn the_database_refuses_to_change_or_remove_a_saved_chunk_or_a_finished_recording() {
    let (app, pool, _vault) = app_with_parts().await;
    let case = new_case(&app, "CRB 42/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let rec = start_recording(&app, &sitting).await;
    send_chunk(&app, &rec, 0, b"aaaa").await;
    assert!(sqlx::query("UPDATE recording_chunks SET bytes = 1").execute(&pool).await.is_err());
    assert!(sqlx::query("DELETE FROM recording_chunks").execute(&pool).await.is_err());
    post(&app, &format!("/api/recordings/{rec}/stop"), json!({})).await;
    assert!(sqlx::query("UPDATE recordings SET status = 'recording'").execute(&pool).await.is_err());
    assert!(sqlx::query("DELETE FROM recordings").execute(&pool).await.is_err());
}

#[tokio::test]
async fn a_recording_still_running_at_the_next_start_is_closed_as_interrupted_keeping_what_was_saved() {
    let (app, pool, _vault) = app_with_parts().await;
    let case = new_case(&app, "CRB 43/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let rec = start_recording(&app, &sitting).await;
    let (_, c0) = send_chunk(&app, &rec, 0, b"before-the-power-cut").await;

    // The application is restarted: nothing ever called stop.
    assert_eq!(crate::domain::recordings::mark_interrupted(&pool).await.unwrap(), 1);
    assert_eq!(crate::domain::recordings::mark_interrupted(&pool).await.unwrap(), 0, "only once");
    let (_, list) = get(&app, &format!("/api/sittings/{sitting}/recordings")).await;
    assert_eq!(list[0]["status"], "interrupted");
    assert_eq!(list[0]["chunks"], 1);
    assert_eq!(list[0]["finalChainSha256"], c0["chainSha256"]);
    let (_, check) = get(&app, &format!("/api/recordings/{rec}/verify")).await;
    assert_eq!(check["intact"], true);
    let (_, audit) = get(&app, &format!("/api/audit?caseId={case}")).await;
    assert!(audit.as_array().unwrap().iter().any(|e| e["action"] == "recording_interrupted"));
    // And a new recording can begin again.
    start_recording(&app, &sitting).await;
}

#[tokio::test]
async fn there_is_no_transcription_engine_and_the_application_says_so_instead_of_inventing_text() {
    let (app, _pool, _vault) = app_with_parts().await;
    let (_, status) = get(&app, "/api/transcription/status").await;
    assert_eq!(status["available"], false);
    let case = new_case(&app, "CRB 44/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let rec = start_recording(&app, &sitting).await;
    let (code, error) = post(&app, &format!("/api/recordings/{rec}/transcribe"), json!({})).await;
    assert_eq!(code, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(error["code"], "TRANSCRIPTION_UNAVAILABLE");
    assert_eq!(get(&app, &format!("/api/recordings/{rec}/segments")).await.1.as_array().unwrap().len(), 0, "no text was made up");
}

#[tokio::test]
async fn a_typed_passage_can_be_adopted_into_the_bench_record_and_is_then_frozen_with_it() {
    let (app, pool, _vault) = app_with_parts().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 45/2026").await;
    let sitting = new_sitting(&app, &case, now() + DAY).await;
    let rec = start_recording(&app, &sitting).await;
    let (_, recording) = get(&app, &format!("/api/sittings/{sitting}/recordings")).await;
    let started = recording[0]["startedAt"].as_i64().unwrap();
    let path = format!("/api/recordings/{rec}/segments");

    assert_eq!(post(&app, &path, json!({ "startMs": 5000, "endMs": 1000, "text": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "startMs": 0, "endMs": 1000, "text": "  " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, segment) = post(&app, &path, json!({ "startMs": 61000, "endMs": 65000, "speaker": "PW1 Opio", "text": "I saw the accused at the market." })).await;
    assert_eq!(status, StatusCode::OK, "{segment}");
    assert_eq!((segment["state"].as_str().unwrap(), segment["source"].as_str().unwrap()), ("edited", "manual"));
    let id = segment["id"].as_str().unwrap().to_string();

    // A machine draft nobody has read is not put into the officer's record.
    sqlx::query("INSERT INTO transcript_segments (id, recording_id, start_ms, end_ms, text, state, source, engine) VALUES ('draft1', ?, 0, 1000, 'machine words', 'draft', 'machine', 'test')").bind(&rec).execute(&pool).await.unwrap();
    assert_eq!(post(&app, "/api/segments/draft1/adopt", json!({ "kind": "evidence" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/segments/{id}/adopt"), json!({ "kind": "gossip" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, adopted) = post(&app, &format!("/api/segments/{id}/adopt"), json!({ "kind": "evidence" })).await;
    assert_eq!(status, StatusCode::OK, "{adopted}");
    assert_eq!(adopted["state"], "adopted");
    let (_, detail) = get(&app, &format!("/api/sittings/{sitting}")).await;
    let note = &detail["notes"][0];
    assert_eq!(note["body"], "I saw the accused at the market.");
    assert_eq!(note["speaker"], "PW1 Opio");
    assert_eq!(note["at"], started + 61000, "stamped with the moment in the sitting it was said");

    assert_eq!(post(&app, &format!("/api/segments/{id}/adopt"), json!({ "kind": "evidence" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(put(&app, &format!("/api/segments/{id}"), json!({ "startMs": 0, "endMs": 1, "text": "changed" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/segments/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn nothing_can_be_adopted_into_a_signed_record() {
    let (app, _pool, _vault) = app_with_parts().await;
    set_profile(&app).await;
    let (_, sitting) = held_sitting(&app, "CRB 46/2026").await;
    post(&app, &format!("/api/sittings/{sitting}/notes"), json!({ "kind": "note", "body": "Heard." })).await;
    let rec = start_recording(&app, &sitting).await;
    let (_, segment) = post(&app, &format!("/api/recordings/{rec}/segments"), json!({ "startMs": 0, "endMs": 1000, "text": "Late passage." })).await;
    assert_eq!(post(&app, &format!("/api/sittings/{sitting}/sign"), json!({})).await.0, StatusCode::OK);
    assert_eq!(post(&app, &format!("/api/segments/{}/adopt", segment["id"].as_str().unwrap()), json!({ "kind": "note" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn the_returns_count_what_was_recorded_in_the_period_and_no_more() {
    let (app, _pool, _vault) = app_with_parts().await;
    set_profile(&app).await;
    let case = new_case(&app, "CRB 47/2026").await;
    let base = (now() / DAY) * DAY;
    let s1 = new_sitting(&app, &case, base + 2 * DAY).await;
    let s2 = new_sitting(&app, &case, base + 3 * DAY).await;
    post(&app, &format!("/api/sittings/{s1}/adjourn"), json!({ "reason": "prisoner_not_produced", "responsible": "prisons" })).await;
    post(&app, &format!("/api/sittings/{s2}/adjourn"), json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": base + 30 * DAY })).await;
    let outside = new_sitting(&app, &case, base + 200 * DAY).await;
    post(&app, &format!("/api/sittings/{outside}/hold"), json!({ "outcome": "Heard." })).await;

    let (status, r) = get(&app, &format!("/api/reports/returns?from={base}&to={}", base + 10 * DAY)).await;
    assert_eq!(status, StatusCode::OK, "{r}");
    assert_eq!(r["sittings"]["total"], 2, "the two adjourned; not the sittings 30 and 200 days away");
    assert_eq!(r["sittings"]["adjourned"], 2);
    assert_eq!(r["adjournments"], 2);
    assert_eq!(r["adjournmentsWithoutDate"], 1);
    assert_eq!(r["mostAdjourned"][0]["adjournments"], 2);
    assert_eq!(r["byReason"].as_array().unwrap().len(), 2);
    assert_eq!(r["openCases"], 1);
    assert_eq!(r["backlog"][0]["count"], 1);
    assert_eq!(r["recordings"], 0);
}
