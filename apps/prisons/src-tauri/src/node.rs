//! The node: the process that owns the database, the vault, the domain logic
//! and the APIs (docs/prisons/product-map/04 I.1). A standalone machine is a
//! node with one local client; a facility LAN is one node with several.

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use sqlx::SqlitePool;

/// Sliding-window limiter keyed by an arbitrary string (an ingress, a
/// client address). Used on sign-in and on the network surface.
#[derive(Default)]
pub struct RateLimiter {
    hits: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn check(&self, key: &str, limit: usize, window: Duration) -> bool {
        let now = Instant::now();
        let mut map = self.hits.lock().unwrap();
        let hits = map.entry(key.to_string()).or_default();
        while let Some(&oldest) = hits.front() {
            if now.duration_since(oldest) > window {
                hits.pop_front();
            } else {
                break;
            }
        }
        if hits.len() >= limit {
            return false;
        }
        hits.push_back(now);
        true
    }
}

/// The facility node this machine is a workstation of. When set, the desktop
/// shell forwards every request to it instead of using its own database.
pub struct Remote {
    /// `https://host:port`
    pub base: String,
    pub device_token: String,
    pub client: reqwest::Client,
}

pub struct Node {
    pub pool: SqlitePool,
    pub vault_root: PathBuf,
    pub data_dir: PathBuf,
    pub limiter: RateLimiter,
    /// Set when this machine is a workstation of another node.
    pub remote: RwLock<Option<Arc<Remote>>>,
    /// Whether the LAN listener is actually accepting connections right now.
    pub lan_listening: AtomicBool,
}

pub type NodeRef = Arc<Node>;

impl Node {
    pub fn new(pool: SqlitePool, vault_root: PathBuf, data_dir: PathBuf) -> NodeRef {
        Arc::new(Node {
            pool,
            vault_root,
            data_dir,
            limiter: RateLimiter::default(),
            remote: RwLock::new(None),
            lan_listening: AtomicBool::new(false),
        })
    }
}
