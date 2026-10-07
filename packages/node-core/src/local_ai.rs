//! Assist on this computer: an open model (Gemma) run by Ollama, so a
//! matter's papers never leave the machine. Pleadli does not ship a model; it
//! finds Ollama or fetches its official installer, downloads the model size
//! the computer can carry, starts it, and then talks to it like any other
//! provider through Ollama's OpenAI-compatible `/v1`.
//!
//! One job runs at a time (an install or a model download); its progress is
//! kept here and read by polling `status()`.

use crate::ai::AiError;
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

/// Where Ollama listens on every platform.
pub const OLLAMA: &str = "http://127.0.0.1:11434";

/// The address Assist's `openai_compatible` provider uses for it.
pub fn base_url() -> String {
    format!("{OLLAMA}/v1")
}

/// A model the app offers, smallest first. Sizes are the download, from
/// ollama.com/library/gemma4 (October 2026); the real size comes from Ollama
/// once the download starts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub tag: &'static str,
    pub label: &'static str,
    pub download_gb: f64,
    /// Below this much memory the computer would struggle to run it.
    pub min_memory_gb: f64,
}

pub const CHOICES: &[Choice] = &[
    Choice { tag: "gemma4:e2b", label: "Gemma 4 E2B", download_gb: 4.6, min_memory_gb: 8.0 },
    Choice { tag: "gemma4:e4b", label: "Gemma 4 E4B", download_gb: 6.6, min_memory_gb: 16.0 },
    Choice { tag: "gemma4:12b", label: "Gemma 4 12B", download_gb: 7.7, min_memory_gb: 32.0 },
];

/// The largest offered model this much memory carries comfortably; the
/// smallest when the memory is unknown or below every line.
pub fn recommended(memory_gb: f64) -> &'static Choice {
    CHOICES.iter().rev().find(|c| memory_gb >= c.min_memory_gb).unwrap_or(&CHOICES[0])
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    /// "install" or "pull".
    pub kind: &'static str,
    /// The model being downloaded, for a pull.
    pub model: Option<String>,
    pub completed: u64,
    pub total: u64,
    /// "downloading", "opening", "verifying", "done", "failed".
    pub state: &'static str,
    pub error: Option<String>,
}

static JOB: Mutex<Option<Job>> = Mutex::new(None);

fn set_job(job: Option<Job>) {
    *JOB.lock().unwrap_or_else(|e| e.into_inner()) = job;
}
fn update(f: impl FnOnce(&mut Job)) {
    if let Some(job) = JOB.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        f(job)
    }
}
fn job() -> Option<Job> {
    JOB.lock().unwrap_or_else(|e| e.into_inner()).clone()
}
fn busy() -> bool {
    job().is_some_and(|j| !matches!(j.state, "done" | "failed"))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalStatus {
    /// "windows", "macos" or "linux".
    pub platform: &'static str,
    pub installed: bool,
    pub running: bool,
    pub version: Option<String>,
    pub models: Vec<LocalModel>,
    /// This computer's memory, 0 when it could not be read.
    pub memory_gb: f64,
    pub choices: Vec<Choice>,
    pub recommended: &'static str,
    /// Linux has no installer to open: the person runs this in a terminal.
    pub install_command: Option<&'static str>,
    pub job: Option<Job>,
}

const PLATFORM: &str = if cfg!(target_os = "windows") {
    "windows"
} else if cfg!(target_os = "macos") {
    "macos"
} else {
    "linux"
};

fn client(timeout: Duration) -> Result<reqwest::Client, AiError> {
    reqwest::Client::builder().timeout(timeout).build().map_err(|e| AiError(e.to_string()))
}

/// Whether Ollama is installed, running, and which models it holds.
pub async fn status() -> LocalStatus {
    let memory_gb = memory_gb();
    let (running, version) = match client(Duration::from_secs(2)) {
        Ok(c) => match c.get(format!("{OLLAMA}/api/version")).send().await {
            Ok(r) if r.status().is_success() => (true, r.json::<Value>().await.ok().and_then(|v| v["version"].as_str().map(str::to_string))),
            _ => (false, None),
        },
        Err(_) => (false, None),
    };
    let models = if running { tags().await.unwrap_or_default() } else { vec![] };
    LocalStatus {
        platform: PLATFORM,
        installed: running || binary().is_some(),
        running,
        version,
        models,
        memory_gb,
        choices: CHOICES.to_vec(),
        recommended: recommended(memory_gb).tag,
        install_command: (PLATFORM == "linux").then_some("curl -fsSL https://ollama.com/install.sh | sh"),
        job: job(),
    }
}

async fn tags() -> Result<Vec<LocalModel>, AiError> {
    let v: Value = client(Duration::from_secs(5))?.get(format!("{OLLAMA}/api/tags")).send().await.map_err(|e| AiError(e.to_string()))?.json().await.map_err(|e| AiError(e.to_string()))?;
    Ok(v["models"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|m| LocalModel { name: m["name"].as_str().unwrap_or("").to_string(), size: m["size"].as_u64().unwrap_or(0) })
        .filter(|m| !m.name.is_empty())
        .collect())
}

/// Ollama's program, where its installers put it.
fn binary() -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "windows") {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            candidates.push(PathBuf::from(local).join("Programs").join("Ollama").join("ollama.exe"));
        }
    } else if cfg!(target_os = "macos") {
        candidates.push("/Applications/Ollama.app/Contents/Resources/ollama".into());
        candidates.push("/usr/local/bin/ollama".into());
        candidates.push("/opt/homebrew/bin/ollama".into());
    } else {
        candidates.push("/usr/local/bin/ollama".into());
        candidates.push("/usr/bin/ollama".into());
    }
    if let Some(path) = std::env::var_os("PATH") {
        let name = if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" };
        candidates.extend(std::env::split_paths(&path).map(|d| d.join(name)));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Starts Ollama when it is installed and not running, and waits for it.
pub async fn start() -> Result<(), AiError> {
    if status().await.running {
        return Ok(());
    }
    if cfg!(target_os = "macos") && std::path::Path::new("/Applications/Ollama.app").exists() {
        std::process::Command::new("open").args(["-a", "Ollama"]).spawn().map_err(|e| AiError(e.to_string()))?;
    } else {
        let bin = binary().ok_or_else(|| AiError("Ollama is not installed on this computer.".into()))?;
        let mut cmd = std::process::Command::new(bin);
        cmd.arg("serve").stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            // No console window behind the app.
            cmd.creation_flags(0x0800_0000);
        }
        cmd.spawn().map_err(|e| AiError(format!("Could not start Ollama: {e}")))?;
    }
    for _ in 0..30 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if status().await.running {
            return Ok(());
        }
    }
    Err(AiError("Ollama did not start. Open it once from the Start menu or Applications, then try again.".into()))
}

/// Downloads Ollama's official installer and opens it; the person clicks
/// through it as with any program. Runs in the background; poll `status()`.
pub fn install() -> Result<(), AiError> {
    if busy() {
        return Err(AiError("Something is already downloading.".into()));
    }
    let url = match PLATFORM {
        "windows" => "https://ollama.com/download/OllamaSetup.exe",
        "macos" => "https://ollama.com/download/Ollama.dmg",
        _ => return Err(AiError("On Linux, run the command shown in a terminal.".into())),
    };
    set_job(Some(Job { kind: "install", model: None, completed: 0, total: 0, state: "downloading", error: None }));
    tokio::spawn(async move {
        let result: Result<(), AiError> = async {
            let file = std::env::temp_dir().join(url.rsplit('/').next().unwrap_or("ollama-installer"));
            download(url, &file).await?;
            update(|j| j.state = "opening");
            if PLATFORM == "windows" {
                std::process::Command::new(&file).spawn().map_err(|e| AiError(format!("Could not open the installer: {e}")))?;
            } else {
                std::process::Command::new("open").arg(&file).spawn().map_err(|e| AiError(format!("Could not open the installer: {e}")))?;
            }
            Ok(())
        }
        .await;
        match result {
            Ok(()) => update(|j| j.state = "done"),
            Err(e) => update(|j| {
                j.state = "failed";
                j.error = Some(e.0);
            }),
        }
    });
    Ok(())
}

async fn download(url: &str, to: &std::path::Path) -> Result<(), AiError> {
    use std::io::Write;
    let mut res = client(Duration::from_secs(60 * 60))?.get(url).send().await.map_err(|e| AiError(format!("Could not reach ollama.com: {e}")))?;
    if !res.status().is_success() {
        return Err(AiError(format!("ollama.com answered {}", res.status())));
    }
    update(|j| j.total = res.content_length().unwrap_or(0));
    let mut out = std::fs::File::create(to).map_err(|e| AiError(e.to_string()))?;
    while let Some(chunk) = res.chunk().await.map_err(|e| AiError(format!("The download stopped: {e}")))? {
        out.write_all(&chunk).map_err(|e| AiError(e.to_string()))?;
        let n = chunk.len() as u64;
        update(|j| j.completed += n);
    }
    Ok(())
}

/// Downloads a model into Ollama, starting Ollama first if needed. Runs in
/// the background; poll `status()` for the bytes done.
pub fn pull(model: &str) -> Result<(), AiError> {
    if busy() {
        return Err(AiError("Something is already downloading.".into()));
    }
    if !CHOICES.iter().any(|c| c.tag == model) {
        return Err(AiError("Choose one of the offered models.".into()));
    }
    let model = model.to_string();
    set_job(Some(Job { kind: "pull", model: Some(model.clone()), completed: 0, total: 0, state: "downloading", error: None }));
    tokio::spawn(async move {
        let result: Result<(), AiError> = async {
            start().await?;
            let mut res = client(Duration::from_secs(6 * 60 * 60))?
                .post(format!("{OLLAMA}/api/pull"))
                .json(&serde_json::json!({ "model": model, "stream": true }))
                .send()
                .await
                .map_err(|e| AiError(e.to_string()))?;
            // Ollama streams one JSON object per line: status, and total/completed per layer.
            let mut pending = Vec::new();
            while let Some(chunk) = res.chunk().await.map_err(|e| AiError(format!("The download stopped: {e}")))? {
                pending.extend_from_slice(&chunk);
                while let Some(end) = pending.iter().position(|b| *b == b'\n') {
                    let line: Vec<u8> = pending.drain(..=end).collect();
                    let Ok(v) = serde_json::from_slice::<Value>(&line) else { continue };
                    if let Some(err) = v["error"].as_str() {
                        return Err(AiError(err.to_string()));
                    }
                    let status = v["status"].as_str().unwrap_or("");
                    update(|j| {
                        if let (Some(total), Some(done)) = (v["total"].as_u64(), v["completed"].as_u64()) {
                            // The big layer is the model; small ones would make the bar jump back.
                            if total >= j.total {
                                j.total = total;
                                j.completed = done;
                            }
                        }
                        if status.starts_with("verifying") || status.starts_with("writing") {
                            j.state = "verifying";
                        }
                    });
                    if status == "success" {
                        return Ok(());
                    }
                }
            }
            Ok(())
        }
        .await;
        match result {
            Ok(()) => update(|j| {
                j.state = "done";
                j.completed = j.total;
            }),
            Err(e) => update(|j| {
                j.state = "failed";
                j.error = Some(e.0);
            }),
        }
    });
    Ok(())
}

/// This computer's memory in GB, or 0 when it cannot be read.
pub fn memory_gb() -> f64 {
    let bytes: Option<u64> = if cfg!(target_os = "linux") {
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|s| s.lines().find(|l| l.starts_with("MemTotal:")).and_then(|l| l.split_whitespace().nth(1)).and_then(|kb| kb.parse::<u64>().ok()))
            .map(|kb| kb * 1024)
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("sysctl").args(["-n", "hw.memsize"]).output().ok().and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
    } else {
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000);
        }
        cmd.output().ok().and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
    };
    bytes.map(|b| (b as f64 / 1_073_741_824.0 * 10.0).round() / 10.0).unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recommends_by_memory() {
        assert_eq!(recommended(0.0).tag, "gemma4:e2b");
        assert_eq!(recommended(8.0).tag, "gemma4:e2b");
        assert_eq!(recommended(14.1).tag, "gemma4:e2b");
        assert_eq!(recommended(16.0).tag, "gemma4:e4b");
        assert_eq!(recommended(32.0).tag, "gemma4:12b");
    }
}
