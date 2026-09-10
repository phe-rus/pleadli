use qrcode::render::svg;
use qrcode::QrCode;
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::commands::cloudflare;
use crate::db::Db;
use crate::domain::{cloudflare_tunnel, officers};
use crate::transport::remote_server;
use crate::{CloudflaredSidecar, RemoteServer};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessStatus {
    pub enabled: bool,
    /// Set once Cloudflare is configured and the tunnel is actually
    /// running — the internet-reachable address. `None` if remote
    /// access is local-network-only (no Cloudflare configured yet).
    pub hostname: Option<String>,
}

async fn current_status(pool: &sqlx::SqlitePool) -> Result<RemoteAccessStatus, String> {
    let settings = officers::get_remote_access_settings(pool).await.map_err(|e| e.to_string())?;
    let hostname = if settings.enabled {
        cloudflare_tunnel::get_tunnel_state(pool).await.map_err(|e| e.to_string())?.map(|t| t.hostname)
    } else {
        None
    };
    Ok(RemoteAccessStatus { enabled: settings.enabled, hostname })
}

#[tauri::command]
pub async fn get_remote_access_status(state: State<'_, Db>) -> Result<RemoteAccessStatus, String> {
    current_status(&state.pool).await
}

/// The one Settings toggle: turns the local restricted server on/off
/// (LAN reachability either way), and — only if Cloudflare has already
/// been configured — also provisions/starts or stops the tunnel that
/// makes it reachable from anywhere.
#[tauri::command]
pub async fn set_remote_access_enabled(
    app: AppHandle,
    db: State<'_, Db>,
    remote: State<'_, RemoteServer>,
    sidecar: State<'_, CloudflaredSidecar>,
    enabled: bool,
) -> Result<RemoteAccessStatus, String> {
    let mut remote_guard = remote.0.lock().await;

    if enabled {
        if remote_guard.is_none() {
            let handle = remote_server::start(db.pool.clone(), remote_server::DEFAULT_PORT, app.clone())
                .await
                .map_err(|e| e.to_string())?;
            *remote_guard = Some(handle);
        }
        if let Err(e) = cloudflare::start_sidecar_if_configured(&app, &db.pool, &sidecar).await {
            log::warn!("remote access is on locally, but the Cloudflare tunnel failed to start: {e}");
        }
    } else {
        if let Some(handle) = remote_guard.take() {
            handle.stop();
        }
        cloudflare::stop_sidecar(&sidecar).await;
    }

    officers::set_remote_access_enabled(&db.pool, enabled).await.map_err(|e| e.to_string())?;
    current_status(&db.pool).await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNetworkInfo {
    pub address: Option<String>,
    pub port: u16,
}

#[tauri::command]
pub fn get_local_network_info() -> LocalNetworkInfo {
    LocalNetworkInfo {
        address: local_ip_address::local_ip().ok().map(|ip| ip.to_string()),
        port: remote_server::DEFAULT_PORT,
    }
}

/// An SVG QR code encoding this station's local login URL — so pairing
/// a phone on the same network is "scan this", never "type an IP".
#[tauri::command]
pub fn get_local_pairing_qr() -> Result<String, String> {
    let info = get_local_network_info();
    let address = info.address.ok_or_else(|| "no local network address found".to_string())?;
    let url = format!("http://{address}:{}/", info.port);
    let code = QrCode::new(url.as_bytes()).map_err(|e| e.to_string())?;
    Ok(code.render::<svg::Color>().build())
}
