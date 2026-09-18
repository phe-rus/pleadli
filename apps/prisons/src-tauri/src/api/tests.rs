//! Tests of the API boundary itself: they drive the real router against a
//! real SQLite file, so what is verified is what ships (docs/prisons/
//! product-map/07 X1, X2, X11, X12).

use axum::body::Body;
use axum::http::{Method, Request, StatusCode};
use axum::Router;
use serde_json::{json, Value};
use tower::ServiceExt;

use super::guard::{Ingress, Need, DEVICE_HEADER};
use crate::domain::authz::role_permissions;
use crate::node::{Node, NodeRef};

struct Harness {
    node: NodeRef,
    router: Router,
}

async fn harness() -> Harness {
    let dir = std::env::temp_dir().join(format!("pleadli-prisons-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(crate::db::connect_options(&dir.join("test.db")))
        .await
        .unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    let node = Node::new(pool, dir.join("vault"), dir);
    std::fs::create_dir_all(&node.vault_root).unwrap();
    let router = super::router(node.clone());
    Harness { node, router }
}

struct Call<'a> {
    ingress: Ingress,
    method: Method,
    path: &'a str,
    token: Option<&'a str>,
    device: Option<&'a str>,
    body: Option<Value>,
}

impl<'a> Call<'a> {
    fn new(method: Method, path: &'a str) -> Self {
        Call { ingress: Ingress::Local, method, path, token: None, device: None, body: None }
    }
    fn token(mut self, token: &'a str) -> Self {
        self.token = Some(token);
        self
    }
    fn device(mut self, device: &'a str) -> Self {
        self.device = Some(device);
        self
    }
    fn ingress(mut self, ingress: Ingress) -> Self {
        self.ingress = ingress;
        self
    }
    fn body(mut self, body: Value) -> Self {
        self.body = Some(body);
        self
    }
}

async fn send(router: &Router, call: Call<'_>) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(call.method).uri(call.path).header("content-type", "application/json");
    if let Some(token) = call.token {
        builder = builder.header("authorization", format!("Bearer {token}"));
    }
    if let Some(device) = call.device {
        builder = builder.header(DEVICE_HEADER, device);
    }
    let body = call.body.map(|b| Body::from(b.to_string())).unwrap_or_else(Body::empty);
    let mut request = builder.body(body).unwrap();
    request.extensions_mut().insert(call.ingress);
    let response = router.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 10 * 1024 * 1024).await.unwrap();
    let value = if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap_or(Value::Null) };
    (status, value)
}

/// First launch as a facility, then the first account (an OIC administrator).
async fn bootstrap(h: &Harness) -> String {
    let (status, _) = send(&h.router, Call::new(Method::POST, "/api/system/onboarding/role").body(json!({ "role": "facility" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, body) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/bootstrap").body(json!({ "badgeNumber": "OIC-1", "name": "Officer In Charge", "password": "correct-horse" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["token"].as_str().unwrap().to_string()
}

async fn account(h: &Harness, admin_token: &str, badge: &str, role: &str) -> String {
    let (status, body) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/accounts")
            .token(admin_token)
            .body(json!({ "badgeNumber": badge, "name": badge, "password": "another-password", "role": role })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let (status, body) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/login").body(json!({ "badgeNumber": badge, "password": "another-password" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["token"].as_str().unwrap().to_string()
}

fn concrete(path: &str) -> String {
    path.replace("{id}", "x")
}

#[tokio::test]
async fn no_route_lives_outside_the_api_namespace() {
    let h = harness().await;
    for spec in super::route_specs(h.node.clone()) {
        assert!(spec.path.starts_with("/api/"), "{} is outside /api/**", spec.path);
    }
    for stray in ["/prisoners", "/login", "/peers/register", "/sync/prisoners", "/facilities", "/cloudflare/config"] {
        let (status, _) = send(&h.router, Call::new(Method::GET, stray)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "{stray} must not exist");
    }
}

/// The routes that may be called without signing in. Adding to this list is a
/// deliberate, reviewed act: anything else that quietly becomes `Public`,
/// `Device` or `Onboarding` would be skipped by the walker below.
const OPEN_BY_DESIGN: &[&str] = &[
    "/api/auth/bootstrap",
    "/api/auth/bootstrap-status",
    "/api/auth/devices/enrol",
    "/api/auth/login",
    "/api/system/dev/activation-code",
    "/api/system/dev/role",
    "/api/system/health",
    "/api/system/local/connection",
    "/api/system/local/disconnect",
    "/api/system/onboarding/activate",
    "/api/system/onboarding/connect",
    "/api/system/onboarding/pair",
    "/api/system/onboarding/role",
    "/api/system/recovery",
    "/api/system/state",
];

#[tokio::test]
async fn only_reviewed_routes_can_be_called_without_signing_in() {
    let h = harness().await;
    let mut open: Vec<&str> = super::route_specs(h.node.clone())
        .into_iter()
        .filter(|s| matches!(s.need, Need::Public | Need::Device | Need::Onboarding))
        .map(|s| s.path)
        .collect();
    open.sort_unstable();
    let mut expected = OPEN_BY_DESIGN.to_vec();
    // The two development routes exist only in debug builds.
    expected.retain(|p| cfg!(debug_assertions) || !p.contains("/dev/"));
    expected.sort_unstable();
    assert_eq!(open, expected, "the set of routes reachable without a session changed");
}

/// The regression net for X1, X2 and X12: walks every registered route and
/// proves an anonymous caller is refused, and that a signed-in officer
/// without the route's permission is refused. A route added without a
/// guard cannot be registered at all, and one added with the wrong guard
/// fails here.
#[tokio::test]
async fn every_guarded_route_refuses_anonymous_and_unprivileged_callers() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let officer = account(&h, &admin, "OFF-1", "officer").await;
    let facility_admin = account(&h, &admin, "ADM-1", "facility_admin").await;
    let officer_perms = role_permissions("officer", false);

    let specs = super::route_specs(h.node.clone());
    assert!(specs.len() > 40, "the route table should not be empty");
    let mut checked = 0;

    for spec in specs {
        let path = concrete(spec.path);
        match spec.need {
            Need::Public | Need::Device | Need::Onboarding => continue,
            Need::Session => {
                let (status, _) = send(&h.router, Call { method: spec.method.clone(), ..Call::new(Method::GET, &path) }).await;
                assert_eq!(status, StatusCode::UNAUTHORIZED, "{} {} must need a session", spec.method, spec.path);
                checked += 1;
            }
            Need::Perm(p) | Need::AnyPerm(&[p, ..]) => {
                let (status, _) = send(&h.router, Call { method: spec.method.clone(), ..Call::new(Method::GET, &path) }).await;
                assert_eq!(status, StatusCode::UNAUTHORIZED, "{} {} must refuse anonymous callers", spec.method, spec.path);

                let all: Vec<&str> = match spec.need {
                    Need::AnyPerm(ps) => ps.to_vec(),
                    _ => vec![p],
                };
                let token = if all.iter().any(|x| officer_perms.contains(x)) { &facility_admin } else { &officer };
                let (status, body) = send(&h.router, Call { method: spec.method.clone(), ..Call::new(Method::GET, &path).token(token) }).await;
                assert_eq!(status, StatusCode::FORBIDDEN, "{} {} must refuse a caller without {all:?}: {body}", spec.method, spec.path);
                checked += 1;
            }
            Need::AnyPerm(_) => unreachable!("AnyPerm always lists at least one permission"),
        }
    }
    assert!(checked > 40, "expected to check every protected route, checked {checked}");
}

#[tokio::test]
async fn onboarding_routes_refuse_a_lan_caller_and_lan_needs_an_enrolled_device() {
    let h = harness().await;
    let (status, body) = send(&h.router, Call::new(Method::POST, "/api/system/onboarding/role").ingress(Ingress::Lan).body(json!({ "role": "facility" }))).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    assert_eq!(body["code"], "LOCAL_ONLY");

    let (status, body) = send(&h.router, Call::new(Method::GET, "/api/system/state").ingress(Ingress::Lan)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "DEVICE_NOT_ENROLLED");

    // Liveness stays open so a workstation can tell the node is there.
    let (status, _) = send(&h.router, Call::new(Method::GET, "/api/system/health").ingress(Ingress::Lan)).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn a_workstation_enrols_signs_in_and_its_session_is_bound_to_it() {
    let h = harness().await;
    let admin = bootstrap(&h).await;

    let (status, code) = send(&h.router, Call::new(Method::POST, "/api/auth/devices/enrolment-codes").token(&admin).body(json!({ "label": "Registry PC" }))).await;
    assert_eq!(status, StatusCode::OK);
    let (status, enrolled) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/devices/enrol").ingress(Ingress::Lan).body(json!({ "code": code["code"] })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{enrolled}");
    let device = enrolled["deviceToken"].as_str().unwrap().to_string();

    let (status, session) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/login")
            .ingress(Ingress::Lan)
            .device(&device)
            .body(json!({ "badgeNumber": "OIC-1", "password": "correct-horse" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{session}");
    let token = session["token"].as_str().unwrap().to_string();

    let (status, _) = send(&h.router, Call::new(Method::GET, "/api/prisons/prisoners").ingress(Ingress::Lan).device(&device).token(&token)).await;
    assert_eq!(status, StatusCode::OK);

    // The same session token without the device is refused, and so is a
    // session presented from a different (revoked) device.
    let (status, _) = send(&h.router, Call::new(Method::GET, "/api/prisons/prisoners").ingress(Ingress::Lan).token(&token)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let device_id = enrolled["deviceId"].as_str().unwrap().to_string();
    let (status, _) = send(&h.router, Call::new(Method::POST, &format!("/api/auth/devices/{device_id}/revoke")).token(&admin)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, body) = send(&h.router, Call::new(Method::GET, "/api/prisons/prisoners").ingress(Ingress::Lan).device(&device).token(&token)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["code"], "DEVICE_NOT_ENROLLED");
}

#[tokio::test]
async fn a_write_is_attributed_and_audited_and_the_chain_verifies() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let officer = account(&h, &admin, "OFF-1", "officer").await;

    let reception = json!({
        "decision": "accept", "receivedAt": 1_700_000_000_000i64,
        "person": { "firstName": "Test", "lastName": "Person" },
        "legalStatus": "unconvicted", "highCourtOnlyOffence": false,
        "instrument": { "kind": "remand_warrant", "authenticated": true },
        "searchDone": true, "rulesInformationGiven": true, "property": [], "contacts": []
    });
    let (status, created) = send(&h.router, Call::new(Method::POST, "/api/prisons/receptions").token(&officer).body(reception)).await;
    assert_eq!(status, StatusCode::OK, "{created}");
    let id = created["prisoner"]["id"].as_str().unwrap();

    let (status, rows) = send(&h.router, Call::new(Method::GET, &format!("/api/system/audit?entityType=prisoner&entityId={id}")).token(&admin)).await;
    assert_eq!(status, StatusCode::OK);
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0]["action"], "custody.admit");
    assert_eq!(rows[0]["actorBadge"], "OFF-1");
    assert!(rows[0]["afterJson"].as_str().unwrap().contains("Person"));

    let (_, chain) = send(&h.router, Call::new(Method::GET, "/api/system/audit/verify").token(&admin)).await;
    assert_eq!(chain["ok"], true);
}

#[tokio::test]
async fn a_failed_write_leaves_no_audit_row_behind() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let officer = account(&h, &admin, "OFF-1", "officer").await;

    let before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log").fetch_one(&h.node.pool).await.unwrap();
    let visit = json!({
        "prisonerId": "does-not-exist", "visitorName": "Someone", "visitedAt": 1, "visitType": "ordinary", "status": "attended"
    });
    let (status, body) = send(&h.router, Call::new(Method::POST, "/api/prisons/visits").token(&officer).body(visit)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{body}");
    assert_eq!(body["code"], "REFERENCE_INVALID");
    let after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log").fetch_one(&h.node.pool).await.unwrap();
    assert_eq!(before, after, "a change that did not commit must not appear in the audit trail");
}

#[tokio::test]
async fn sign_out_kills_the_token_and_an_admin_role_cannot_read_records() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let facility_admin = account(&h, &admin, "ADM-1", "facility_admin").await;

    let (status, body) = send(&h.router, Call::new(Method::GET, "/api/prisons/prisoners").token(&facility_admin)).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "administering accounts must not imply reading records: {body}");

    let (status, _) = send(&h.router, Call::new(Method::POST, "/api/auth/logout").token(&facility_admin)).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = send(&h.router, Call::new(Method::GET, "/api/auth/session").token(&facility_admin)).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn bootstrap_is_a_one_time_step_and_the_role_cannot_be_flipped_afterwards() {
    let h = harness().await;
    bootstrap(&h).await;

    let (status, body) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/bootstrap").body(json!({ "badgeNumber": "EVIL", "name": "Evil", "password": "evil-password" })),
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");

    // An installation that chose 'facility' can never be activated as Head Office.
    let (status, _) = send(&h.router, Call::new(Method::POST, "/api/system/onboarding/role").body(json!({ "role": "facility" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let config = crate::domain::session::get_hq_config(&h.node.pool).await.unwrap();
    assert_eq!(config.role.as_deref(), Some("facility"));
    assert!(!config.is_head_office);
}

#[tokio::test]
async fn a_facility_account_cannot_be_given_a_head_office_role() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let (status, body) = send(
        &h.router,
        Call::new(Method::POST, "/api/auth/accounts")
            .token(&admin)
            .body(json!({ "badgeNumber": "X", "name": "X", "password": "another-password", "role": "hq_admin" })),
    )
    .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(body["code"], "INVALID_ROLE");
}

#[tokio::test]
async fn login_failures_are_uniform_and_do_not_reveal_which_part_was_wrong() {
    let h = harness().await;
    bootstrap(&h).await;
    let (s1, b1) = send(&h.router, Call::new(Method::POST, "/api/auth/login").body(json!({ "badgeNumber": "NOPE", "password": "whatever-1" }))).await;
    let (s2, b2) = send(&h.router, Call::new(Method::POST, "/api/auth/login").body(json!({ "badgeNumber": "OIC-1", "password": "whatever-1" }))).await;
    assert_eq!(s1, StatusCode::UNAUTHORIZED);
    assert_eq!((s1, &b1), (s2, &b2));
}

fn reception_body(property: Value) -> Value {
    json!({
        "decision": "accept", "receivedAt": chrono::Utc::now().timestamp_millis() - 86_400_000,
        "person": { "firstName": "Test", "lastName": "Person" },
        "legalStatus": "unconvicted", "highCourtOnlyOffence": false,
        "instrument": { "kind": "remand_warrant", "authenticated": true },
        "searchDone": true, "rulesInformationGiven": true, "property": property, "contacts": []
    })
}

#[tokio::test]
async fn a_discharge_gate_is_met_or_waived_only_by_an_authorising_oic() {
    let h = harness().await;
    let admin = bootstrap(&h).await;
    let officer = account(&h, &admin, "OFF-1", "officer").await;

    let (_, created) = send(&h.router, Call::new(Method::POST, "/api/prisons/receptions").token(&officer).body(reception_body(json!(["Phone"])))).await;
    let id = created["prisoner"]["id"].as_str().unwrap().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let release = |exception: Value| json!({ "prisonerId": id, "releaseType": "bail", "releasedAt": now, "orderedBy": "Court", "exception": exception });

    let (status, body) = send(&h.router, Call::new(Method::POST, "/api/prisons/releases").token(&officer).body(release(Value::Null))).await;
    assert_eq!((status, body["code"].as_str()), (StatusCode::CONFLICT, Some("DISCHARGE_GATES_UNMET")));

    let (status, body) = send(&h.router, Call::new(Method::POST, "/api/prisons/releases").token(&officer).body(release(json!({ "reason": "Court order" })))).await;
    assert_eq!((status, body["code"].as_str()), (StatusCode::FORBIDDEN, Some("EXCEPTION_NEEDS_OIC")), "an officer cannot waive a gate alone");

    let exception = json!({ "reason": "Court order, phone in the store", "authoriser": { "badgeNumber": "OIC-1", "password": "correct-horse" } });
    let (status, body) = send(&h.router, Call::new(Method::POST, "/api/prisons/releases").token(&officer).body(release(exception))).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["authorisedBy"].as_str().unwrap().contains("OIC-1"));
    assert!(body["exceptionGates"].as_str().unwrap().contains("property_outstanding"));

    let (_, prisoner) = send(&h.router, Call::new(Method::GET, &format!("/api/prisons/prisoners/{id}")).token(&officer)).await;
    assert_eq!(prisoner["currentStatus"], "released");
}

#[tokio::test]
async fn a_transfer_moves_the_record_between_two_nodes_and_closes_the_sender_only_on_receipt() {
    let a = harness().await;
    let b = harness().await;
    let admin_a = bootstrap(&a).await;
    let admin_b = bootstrap(&b).await;

    let (_, created) = send(&a.router, Call::new(Method::POST, "/api/prisons/receptions").token(&admin_a).body(reception_body(json!(["Phone"])))).await;
    let id = created["prisoner"]["id"].as_str().unwrap().to_string();
    let episode = created["prisoner"]["episodeId"].as_str().unwrap().to_string();

    let (_, transfer) = send(
        &a.router,
        Call::new(Method::POST, "/api/prisons/transfers").token(&admin_a).body(json!({ "prisonerId": id, "destinationName": "Other Prison", "orderReference": "CGP/1" })),
    )
    .await;
    let tid = transfer["id"].as_str().unwrap().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let (status, sent) = send(
        &a.router,
        Call::new(Method::POST, &format!("/api/prisons/transfers/{tid}/dispatch")).token(&admin_a).body(json!({ "departedAt": now, "passphrase": "a-long-passphrase" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{sent}");
    let dossier = sent["file"]["contentBase64"].as_str().unwrap().to_string();

    let (_, p) = send(&a.router, Call::new(Method::GET, &format!("/api/prisons/prisoners/{id}")).token(&admin_a)).await;
    assert_eq!(p["currentStatus"], "in_transit", "still in custody while in transit");

    let (status, _) = send(&b.router, Call::new(Method::POST, "/api/prisons/transfers/import").token(&admin_b).body(json!({ "contentBase64": dossier, "passphrase": "the wrong one" }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "the dossier does not open without the passphrase");
    let (status, arrived) = send(&b.router, Call::new(Method::POST, "/api/prisons/transfers/import").token(&admin_b).body(json!({ "contentBase64": dossier, "passphrase": "a-long-passphrase" }))).await;
    assert_eq!(status, StatusCode::OK, "{arrived}");

    let (status, _) = send(&b.router, Call::new(Method::POST, &format!("/api/prisons/transfers/{tid}/confirm")).token(&admin_b).body(json!({ "identityVerified": false, "property": [], "receivedAt": now }))).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "identity must be verified before acceptance");
    let (_, preview) = send(&b.router, Call::new(Method::GET, &format!("/api/prisons/transfers/{tid}/dossier")).token(&admin_b)).await;
    let line = preview["property"][0]["id"].as_str().unwrap();
    let (status, confirmed) = send(
        &b.router,
        Call::new(Method::POST, &format!("/api/prisons/transfers/{tid}/confirm")).token(&admin_b).body(json!({
            "identityVerified": true, "property": [{ "id": line, "received": true }], "placement": "Ward 1", "receivedAt": now
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{confirmed}");

    let (_, held) = send(&b.router, Call::new(Method::GET, "/api/prisons/prisoners").token(&admin_b)).await;
    assert_eq!(held.as_array().unwrap().len(), 1);
    assert_eq!(held[0]["episodeId"], episode.as_str(), "one custody episode across the transfer");
    assert_eq!(held[0]["currentStatus"], "in_custody");

    let (_, receipt) = send(&b.router, Call::new(Method::GET, &format!("/api/prisons/transfers/{tid}/receipt-file")).token(&admin_b)).await;
    let receipt = receipt["contentBase64"].as_str().unwrap().to_string();
    let (status, closed) = send(&a.router, Call::new(Method::POST, "/api/prisons/transfers/import-receipt").token(&admin_a).body(json!({ "contentBase64": receipt }))).await;
    assert_eq!(status, StatusCode::OK, "{closed}");
    let (_, p) = send(&a.router, Call::new(Method::GET, &format!("/api/prisons/prisoners/{id}")).token(&admin_a)).await;
    assert_eq!(p["currentStatus"], "transferred_out");

    let (status, _) = send(&a.router, Call::new(Method::POST, "/api/prisons/transfers/import-receipt").token(&admin_a).body(json!({ "contentBase64": receipt }))).await;
    assert_eq!(status, StatusCode::CONFLICT, "a receipt closes a transfer once");
}
