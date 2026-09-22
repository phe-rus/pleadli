//! Finding Head Office on the local network. Suggest-only.
//!
//! A Head Office that accepts facilities on its LAN answers a small UDP probe on
//! port 47924 with its name and the TCP port to use. A facility broadcasts the
//! probe and lists whoever answers. That is all it is:
//!
//! - an answer is a *suggestion*. Nothing in it is trusted, and nothing is sent
//!   to the address it names until a person has seen the certificate
//!   fingerprint the address really presents (`peer::probe_identity`) and
//!   confirmed it;
//! - it is never required. UDP broadcast does not cross routers and is often
//!   blocked on managed networks, so typing the address is always possible;
//! - it says nothing a listener on the LAN could not learn by connecting to the
//!   port: the product, the role and a display name.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::net::UdpSocket;
use tokio::task::JoinHandle;

use crate::domain::{nodeconfig, session};
use crate::node::NodeRef;

pub const PORT: u16 = 47924;
const PROBE: &[u8] = b"PLEADLI-PRISONS-HQ?1";
const PRODUCT: &str = "pleadli-prisons";
const REPLIES_PER_WINDOW: usize = 6;
const REPLY_WINDOW: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize, Deserialize)]
struct Announcement {
    product: String,
    role: String,
    name: String,
    port: u16,
}

/// A Head Office that answered. The fingerprint is not here on purpose: it is
/// read from the certificate the address presents, never from the answer.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub address: String,
    pub name: String,
}

/// Answers probes until the task is aborted.
async fn respond(node: NodeRef, socket: UdpSocket, tcp_port: u16, name: String) {
    let reply = serde_json::to_vec(&Announcement { product: PRODUCT.into(), role: "head_office".into(), name, port: tcp_port }).unwrap_or_default();
    let mut buf = [0u8; 64];
    loop {
        let Ok((n, from)) = socket.recv_from(&mut buf).await else { continue };
        if &buf[..n] != PROBE || !node.limiter.check(&format!("discovery:{}", from.ip()), REPLIES_PER_WINDOW, REPLY_WINDOW) {
            continue;
        }
        let _ = socket.send_to(&reply, from).await;
    }
}

/// Binds the responder on `addr` and returns the task and the bound address.
/// The port is a parameter so tests do not compete for the real one.
pub async fn serve_on(node: NodeRef, addr: SocketAddr, tcp_port: u16) -> std::io::Result<(JoinHandle<()>, SocketAddr)> {
    let socket = UdpSocket::bind(addr).await?;
    let bound = socket.local_addr()?;
    Ok((tokio::spawn(respond(node, socket, tcp_port, "Head Office".into())), bound))
}

/// Keeps the responder running exactly while this installation is a Head Office
/// that accepts facilities on its local network.
pub async fn supervise(node: NodeRef) {
    let mut running: Option<JoinHandle<()>> = None;
    loop {
        let want = session::is_head_office(&node.pool).await && nodeconfig::network_lan_enabled(&node.pool).await;
        if running.as_ref().is_some_and(|task| task.is_finished()) {
            running = None;
        }
        match (&running, want) {
            (None, true) => match serve_on(node.clone(), SocketAddr::from((Ipv4Addr::UNSPECIFIED, PORT)), crate::api::network::LAN_PORT).await {
                Ok((task, _)) => running = Some(task),
                Err(e) => log::warn!("discovery could not listen on UDP {PORT}: {e}"),
            },
            (Some(task), false) => {
                task.abort();
                running = None;
            }
            _ => {}
        }
        node.discovery_listening.store(running.is_some(), Ordering::Relaxed);
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}

/// The addresses to broadcast the probe to: the limited broadcast, and each
/// IPv4 interface's own /24 broadcast (the common facility network).
pub fn broadcast_targets() -> Vec<SocketAddr> {
    let mut targets = vec![SocketAddr::from((Ipv4Addr::BROADCAST, PORT))];
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_, ip) in interfaces {
            if let IpAddr::V4(v4) = ip {
                if v4.is_loopback() || v4.is_link_local() {
                    continue;
                }
                let o = v4.octets();
                let target = SocketAddr::from((Ipv4Addr::new(o[0], o[1], o[2], 255), PORT));
                if !targets.contains(&target) {
                    targets.push(target);
                }
            }
        }
    }
    targets
}

/// Sends the probe to `targets` and collects the answers for `wait`.
pub async fn probe(targets: &[SocketAddr], wait: Duration) -> Vec<Found> {
    let Ok(socket) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).await else { return Vec::new() };
    let _ = socket.set_broadcast(true);
    for target in targets {
        let _ = socket.send_to(PROBE, target).await;
    }
    let mut found: Vec<Found> = Vec::new();
    let deadline = tokio::time::Instant::now() + wait;
    let mut buf = [0u8; 512];
    while let Ok(Ok((n, from))) = tokio::time::timeout_at(deadline, socket.recv_from(&mut buf)).await {
        let Ok(announcement) = serde_json::from_slice::<Announcement>(&buf[..n]) else { continue };
        if announcement.product != PRODUCT || announcement.role != "head_office" || announcement.port == 0 {
            continue;
        }
        // Whatever the packet says about itself, the address is where it came from.
        let name: String = announcement.name.chars().filter(|c| !c.is_control()).take(80).collect();
        let entry = Found { address: format!("{}:{}", from.ip(), announcement.port), name };
        if !found.contains(&entry) {
            found.push(entry);
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn hq_node() -> NodeRef {
        let dir = std::env::temp_dir().join(format!("pleadli-discovery-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = sqlx::sqlite::SqlitePoolOptions::new().max_connections(2).connect_with(crate::db::connect_options(&dir.join("hq.db"))).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        crate::node::Node::new(pool, dir.join("vault"), dir)
    }

    #[tokio::test]
    async fn a_probe_finds_the_head_office_that_answers_and_reports_where_it_came_from() {
        let node = hq_node().await;
        let (_task, bound) = serve_on(node, "127.0.0.1:0".parse().unwrap(), 47924).await.unwrap();
        let found = probe(&[bound], Duration::from_millis(400)).await;
        assert_eq!(found, [Found { address: "127.0.0.1:47924".into(), name: "Head Office".into() }]);
    }

    #[tokio::test]
    async fn nothing_answering_is_an_empty_list_not_an_error() {
        let silent = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let found = probe(&[silent.local_addr().unwrap()], Duration::from_millis(200)).await;
        assert!(found.is_empty());
    }

    #[tokio::test]
    async fn a_packet_that_is_not_an_announcement_is_ignored() {
        let liar = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let target = liar.local_addr().unwrap();
        tokio::spawn(async move {
            let mut buf = [0u8; 64];
            if let Ok((_, from)) = liar.recv_from(&mut buf).await {
                let _ = liar.send_to(b"{\"product\":\"something-else\",\"role\":\"head_office\",\"name\":\"x\",\"port\":1}", from).await;
                let _ = liar.send_to(b"garbage", from).await;
            }
        });
        assert!(probe(&[target], Duration::from_millis(300)).await.is_empty());
    }

    #[tokio::test]
    async fn a_probe_that_is_not_ours_gets_no_answer() {
        let node = hq_node().await;
        let (_task, bound) = serve_on(node, "127.0.0.1:0".parse().unwrap(), 47924).await.unwrap();
        let socket = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        socket.send_to(b"hello", bound).await.unwrap();
        let mut buf = [0u8; 64];
        assert!(tokio::time::timeout(Duration::from_millis(300), socket.recv_from(&mut buf)).await.is_err());
    }
}
