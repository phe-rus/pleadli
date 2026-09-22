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

async fn app() -> Router {
    let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    router(AppState { pool })
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
    let make = |offset: i64| post(&app, &format!("/api/matters/{matter}/hearings"), json!({ "at": now() + offset * DAY, "purpose": "mention" }));
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

    // Nothing to file, and no name set.
    assert_eq!(post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": filed_on })).await.0, StatusCode::UNPROCESSABLE_ENTITY);
    put(&app, &format!("/api/documents/{id}"), json!({ "title": "Application for bail pending trial", "body": doc("The applicant is a first offender with a fixed abode.") })).await;
    let (status, error) = post(&app, &format!("/api/documents/{id}/file"), json!({ "filedOn": filed_on })).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(error["message"].as_str().unwrap().contains("Settings"));

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
    assert_eq!(verdict["entries"], 5, "the profile, the client, and the three above");
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
