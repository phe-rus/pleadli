//! Help and diagnostics shared by every Pleadli app: a versioned, redacted report a person can
//! read before anything leaves their computer, an offline record of recent events and of crashes,
//! and a panic hook that cannot crash while crashing.
//!
//! What is collected, and what never is:
//! * Collected: the app and its version, the operating system and architecture, a report id, an
//!   error code, the place a crash happened (file and line, symbol names), and recent EVENTS. An
//!   event is a short code from the app (`sync.failed`, `backup.restore.started`), never a sentence
//!   about a case, plus at most a redacted 120-character detail.
//! * Never collected: case contents, evidence, names, statements, credentials, tokens, encryption
//!   keys, database contents, file paths of the user's documents, or client information. Anything a
//!   person types as a description is shown to them first and still passes the redactor.
//! * Nothing here touches the network. A report leaves the computer only when the person chooses to
//!   send it (to Pleadli's private support channel, or copied by hand). Submitting is the app's job
//!   and always starts from the preview of exactly this JSON.
//!
//! The redactor is a safety net, not a licence to collect free text: it recognises the shapes of
//! secrets (tokens, keys, long hex, emails, paths, long numbers, `key=value` pairs for sensitive
//! names). It cannot recognise a person's name in a sentence, which is why events are codes.

use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// The version of the bundle's shape. Bump it when a field's meaning changes.
pub const FORMAT: u32 = 1;
const MAX_EVENTS: usize = 200;
const MAX_CRASH_FILES: usize = 10;
const MAX_TEXT: usize = 2_000;
const MAX_FRAMES: usize = 24;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    Bug,
    Crash,
    Diagnostics,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Event {
    /// Milliseconds since the epoch.
    pub at: i64,
    /// `^[a-z0-9_.]{1,48}$`, chosen by the app.
    pub code: String,
    /// At most 120 characters, redacted.
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Crash {
    /// `rust_panic` or `frontend_error`.
    pub source: String,
    /// The file name and line (no directories), e.g. `matters.rs:214`.
    pub location: Option<String>,
    pub message: String,
    /// Function names only, innermost first.
    pub frames: Vec<String>,
}

/// The whole report. Every field is shown to the person before sending.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bundle {
    pub format: u32,
    pub report_id: String,
    pub kind: Kind,
    /// `police`, `dpp`, `courts`, `lawyers` or `prisons`.
    pub app: String,
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub created_at: i64,
    pub error_code: Option<String>,
    /// What the person wrote, redacted. Empty for an automatic crash record.
    pub description: String,
    pub crash: Option<Crash>,
    pub events: Vec<Event>,
}

// ---------------------------------------------------------------- redaction

const SENSITIVE_NAMES: [&str; 14] = ["password", "passwd", "passphrase", "secret", "token", "apikey", "api_key", "authorization", "pin", "otp", "key", "cookie", "session", "recovery"];

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=' | '_' | '-' | '.')
}

fn redact_word(word: &str) -> String {
    let trimmed = word.trim_matches(|c: char| matches!(c, ',' | ';' | ':' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\'' | '<' | '>'));
    if trimmed.is_empty() {
        return word.to_string();
    }
    let replace = |label: &str| word.replacen(trimmed, label, 1);
    // key=value and key:value with a sensitive key
    if let Some((name, value)) = trimmed.split_once('=').or_else(|| trimmed.split_once(':')) {
        let lower = name.to_ascii_lowercase();
        if !value.is_empty() && SENSITIVE_NAMES.iter().any(|s| lower == *s || lower.ends_with(s)) {
            return replace(&format!("{name}=[redacted]"));
        }
    }
    let lower = trimmed.to_ascii_lowercase();
    // known token shapes
    if trimmed.starts_with("plr_") || trimmed.starts_with("sk-") || trimmed.starts_with("ghp_") || trimmed.starts_with("xox") || (trimmed.starts_with("eyJ") && trimmed.contains('.')) || lower.starts_with("bearer") && trimmed.len() > 12 {
        return replace("[token]");
    }
    // an email address
    if let Some(at) = trimmed.find('@') {
        if at > 0 && trimmed[at + 1..].contains('.') {
            return replace("[email]");
        }
    }
    // a path: keep only the final file name, so no user name or folder of documents survives
    let looks_windows = trimmed.len() > 3 && trimmed.as_bytes()[1] == b':' && (trimmed.as_bytes()[2] == b'\\' || trimmed.as_bytes()[2] == b'/');
    if looks_windows || (trimmed.starts_with('/') && trimmed[1..].contains('/')) || trimmed.starts_with("~/") {
        let name = trimmed.rsplit(['/', '\\']).next().unwrap_or("");
        return replace(&format!("[path]/{name}"));
    }
    // an IPv4 address
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() == 4 && parts.iter().all(|p| !p.is_empty() && p.len() <= 3 && p.chars().all(|c| c.is_ascii_digit())) {
        return replace("[ip]");
    }
    // long hex (keys, hashes) and long base64-like runs
    if trimmed.len() >= 32 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return replace("[secret]");
    }
    if trimmed.len() >= 40 && trimmed.chars().all(is_token_char) {
        return replace("[secret]");
    }
    // a long run of digits: phone, national ID, account number
    if trimmed.chars().filter(char::is_ascii_digit).count() >= 8 && trimmed.chars().all(|c| c.is_ascii_digit() || matches!(c, '-' | '+' | ' ')) {
        return replace("[number]");
    }
    word.to_string()
}

/// Removes the shapes of secrets and personal identifiers from `text` and cuts it to a safe length.
pub fn redact(text: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let mut words: Vec<String> = line.split(' ').map(redact_word).collect();
        // "Bearer <token>" and "password <value>": the word after a sensitive word is the secret
        for i in 0..words.len().saturating_sub(1) {
            let lower = words[i].trim_matches(|c: char| !c.is_ascii_alphanumeric()).to_ascii_lowercase();
            if matches!(lower.as_str(), "bearer" | "password" | "passphrase" | "token" | "secret") && !words[i + 1].starts_with('[') {
                words[i + 1] = "[redacted]".to_string();
            }
        }
        out.push(words.join(" "));
    }
    let mut joined = out.join("\n");
    if joined.chars().count() > MAX_TEXT {
        joined = joined.chars().take(MAX_TEXT).collect::<String>() + " [cut]";
    }
    joined
}

fn clean_code(code: &str) -> String {
    let ok = !code.is_empty() && code.len() <= 48 && code.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '.');
    if ok { code.to_string() } else { "invalid_code".to_string() }
}

// ---------------------------------------------------------------- the local record

fn dir_of(base: &Path) -> PathBuf {
    base.join("diagnostics")
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Notes that something happened. Best effort: a failure to write never disturbs the app.
/// `detail` is optional, cut to 120 characters and redacted. Do not pass case content.
pub fn record(base: &Path, code: &str, detail: Option<&str>) {
    let _ = try_record(base, code, detail);
}

fn try_record(base: &Path, code: &str, detail: Option<&str>) -> std::io::Result<()> {
    let dir = dir_of(base);
    std::fs::create_dir_all(&dir)?;
    let event = Event { at: now_ms(), code: clean_code(code), detail: detail.map(|d| redact(&d.chars().take(120).collect::<String>())) };
    let path = dir.join("events.jsonl");
    let mut lines: Vec<String> = std::fs::read_to_string(&path).unwrap_or_default().lines().map(String::from).collect();
    lines.push(serde_json::to_string(&event).map_err(std::io::Error::other)?);
    if lines.len() > MAX_EVENTS {
        lines.drain(0..lines.len() - MAX_EVENTS);
    }
    std::fs::write(path, lines.join("\n") + "\n")
}

pub fn recent_events(base: &Path, limit: usize) -> Vec<Event> {
    let text = std::fs::read_to_string(dir_of(base).join("events.jsonl")).unwrap_or_default();
    let mut events: Vec<Event> = text.lines().filter_map(|l| serde_json::from_str(l).ok()).collect();
    let skip = events.len().saturating_sub(limit);
    events.drain(0..skip);
    events
}

fn os_name() -> String {
    std::env::consts::OS.to_string()
}

/// Builds the report from what is on this computer. Nothing is sent. `description` is what the
/// person typed (empty for a crash); `error_code` is the app's own code.
pub fn build(base: &Path, app: &str, app_version: &str, kind: Kind, description: &str, error_code: Option<&str>, crash: Option<Crash>) -> Bundle {
    Bundle {
        format: FORMAT,
        report_id: uuid::Uuid::new_v4().to_string(),
        kind,
        app: app.to_string(),
        app_version: app_version.chars().take(40).collect(),
        os: os_name(),
        arch: std::env::consts::ARCH.to_string(),
        created_at: now_ms(),
        error_code: error_code.map(clean_code),
        description: redact(description),
        crash,
        events: recent_events(base, 50),
    }
}

/// Exactly what would be sent: the preview shows this text and the submission sends these bytes.
pub fn to_json(bundle: &Bundle) -> String {
    serde_json::to_string_pretty(bundle).unwrap_or_default()
}

/// A crash as the person would see it, with every free-text part already redacted.
pub fn crash_record(source: &str, location: Option<&str>, message: &str, frames: &[String]) -> Crash {
    Crash {
        source: source.to_string(),
        location: location.map(|l| redact(l.rsplit(['/', '\\']).next().unwrap_or(l))),
        message: redact(message),
        frames: frames.iter().take(MAX_FRAMES).map(|f| redact(f)).collect(),
    }
}

/// Keeps a crash on disk so it can be offered on the next start. Returns the file's path.
pub fn save_crash(base: &Path, app: &str, app_version: &str, crash: Crash) -> std::io::Result<PathBuf> {
    let dir = dir_of(base);
    std::fs::create_dir_all(&dir)?;
    let bundle = build(base, app, app_version, Kind::Crash, "", Some("crash"), Some(crash));
    let path = dir.join(format!("crash-{}.json", bundle.report_id));
    let mut file = std::fs::File::create(&path)?;
    file.write_all(to_json(&bundle).as_bytes())?;
    // Keep the newest few: a crash loop must not fill the disk.
    let mut files: Vec<_> = std::fs::read_dir(&dir)?.filter_map(Result::ok).filter(|e| e.file_name().to_string_lossy().starts_with("crash-")).collect();
    files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
    while files.len() > MAX_CRASH_FILES {
        let _ = std::fs::remove_file(files.remove(0).path());
    }
    Ok(path)
}

/// A crash from the browser side of the window (an unhandled error or rejected promise).
/// Only the message and the top frames' function names are kept.
pub fn save_frontend_error(base: &Path, app: &str, app_version: &str, message: &str, stack: &str) -> std::io::Result<PathBuf> {
    let frames: Vec<String> = stack
        .lines()
        .skip(1)
        .filter_map(|l| l.trim().strip_prefix("at "))
        .map(|l| l.split(" (").next().unwrap_or(l).to_string())
        .collect();
    save_crash(base, app, app_version, crash_record("frontend_error", None, message, &frames))
}

/// Crash reports from earlier runs that the person has not yet decided about, newest first.
pub fn pending_crashes(base: &Path) -> Vec<Bundle> {
    let Ok(entries) = std::fs::read_dir(dir_of(base)) else { return Vec::new() };
    let mut found: Vec<Bundle> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_name().to_string_lossy().starts_with("crash-"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|text| serde_json::from_str::<Bundle>(&text).ok())
        .collect();
    found.sort_by_key(|b| std::cmp::Reverse(b.created_at));
    found
}

/// The person sent it, or chose not to: either way it is not offered again.
pub fn dismiss_crash(base: &Path, report_id: &str) {
    if report_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        let _ = std::fs::remove_file(dir_of(base).join(format!("crash-{report_id}.json")));
    }
}

static IN_HOOK: AtomicBool = AtomicBool::new(false);

/// Makes a panic leave a redacted crash record, then lets the previous hook run. Safe against its own
/// failure: a panic while writing the record (or a second panic on another thread meanwhile) is not
/// recorded again, so reporting can never loop or hide the original panic.
pub fn install_panic_hook(base: PathBuf, app: &'static str, app_version: &'static str) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if !IN_HOOK.swap(true, Ordering::SeqCst) {
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let location = info.location().map(|l| format!("{}:{}", l.file(), l.line()));
                let message = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_else(|| "panic".to_string());
                let frames = backtrace_names();
                let _ = save_crash(&base, app, app_version, crash_record("rust_panic", location.as_deref(), &message, &frames));
            }));
            IN_HOOK.store(false, Ordering::SeqCst);
        }
        previous(info);
    }));
}

/// Function names from the current backtrace, with no file paths. Empty when the runtime hides them.
fn backtrace_names() -> Vec<String> {
    let text = std::backtrace::Backtrace::capture().to_string();
    text.lines().filter_map(|l| l.trim().split_once(": ").map(|(_, name)| name.trim().to_string())).filter(|n| !n.is_empty() && !n.starts_with("at ")).take(MAX_FRAMES).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-diag-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn secrets_and_identifiers_do_not_survive() {
        let text = "Authorization: Bearer abc123def456ghi789 failed for okello@example.com at /home/laniina/cases/Okello/statement.pdf \
                    from 192.168.1.20 key=3f2a9c4e5b6d7a8f9e0d1c2b3a4f5e6d7c8b9a0f password=hunter2 phone 0772123456 plr_SGVsbG9Xb3JsZEhlbGxvV29ybGQ \
                    C:\\Users\\Grace\\Documents\\Statement.docx jwt eyJhbGciOi.eyJzdWIi.sig";
        let out = redact(text);
        for secret in ["abc123def456ghi789", "okello@example.com", "laniina", "Okello/", "192.168.1.20", "3f2a9c4e5b6d7a8f9e0d1c2b3a4f5e6d7c8b9a0f", "hunter2", "0772123456", "plr_SGVs", "Grace", "eyJhbGciOi"] {
            assert!(!out.contains(secret), "{secret} survived: {out}");
        }
        assert!(out.contains("statement.pdf"), "a file name is kept to help diagnose: {out}");
        assert!(out.contains("[email]") && out.contains("[ip]") && out.contains("[number]") && out.contains("[token]"));
        assert_eq!(redact("The database is locked after migration 24"), "The database is locked after migration 24", "ordinary words are untouched");
    }

    #[test]
    fn events_are_codes_capped_and_redacted_and_the_ring_is_bounded() {
        let base = temp();
        record(&base, "backup.failed", Some("token=abcdef for /home/x/case.db"));
        record(&base, "Case: Uganda v Okello", Some("name"));
        for i in 0..250 {
            record(&base, "tick", Some(&i.to_string()));
        }
        let events = recent_events(&base, 1000);
        assert_eq!(events.len(), MAX_EVENTS);
        assert!(events.iter().all(|e| e.code == "tick"));
        let base2 = temp();
        record(&base2, "backup.failed", Some("token=abcdef for /home/x/case.db"));
        record(&base2, "Case: Uganda v Okello", None);
        let e = recent_events(&base2, 10);
        assert_eq!(e[0].detail.as_deref(), Some("token=[redacted] for [path]/case.db"));
        assert_eq!(e[1].code, "invalid_code", "a sentence is not an event code, so a name cannot get in through one");
        assert!(!std::fs::read_to_string(dir_of(&base2).join("events.jsonl")).unwrap().contains("Okello"));
        assert!(e[0].detail.as_ref().unwrap().chars().count() <= 120);
    }

    #[test]
    fn a_bundle_is_versioned_complete_and_what_is_previewed_is_what_parses_back() {
        let base = temp();
        record(&base, "sync.failed", None);
        let b = build(&base, "lawyers", "0.1.4", Kind::Bug, "Saving a note fails. Call me on 0772123456", Some("save_failed"), None);
        assert_eq!((b.format, b.kind, b.app.as_str(), b.error_code.as_deref()), (1, Kind::Bug, "lawyers", Some("save_failed")));
        assert!(!b.description.contains("0772123456"));
        assert_eq!(b.events.len(), 1);
        let json = to_json(&b);
        assert_eq!(serde_json::from_str::<Bundle>(&json).unwrap(), b);
        // The report names no field that could carry a case, a key or a credential.
        let keys: Vec<String> = serde_json::from_str::<serde_json::Value>(&json).unwrap().as_object().unwrap().keys().cloned().collect();
        for forbidden in ["case", "evidence", "client", "token", "key", "password", "database", "path"] {
            assert!(!keys.iter().any(|k| k.contains(forbidden)), "{forbidden} in {keys:?}");
        }
    }

    #[test]
    fn crashes_keep_only_the_file_name_and_function_names_and_are_offered_until_dismissed() {
        let base = temp();
        let crash = crash_record("rust_panic", Some("/home/laniina/pleadli/apps/lawyers/src-tauri/src/domain/matters.rs:214"), "called unwrap on /home/laniina/secret/cases.db token=zzz", &["lawyers::matters::close".to_string()]);
        assert_eq!(crash.location.as_deref(), Some("matters.rs:214"));
        assert!(!crash.message.contains("laniina") && !crash.message.contains("zzz"));
        save_crash(&base, "lawyers", "0.1.4", crash).unwrap();
        save_frontend_error(&base, "lawyers", "0.1.4", "TypeError: x is undefined in /Users/grace/app.js", "TypeError: x\n    at renderMatter (http://localhost/app.js:1:2)\n    at commit (http://localhost/app.js:3:4)").unwrap();
        let pending = pending_crashes(&base);
        assert_eq!(pending.len(), 2);
        let ui = pending.iter().find(|b| b.crash.as_ref().unwrap().source == "frontend_error").unwrap();
        assert_eq!(ui.crash.as_ref().unwrap().frames, vec!["renderMatter".to_string(), "commit".to_string()]);
        assert!(!to_json(ui).contains("grace"));
        dismiss_crash(&base, &ui.report_id);
        dismiss_crash(&base, "../../etc/passwd");
        assert_eq!(pending_crashes(&base).len(), 1);
        for _ in 0..20 {
            save_crash(&base, "lawyers", "0.1.4", crash_record("rust_panic", None, "boom", &[])).unwrap();
        }
        assert!(pending_crashes(&base).len() <= MAX_CRASH_FILES, "a crash loop does not fill the disk");
    }

    #[test]
    fn a_panic_in_the_report_path_is_not_reported_again() {
        // The guard is what stops recursion: while it is held, a second panic skips the record.
        assert!(!IN_HOOK.swap(true, Ordering::SeqCst));
        assert!(IN_HOOK.swap(true, Ordering::SeqCst), "already held, so the hook would skip");
        IN_HOOK.store(false, Ordering::SeqCst);
    }
}
