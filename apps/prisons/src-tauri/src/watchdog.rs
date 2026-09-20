//! A resource ceiling for the desktop app (Linux). A window whose web process
//! is stuck in a loop cannot answer any script, so the limit has to be enforced
//! from outside it: this thread samples the app and every process it started
//! and stops the whole app, with a native dialog saying why, before a runaway
//! can take the machine with it. Records are already on disk, so stopping is
//! safe. The limits are deliberately generous for normal work (a window is a few
//! hundred megabytes) and low enough to stop a leak long before the laptop
//! freezes.

use std::collections::HashMap;
use std::fs;
use std::thread;
use std::time::Duration;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const SAMPLE: Duration = Duration::from_secs(5);
/// One process (usually the web view) may hold this much memory.
const MAX_PROCESS_MB: u64 = 1536;
/// The app and everything it started, together.
const MAX_TOTAL_MB: u64 = 2560;
/// A process using almost a whole core for this many samples in a row (a
/// minute and a half) is treated as a loop.
const BUSY_SAMPLES: u32 = 18;
const BUSY_FRACTION: f64 = 0.9;
const PAGE_BYTES: u64 = 4096;
const TICKS_PER_SECOND: f64 = 100.0;

struct Sample {
    ppid: u32,
    ticks: u64,
    rss_mb: u64,
    name: String,
}

fn sample(pid: u32) -> Option<Sample> {
    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // The process name is in parentheses and may itself contain spaces or
    // brackets, so fields are counted from the last closing one.
    let open = stat.find('(')?;
    let close = stat.rfind(')')?;
    let name = stat[open + 1..close].to_string();
    let rest: Vec<&str> = stat[close + 1..].split_whitespace().collect();
    let ppid = rest.get(1)?.parse().ok()?;
    let utime: u64 = rest.get(11)?.parse().ok()?;
    let stime: u64 = rest.get(12)?.parse().ok()?;
    let statm = fs::read_to_string(format!("/proc/{pid}/statm")).ok()?;
    let pages: u64 = statm.split_whitespace().nth(1)?.parse().ok()?;
    Some(Sample { ppid, ticks: utime + stime, rss_mb: pages * PAGE_BYTES / 1_048_576, name })
}

/// The app itself and all of its descendants, as `pid -> sample`.
fn family(me: u32) -> HashMap<u32, Sample> {
    let mut all: HashMap<u32, Sample> = HashMap::new();
    if let Ok(dir) = fs::read_dir("/proc") {
        for entry in dir.flatten() {
            if let Some(pid) = entry.file_name().to_str().and_then(|n| n.parse::<u32>().ok()) {
                if let Some(s) = sample(pid) {
                    all.insert(pid, s);
                }
            }
        }
    }
    let mut keep = vec![me];
    let mut out = HashMap::new();
    while let Some(pid) = keep.pop() {
        if let Some(s) = all.remove(&pid) {
            let children: Vec<u32> = all.iter().filter(|(_, c)| c.ppid == pid).map(|(p, _)| *p).collect();
            keep.extend(children);
            out.insert(pid, s);
        }
    }
    out
}

fn stop(app: &AppHandle, reason: String) -> ! {
    log::error!("resource limit: {reason}");
    let handle = app.clone();
    let shown = thread::spawn(move || {
        handle
            .dialog()
            .message(format!("{reason}\n\nYour records are saved. Open the app again. If this keeps happening, send the log file from the app's data folder."))
            .title("Pleadli Prisons was stopped")
            .kind(MessageDialogKind::Error)
            .blocking_show()
    });
    let _ = shown.join();
    app.exit(1);
    thread::sleep(Duration::from_secs(3));
    std::process::exit(1);
}

pub fn start(app: AppHandle) {
    let me = std::process::id();
    thread::Builder::new()
        .name("resource-watchdog".into())
        .spawn(move || {
            let mut last: HashMap<u32, u64> = HashMap::new();
            let mut busy: HashMap<u32, u32> = HashMap::new();
            loop {
                thread::sleep(SAMPLE);
                let procs = family(me);
                let total: u64 = procs.values().map(|p| p.rss_mb).sum();
                if total > MAX_TOTAL_MB {
                    stop(&app, format!("The app and its window together used {total} MB of memory. The limit is {MAX_TOTAL_MB} MB."));
                }
                for (pid, p) in &procs {
                    if p.rss_mb > MAX_PROCESS_MB {
                        stop(&app, format!("{} used {} MB of memory. The limit for one process is {MAX_PROCESS_MB} MB.", p.name, p.rss_mb));
                    }
                    if let Some(before) = last.get(pid) {
                        let used = (p.ticks.saturating_sub(*before)) as f64 / TICKS_PER_SECOND / SAMPLE.as_secs_f64();
                        let count = busy.entry(*pid).or_insert(0);
                        *count = if used > BUSY_FRACTION { *count + 1 } else { 0 };
                        if *count >= BUSY_SAMPLES {
                            stop(&app, format!("{} kept a whole processor busy for a minute and a half, which means it is stuck in a loop.", p.name));
                        }
                    }
                    last.insert(*pid, p.ticks);
                }
                last.retain(|pid, _| procs.contains_key(pid));
                busy.retain(|pid, _| procs.contains_key(pid));
            }
        })
        .ok();
}
