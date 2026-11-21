//! Spoken statements: turns a window of recorded speech into draft words, on this computer.
//!
//! The window records, sends about ten seconds at a time, and shows the words as they come.
//! Everything here is a draft: the officer reads it against the recording and keeps or corrects
//! it, and the officer is the author of the statement. With no model on the computer the status
//! says so and nothing is ever made up.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use pleadli_node_core::speech::{self, Segment, SpeechError, Transcriber};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::{Arc, OnceLock};

use super::{ApiError, AppState};

/// Languages the officer can choose before recording. The engine can also detect one.
const LANGUAGES: [&str; 3] = ["en", "sw", "fr"];

fn transcriber() -> Arc<Transcriber> {
    static T: OnceLock<Arc<Transcriber>> = OnceLock::new();
    T.get_or_init(|| Arc::new(Transcriber::default())).clone()
}

/// Where the speech model is fetched from when an office has none: a public GitHub release of
/// Pleadli (the same place app updates come from). PLEADLI_MODEL_URL replaces it, for an office
/// that keeps the file on its own server. The download is checked against a fixed SHA-256, so a
/// changed or damaged file is thrown away and never used.
const MODEL_URL: &str = "https://github.com/phe-rus/pleadli-releases/releases/download/models-1/ggml-base.bin";
const MODEL_SHA256: &str = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe";
const MODEL_BYTES: u64 = 147_951_465;

#[derive(Default)]
struct Install {
    running: std::sync::atomic::AtomicBool,
    downloaded: std::sync::atomic::AtomicU64,
    error: std::sync::Mutex<Option<String>>,
}

fn install_state() -> &'static Install {
    static I: OnceLock<Install> = OnceLock::new();
    I.get_or_init(Install::default)
}

/// The data folder is the vault's parent (`<data>/vault`).
fn data_dir(state: &AppState) -> PathBuf {
    state.vault_root.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| state.vault_root.clone())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub available: bool,
    /// Why not, in words an officer can read. Empty when available.
    pub reason: String,
    pub languages: Vec<&'static str>,
    /// True while the model is being downloaded.
    pub installing: bool,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    /// Why the last download failed, in words an officer can read.
    pub install_error: Option<String>,
}

pub async fn status(State(state): State<AppState>) -> Json<Status> {
    let available = speech::model_path(&data_dir(&state)).is_some();
    Json(Status {
        available,
        reason: if available {
            String::new()
        } else {
            "The speech model is not on this computer, so words cannot be written as someone speaks. The recording can still be kept and typed up.".to_string()
        },
        languages: LANGUAGES.to_vec(),
        installing: install_state().running.load(Ordering::Relaxed),
        downloaded_bytes: install_state().downloaded.load(Ordering::Relaxed),
        total_bytes: MODEL_BYTES,
        install_error: install_state().error.lock().ok().and_then(|e| e.clone()),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Params {
    /// "en", "sw" or "fr"; anything else (or nothing) lets the engine detect it.
    pub language: Option<String>,
    /// Where this window starts in the whole recording, so the lines are timed from the start.
    pub offset_ms: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    /// 16 kHz mono 32-bit float samples, little-endian, as base64: the window's own recording.
    pub samples_base64: String,
}

/// Sent as JSON, like every other call from the window, so it works the same in a release build.
pub async fn transcribe(State(state): State<AppState>, Query(params): Query<Params>, Json(window): Json<Window>) -> Result<Json<Vec<Segment>>, ApiError> {
    let model = speech::model_path(&data_dir(&state)).ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "The speech model is not on this computer, so words cannot be written as someone speaks.".to_string(),
    ))?;
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(&window.samples_base64).map_err(|_| (StatusCode::BAD_REQUEST, "The audio could not be read.".to_string()))?;
    let samples = speech::samples_from_bytes(&bytes).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let language = params.language.filter(|l| LANGUAGES.contains(&l.as_str()));
    let offset = params.offset_ms.unwrap_or(0).max(0);
    let engine = transcriber();
    let segments = tokio::task::spawn_blocking(move || engine.transcribe(&model, &samples, language.as_deref()))
        .await
        .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "The speech engine stopped.".to_string()))?
        .map_err(|e| match e {
            SpeechError::ModelMissing => (StatusCode::SERVICE_UNAVAILABLE, e.to_string()),
            SpeechError::InvalidAudio => (StatusCode::BAD_REQUEST, e.to_string()),
            SpeechError::Engine(_) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
        })?;
    Ok(Json(segments.into_iter().map(|s| Segment { start_ms: s.start_ms + offset, end_ms: s.end_ms + offset, text: s.text }).collect()))
}

/// Starts the one-time download of the speech model. Returns at once; the status shows progress.
pub async fn install(State(state): State<AppState>) -> Result<StatusCode, ApiError> {
    let dir = data_dir(&state);
    if speech::model_path(&dir).is_some() {
        return Ok(StatusCode::NO_CONTENT);
    }
    let i = install_state();
    if i.running.swap(true, Ordering::SeqCst) {
        return Ok(StatusCode::ACCEPTED);
    }
    i.downloaded.store(0, Ordering::Relaxed);
    if let Ok(mut e) = i.error.lock() {
        *e = None;
    }
    tokio::task::spawn_blocking(move || {
        if let Err(message) = download_model(&dir) {
            log::warn!("speech model download failed: {message}");
            if let Ok(mut e) = install_state().error.lock() {
                *e = Some(message);
            }
        }
        install_state().running.store(false, Ordering::SeqCst);
    });
    Ok(StatusCode::ACCEPTED)
}

fn download_model(dir: &std::path::Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Write};
    let url = std::env::var("PLEADLI_MODEL_URL").unwrap_or_else(|_| MODEL_URL.to_string());
    let models = dir.join("models");
    std::fs::create_dir_all(&models).map_err(|_| "The models folder could not be made.".to_string())?;
    let part = models.join("ggml-base.bin.part");
    let offline = "The model could not be downloaded. Check the computer is online, or ask whoever sets up the station for the file.".to_string();
    let client = reqwest::blocking::Client::builder().timeout(None).connect_timeout(std::time::Duration::from_secs(20)).build().map_err(|_| offline.clone())?;
    let mut response = client.get(&url).send().and_then(|r| r.error_for_status()).map_err(|_| offline.clone())?;
    let mut file = std::fs::File::create(&part).map_err(|_| "The model could not be saved.".to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = response.read(&mut buf).map_err(|_| offline.clone())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n]).map_err(|_| "The model could not be saved.".to_string())?;
        install_state().downloaded.fetch_add(n as u64, Ordering::Relaxed);
    }
    file.flush().ok();
    drop(file);
    let got: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if got != MODEL_SHA256 {
        let _ = std::fs::remove_file(&part);
        return Err("The downloaded file is not the expected speech model, so it was thrown away.".to_string());
    }
    std::fs::rename(&part, models.join("ggml-base.bin")).map_err(|_| "The model could not be put in place.".to_string())
}
