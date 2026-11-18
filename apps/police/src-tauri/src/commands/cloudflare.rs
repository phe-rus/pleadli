use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;

use crate::db::Db;
use crate::domain::cloudflare_tunnel::{self, CloudflareConfig, SaveCloudflareConfigInput, TunnelState};
use crate::transport::remote_server;
use crate::CloudflaredSidecar;

#[tauri::command]
pub async fn save_cloudflare_config(_who: super::api::AdminSignedIn, state: State<'_, Db>, input: SaveCloudflareConfigInput) -> Result<(), String> {
    cloudflare_tunnel::save_config(&state.pool, input).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cloudflare_config(_who: super::api::SignedIn, state: State<'_, Db>) -> Result<Option<CloudflareConfig>, String> {
    cloudflare_tunnel::get_config(&state.pool).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_cloudflare_tunnel_state(_who: super::api::SignedIn, state: State<'_, Db>) -> Result<Option<TunnelState>, String> {
    cloudflare_tunnel::get_tunnel_state(&state.pool).await.map_err(|e| e.to_string())
}

/// Provisions (or reuses) this station's tunnel and starts the
/// `cloudflared` sidecar pointed at it — best-effort: a Cloudflare
/// failure here doesn't stop the base local/LAN toggle from working,
/// it just means the internet-reachable hostname isn't live.
pub async fn start_sidecar_if_configured(
    app: &AppHandle,
    pool: &sqlx::SqlitePool,
    orchestra: &pleadli_node_core::orchestra::Orchestra,
    sidecar: &CloudflaredSidecar,
) -> Result<Option<String>, String> {
    // Own Cloudflare details, if an administrator saved them; otherwise Pleadli provides the tunnel.
    let result = if cloudflare_tunnel::get_config(pool).await.map_err(|e| e.to_string())?.is_some() {
        cloudflare_tunnel::provision(pool, remote_server::DEFAULT_PORT).await.map_err(|e| e.to_string())?
    } else {
        let (hostname, run_token) = orchestra.tunnel(remote_server::DEFAULT_PORT).await.map_err(|e| e.to_string())?;
        cloudflare_tunnel::save_tunnel_state(pool, "pleadli", &hostname, &run_token).await.map_err(|e| e.to_string())?;
        cloudflare_tunnel::ProvisionResult { hostname, run_token }
    };

    let command = app
        .shell()
        .sidecar("cloudflared")
        .map_err(|e| e.to_string())?
        .args(["tunnel", "--no-autoupdate", "run", "--token", &result.run_token]);

    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;
    *sidecar.0.lock().await = Some(child);

    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stderr(bytes) => log::warn!("cloudflared: {}", String::from_utf8_lossy(&bytes)),
                CommandEvent::Error(err) => log::warn!("cloudflared error: {err}"),
                _ => {}
            }
        }
    });

    Ok(Some(result.hostname))
}

pub async fn stop_sidecar(sidecar: &CloudflaredSidecar) {
    if let Some(child) = sidecar.0.lock().await.take() {
        let _ = child.kill();
    }
}
