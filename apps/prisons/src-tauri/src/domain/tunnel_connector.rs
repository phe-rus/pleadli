//! The `cloudflared` connector that carries Head Office's tunnel.
//!
//! Provisioning (`cloudflare_tunnel`) only creates the tunnel at Cloudflare;
//! nothing is reachable until a `cloudflared` process runs with the tunnel's
//! token. That binary ships with the app as a Tauri `externalBin` (see
//! `docs/prisons/remote-access.md`), which the bundler places beside the
//! executable, so it is found there first and on `PATH` second.
//!
//! It is run with `tokio::process`, not the Tauri shell plugin, because the
//! tunnel is set up from the node API, which has no window handle, and so that
//! the headless node can run it too. The token is passed in the environment
//! (`TUNNEL_TOKEN`), never on the command line, where any local user's `ps`
//! would show it.

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::cloudflare_tunnel;
use crate::node::NodeRef;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectorState {
    /// The process is up.
    Running,
    /// The binary is here but nothing is running.
    Stopped,
    /// This build has no `cloudflared` to run.
    Missing,
}

#[derive(Default)]
pub struct Connector {
    child: Mutex<Option<Child>>,
}

const BINARY: &str = if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" };

/// The bundled binary beside the executable, else one on `PATH`.
pub fn locate() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.join(BINARY)));
    if let Some(path) = beside.filter(|p| p.is_file()) {
        return Some(path);
    }
    let paths = std::env::var_os("PATH")?;
    std::env::split_paths(&paths).map(|dir| dir.join(BINARY)).find(|p| p.is_file())
}

impl Connector {
    pub async fn state(&self) -> ConnectorState {
        let mut child = self.child.lock().await;
        if let Some(running) = child.as_mut() {
            // `try_wait` is what notices a process that has since exited.
            match running.try_wait() {
                Ok(None) => return ConnectorState::Running,
                _ => *child = None,
            }
        }
        if locate().is_some() {
            ConnectorState::Stopped
        } else {
            ConnectorState::Missing
        }
    }

    pub async fn stop(&self) {
        if let Some(mut child) = self.child.lock().await.take() {
            let _ = child.kill().await;
        }
    }

    /// (Re)starts the connector with `run_token`. Any earlier one is stopped
    /// first, so a refreshed token takes effect.
    pub async fn start(&self, run_token: &str) -> Result<(), String> {
        let binary = locate().ok_or_else(|| "This build has no cloudflared connector.".to_string())?;
        self.stop().await;
        let mut child = Command::new(&binary)
            .args(["tunnel", "--no-autoupdate", "run"])
            .env("TUNNEL_TOKEN", run_token)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            // The connector must not outlive the app.
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("cloudflared could not be started: {e}"))?;
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if line.contains(" ERR ") {
                        log::warn!("cloudflared: {line}");
                    } else {
                        log::debug!("cloudflared: {line}");
                    }
                }
            });
        }
        *self.child.lock().await = Some(child);
        Ok(())
    }

    /// Starts the connector from the stored tunnel, if this installation has
    /// one. `Ok(false)` when there is nothing to start.
    pub async fn start_provisioned(&self, node: &NodeRef) -> Result<bool, String> {
        match cloudflare_tunnel::get_run_token(&node.pool).await.map_err(|e| e.to_string())? {
            Some(token) => self.start(&token).await.map(|_| true),
            None => Ok(false),
        }
    }
}

/// Keeps the connector running for as long as this installation is a Head
/// Office with a provisioned tunnel: starts it at launch, when the tunnel is
/// first set up elsewhere, and again if it exits. Retries back off, so a bad
/// token or a missing binary does not spin.
pub async fn supervise(node: NodeRef) {
    let mut started_before = false;
    let mut failures: u32 = 0;
    loop {
        if super::session::is_head_office(&node.pool).await {
            match node.connector.state().await {
                ConnectorState::Stopped => {
                    if started_before {
                        failures += 1;
                    }
                    match node.connector.start_provisioned(&node).await {
                        Ok(true) => started_before = true,
                        Ok(false) => {}
                        Err(e) => {
                            failures += 1;
                            log::warn!("tunnel connector: {e}");
                        }
                    }
                }
                ConnectorState::Running => failures = 0,
                ConnectorState::Missing => {}
            }
        } else if started_before {
            // No longer Head Office: the tunnel has no business staying up.
            node.connector.stop().await;
            started_before = false;
        }
        tokio::time::sleep(Duration::from_secs((10u64 << failures.min(5)).min(300))).await;
    }
}
