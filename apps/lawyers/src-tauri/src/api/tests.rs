//! The API exercised as a client would: real router, real migrations, an
//! in-memory database. These pin the rules that live in the domain layer: the
//! duties the state-funded scheme puts on an appointed advocate become dated
//! tasks, a hearing is never closed by silence, a filed document is frozen, and
//! the plea steps are recorded in order.

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use sqlx::sqlite::SqlitePoolOptions;
use tower::ServiceExt;

use super::{router, AppState};

const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;

/// A copy that has never been set up, as it is on first launch.
async fn fresh_app() -> Router {
    router(fresh_state(0).await)
}

/// The same, as its state, for a test that runs its office listener on `port`.
async fn fresh_state(port: u16) -> AppState {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let security = crate::domain::security::Security::new();
    security.load(&pool).await.unwrap();
    let vault_root = std::env::temp_dir().join(format!("lawyers-vault-test-{}", uuid::Uuid::new_v4()));
    let network = std::sync::Arc::new(crate::domain::network::Runtime::load(&pool).await.unwrap());
    let lan = std::sync::Arc::new(super::Lan::new(vault_root.with_extension("lan")));
    let lan = std::sync::Arc::new(std::sync::Arc::try_unwrap(lan).ok().unwrap().with_port(port));
    AppState { pool, vault_root, lock: std::sync::Arc::new(crate::domain::lock::Runtime::new(false)), security: std::sync::Arc::new(security), network, lan }
}

/// What setup sends, for one advocate working alone.
fn setup_payload(protection: &str, secret: Option<&str>, setting: &str, role: &str, people: Value) -> Value {
    json!({
        "licenceVersion": "2026-09", "jurisdiction": "ug", "language": "en", "model": "office",
        "officeName": "Nabirye & Co. Advocates", "region": "Kampala", "protection": protection, "accent": "navy", "logo": null,
        "administrator": { "name": "A. Nabirye", "rank": "Advocate", "role": role, "flag": false, "secret": secret, "secondFactor": null },
        "people": people,
        "extra": { "setting": setting, "practiceKind": "private", "usages": ["criminal", "civil"] }
    })
}

/// A copy set up by one advocate working alone, with no sign-in: every rule
/// test below runs as that advocate.
async fn app() -> Router {
    let app = fresh_app().await;
    let (status, body) = post(&app, "/api/setup/complete", setup_payload("none", None, "alone", "advocate", json!([]))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    app
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

async fn put(app: &Router, path: &str, body: Value) -> (StatusCode, Value) {
    call(app, Method::PUT, path, Some(body)).await
}

async fn get(app: &Router, path: &str) -> (StatusCode, Value) {
    call(app, Method::GET, path, None).await
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// A day far enough ahead to be a fixed weekday whatever today is: the
/// Monday of a known week (21 September 2026), in East Africa Time.
fn monday() -> i64 {
    use chrono::NaiveDate;
    NaiveDate::from_ymd_opt(2026, 9, 21).unwrap().and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis() - 3 * HOUR
}

async fn new_client(app: &Router, name: &str) -> String {
    let (status, client) = post(app, "/api/clients", json!({ "name": name })).await;
    assert_eq!(status, StatusCode::OK, "{client}");
    client["id"].as_str().unwrap().to_string()
}

async fn new_matter(app: &Router, client: &str, engagement: &str, appointed_on: Option<i64>) -> String {
    let (status, matter) = post(app, "/api/matters", json!({ "clientId": client, "title": "Uganda v. Okello", "courtNumber": "CRB 214/2026", "engagement": engagement, "appointedOn": appointed_on })).await;
    assert_eq!(status, StatusCode::OK, "{matter}");
    matter["id"].as_str().unwrap().to_string()
}

async fn set_profile(app: &Router) {
    let (status, _) = put(app, "/api/profile", json!({ "name": "A. Nabirye, Advocate", "firm": "Nabirye & Co. Advocates" })).await;
    assert_eq!(status, StatusCode::OK);
}

async fn tasks_of(app: &Router, matter: &str) -> Vec<Value> {
    get(app, &format!("/api/tasks?matterId={matter}")).await.1.as_array().unwrap().clone()
}

#[tokio::test]
async fn every_route_is_under_api_and_nothing_else_answers() {
    let app = app().await;
    assert_eq!(get(&app, "/matters").await.0, StatusCode::NOT_FOUND);
    assert_eq!(get(&app, "/api/matters").await.0, StatusCode::OK);
    assert_eq!(get(&app, "/api/system/status").await.1["state"], "ready");
}

#[tokio::test]
async fn a_client_needs_a_name_and_custody_is_one_of_three() {
    let app = app().await;
    assert_eq!(post(&app, "/api/clients", json!({ "name": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/clients", json!({ "name": "X", "custody": "abroad" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, client) = post(&app, "/api/clients", json!({ "name": "Okello", "custody": "remanded", "custodyPlace": "Kampala Remand Prison" })).await;
    assert_eq!(status, StatusCode::OK, "{client}");
    assert_eq!(client["custodyPlace"], "Kampala Remand Prison");
    let (_, free) = post(&app, "/api/clients", json!({ "name": "Auma", "custody": "at_liberty", "custodyPlace": "ignored" })).await;
    assert!(free["custodyPlace"].is_null(), "a place is kept only for someone held");
}

#[tokio::test]
async fn a_matter_needs_a_client_a_title_and_a_way_of_acting_and_its_reference_is_unique() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": "nope", "title": "x", "engagement": "private" })).await.0, StatusCode::NOT_FOUND);
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": client, "title": " ", "engagement": "private" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": client, "title": "x", "engagement": "friend" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": client, "title": "x", "engagement": "private", "courtLevel": "moon" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, _) = post(&app, "/api/matters", json!({ "clientId": client, "title": "One", "engagement": "private", "ourRef": "PRA/1" })).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": client, "title": "Two", "engagement": "private", "ourRef": "pra/1" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn a_state_appointment_makes_the_meeting_confirmation_task_two_working_days_on() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    // Appointed on Friday 18 September 2026: two working days on is Tuesday 22.
    let friday = monday() - 3 * DAY;
    let matter = new_matter(&app, &client, "state_appointed", Some(friday)).await;
    let tasks = tasks_of(&app, &matter).await;
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0]["source"], "state_rule");
    assert_eq!(tasks[0]["ruleKey"], "confirm_meeting");
    assert_eq!(tasks[0]["dueOn"], monday() + DAY);

    // The day follows the appointment if it is corrected, and the task is not doubled.
    let (status, _) = put(&app, &format!("/api/matters/{matter}"), json!({ "clientId": client, "title": "Uganda v. Okello", "engagement": "state_appointed", "appointedOn": monday() })).await;
    assert_eq!(status, StatusCode::OK);
    let tasks = tasks_of(&app, &matter).await;
    assert_eq!(tasks.len(), 1);
    assert_eq!(tasks[0]["dueOn"], monday() + 2 * DAY);

    // A private matter has no such duty; changing an engagement away drops an undone one.
    let (_, _) = put(&app, &format!("/api/matters/{matter}"), json!({ "clientId": client, "title": "Uganda v. Okello", "engagement": "private" })).await;
    assert_eq!(tasks_of(&app, &matter).await.len(), 0);
    let private = new_matter(&app, &client, "private", None).await;
    assert_eq!(tasks_of(&app, &private).await.len(), 0);
}

#[tokio::test]
async fn a_duty_from_the_scheme_is_completed_not_edited_or_removed() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "state_appointed", Some(monday())).await;
    let task = tasks_of(&app, &matter).await[0]["id"].as_str().unwrap().to_string();
    assert_eq!(put(&app, &format!("/api/tasks/{task}"), json!({ "title": "changed" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/tasks/{task}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, done) = post(&app, &format!("/api/tasks/{task}/done"), json!({ "done": true })).await;
    assert_eq!(status, StatusCode::OK, "{done}");
    assert!(done["doneAt"].as_i64().unwrap() > 0);
    let (_, undone) = post(&app, &format!("/api/tasks/{task}/done"), json!({ "done": false })).await;
    assert!(undone["doneAt"].is_null());
}

#[tokio::test]
async fn your_own_tasks_are_free_to_make_change_and_remove() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    assert_eq!(post(&app, "/api/tasks", json!({ "title": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, task) = post(&app, "/api/tasks", json!({ "matterId": matter, "title": "Interview the witness", "dueOn": now() + 2 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{task}");
    assert_eq!(task["source"], "manual");
    let id = task["id"].as_str().unwrap();
    assert_eq!(put(&app, &format!("/api/tasks/{id}"), json!({ "title": "Interview both witnesses" })).await.0, StatusCode::OK);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/tasks/{id}"), None).await.0, StatusCode::NO_CONTENT);
    // A task with no matter is allowed: not everything belongs to one.
    assert_eq!(post(&app, "/api/tasks", json!({ "title": "Renew the practising certificate" })).await.0, StatusCode::OK);
}

#[tokio::test]
async fn a_trial_hearing_in_a_state_appointed_matter_makes_the_readiness_task_five_working_days_before() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let state = new_matter(&app, &client, "state_appointed", Some(monday() - 30 * DAY)).await;
    let hearing_day = monday() + 14 * DAY + 9 * HOUR; // Monday 5 October 2026, 09:00
    let (status, hearing) = post(&app, &format!("/api/matters/{state}/hearings"), json!({ "at": hearing_day, "purpose": "hearing" })).await;
    assert_eq!(status, StatusCode::OK, "{hearing}");
    let readiness: Vec<Value> = tasks_of(&app, &state).await.into_iter().filter(|t| t["ruleKey"].as_str().is_some_and(|k| k.starts_with("trial_readiness"))).collect();
    assert_eq!(readiness.len(), 1);
    assert_eq!(readiness[0]["dueOn"], monday() + 7 * DAY, "five working days before Monday 5 October is Monday 28 September");

    // A mention is not a trial: no certificate.
    post(&app, &format!("/api/matters/{state}/hearings"), json!({ "at": hearing_day + DAY, "purpose": "mention" })).await;
    assert_eq!(tasks_of(&app, &state).await.iter().filter(|t| t["ruleKey"].as_str().is_some_and(|k| k.starts_with("trial_readiness"))).count(), 1);
    // And a private matter never has one.
    let private = new_matter(&app, &client, "private", None).await;
    post(&app, &format!("/api/matters/{private}/hearings"), json!({ "at": hearing_day, "purpose": "hearing" })).await;
    assert_eq!(tasks_of(&app, &private).await.len(), 0);
}

#[tokio::test]
async fn adjourning_a_trial_hearing_moves_the_readiness_task_to_the_next_hearing() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "state_appointed", Some(monday() - 30 * DAY)).await;
    let (_, hearing) = post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": monday() + 14 * DAY, "purpose": "hearing" })).await;
    let id = hearing["id"].as_str().unwrap();
    let readiness = |tasks: &[Value]| tasks.iter().filter(|t| t["ruleKey"].as_str().is_some_and(|k| k.starts_with("trial_readiness"))).map(|t| t["dueOn"].as_i64().unwrap()).collect::<Vec<_>>();
    assert_eq!(readiness(&tasks_of(&app, &matter).await), vec![monday() + 7 * DAY]);

    let (status, out) = post(&app, &format!("/api/hearings/{id}/adjourn"), json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": monday() + 28 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{out}");
    assert_eq!(out["nextHearing"]["purpose"], "hearing", "the next hearing keeps the purpose");
    assert_eq!(readiness(&tasks_of(&app, &matter).await), vec![monday() + 21 * DAY], "the old task is gone and the new hearing has its own");
}

#[tokio::test]
async fn a_hearing_is_closed_as_attended_adjourned_missed_or_cancelled_and_never_by_silence() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let url = format!("/api/matters/{matter}/hearings");
    let make = |offset: i64| post(&app, &url, json!({ "at": now() + offset * DAY, "purpose": "mention" }));
    let a = make(1).await.1["id"].as_str().unwrap().to_string();
    let b = make(2).await.1["id"].as_str().unwrap().to_string();
    let c = make(3).await.1["id"].as_str().unwrap().to_string();

    assert_eq!(post(&app, &format!("/api/hearings/{a}/attend"), json!({ "outcome": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/hearings/{a}/attend"), json!({ "outcome": "Bail granted." })).await.0, StatusCode::OK);
    assert_eq!(post(&app, &format!("/api/hearings/{a}/attend"), json!({ "outcome": "again" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "closed is closed");

    let path = format!("/api/hearings/{b}/adjourn");
    assert_eq!(post(&app, &path, json!({ "reason": "tired", "responsible": "court" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "reason": "witness_absent", "responsible": "nobody" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "reason": "other", "responsible": "court" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "other needs words");
    assert_eq!(post(&app, &path, json!({ "reason": "witness_absent", "responsible": "prosecution", "nextDate": now() })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not before the hearing");
    let (status, out) = post(&app, &path, json!({ "reason": "prisoner_not_produced", "responsible": "prisons" })).await;
    assert_eq!(status, StatusCode::OK, "{out}");
    assert!(out["nextHearing"].is_null(), "no next date fixed: it stays an open item");
    assert_eq!(out["hearing"]["adjournReason"], "prisoner_not_produced");

    let (status, missed) = post(&app, &format!("/api/hearings/{c}/miss"), json!({ "note": "Clashed with a High Court matter" })).await;
    assert_eq!(status, StatusCode::OK, "{missed}");
    assert_eq!(missed["status"], "missed");
}

#[tokio::test]
async fn the_diary_lists_a_range_earliest_first_without_cancelled_hearings() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let day = monday();
    let mut ids = vec![];
    for (offset, purpose) in [(11 * HOUR, "hearing"), (9 * HOUR, "mention"), (10 * HOUR, "plea")] {
        let (_, h) = post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": day + offset, "purpose": purpose })).await;
        ids.push(h["id"].as_str().unwrap().to_string());
    }
    post(&app, &format!("/api/hearings/{}/cancel", ids[2]), json!({})).await;
    post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": day + DAY + 9 * HOUR, "purpose": "mention" })).await;
    let (status, rows) = get(&app, &format!("/api/diary?from={day}&to={}", day + DAY)).await;
    assert_eq!(status, StatusCode::OK);
    let purposes: Vec<&str> = rows.as_array().unwrap().iter().map(|r| r["purpose"].as_str().unwrap()).collect();
    assert_eq!(purposes, ["mention", "hearing"]);
}

#[tokio::test]
async fn a_closed_matter_takes_nothing_new_and_cannot_close_with_hearings_still_listed() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let (_, h) = post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": now() + DAY, "purpose": "mention" })).await;
    assert_eq!(post(&app, &format!("/api/matters/{matter}/close"), json!({ "outcome": "Acquitted" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    post(&app, &format!("/api/hearings/{}/attend", h["id"].as_str().unwrap()), json!({ "outcome": "Heard." })).await;
    assert_eq!(post(&app, &format!("/api/matters/{matter}/close"), json!({ "outcome": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/matters/{matter}/close"), json!({ "outcome": "Acquitted" })).await.0, StatusCode::OK);
    assert_eq!(post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": now() + DAY, "purpose": "mention" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/matters/{matter}/notes"), json!({ "body": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/matters/{matter}/time"), json!({ "workedOn": now() - DAY, "minutes": 30, "description": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/matters/{matter}/reopen"), json!({})).await.0, StatusCode::OK);
}

#[tokio::test]
async fn notes_and_time_are_kept_and_time_is_between_a_minute_and_a_day() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    assert_eq!(post(&app, &format!("/api/matters/{matter}/notes"), json!({ "body": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, note) = post(&app, &format!("/api/matters/{matter}/notes"), json!({ "body": "Client says he was at home." })).await;
    assert_eq!(status, StatusCode::OK, "{note}");
    assert_eq!(put(&app, &format!("/api/notes/{}", note["id"].as_str().unwrap()), json!({ "body": "Client says he was at home all evening." })).await.0, StatusCode::OK);

    let path = format!("/api/matters/{matter}/time");
    assert_eq!(post(&app, &path, json!({ "workedOn": now() - DAY, "minutes": 0, "description": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "workedOn": now() - DAY, "minutes": 2000, "description": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &path, json!({ "workedOn": now() - DAY, "minutes": 30, "description": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, entry) = post(&app, &path, json!({ "workedOn": now() - DAY, "minutes": 90, "description": "Interview at the remand prison" })).await;
    assert_eq!(status, StatusCode::OK, "{entry}");
    let (_, detail) = get(&app, &format!("/api/matters/{matter}")).await;
    assert_eq!(detail["notes"].as_array().unwrap().len(), 1);
    assert_eq!(detail["time"][0]["minutes"], 90);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/time/{}", entry["id"].as_str().unwrap()), None).await.0, StatusCode::NO_CONTENT);
}

fn doc(text: &str) -> String {
    json!({ "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": text }] }] }).to_string()
}

#[tokio::test]
async fn a_document_is_drafted_edited_and_filed_once_with_a_reference_and_then_frozen() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    assert_eq!(post(&app, "/api/documents", json!({ "matterId": matter, "kind": "poem", "title": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, document) = post(&app, "/api/documents", json!({ "matterId": matter, "kind": "bail_application", "title": "Application for bail pending trial" })).await;
    assert_eq!(status, StatusCode::OK, "{document}");
    let id = document["id"].as_str().unwrap().to_string();
    let filed_on = now() - DAY;

    // Nothing to file yet.
    assert_eq!(post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": filed_on })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    put(&app, &format!("/api/documents/{id}"), json!({ "title": "Application for bail pending trial", "body": doc("The applicant is a first offender with a fixed abode.") })).await;
    set_profile(&app).await;
    let (status, filed) = post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": filed_on, "filedWith": "Buganda Road Chief Magistrate's Court" })).await;
    assert_eq!(status, StatusCode::OK, "{filed}");
    let year = chrono::Utc::now().format("%Y").to_string();
    assert_eq!(filed["reference"], format!("DOC/{year}/0001"));
    assert_eq!(filed["intact"], true);
    assert_eq!(filed["content"]["heading"], "APPLICATION FOR BAIL");
    assert_eq!(filed["content"]["advocate"], "A. Nabirye, Advocate");
    assert_eq!(filed["filedBy"], "A. Nabirye, Advocate");

    assert_eq!(put(&app, &format!("/api/documents/{id}"), json!({ "title": "x", "body": doc("changed") })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/documents/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": filed_on })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, second) = post(&app, "/api/documents", json!({ "matterId": matter, "kind": "letter", "title": "Letter to the prison" })).await;
    let sid = second["id"].as_str().unwrap();
    put(&app, &format!("/api/documents/{sid}"), json!({ "title": "Letter to the prison", "body": doc("Please arrange a visit.") })).await;
    let (_, sf) = post(&app, &format!("/api/documents/{sid}/file"), json!({ "filedOn": filed_on })).await;
    assert_eq!(sf["reference"], format!("DOC/{year}/0002"));
}

#[tokio::test]
async fn an_agreement_counts_as_reached_only_once_it_was_explained_to_the_accused() {
    let app = app().await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let path = format!("/api/matters/{matter}/plea");
    assert!(get(&app, &path).await.1.is_null(), "nothing recorded yet");
    assert_eq!(put(&app, &path, json!({ "status": "guessing" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(put(&app, &path, json!({ "status": "negotiating", "summary": "Reduction to simple theft proposed." })).await.0, StatusCode::OK);

    let explained = now() - 5 * DAY;
    assert_eq!(put(&app, &path, json!({ "status": "agreed" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "explanation is required");
    assert_eq!(put(&app, &path, json!({ "status": "agreed", "explainedOn": explained, "explainedBy": "the prosecutor" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not the prosecutor");
    let (status, agreed) = put(&app, &path, json!({ "status": "agreed", "explainedOn": explained, "explainedBy": "advocate", "signedOn": explained + DAY })).await;
    assert_eq!(status, StatusCode::OK, "{agreed}");

    assert_eq!(put(&app, &path, json!({ "status": "confirmed", "explainedOn": explained, "explainedBy": "advocate" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "needs the signing and the confirmation");
    assert_eq!(put(&app, &path, json!({ "status": "confirmed", "explainedOn": explained, "explainedBy": "advocate", "signedOn": explained + 2 * DAY, "confirmedOn": explained + DAY })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not confirmed before signed");
    assert_eq!(put(&app, &path, json!({ "status": "confirmed", "explainedOn": explained, "explainedBy": "justice_of_the_peace", "signedOn": explained - DAY, "confirmedOn": explained + DAY })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not signed before explained");
    let (status, confirmed) = put(&app, &path, json!({ "status": "confirmed", "explainedOn": explained, "explainedBy": "justice_of_the_peace", "signedOn": explained + DAY, "confirmedOn": explained + 2 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{confirmed}");

    assert_eq!(put(&app, &path, json!({ "status": "abandoned" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "say why");
    assert_eq!(put(&app, &path, json!({ "status": "abandoned", "abandonedReason": "The prosecution withdrew the offer." })).await.0, StatusCode::OK);
}

#[tokio::test]
async fn today_shows_what_the_advocate_has_left_open() {
    let app = app().await;
    set_profile(&app).await;
    let client = new_client(&app, "Okello").await;
    let day = (now() / DAY) * DAY;

    let lapsed = new_matter(&app, &client, "private", None).await;
    post(&app, &format!("/api/matters/{lapsed}/hearings"), json!({ "at": day - 2 * DAY, "purpose": "mention" })).await;
    let undated = new_matter(&app, &client, "private", None).await;
    let (_, h) = post(&app, &format!("/api/matters/{undated}/hearings"), json!({ "at": now() + DAY, "purpose": "mention" })).await;
    post(&app, &format!("/api/hearings/{}/adjourn", h["id"].as_str().unwrap()), json!({ "reason": "file_incomplete", "responsible": "prosecution" })).await;
    let tasked = new_matter(&app, &client, "private", None).await;
    post(&app, "/api/tasks", json!({ "matterId": tasked, "title": "File the list of authorities", "dueOn": day - DAY })).await;
    post(&app, "/api/tasks", json!({ "matterId": tasked, "title": "Call the surety", "dueOn": day + DAY })).await;
    put(&app, &format!("/api/matters/{tasked}/plea"), json!({ "status": "agreed", "explainedOn": now() - 3 * DAY, "explainedBy": "advocate" })).await;

    let (status, today) = get(&app, &format!("/api/overview?from={day}&to={}", day + DAY)).await;
    assert_eq!(status, StatusCode::OK, "{today}");
    let kinds: Vec<(String, String)> = today["attention"].as_array().unwrap().iter().map(|a| (a["kind"].as_str().unwrap().to_string(), a["matterId"].as_str().unwrap_or("").to_string())).collect();
    assert!(kinds.contains(&("hearing_not_closed".into(), lapsed.clone())), "{kinds:?}");
    assert!(kinds.contains(&("no_hearing".into(), undated.clone())), "{kinds:?}");
    assert!(kinds.contains(&("task_overdue".into(), tasked.clone())), "{kinds:?}");
    assert!(kinds.contains(&("task_soon".into(), tasked.clone())), "{kinds:?}");
    assert!(kinds.contains(&("plea_unconfirmed".into(), tasked.clone())), "{kinds:?}");
    assert_eq!(today["counts"]["openMatters"], 3);
    assert_eq!(today["counts"]["tasksOverdue"], 1);
    assert_eq!(today["reasonCounts"][0]["reason"], "file_incomplete");
}

#[tokio::test]
async fn the_audit_trail_records_what_changed_the_standing_of_a_matter_and_who_did_it() {
    let app = app().await;
    set_profile(&app).await;
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let (_, h) = post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": now() + DAY, "purpose": "mention" })).await;
    post(&app, &format!("/api/hearings/{}/attend", h["id"].as_str().unwrap()), json!({ "outcome": "Heard." })).await;
    post(&app, &format!("/api/hearings/{}/attend", h["id"].as_str().unwrap()), json!({ "outcome": "again" })).await; // refused: leaves nothing behind

    let (_, entries) = get(&app, &format!("/api/audit?matterId={matter}")).await;
    let actions: Vec<&str> = entries.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    assert_eq!(actions, ["hearing_attended", "hearing_scheduled", "matter_opened"]);
    assert!(entries.as_array().unwrap().iter().all(|e| e["actor"] == "A. Nabirye, Advocate"));
    let (_, verdict) = get(&app, "/api/audit/verify").await;
    assert_eq!(verdict["intact"], true);
    assert_eq!(verdict["entries"], 6, "setup, the profile, the client, and the three above");
}

#[tokio::test]
async fn the_register_can_be_searched_by_title_reference_court_number_or_the_clients_name() {
    let app = app().await;
    let a = new_client(&app, "Kiiza Robert").await;
    let b = new_client(&app, "Nakato Sarah").await;
    post(&app, "/api/matters", json!({ "clientId": a, "title": "Uganda v. Kiiza", "courtNumber": "CRB 77/2026", "engagement": "private", "ourRef": "PRA/77" })).await;
    post(&app, "/api/matters", json!({ "clientId": b, "title": "Uganda v. Nakato", "courtNumber": "CRB 88/2026", "engagement": "pro_bono" })).await;
    assert_eq!(get(&app, "/api/matters?query=kiiza").await.1.as_array().unwrap().len(), 1);
    assert_eq!(get(&app, "/api/matters?query=88%2F2026").await.1.as_array().unwrap().len(), 1);
    assert_eq!(get(&app, "/api/matters?query=pra%2F77").await.1.as_array().unwrap().len(), 1);
    assert_eq!(get(&app, "/api/matters?query=%25").await.1.as_array().unwrap().len(), 0, "a percent sign is searched for, not a wildcard");
    assert_eq!(get(&app, "/api/matters?view=no_hearing").await.1.as_array().unwrap().len(), 2);
    assert_eq!(get(&app, "/api/clients?query=nakato").await.1.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn before_setup_the_old_pin_lock_still_guards_and_setup_retires_it() {
    let app = fresh_app().await;
    let recovery_code = post(&app, "/api/lock/setup", json!({ "pin": "correct horse" })).await.1["recoveryCode"].as_str().unwrap().to_string();
    // Unlocked but not set up: everything but setup waits for setup.
    let (status, body) = get(&app, "/api/clients").await;
    assert_eq!(status, StatusCode::PRECONDITION_REQUIRED);
    assert_eq!(body["code"], "SETUP_REQUIRED");

    post(&app, "/api/lock/lock", json!({})).await;
    assert_eq!(get(&app, "/api/clients").await.0, StatusCode::LOCKED);
    assert_eq!(get(&app, "/api/setup/status").await.0, StatusCode::LOCKED, "a closed old lock comes before setup");
    assert_eq!(get(&app, "/api/lock/status").await.0, StatusCode::OK, "the lock routes stay reachable while locked");
    assert_eq!(get(&app, "/api/system/status").await.0, StatusCode::OK);
    assert_eq!(get(&app, "/api/session/status").await.1["legacyLocked"], true);

    assert_eq!(post(&app, "/api/lock/unlock", json!({ "pin": "wrong" })).await.0, StatusCode::UNAUTHORIZED);
    assert_eq!(get(&app, "/api/clients").await.0, StatusCode::LOCKED, "a wrong pin does not unlock it");
    assert_eq!(post(&app, "/api/lock/unlock", json!({ "pin": "correct horse" })).await.0, StatusCode::NO_CONTENT);
    assert_eq!(get(&app, "/api/setup/status").await.0, StatusCode::OK, "the right pin opens setup");

    // Recovery works without the pin, using the code shown once.
    post(&app, "/api/lock/lock", json!({})).await;
    let (status, body) = post(&app, "/api/lock/recover", json!({ "recoveryCode": recovery_code, "newPin": "another pin here" })).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    // Setup retires the old lock: the protection level takes over.
    let (status, body) = post(&app, "/api/setup/complete", setup_payload("none", None, "alone", "advocate", json!([]))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(get(&app, "/api/clients").await.0, StatusCode::OK);
    assert_eq!(get(&app, "/api/lock/status").await.1["enabled"], false);
    assert_eq!(post(&app, "/api/lock/setup", json!({ "pin": "correct horse" })).await.0, StatusCode::FORBIDDEN);
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("none", None, "alone", "advocate", json!([]))).await.0, StatusCode::FORBIDDEN, "set up once");
}

#[tokio::test]
async fn setup_records_the_practice_and_refuses_what_does_not_fit() {
    let app = fresh_app().await;
    let (_, status) = get(&app, "/api/setup/status").await;
    assert_eq!(status["installed"], false);

    let mut bad = setup_payload("none", None, "alone", "advocate", json!([]));
    bad["extra"]["usages"] = json!([]);
    assert_eq!(post(&app, "/api/setup/complete", bad).await.0, StatusCode::UNPROCESSABLE_ENTITY, "at least one kind of work");
    let mut bad = setup_payload("none", None, "alone", "advocate", json!([]));
    bad["extra"]["usages"] = json!(["civil", "astrology"]);
    assert_eq!(post(&app, "/api/setup/complete", bad).await.0, StatusCode::UNPROCESSABLE_ENTITY, "only known kinds of work");
    let people = json!([{ "name": "B. Clerk", "rank": "", "role": "paralegal", "flag": false, "secret": "123456" }]);
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("basic", Some("654321"), "alone", "advocate", people)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "alone means one person");
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("none", None, "alone", "accounts", json!([]))).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (status, body) = post(&app, "/api/setup/complete", setup_payload("none", None, "alone", "advocate", json!([]))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["actor"]["name"], "A. Nabirye");
    assert_eq!(body["actor"]["isAdmin"], true);
    let (_, install) = get(&app, "/api/installation").await;
    assert_eq!(install["setting"], "alone");
    assert_eq!(install["practiceKind"], "private");
    assert_eq!(get(&app, "/api/usages").await.1, json!(["civil", "criminal"]));
    assert_eq!(get(&app, "/api/installation/brand").await.1["officeName"], "Nabirye & Co. Advocates");
    assert_eq!(post(&app, "/api/staff", json!({ "name": "B. Clerk", "role": "paralegal", "secret": "123456" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "no people when alone");
}

#[tokio::test]
async fn in_a_firm_everyone_signs_in_and_only_an_advocate_files() {
    let app = fresh_app().await;
    let people = json!([
        { "name": "B. Clerk", "rank": "Legal assistant", "role": "paralegal", "flag": false, "secret": "111111" },
        { "name": "C. Books", "rank": "", "role": "accounts", "flag": false, "secret": "222222" }
    ]);
    let (status, body) = post(&app, "/api/setup/complete", setup_payload("basic", Some("654321"), "firm", "advocate", people)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // The advocate who set it up is signed in and drafts a document.
    let client = new_client(&app, "Okello").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let id = post(&app, "/api/documents", json!({ "matterId": matter, "kind": "letter", "title": "Demand" })).await.1["id"].as_str().unwrap().to_string();
    put(&app, &format!("/api/documents/{id}"), json!({ "title": "Demand", "body": doc("Pay within seven days.") })).await;

    post(&app, "/api/session/sign-out", json!({})).await;
    assert_eq!(get(&app, "/api/clients").await.0, StatusCode::LOCKED, "nobody signed in");
    let (status, list) = get(&app, "/api/session/people").await;
    assert_eq!(status, StatusCode::OK);
    let id_of = |name: &str| list.as_array().unwrap().iter().find(|p| p["name"] == name).unwrap()["id"].as_str().unwrap().to_string();
    let (clerk, advocate) = (id_of("B. Clerk"), id_of("A. Nabirye"));

    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": clerk, "secret": "000000" })).await.0, StatusCode::FORBIDDEN);
    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": clerk, "secret": "111111" })).await.1["status"], "signed_in");
    // A paralegal drafts, but may not file in the practice's name (Advocates Act ss.64, 66, 67).
    let (status, body) = post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": now() - DAY })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    assert!(body["message"].as_str().unwrap().contains("advocate"));
    // Nor run the practice.
    assert_eq!(put(&app, "/api/usages", json!({ "usages": ["civil"] })).await.0, StatusCode::FORBIDDEN);

    post(&app, "/api/session/sign-out", json!({})).await;
    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": advocate, "secret": "654321" })).await.1["status"], "signed_in");
    let (status, filed) = post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": now() - DAY })).await;
    assert_eq!(status, StatusCode::OK, "{filed}");
    assert_eq!(filed["filedBy"], "A. Nabirye");
    assert_eq!(filed["content"]["firm"], "Nabirye & Co. Advocates");

    // Usages change, and a kind of work switched off deletes nothing.
    assert_eq!(put(&app, "/api/usages", json!({ "usages": ["civil", "land"] })).await.1, json!(["civil", "land"]));
    assert_eq!(get(&app, &format!("/api/matters/{matter}")).await.0, StatusCode::OK);
    let (_, trail) = get(&app, "/api/audit").await;
    let actions: Vec<&str> = trail.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    for expected in ["setup_completed", "signed_in", "sign_in_failed", "signed_out", "usages_changed"] {
        assert!(actions.contains(&expected), "{expected} in {actions:?}");
    }
}

#[tokio::test]
async fn full_protection_needs_the_phone_linked_at_setup_and_a_code_at_sign_in() {
    let app = fresh_app().await;
    let password = "a long enough password";
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("full", Some(password), "alone", "advocate", json!([]))).await.0, StatusCode::UNPROCESSABLE_ENTITY, "no phone linked");
    let (_, enrolment) = post(&app, "/api/setup/second-factor", json!({ "name": "A. Nabirye" })).await;
    let key = enrolment["secret"].as_str().unwrap().to_string();
    let mut payload = setup_payload("full", Some(password), "alone", "advocate", json!([]));
    payload["administrator"]["secondFactor"] = json!({ "secret": key, "code": crate::domain::totp::current_code(&key) });
    let (status, body) = post(&app, "/api/setup/complete", payload).await;
    assert_eq!(status, StatusCode::OK, "{body}");

    post(&app, "/api/session/sign-out", json!({})).await;
    let me = get(&app, "/api/session/people").await.1[0]["id"].as_str().unwrap().to_string();
    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": me, "secret": password })).await.1["status"], "code");
    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": me, "secret": password, "code": "000000" })).await.0, StatusCode::FORBIDDEN);
    let code = crate::domain::totp::current_code(&key);
    assert_eq!(post(&app, "/api/session/sign-in", json!({ "staffId": me, "secret": password, "code": code })).await.1["status"], "signed_in");
    assert_eq!(get(&app, "/api/clients").await.0, StatusCode::OK);
}

#[tokio::test]
async fn matters_of_each_kind_follow_their_own_stages_and_names_are_checked_for_conflicts() {
    let app = app().await; // civil and criminal switched on
    let client = new_client(&app, "Okello John").await;
    let (status, suit) = post(&app, "/api/matters", json!({ "clientId": client, "title": "Okello v. Kiiza Robert & Sons Ltd", "engagement": "private", "matterType": "civil_suit" })).await;
    assert_eq!(status, StatusCode::OK, "{suit}");
    assert_eq!(suit["matterType"], "civil_suit");
    assert_eq!(suit["stage"], "instructions");
    let suit = suit["id"].as_str().unwrap().to_string();

    // Land is not switched on for this practice.
    let (status, body) = post(&app, "/api/matters", json!({ "clientId": client, "title": "Plot 12", "engagement": "private", "matterType": "land_transaction" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert!(body["message"].as_str().unwrap().contains("Settings"));
    assert_eq!(post(&app, "/api/matters", json!({ "clientId": client, "title": "x", "engagement": "private", "matterType": "astrology" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // Stages are the type's own; a criminal stage is not a civil one.
    assert_eq!(put(&app, &format!("/api/matters/{suit}/stage"), json!({ "stage": "pleadings" })).await.1["stage"], "pleadings");
    assert_eq!(put(&app, &format!("/api/matters/{suit}/stage"), json!({ "stage": "custody_bail" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(get(&app, "/api/matters?type=civil_suit").await.1.as_array().unwrap().len(), 1);
    let (_, types) = get(&app, "/api/matter-types").await;
    assert!(types.as_array().unwrap().iter().any(|t| t["id"] == "appeal" && t["stages"][0] == "notice"));

    // The other side, then the check a new instruction runs.
    let (status, party) = post(&app, &format!("/api/matters/{suit}/parties"), json!({ "role": "opposing_party", "name": "Robert Kiiza & Sons Ltd" })).await;
    assert_eq!(status, StatusCode::OK, "{party}");
    assert_eq!(post(&app, &format!("/api/matters/{suit}/parties"), json!({ "role": "judge", "name": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, hits) = get(&app, "/api/conflicts?name=Kiiza%20Robert").await;
    let hits = hits.as_array().unwrap();
    assert_eq!(hits.len(), 1, "{hits:?}");
    assert_eq!(hits[0]["role"], "opposing_party");
    assert_eq!(hits[0]["strong"], true);
    let (_, hits) = get(&app, "/api/conflicts?name=John%20Okello").await;
    assert_eq!(hits[0]["role"], "client", "the practice's own client, found in any word order");
    let (_, detail) = get(&app, &format!("/api/matters/{suit}")).await;
    assert_eq!(detail["parties"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn what_happened_on_a_matter_starts_the_deadlines_and_a_later_step_answers_them() {
    let app = app().await;
    let client = new_client(&app, "Nsubuga Traders Ltd").await;
    let (_, suit) = post(&app, "/api/matters", json!({ "clientId": client, "title": "Kato v. Nsubuga Traders", "engagement": "private", "matterType": "civil_suit" })).await;
    let suit = suit["id"].as_str().unwrap().to_string();
    let served = now() - 3 * DAY;
    let (status, event) = post(&app, &format!("/api/matters/{suit}/events"), json!({ "kind": "served_with_summons", "onDay": served })).await;
    assert_eq!(status, StatusCode::OK, "{event}");
    assert_eq!(event["recordedBy"], "A. Nabirye");
    // An event with no meaning for this kind of matter is refused.
    assert_eq!(post(&app, &format!("/api/matters/{suit}/events"), json!({ "kind": "government_notice_served", "onDay": served })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, detail) = get(&app, &format!("/api/matters/{suit}")).await;
    let clocks = detail["clocks"]["clocks"].as_array().unwrap();
    let defence = clocks.iter().find(|c| c["rule"] == "file_defence").unwrap();
    assert_eq!(defence["status"], "running");
    assert_eq!(defence["daysLeft"], 12);
    assert!(detail["clocks"]["canRecord"].as_array().unwrap().iter().any(|e| e == "defence_filed"));
    assert_eq!(get(&app, "/api/clocks").await.1.as_array().unwrap().len(), 1);

    post(&app, &format!("/api/matters/{suit}/events"), json!({ "kind": "defence_filed", "onDay": now() })).await;
    let (_, detail) = get(&app, &format!("/api/matters/{suit}")).await;
    assert_eq!(detail["clocks"]["clocks"][detail["clocks"]["clocks"].as_array().unwrap().len() - 1]["status"], "done");
    assert_eq!(get(&app, "/api/clocks").await.1.as_array().unwrap().len(), 0, "an answered deadline leaves Today");
}

#[tokio::test]
async fn a_filing_seals_its_drafts_together_with_the_letterhead_and_a_code_a_printed_copy_can_be_checked_with() {
    let app = app().await;
    put(&app, "/api/installation/contacts", json!({ "address": "Plot 4, Kampala Road", "phone": "0414 000 111", "email": "chambers@nabirye.example" })).await;
    let client = new_client(&app, "Nsubuga Traders Ltd").await;
    let (_, suit) = post(&app, "/api/matters", json!({ "clientId": client, "title": "Nsubuga Traders Ltd v. Kato Hardware", "engagement": "private", "matterType": "civil_suit" })).await;
    let suit = suit["id"].as_str().unwrap().to_string();
    let mut ids = Vec::new();
    for (kind, title) in [("plaint", "Plaint"), ("affidavit", "Affidavit in support")] {
        let (status, d) = post(&app, "/api/documents", json!({ "matterId": suit, "kind": kind, "title": title, "body": doc("The plaintiff claims UGX 12,000,000.") })).await;
        assert_eq!(status, StatusCode::OK, "{d}");
        ids.push(d["id"].as_str().unwrap().to_string());
    }
    let (status, filing) = post(&app, &format!("/api/matters/{suit}/filings"), json!({ "documentIds": ids, "filedOn": now() - DAY, "court": "High Court (Commercial Division)", "courtReference": "HCCS 88/2026", "feeAmount": 150000, "feePrn": "2260000123456" })).await;
    assert_eq!(status, StatusCode::OK, "{filing}");
    assert_eq!(filing["documents"].as_array().unwrap().len(), 2);
    let filing_id = filing["id"].as_str().unwrap().to_string();

    let (_, matter) = get(&app, &format!("/api/matters/{suit}")).await;
    assert_eq!(matter["matter"]["courtNumber"], "HCCS 88/2026", "the registry's number reaches the matter");
    assert_eq!(matter["matter"]["courtName"], "High Court (Commercial Division)");

    let (_, plaint) = get(&app, &format!("/api/documents/{}", ids[0])).await;
    assert_eq!(plaint["status"], "filed");
    assert_eq!(plaint["content"]["heading"], "PLAINT");
    assert_eq!(plaint["content"]["firmAddress"], "Plot 4, Kampala Road");
    assert!(plaint["content"]["drawnBy"].as_str().unwrap().contains("Plot 4, Kampala Road"), "the drawer's name and address (s.67)");
    assert!(plaint["content"]["verifyQr"].as_str().unwrap().starts_with("<?xml") || plaint["content"]["verifyQr"].as_str().unwrap().contains("<svg"));
    let reference = plaint["reference"].as_str().unwrap().to_string();
    let code = plaint["content"]["verifyCode"].as_str().unwrap().to_string();
    assert_eq!(code.len(), 12);

    let (_, v) = post(&app, "/api/documents/verify", json!({ "reference": reference, "code": code.to_lowercase() })).await;
    assert_eq!(v["result"], "genuine");
    let spaced = format!("{} {}-{}", &code[..4], &code[4..8], &code[8..]).to_lowercase();
    let (_, v) = post(&app, "/api/documents/verify", json!({ "reference": reference.to_lowercase(), "code": spaced })).await;
    assert_eq!(v["result"], "genuine", "typed off paper with spaces and dashes");
    let (_, v) = post(&app, "/api/documents/verify", json!({ "reference": reference, "code": "000000000000" })).await;
    assert_eq!(v["result"], "mismatch");
    assert!(v["title"].is_null(), "a wrong code learns nothing about the document");
    assert_eq!(post(&app, "/api/documents/verify", json!({ "reference": "DOC/1999/0001", "code": code })).await.1["result"], "not_found");

    // Service, once.
    let (status, served) = put(&app, &format!("/api/filings/{filing_id}/service"), json!({ "servedOn": now(), "servedTo": "Mugisha & Co. Advocates", "method": "advocate" })).await;
    assert_eq!(status, StatusCode::OK, "{served}");
    assert_eq!(put(&app, &format!("/api/filings/{filing_id}/service"), json!({ "servedOn": now(), "servedTo": "x", "method": "advocate" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, detail) = get(&app, &format!("/api/matters/{suit}")).await;
    assert_eq!(detail["filings"][0]["servedTo"], "Mugisha & Co. Advocates");
    // An empty draft cannot be filed, and nothing in the pack is filed then.
    let (_, empty) = post(&app, "/api/documents", json!({ "matterId": suit, "kind": "notice_of_motion", "title": "Motion" })).await;
    let (_, full) = post(&app, "/api/documents", json!({ "matterId": suit, "kind": "affidavit", "title": "Affidavit", "body": doc("I swear.") })).await;
    let (status, _) = post(&app, &format!("/api/matters/{suit}/filings"), json!({ "documentIds": [full["id"], empty["id"]], "filedOn": now() })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(get(&app, &format!("/api/documents/{}", full["id"].as_str().unwrap())).await.1["status"], "draft", "a pack is filed whole or not at all");
}

#[tokio::test]
async fn assist_runs_only_once_an_administrator_turns_it_on_and_confirms_and_the_key_never_leaves() {
    let app = fresh_app().await;
    let people = json!([
        { "name": "B. Clerk", "rank": "", "role": "paralegal", "flag": false, "secret": "111111" },
        { "name": "C. Books", "rank": "", "role": "accounts", "flag": false, "secret": "222222" }
    ]);
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("basic", Some("654321"), "firm", "advocate", people)).await.0, StatusCode::OK);
    let client = new_client(&app, "Auma").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let ask = format!("/api/matters/{matter}/assist");

    let (_, settings) = get(&app, "/api/assist/settings").await;
    assert_eq!(settings["mode"], "off");
    assert_eq!(settings["ready"], false);
    let (status, body) = post(&app, &ask, json!({ "task": "summary" })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");

    // A server that is not there: nothing leaves this machine in the test.
    let on = json!({ "mode": "practice_key", "provider": "openai_compatible", "baseUrl": "http://127.0.0.1:9/v1", "apiKey": "sk-test-abcd1234" });
    let (status, settings) = put(&app, "/api/assist/settings", on.clone()).await;
    assert_eq!(status, StatusCode::OK, "{settings}");
    assert_eq!(settings["keyHint"], "…1234");
    assert!(!settings.to_string().contains("sk-test"), "the key is never sent back");
    assert_eq!(settings["ready"], false, "not until an administrator confirms where papers go");
    assert!(post(&app, &ask, json!({ "task": "summary" })).await.1["message"].as_str().unwrap().contains("confirm"));

    let (_, settings) = put(&app, "/api/assist/settings", json!({ "mode": "practice_key", "acknowledge": true })).await;
    assert_eq!(settings["ready"], true);
    assert_eq!(settings["acknowledgedBy"], "A. Nabirye");
    assert_eq!(post(&app, &ask, json!({ "task": "decide_the_case" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, body) = post(&app, &ask, json!({ "task": "summary" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "the provider cannot be reached: {body}");
    assert_eq!(post(&app, &ask, json!({ "task": "unanswered" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "needs a document or text");

    let (_, list) = get(&app, "/api/session/people").await;
    let id_of = |name: &str| list.as_array().unwrap().iter().find(|p| p["name"] == name).unwrap()["id"].as_str().unwrap().to_string();
    post(&app, "/api/session/sign-out", json!({})).await;
    post(&app, "/api/session/sign-in", json!({ "staffId": id_of("B. Clerk"), "secret": "111111" })).await;
    assert_eq!(get(&app, "/api/assist/settings").await.1["ready"], true, "a paralegal sees Assist is ready");
    assert_eq!(put(&app, "/api/assist/settings", on).await.0, StatusCode::FORBIDDEN, "but does not configure it");

    post(&app, "/api/session/sign-out", json!({})).await;
    post(&app, "/api/session/sign-in", json!({ "staffId": id_of("C. Books"), "secret": "222222" })).await;
    assert_eq!(post(&app, &ask, json!({ "task": "summary" })).await.0, StatusCode::FORBIDDEN, "accounts do not work on matters");

    let (_, trail) = get(&app, "/api/audit").await;
    assert!(trail.as_array().unwrap().iter().any(|e| e["action"] == "assist_settings_changed"));
}

#[tokio::test]
async fn a_paper_is_sealed_in_the_vault_opens_as_it_went_in_and_is_gone_once_removed() {
    use base64::Engine as _;
    let b64 = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);
    let app = app().await;
    let client = new_client(&app, "Auma").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let papers = format!("/api/matters/{matter}/papers");

    // A photo of a page; the bytes are what matter here, not the picture.
    let photo: Vec<u8> = (0..4096u32).map(|i| (i % 251) as u8).collect();
    let (status, paper) = post(&app, &papers, json!({ "fileName": "summons_served.jpg", "data": b64(&photo) })).await;
    assert_eq!(status, StatusCode::OK, "{paper}");
    assert_eq!(paper["title"], "summons served", "named from the file until someone names it");
    assert_eq!(paper["mimeType"], "image/jpeg");
    assert!(paper.get("storedPath").is_none(), "where it sits in the vault never reaches the screen");
    let id = paper["id"].as_str().unwrap().to_string();

    let (_, file) = get(&app, &format!("/api/papers/{id}/file")).await;
    assert_eq!(base64::engine::general_purpose::STANDARD.decode(file["data"].as_str().unwrap()).unwrap(), photo, "opens exactly as it went in");

    assert_eq!(post(&app, &papers, json!({ "fileName": "brief.docx", "data": b64(b"PK") })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "Word is printed to PDF first");
    assert_eq!(post(&app, &papers, json!({ "fileName": "x.pdf", "data": "not base64!" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    // A 10 MB scan travels as ~13 MB of JSON: over the API's general limit, within the papers route's own.
    let scan = vec![7u8; 10 * 1024 * 1024];
    let (status, big) = post(&app, &papers, json!({ "fileName": "bundle.pdf", "data": b64(&scan) })).await;
    assert_eq!(status, StatusCode::OK, "{big}");
    let over = vec![7u8; 21 * 1024 * 1024];
    assert_eq!(post(&app, &papers, json!({ "fileName": "huge.pdf", "data": b64(&over) })).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let edit = json!({ "title": "Summons to file a defence", "kind": "court_document", "dated": "2026-09-20", "fromWhom": "High Court registry", "summary": null });
    let (status, edited) = put(&app, &format!("/api/papers/{id}"), edit.clone()).await;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["assisted"], false);
    assert_eq!(put(&app, &format!("/api/papers/{id}"), json!({ "title": "x", "kind": "court_document", "dated": "20/09/2026" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "a day, not a guess");
    let (_, list) = get(&app, &papers).await;
    assert_eq!(list.as_array().unwrap().len(), 2);
    assert_eq!(list[0]["title"], "Summons to file a defence", "dated papers first, oldest first");

    let (status, body) = post(&app, &format!("{papers}/read"), json!({ "paperIds": [id] })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "Assist is off: {body}");

    assert_eq!(call(&app, Method::DELETE, &format!("/api/papers/{id}"), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(get(&app, &format!("/api/papers/{id}/file")).await.0, StatusCode::NOT_FOUND);
    let (_, trail) = get(&app, "/api/audit").await;
    let actions: Vec<&str> = trail.as_array().unwrap().iter().map(|e| e["action"].as_str().unwrap()).collect();
    for expected in ["paper_added", "paper_changed", "paper_removed"] {
        assert!(actions.contains(&expected), "{expected} in {actions:?}");
    }
}

#[tokio::test]
async fn the_books_keep_client_money_apart_pay_out_only_what_is_held_and_bill_time_once() {
    let app = app().await;
    let client = new_client(&app, "Auma").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let other = new_client(&app, "Kato").await;
    let ledger = |kind: &str, amount: i64, note: Option<&str>| json!({ "clientId": client, "matterId": matter, "kind": kind, "amount": amount, "onDay": now() - DAY, "description": "x", "feeNoteId": note });

    // Money held for the client, and what may come out of it.
    assert_eq!(post(&app, "/api/ledger", ledger("paid_out", 1, None)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "nothing held yet");
    let (status, deposit) = post(&app, "/api/ledger", ledger("received", 2_000_000, None)).await;
    assert_eq!(status, StatusCode::OK, "{deposit}");
    assert_eq!(post(&app, "/api/ledger", ledger("paid_out", 150_000, None)).await.0, StatusCode::OK, "court fees paid from the client's money");
    let (status, body) = post(&app, "/api/ledger", ledger("paid_out", 1_900_000, None)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "more than is held: {body}");
    assert!(body["message"].as_str().unwrap().contains("1850000"));
    assert_eq!(post(&app, "/api/ledger", json!({ "clientId": other, "matterId": matter, "kind": "received", "amount": 5, "onDay": now(), "description": "x" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "another client's matter");
    assert_eq!(post(&app, "/api/ledger", ledger("disbursement", 50_000, None)).await.0, StatusCode::OK, "the practice paid a process server");

    // Time billed once, at the rate given; fees and disbursements as lines.
    let time = format!("/api/matters/{matter}/time");
    let t1 = post(&app, &time, json!({ "workedOn": now() - DAY, "minutes": 90, "description": "Drafting the plaint" })).await.1["id"].as_str().unwrap().to_string();
    let t2 = post(&app, &time, json!({ "workedOn": now() - DAY, "minutes": 20, "description": "Call with client" })).await.1["id"].as_str().unwrap().to_string();
    assert_eq!(get(&app, &format!("/api/matters/{matter}/unbilled-time")).await.1.as_array().unwrap().len(), 2);
    assert_eq!(post(&app, "/api/fee-notes", json!({ "matterId": matter, "timeEntryIds": [t1] })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "time needs a rate");
    let draft = json!({ "matterId": matter, "timeEntryIds": [t1, t2], "rate": 300_000, "lines": [{ "kind": "disbursement", "description": "Process server", "amount": 50_000 }] });
    let (status, note) = post(&app, "/api/fee-notes", draft.clone()).await;
    assert_eq!(status, StatusCode::OK, "{note}");
    assert_eq!(note["total"], 450_000 + 100_000 + 50_000, "90 min and 20 min at 300,000 an hour, and the disbursement");
    assert_eq!(note["status"], "draft");
    assert!(note["number"].is_null(), "numbered when issued");
    let note_id = note["id"].as_str().unwrap().to_string();
    assert_eq!(post(&app, "/api/fee-notes", draft).await.0, StatusCode::UNPROCESSABLE_ENTITY, "time is billed once");
    assert_eq!(get(&app, &format!("/api/matters/{matter}/unbilled-time")).await.1.as_array().unwrap().len(), 0);
    assert_eq!(call(&app, Method::DELETE, &format!("/api/time/{t1}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY, "billed time is not deleted");

    // Client money moves to the practice only against an issued fee note.
    assert_eq!(post(&app, "/api/ledger", ledger("to_office", 100_000, None)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "no fee note");
    assert_eq!(post(&app, "/api/ledger", ledger("to_office", 100_000, Some(&note_id))).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not issued yet");
    let (status, issued) = post(&app, &format!("/api/fee-notes/{note_id}/issue"), json!({ "issuedOn": now(), "dueOn": now() + 14 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{issued}");
    assert_eq!(issued["number"], "FN/2026/0001");
    assert_eq!(put(&app, &format!("/api/fee-notes/{note_id}"), json!({ "matterId": matter, "lines": [] })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "an issued note is not changed");
    assert_eq!(post(&app, "/api/ledger", ledger("to_office", 700_000, Some(&note_id))).await.0, StatusCode::UNPROCESSABLE_ENTITY, "more than is owed");
    let (status, moved) = post(&app, "/api/ledger", ledger("to_office", 500_000, Some(&note_id))).await;
    assert_eq!(status, StatusCode::OK, "{moved}");
    assert_eq!(post(&app, "/api/ledger", ledger("fee_received", 100_000, Some(&note_id))).await.0, StatusCode::OK, "the rest paid straight to the practice");
    let (_, paid) = get(&app, &format!("/api/fee-notes/{note_id}")).await;
    assert_eq!(paid["paid"], 600_000);
    assert_eq!(post(&app, &format!("/api/fee-notes/{note_id}/cancel"), json!({ "reason": "wrong client" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "paid on");

    let (_, books) = get(&app, &format!("/api/clients/{client}/money")).await;
    assert_eq!(books["clientBalance"], 2_000_000 - 150_000 - 500_000);
    assert_eq!(books["owed"], 0);
    assert_eq!(books["disbursementsUnbilled"], 0, "billed on the fee note");

    // Nothing is edited or deleted: a mistake is reversed, once, and never below nothing.
    let deposit_id = deposit["id"].as_str().unwrap();
    let (status, body) = post(&app, &format!("/api/ledger/{deposit_id}/reverse"), json!({ "reason": "wrong client" })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "already spent: {body}");
    let moved_id = moved["id"].as_str().unwrap();
    let (status, reversal) = post(&app, &format!("/api/ledger/{moved_id}/reverse"), json!({ "reason": "moved in error" })).await;
    assert_eq!(status, StatusCode::OK, "{reversal}");
    assert_eq!(post(&app, &format!("/api/ledger/{moved_id}/reverse"), json!({ "reason": "again" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "reversed once");
    let (_, books) = get(&app, &format!("/api/clients/{client}/money")).await;
    assert_eq!(books["clientBalance"], 2_000_000 - 150_000);
    assert_eq!(books["owed"], 500_000);
    assert_eq!(books["entries"].as_array().unwrap().len(), 6, "every entry stays in the books, the reversal beside what it reverses");

    // State brief work is not billed.
    let state = new_matter(&app, &client, "state_appointed", Some(now() - DAY)).await;
    assert_eq!(post(&app, "/api/fee-notes", json!({ "matterId": state, "lines": [{ "kind": "fee", "description": "x", "amount": 1 }] })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, positions) = get(&app, "/api/money/positions").await;
    assert_eq!(positions.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn a_bill_of_costs_is_drawn_from_the_matter_by_the_sixth_schedule_and_kept_once_taxed() {
    let app = app().await;
    let client = new_client(&app, "Auma").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let plaint = post(&app, "/api/documents", json!({ "matterId": matter, "kind": "plaint", "title": "Plaint", "body": doc("The plaintiff claims UGX 12,400,000.") })).await.1["id"].as_str().unwrap().to_string();
    assert_eq!(post(&app, &format!("/api/documents/{plaint}/file"), json!({ "filedOn": now() - DAY })).await.0, StatusCode::OK);
    post(&app, "/api/ledger", json!({ "clientId": client, "matterId": matter, "kind": "received", "amount": 500_000, "onDay": now() - DAY, "description": "On account" })).await;
    post(&app, "/api/ledger", json!({ "clientId": client, "matterId": matter, "kind": "paid_out", "amount": 150_000, "onDay": now() - DAY, "description": "Court fees on filing the plaint" })).await;

    let (status, bill) = post(&app, &format!("/api/matters/{matter}/bills"), json!({ "against": "other_side", "subjectValue": 12_400_000 })).await;
    assert_eq!(status, StatusCode::OK, "{bill}");
    let items = bill["items"].as_array().unwrap();
    assert_eq!(items[0]["itemRef"], "1(1)");
    assert_eq!(items[0]["claimed"], 1_560_000, "15% of 2M + 14% of 3M + 12% of 5M + 10% of 2.4M");
    assert!(items.iter().any(|i| i["itemRef"] == "10(1)" && i["claimed"] == 300_000), "drawing the filed plaint");
    assert!(items.iter().any(|i| i["disbursement"] == true && i["claimed"] == 150_000), "court fees from the books");
    assert_eq!(items.last().unwrap()["itemRef"], "10(5)");
    assert_eq!(bill["claimed"], 1_560_000 + 300_000 + 150_000 + 200_000);
    assert_eq!(bill["scaleInstructionFee"], 1_560_000);

    let id = bill["id"].as_str().unwrap().to_string();
    let edited = |status: &str, taxed_on: Option<i64>, taxed: i64| {
        let mut items: Vec<Value> = bill["items"].as_array().unwrap().iter().map(|i| json!({ "onDay": i["onDay"], "itemRef": i["itemRef"], "particulars": i["particulars"], "disbursement": i["disbursement"], "claimed": i["claimed"], "agreed": null, "taxed": null })).collect();
        items[1]["agreed"] = json!(300_000);
        items[0]["taxed"] = json!(taxed);
        json!({ "subjectValue": 12_400_000, "instructionBasis": "1_1", "status": status, "taxedOn": taxed_on, "items": items })
    };
    assert_eq!(put(&app, &format!("/api/bills/{id}"), edited("lodged", None, 2_000_000)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "nothing allowed above the claim");
    assert_eq!(put(&app, &format!("/api/bills/{id}"), edited("taxed", None, 1_200_000)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "taxed on a day");
    let (status, taxed) = put(&app, &format!("/api/bills/{id}"), edited("taxed", Some(now()), 1_200_000)).await;
    assert_eq!(status, StatusCode::OK, "{taxed}");
    assert_eq!(taxed["items"][1]["agreed"], 300_000, "agreed at the pre-taxation meeting (reg. 13A)");
    assert_eq!(put(&app, &format!("/api/bills/{id}"), edited("taxed", Some(now()), 1_000_000)).await.0, StatusCode::UNPROCESSABLE_ENTITY, "kept as taxed");
    assert_eq!(call(&app, Method::DELETE, &format!("/api/bills/{id}"), None).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    // No value: the floor the Schedule sets, never an invented amount.
    let criminal = new_matter(&app, &client, "private", None).await;
    let (_, bill) = post(&app, &format!("/api/matters/{criminal}/bills"), json!({ "against": "client" })).await;
    assert!(bill["items"][0]["particulars"].as_str().unwrap().contains("not less than"));
    let (_, scale) = get(&app, "/api/costs/scale").await;
    assert_eq!(scale["fixed"].as_array().unwrap().len(), 10);
}

#[tokio::test]
async fn the_oaths_register_takes_an_appointed_advocate_numbers_by_year_and_strikes_out_but_never_deletes() {
    let app = app().await;
    let oath = json!({ "register": "oaths", "kind": "affidavit", "onDay": now(), "personName": "Okello James", "documentTitle": "Affidavit in support" });
    assert_eq!(post(&app, "/api/registers", oath.clone()).await.0, StatusCode::UNPROCESSABLE_ENTITY, "the usage is off");
    assert_eq!(put(&app, "/api/usages", json!({ "usages": ["criminal", "civil", "oaths"] })).await.0, StatusCode::OK);

    let (_, page) = get(&app, "/api/registers?register=oaths").await;
    assert!(page["refusal"].as_str().unwrap().contains("appointment"), "{page}");
    assert_eq!(post(&app, "/api/registers", oath.clone()).await.0, StatusCode::UNPROCESSABLE_ENTITY, "no appointment recorded");

    let (_, staff) = get(&app, "/api/staff").await;
    let me = staff[0]["id"].as_str().unwrap().to_string();
    let practising = json!({ "practisingNumber": "PC/1234", "certificateExpiresOn": now() - DAY, "ulsPaidYear": 2026, "commissionerSince": now() - 400 * DAY });
    assert_eq!(put(&app, &format!("/api/compliance/{me}"), practising).await.0, StatusCode::OK);
    assert_eq!(post(&app, "/api/registers", oath.clone()).await.0, StatusCode::UNPROCESSABLE_ENTITY, "certificate expired");
    let (status, compliance) = put(&app, &format!("/api/compliance/{me}"), json!({ "practisingNumber": "PC/1234", "certificateExpiresOn": now() + 90 * DAY, "commissionerSince": now() - 400 * DAY })).await;
    assert_eq!(status, StatusCode::OK, "{compliance}");
    assert_eq!(compliance["advocates"][0]["certificate"], "valid");

    let (status, first) = post(&app, "/api/registers", oath.clone()).await;
    assert_eq!(status, StatusCode::OK, "{first}");
    let year = crate::domain::registers::year_of(now());
    assert_eq!(first["number"], format!("OA/{year}/0001"));
    assert_eq!(post(&app, "/api/registers", oath.clone()).await.1["number"], format!("OA/{year}/0002"));
    assert_eq!(post(&app, "/api/registers", json!({ "register": "oaths", "kind": "protest", "onDay": now(), "personName": "X", "documentTitle": "Y" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "a protest is notarial");
    assert_eq!(post(&app, "/api/registers", json!({ "register": "notarial", "kind": "attestation", "onDay": now(), "personName": "X", "documentTitle": "Y" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "not a notary");

    // Not in a matter the practice acts in.
    let client = new_client(&app, "Okello James").await;
    let matter = new_matter(&app, &client, "private", None).await;
    let mut linked = oath.clone();
    linked["matterId"] = json!(matter);
    assert_eq!(post(&app, "/api/registers", linked).await.0, StatusCode::UNPROCESSABLE_ENTITY);

    let id = first["id"].as_str().unwrap();
    assert_eq!(post(&app, &format!("/api/registers/{id}/void"), json!({ "reason": " " })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (status, voided) = post(&app, &format!("/api/registers/{id}/void"), json!({ "reason": "Deponent left before swearing" })).await;
    assert_eq!(status, StatusCode::OK, "{voided}");
    assert!(voided["voidedAt"].is_i64());
    assert_eq!(post(&app, &format!("/api/registers/{id}/void"), json!({ "reason": "again" })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    let (_, page) = get(&app, "/api/registers?register=oaths").await;
    assert_eq!(page["entries"].as_array().unwrap().len(), 2, "struck out, still there");
    assert!(page["refusal"].is_null());
}

#[tokio::test]
async fn pro_bono_hours_count_for_the_advocate_who_worked_and_statistics_come_from_the_records() {
    let app = app().await;
    let client = new_client(&app, "Nakato").await;
    let pro_bono = new_matter(&app, &client, "pro_bono", None).await;
    let private = new_matter(&app, &client, "private", None).await;
    post(&app, &format!("/api/matters/{pro_bono}/time"), json!({ "workedOn": now() - DAY, "minutes": 150, "description": "Advice at the clinic" })).await;
    post(&app, &format!("/api/matters/{private}/time"), json!({ "workedOn": now() - DAY, "minutes": 60, "description": "Drafting" })).await;

    let (_, compliance) = get(&app, "/api/compliance").await;
    assert_eq!(compliance["targetMinutes"], 2400);
    assert_eq!(compliance["advocates"][0]["proBonoMinutes"], 150, "{compliance}");
    assert_eq!(compliance["advocates"][0]["certificate"], "missing");

    post(&app, "/api/ledger", json!({ "clientId": client, "matterId": private, "kind": "received", "amount": 800_000, "onDay": now() - DAY, "description": "On account" })).await;
    let (status, stats) = get(&app, "/api/statistics").await;
    assert_eq!(status, StatusCode::OK, "{stats}");
    assert_eq!(stats["minutesRecorded"], 210);
    assert_eq!(stats["proBonoMinutes"], 150);
    assert_eq!(stats["money"]["heldForClients"], 800_000);
    assert_eq!(stats["openedByMonth"].as_array().unwrap().iter().map(|v| v.as_i64().unwrap()).sum::<i64>(), 2);
    assert_eq!(stats["byType"][0]["open"], 2);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_firm_works_on_one_office_computer_and_each_desk_has_its_own_person() {
    // The office: set up as a firm, everyone with a PIN.
    let port = std::net::TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
    let office_state = fresh_state(port).await;
    let office = router(office_state.clone());
    let people = json!([{ "name": "B. Clerk", "rank": "Legal assistant", "role": "paralegal", "flag": false, "secret": "111111" }]);
    assert_eq!(post(&office, "/api/setup/complete", setup_payload("basic", Some("654321"), "firm", "advocate", people)).await.0, StatusCode::OK);
    let (status, body) = put(&office, "/api/network/office", json!({ "on": true })).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    tokio::spawn(super::supervise_office(office_state.clone()));
    for _ in 0..50 {
        if office_state.lan.listening.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    let (_, status_o) = get(&office, "/api/network").await;
    assert_eq!(status_o["listening"], true, "{status_o}");
    let fingerprint = status_o["fingerprint"].as_str().unwrap().to_string();
    let code = post(&office, "/api/network/pairing-code", json!({})).await.1["code"].as_str().unwrap().to_string();

    // A second computer, never set up, looks and compares before joining.
    let desk = fresh_app().await;
    let address = format!("127.0.0.1:{port}");
    let (status, probe) = post(&desk, "/api/network/probe", json!({ "address": address })).await;
    assert_eq!(status, StatusCode::OK, "{probe}");
    assert_eq!(probe["fingerprint"], fingerprint);
    assert_eq!(probe["officeName"], "Nabirye & Co. Advocates");
    // A fingerprint that is not the office's is never joined.
    let wrong = "AA:".repeat(31) + "AA";
    let (status, body) = post(&desk, "/api/network/join", json!({ "address": address, "fingerprint": wrong, "code": code, "deviceName": "Reception" })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    let (status, joined) = post(&desk, "/api/network/join", json!({ "address": address, "fingerprint": fingerprint, "code": code.to_lowercase(), "deviceName": "Reception" })).await;
    assert_eq!(status, StatusCode::OK, "{joined}");
    assert_eq!(joined["mode"], "terminal");
    assert_eq!(post(&desk, "/api/network/join", json!({ "address": address, "fingerprint": fingerprint, "code": code, "deviceName": "Again" })).await.0, StatusCode::UNPROCESSABLE_ENTITY, "already joined");
    let other_desk = fresh_app().await;
    let (status, body) = post(&other_desk, "/api/network/join", json!({ "address": address, "fingerprint": fingerprint, "code": code, "deviceName": "Library" })).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "a code is used once: {body}");

    // The desk shows the office's practice, with nobody signed in there yet,
    // while the advocate stays signed in on the office computer.
    let (_, desk_session) = get(&desk, "/api/session/status").await;
    assert_eq!(desk_session["installed"], true);
    assert_eq!(desk_session["locked"], true, "{desk_session}");
    assert_eq!(get(&office, "/api/session/status").await.1["actor"]["name"], "A. Nabirye");
    let (_, list) = get(&desk, "/api/session/people").await;
    let clerk = list.as_array().unwrap().iter().find(|p| p["name"] == "B. Clerk").unwrap()["id"].as_str().unwrap().to_string();
    assert_eq!(post(&desk, "/api/session/sign-in", json!({ "staffId": clerk, "secret": "111111" })).await.1["status"], "signed_in");
    assert_eq!(get(&desk, "/api/session/status").await.1["actor"]["name"], "B. Clerk");
    assert_eq!(get(&office, "/api/session/status").await.1["actor"]["name"], "A. Nabirye", "each desk has its own person");

    // Work done at the desk is the office's record, in the clerk's name.
    let (status, client) = post(&desk, "/api/clients", json!({ "name": "Wasswa Peter" })).await;
    assert_eq!(status, StatusCode::OK, "{client}");
    let (_, clients) = get(&office, "/api/clients").await;
    assert!(clients.as_array().unwrap().iter().any(|c| c["name"] == "Wasswa Peter"));
    let (_, trail) = get(&office, "/api/audit").await;
    let joined = trail.as_array().unwrap().iter().find(|e| e["action"] == "device_joined").expect("joining is recorded");
    assert!(joined["actor"].is_null(), "a computer joining over the network acts as nobody on the office: {joined}");
    assert!(trail.as_array().unwrap().iter().any(|e| e["action"] == "signed_in" && e["actor"] == "B. Clerk"), "{trail}");
    // The office network is managed only on the office computer.
    assert_eq!(get(&desk, "/api/network").await.1["mode"], "terminal");

    // Removed on the office: the desk is refused at once.
    let (_, status_o) = get(&office, "/api/network").await;
    let device = status_o["devices"][0]["id"].as_str().unwrap().to_string();
    assert_eq!(call(&office, Method::DELETE, &format!("/api/network/devices/{device}"), None).await.0, StatusCode::OK);
    let (status, body) = get(&desk, "/api/clients").await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");
    assert_eq!(body["code"], "DEVICE_UNKNOWN");
}

#[tokio::test]
async fn an_administrator_takes_every_record_out_without_anyones_secrets() {
    let app = fresh_app().await;
    let people = json!([{ "name": "B. Clerk", "rank": "", "role": "paralegal", "flag": false, "secret": "111111" }]);
    assert_eq!(post(&app, "/api/setup/complete", setup_payload("basic", Some("654321"), "firm", "advocate", people)).await.0, StatusCode::OK);
    new_client(&app, "Okello").await;
    let (status, data) = get(&app, "/api/export").await;
    assert_eq!(status, StatusCode::OK, "{data}");
    assert!(data["tables"]["clients"].as_array().unwrap().iter().any(|c| c["name"] == "Okello"));
    assert!(data["tables"]["matters"].is_array());
    let staff = data["tables"]["staff"].as_array().unwrap();
    assert_eq!(staff.len(), 2);
    let text = data.to_string();
    assert!(!text.contains("secret_hash") && !text.contains("$argon2"), "no PIN hashes");
    assert!(data["tables"].get("pairing_codes").is_none());

    // A paralegal does not carry the whole practice away.
    post(&app, "/api/session/sign-out", json!({})).await;
    let (_, list) = get(&app, "/api/session/people").await;
    let clerk = list.as_array().unwrap().iter().find(|p| p["name"] == "B. Clerk").unwrap()["id"].as_str().unwrap().to_string();
    post(&app, "/api/session/sign-in", json!({ "staffId": clerk, "secret": "111111" })).await;
    assert_eq!(get(&app, "/api/export").await.0, StatusCode::FORBIDDEN);
}
