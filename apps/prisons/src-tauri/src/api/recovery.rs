//! Recovery mode (docs/prisons/product-map/03 L.4, state 9).
//!
//! When the database fails its integrity check at startup the node does not
//! open it for work. It serves only this router: it says what is wrong, lists
//! backups, and stages a restore. There are no accounts to sign in with (they
//! live in the database that cannot be trusted), so these routes are for the
//! node's own machine only, and a restore still needs the recovery
//! passphrase, which is what actually protects the backups.

use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Extension, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::error::ApiError;
use super::guard::Ingress;
use crate::domain::backup::{self, BackupInfo, BackupSummary};

struct RecoveryState {
    data_dir: PathBuf,
    reason: String,
}

pub fn router(data_dir: PathBuf, reason: String) -> Router {
    Router::new()
        .route("/api/system/health", get(health))
        .route("/api/system/recovery", get(status))
        .route("/api/system/recovery/backups", post(list))
        .route("/api/system/recovery/restore", post(restore))
        .with_state(Arc::new(RecoveryState { data_dir, reason }))
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": false, "recovering": true }))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Status {
    recovering: bool,
    reason: String,
    default_backup_dir: String,
}

async fn status(State(state): State<Arc<RecoveryState>>) -> Json<Status> {
    Json(Status {
        recovering: true,
        reason: state.reason.clone(),
        default_backup_dir: backup::default_backup_dir(&state.data_dir).to_string_lossy().to_string(),
    })
}

fn require_local(ingress: Option<Extension<Ingress>>) -> Result<(), ApiError> {
    match ingress {
        Some(Extension(i)) if i.is_local() => Ok(()),
        _ => Err(ApiError::local_only()),
    }
}

#[derive(Deserialize)]
struct ListBody {
    dir: Option<String>,
}

async fn list(
    State(state): State<Arc<RecoveryState>>,
    ingress: Option<Extension<Ingress>>,
    Json(body): Json<ListBody>,
) -> Result<Json<Vec<BackupInfo>>, ApiError> {
    require_local(ingress)?;
    let dir = body.dir.filter(|d| !d.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| backup::default_backup_dir(&state.data_dir));
    backup::list_backups(&dir).map(Json).map_err(|_| ApiError::not_found("That folder"))
}

#[derive(Deserialize)]
struct RestoreBody {
    path: String,
    passphrase: String,
}

async fn restore(
    State(state): State<Arc<RecoveryState>>,
    ingress: Option<Extension<Ingress>>,
    Json(body): Json<RestoreBody>,
) -> Result<(StatusCode, Json<BackupSummary>), ApiError> {
    require_local(ingress)?;
    let summary = backup::stage_restore(&state.data_dir, std::path::Path::new(&body.path), &body.passphrase).await?;
    Ok((StatusCode::ACCEPTED, Json(summary)))
}
