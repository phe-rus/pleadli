//! The facility LAN listener (docs/prisons/product-map/04 I.3).
//!
//! A node in `node` mode serves the same router as the desktop shell, over
//! TLS with its own pinned certificate, to workstations on the facility
//! network. Every request arrives as `Ingress::Lan`, so every route needs an
//! enrolled device and, past sign-in, a session bound to that device. Only the
//! `/api/auth`, `/api/prisons`, `/api/hq` and `/api/system` namespaces are
//! here; the inter-installation `/api/network/**` surface is a different
//! listener.

use std::net::SocketAddr;
use std::sync::atomic::Ordering;
use std::time::Duration;

use axum::Extension;
use axum_server::tls_rustls::RustlsConfig;
use axum_server::Handle;
use tokio::task::JoinHandle;

use crate::api;
use crate::api::guard::Ingress;
use crate::domain::{nodeconfig, tls};
use crate::node::NodeRef;

/// Serves the node API over TLS on `addr` until the returned handle is
/// aborted or shut down. Returns the handle so callers (and tests) can learn
/// the bound address.
pub fn serve(node: NodeRef, cert: tls::NodeCert, addr: SocketAddr) -> (Handle<SocketAddr>, JoinHandle<()>) {
    tls::install_crypto_provider();
    let handle = Handle::new();
    let for_task = handle.clone();
    let task = tokio::spawn(async move {
        let config = match RustlsConfig::from_pem(cert.cert_pem.into_bytes(), cert.key_pem.into_bytes()).await {
            Ok(config) => config,
            Err(e) => {
                log::error!("LAN listener: bad certificate: {e}");
                return;
            }
        };
        let app = api::router(node.clone()).layer(Extension(Ingress::Lan));
        node.lan_listening.store(true, Ordering::Relaxed);
        let result = axum_server::bind_rustls(addr, config).handle(for_task).serve(app.into_make_service()).await;
        node.lan_listening.store(false, Ordering::Relaxed);
        if let Err(e) = result {
            log::warn!("LAN listener on {addr} stopped: {e}");
        }
    });
    (handle, task)
}

/// Keeps the LAN listener in step with the node's configured mode: on while
/// the node serves workstations, off otherwise, restarted if the port
/// changes. A listener that failed to bind is retried, not assumed.
pub async fn supervise(node: NodeRef) {
    let mut running: Option<(i64, JoinHandle<()>)> = None;
    loop {
        if let Ok(config) = nodeconfig::get(&node.pool).await {
            let want = config.node_mode == "node";
            if let Some((_, task)) = &running {
                if task.is_finished() {
                    running = None;
                }
            }
            match (&running, want) {
                (None, true) => running = start(&node, &config).await,
                (Some((port, task)), true) if *port != config.lan_port => {
                    task.abort();
                    node.lan_listening.store(false, Ordering::Relaxed);
                    running = start(&node, &config).await;
                }
                (Some((_, task)), false) => {
                    task.abort();
                    node.lan_listening.store(false, Ordering::Relaxed);
                    running = None;
                }
                _ => {}
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn start(node: &NodeRef, config: &nodeconfig::NodeConfig) -> Option<(i64, JoinHandle<()>)> {
    let cert = match tls::load_or_create(&node.data_dir) {
        Ok(cert) => cert,
        Err(e) => {
            log::error!("LAN listener: could not load the node certificate: {e}");
            return None;
        }
    };
    let addr: SocketAddr = format!("{}:{}", config.lan_bind, config.lan_port).parse().ok()?;
    let (_, task) = serve(node.clone(), cert, addr);
    log::info!("LAN listener starting on {addr}");
    Some((config.lan_port, task))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::authz::Actor;
    use crate::domain::{devices, officers};
    use crate::node::Remote;
    use serde_json::json;
    use std::sync::Arc;

    async fn node_with_admin() -> (NodeRef, String) {
        let dir = std::env::temp_dir().join(format!("pleadli-lan-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(crate::db::connect_options(&dir.join("prisons.db")))
            .await
            .unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let node = crate::node::Node::new(pool, dir.join("vault"), dir.clone());
        let mut tx = crate::db::begin_write(&node.pool).await.unwrap();
        officers::create_first_admin(&mut tx, "OIC-1", "OIC", "correct-horse").await.unwrap();
        let admin = Actor::officer("a".into(), "OIC-1".into(), "OIC".into(), "oic".into(), true, None);
        let code = devices::create_enrolment_code(&mut tx, &admin, "Registry PC").await.unwrap();
        tx.commit().await.unwrap();
        (node, code.code)
    }

    async fn listening(node: &NodeRef) -> (SocketAddr, String, Handle<SocketAddr>) {
        let cert = tls::load_or_create(&node.data_dir).unwrap();
        let fingerprint = cert.fingerprint.clone();
        let (handle, _task) = serve(node.clone(), cert, "127.0.0.1:0".parse().unwrap());
        let addr = handle.listening().await.expect("the listener binds");
        (addr, fingerprint, handle)
    }

    #[tokio::test]
    async fn a_workstation_reaches_the_node_only_with_the_pinned_certificate_and_an_enrolled_device() {
        let (node, code) = node_with_admin().await;
        let (addr, fingerprint, handle) = listening(&node).await;
        let base = format!("https://127.0.0.1:{}", addr.port());

        // The right fingerprint enrols; the same code cannot be used twice.
        let client = tls::pinned_client(&fingerprint, Duration::from_secs(10)).unwrap();
        let enrol = |code: String| {
            let client = client.clone();
            let base = base.clone();
            async move { client.post(format!("{base}/api/auth/devices/enrol")).json(&json!({ "code": code })).send().await.unwrap() }
        };
        let response = enrol(code.clone()).await;
        assert_eq!(response.status(), 200);
        let enrolled: serde_json::Value = response.json().await.unwrap();
        let device = enrolled["deviceToken"].as_str().unwrap().to_string();
        assert_eq!(enrol(code).await.status(), 401, "an enrolment code is single use");

        // A wrong fingerprint never even completes the handshake.
        let impostor = tls::pinned_client(&"00".repeat(32), Duration::from_secs(10)).unwrap();
        assert!(impostor.get(format!("{base}/api/system/health")).send().await.is_err(), "a certificate that is not the pinned one is refused");

        // Everything else needs the device, then a session bound to it.
        let no_device = client.get(format!("{base}/api/system/state")).send().await.unwrap();
        assert_eq!(no_device.status(), 401);
        let login: serde_json::Value = client
            .post(format!("{base}/api/auth/login"))
            .header("x-pleadli-device", &device)
            .json(&json!({ "badgeNumber": "OIC-1", "password": "correct-horse" }))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let token = login["token"].as_str().unwrap();
        let list = client
            .get(format!("{base}/api/prisons/prisoners"))
            .header("x-pleadli-device", &device)
            .header("authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(list.status(), 200);

        // The inter-installation surface is not on the LAN listener.
        let network = client.get(format!("{base}/api/network/v1/health")).header("x-pleadli-device", &device).send().await.unwrap();
        assert_eq!(network.status(), 404);

        handle.shutdown();
    }

    #[tokio::test]
    async fn a_fresh_machine_becomes_a_workstation_and_its_requests_reach_the_node() {
        let (node, code) = node_with_admin().await;
        let (addr, fingerprint, handle) = listening(&node).await;

        // A second, empty installation: the workstation.
        let dir = std::env::temp_dir().join(format!("pleadli-ws-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new().connect_with(crate::db::connect_options(&dir.join("prisons.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        let workstation = crate::node::Node::new(pool, dir.join("vault"), dir);

        let wrong = nodeconfig::connect_as_workstation(&workstation, &format!("127.0.0.1:{}", addr.port()), &"11".repeat(32), &code).await;
        assert!(matches!(wrong, Err(nodeconfig::ConnectError::Unreachable(_))), "a wrong fingerprint is not trusted");
        let bad_code = nodeconfig::connect_as_workstation(&workstation, &format!("127.0.0.1:{}", addr.port()), &fingerprint, "0000-0000").await;
        assert!(matches!(bad_code, Err(nodeconfig::ConnectError::Refused)));
        nodeconfig::connect_as_workstation(&workstation, &format!("127.0.0.1:{}", addr.port()), &fingerprint, &code).await.unwrap();
        assert_eq!(nodeconfig::get(&workstation.pool).await.unwrap().node_mode, "client");

        // The workstation forwards, and the node answers as itself.
        let remote: Arc<Remote> = workstation.remote.read().unwrap().clone().expect("connected");
        let (status, body) = crate::transport::forward::forward(&remote, "GET", "/api/system/state", None, None).await;
        assert_eq!(status, 200, "{body}");
        assert_eq!(body["bootstrap"], false, "the answer is the node's state, not the workstation's own empty database");

        // A machine that already has a role or accounts cannot become one.
        let again = nodeconfig::connect_as_workstation(&node, &format!("127.0.0.1:{}", addr.port()), &fingerprint, &code).await;
        assert!(matches!(again, Err(nodeconfig::ConnectError::NotFresh)));

        // When the node goes away the workstation says so, distinctly.
        handle.shutdown();
        tokio::time::sleep(Duration::from_millis(300)).await;
        let (status, body) = crate::transport::forward::forward(&remote, "GET", "/api/system/state", None, None).await;
        assert_eq!(status, 502);
        assert_eq!(body["code"], "NODE_UNREACHABLE");
    }
}
