//! Pleadli Extensions: installable `.pleadli` packages (docs/platform/EXTENSIONS.md).
//!
//! What this module is: the part that decides whether a package may be installed, what it may do once
//! installed, and what happens when it misbehaves. It is deliberately small and strict.
//!
//! * **Package format.** A single file: magic, the manifest's length, the manifest (JSON), then the files in
//!   the order the manifest lists them. There is no archive format with paths inside it, so there is no
//!   "zip slip". Every file is named in the manifest with its SHA-256 and size; a package whose bytes do not
//!   match its manifest is refused whole.
//! * **Trust.** A manifest may carry an Ed25519 signature. One that verifies against a key the app trusts is
//!   `Verified`; no signature, or a signer the app does not trust, is `Developer` and installs only when the
//!   person explicitly accepts a developer extension. A signature that is present but does not verify is
//!   refused: it is never silently downgraded.
//! * **Capabilities.** An extension can do only what its manifest declares AND the person granted. The list is
//!   closed (`CAPABILITIES`, plus `network:<host>` for one named host). A capability is a permission to ask the
//!   host, never a way around it: the host still applies the app's authorisation, the sealed database, evidence
//!   integrity and the audit rules. An update that asks for more is installed disabled until the person agrees.
//! * **Isolation.** Each extension has its own folder and its own capped storage. A call into an extension
//!   runs behind `Host::call`, which checks it is enabled and granted, audits the call or its refusal, catches
//!   a panic so one extension cannot take the app down, and disables an extension that keeps failing.
//! * **Not here (yet).** Running executable extension logic. The design is a restricted WebAssembly runtime
//!   with no ambient authority; it is not built, and `entry` is parsed but never run. Declarative extensions
//!   (templates, forms, reference sources) work today through `Host::call` and `read_asset`.
//!
//! Nothing here uses the network or loads native code.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

pub const MAGIC: &[u8] = b"PLEADLI-EXT\x01";
pub const SCHEMA: u32 = 1;
pub const MAX_PACKAGE: usize = 8 * 1024 * 1024;
pub const MAX_FILES: usize = 64;
pub const MAX_FILE: usize = 2 * 1024 * 1024;
pub const STORAGE_QUOTA: usize = 1024 * 1024;
/// Failures in a row after which an extension is switched off.
pub const MAX_FAILURES: u32 = 3;
pub const APPS: [&str; 5] = ["police", "dpp", "courts", "lawyers", "prisons"];

/// What an extension may ask for. `sensitive` ones reach case material through the host and are called out to the person.
pub const CAPABILITIES: [(&str, bool); 10] = [
    ("storage", false),
    ("templates.documents", false),
    ("templates.forms", false),
    ("ui.menu", false),
    ("ui.panel", false),
    ("reports.read", true),
    ("documents.read", true),
    ("records.lookup", true),
    ("export.write", true),
    ("import.read", true),
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExtError {
    Malformed(String),
    TooLarge,
    Integrity(String),
    BadSignature,
    NotCompatible(String),
    UnknownCapability(String),
    DeveloperNotAccepted,
    NotInstalled,
    NotOlder,
    Disabled,
    Denied(String),
    /// The host said no to a request that was well formed but not allowed (a missing file, a full storage). Not a fault.
    Refused(String),
    /// The extension itself broke.
    Failed(String),
    Io(String),
}

impl std::fmt::Display for ExtError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl From<std::io::Error> for ExtError {
    fn from(e: std::io::Error) -> Self {
        ExtError::Io(e.to_string())
    }
}

/// What a call can come back with. A `Refused` is the host declining an ordinary request and is never held against the
/// extension; only `Broke` (an error it raised, or a panic) counts toward switching it off.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Fault {
    Refused(String),
    Broke(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Capability {
    pub name: String,
    /// Why the extension needs it, in words the person will read before granting.
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FileEntry {
    pub path: String,
    pub sha256: String,
    pub size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Signed {
    /// The signer's public key, hex.
    pub key: String,
    /// The signature over the manifest without this field, hex.
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Manifest {
    pub schema: u32,
    /// Reverse-domain style, `^[a-z0-9]+(\.[a-z0-9-]+)+$`.
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub publisher: String,
    /// Which apps it is for, from `APPS`.
    pub targets: Vec<String>,
    /// The oldest app version it works with.
    pub min_app_version: Option<String>,
    pub capabilities: Vec<Capability>,
    /// A WebAssembly module in `files`. Parsed, validated as a path, never run in this build.
    pub entry: Option<String>,
    pub files: Vec<FileEntry>,
    pub signature: Option<Signed>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Trust {
    Verified,
    Developer,
}

/// A package that passed every check, not yet installed. What the person is shown before they agree.
#[derive(Debug, Clone)]
pub struct Inspection {
    pub manifest: Manifest,
    pub trust: Trust,
    pub files: Vec<(String, Vec<u8>)>,
    /// The capabilities that reach case material, for the consent screen.
    pub sensitive: Vec<String>,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn unhex(text: &str) -> Option<Vec<u8>> {
    if text.len() % 2 != 0 || !text.is_ascii() {
        return None;
    }
    (0..text.len()).step_by(2).map(|i| u8::from_str_radix(&text[i..i + 2], 16).ok()).collect()
}
fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn valid_id(id: &str) -> bool {
    let parts: Vec<&str> = id.split('.').collect();
    id.len() <= 80 && parts.len() >= 2 && parts.iter().all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'))
}

fn valid_path(path: &str) -> bool {
    !path.is_empty() && path.len() <= 120 && !path.starts_with('/') && !path.ends_with('/') && path.split('/').all(|s| !s.is_empty() && !s.starts_with('.') && s.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.')))
}

pub fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let mut it = v.split('.').map(|p| p.parse::<u64>().ok());
    let r = (it.next()??, it.next()??, it.next()??);
    if it.next().is_some() { None } else { Some(r) }
}

fn valid_host(host: &str) -> bool {
    host.len() <= 253 && host.contains('.') && !host.starts_with('.') && !host.ends_with('.') && host.split('.').all(|l| !l.is_empty() && l.len() <= 63 && l.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')) && !host.chars().all(|c| c.is_ascii_digit() || c == '.')
}

/// Whether this capability string is one the host knows. `network:<host>` names exactly one host: no wildcard, no address.
pub fn known_capability(name: &str) -> bool {
    match name.strip_prefix("network:") {
        Some(host) => valid_host(host),
        None => CAPABILITIES.iter().any(|(c, _)| *c == name),
    }
}

fn is_sensitive(name: &str) -> bool {
    name.starts_with("network:") || CAPABILITIES.iter().any(|(c, s)| *c == name && *s)
}

fn signing_bytes(manifest: &Manifest) -> Vec<u8> {
    let mut unsigned = manifest.clone();
    unsigned.signature = None;
    serde_json::to_vec(&unsigned).unwrap_or_default()
}

/// Builds a package. Used by the developer tool and by tests; `signer` makes it a Verified candidate.
pub fn pack(mut manifest: Manifest, files: &[(&str, &[u8])], signer: Option<&SigningKey>) -> Vec<u8> {
    manifest.schema = SCHEMA;
    manifest.files = files.iter().map(|(p, b)| FileEntry { path: p.to_string(), sha256: sha(b), size: b.len() }).collect();
    manifest.signature = None;
    if let Some(key) = signer {
        let signature = key.sign(&signing_bytes(&manifest));
        manifest.signature = Some(Signed { key: hex(key.verifying_key().as_bytes()), signature: hex(&signature.to_bytes()) });
    }
    let json = serde_json::to_vec(&manifest).unwrap_or_default();
    let mut out = MAGIC.to_vec();
    out.extend((json.len() as u32).to_le_bytes());
    out.extend(json);
    for (_, bytes) in files {
        out.extend(*bytes);
    }
    out
}

/// Checks a package completely and changes nothing. `trusted` are the public keys the app accepts as Pleadli's or an
/// institution's; `app` and `app_version` are this application.
pub fn inspect(bytes: &[u8], trusted: &[[u8; 32]], app: &str, app_version: &str) -> Result<Inspection, ExtError> {
    if bytes.len() > MAX_PACKAGE {
        return Err(ExtError::TooLarge);
    }
    let rest = bytes.strip_prefix(MAGIC).ok_or_else(|| ExtError::Malformed("not a .pleadli package".into()))?;
    if rest.len() < 4 {
        return Err(ExtError::Malformed("truncated".into()));
    }
    let len = u32::from_le_bytes([rest[0], rest[1], rest[2], rest[3]]) as usize;
    if len == 0 || len > 256 * 1024 || rest.len() < 4 + len {
        return Err(ExtError::Malformed("manifest length".into()));
    }
    let manifest: Manifest = serde_json::from_slice(&rest[4..4 + len]).map_err(|e| ExtError::Malformed(format!("manifest: {e}")))?;
    if manifest.schema != SCHEMA {
        return Err(ExtError::NotCompatible(format!("package format {} is not understood", manifest.schema)));
    }
    if !valid_id(&manifest.id) || parse_version(&manifest.version).is_none() || manifest.name.trim().is_empty() || manifest.name.len() > 80 || manifest.description.len() > 500 || manifest.publisher.trim().is_empty() || manifest.publisher.len() > 80 {
        return Err(ExtError::Malformed("id, version, name or publisher is not valid".into()));
    }
    if manifest.targets.is_empty() || manifest.targets.iter().any(|t| !APPS.contains(&t.as_str())) {
        return Err(ExtError::Malformed("targets must name Pleadli applications".into()));
    }
    if !manifest.targets.iter().any(|t| t == app) {
        return Err(ExtError::NotCompatible(format!("this extension is not for {app}")));
    }
    if let Some(min) = &manifest.min_app_version {
        let need = parse_version(min).ok_or_else(|| ExtError::Malformed("min_app_version".into()))?;
        let have = parse_version(app_version).ok_or_else(|| ExtError::Malformed("this app's version".into()))?;
        if have < need {
            return Err(ExtError::NotCompatible(format!("needs {app} {min} or newer")));
        }
    }
    for c in &manifest.capabilities {
        if !known_capability(&c.name) {
            return Err(ExtError::UnknownCapability(c.name.clone()));
        }
        if c.reason.trim().is_empty() || c.reason.len() > 300 {
            return Err(ExtError::Malformed(format!("{} needs a reason the person can read", c.name)));
        }
    }
    let mut names: Vec<&str> = manifest.capabilities.iter().map(|c| c.name.as_str()).collect();
    names.sort();
    names.dedup();
    if names.len() != manifest.capabilities.len() {
        return Err(ExtError::Malformed("a capability is listed twice".into()));
    }
    if manifest.files.len() > MAX_FILES {
        return Err(ExtError::TooLarge);
    }
    let mut seen = std::collections::HashSet::new();
    let mut offset = 4 + len;
    let mut files = Vec::new();
    for entry in &manifest.files {
        if !valid_path(&entry.path) || !seen.insert(entry.path.clone()) {
            return Err(ExtError::Malformed(format!("file path {:?} is not allowed or repeated", entry.path)));
        }
        if entry.size > MAX_FILE || offset + entry.size > rest.len() {
            return Err(ExtError::Malformed(format!("{} is cut short or too large", entry.path)));
        }
        let content = &rest[offset..offset + entry.size];
        if sha(content) != entry.sha256 {
            return Err(ExtError::Integrity(entry.path.clone()));
        }
        files.push((entry.path.clone(), content.to_vec()));
        offset += entry.size;
    }
    if offset != rest.len() {
        return Err(ExtError::Malformed("bytes after the last file".into()));
    }
    if let Some(entry) = &manifest.entry {
        if !seen.contains(entry) {
            return Err(ExtError::Malformed("entry is not one of the files".into()));
        }
    }
    let trust = match &manifest.signature {
        None => Trust::Developer,
        Some(s) => {
            let key: [u8; 32] = unhex(&s.key).and_then(|b| b.try_into().ok()).ok_or(ExtError::BadSignature)?;
            let sig: [u8; 64] = unhex(&s.signature).and_then(|b| b.try_into().ok()).ok_or(ExtError::BadSignature)?;
            let verifying = VerifyingKey::from_bytes(&key).map_err(|_| ExtError::BadSignature)?;
            // Present but wrong is refused outright, never treated as unsigned.
            verifying.verify(&signing_bytes(&manifest), &Signature::from_bytes(&sig)).map_err(|_| ExtError::BadSignature)?;
            if trusted.contains(&key) { Trust::Verified } else { Trust::Developer }
        }
    };
    let sensitive = manifest.capabilities.iter().filter(|c| is_sensitive(&c.name)).map(|c| c.name.clone()).collect();
    Ok(Inspection { manifest, trust, files, sensitive })
}

// ---------------------------------------------------------------- what is installed

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Enabled,
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Installed {
    pub id: String,
    pub version: String,
    pub name: String,
    pub publisher: String,
    pub trust: Trust,
    pub state: State,
    pub requested: Vec<String>,
    /// What the person agreed to. Always a subset of `requested`.
    pub granted: Vec<String>,
    pub failures: u32,
    pub installed_at: i64,
    /// Why it was switched off, when the host did it.
    pub disabled_reason: Option<String>,
}

/// An entry for the app's own audit trail (the app writes it: `node-core::audit` or its copy).
#[derive(Debug, Clone, PartialEq)]
pub struct AuditEvent {
    pub action: &'static str,
    pub extension: String,
    pub detail: String,
}

#[derive(Default, Serialize, Deserialize)]
struct Registry {
    installed: Vec<Installed>,
}

pub struct Host {
    root: PathBuf,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl Host {
    pub fn new(base: &Path) -> Self {
        Host { root: base.join("extensions") }
    }

    fn registry(&self) -> Registry {
        std::fs::read_to_string(self.root.join("registry.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
    }
    fn save(&self, registry: &Registry) -> Result<(), ExtError> {
        std::fs::create_dir_all(&self.root)?;
        let tmp = self.root.join("registry.json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(registry).map_err(|e| ExtError::Io(e.to_string()))?)?;
        Ok(std::fs::rename(tmp, self.root.join("registry.json"))?)
    }
    fn dir(&self, id: &str) -> PathBuf {
        self.root.join(id)
    }

    pub fn list(&self) -> Vec<Installed> {
        self.registry().installed
    }
    pub fn get(&self, id: &str) -> Option<Installed> {
        self.list().into_iter().find(|i| i.id == id)
    }

    /// Installs a checked package. It is installed DISABLED with nothing granted: the person enables it and chooses
    /// what to grant. A Developer package needs `accept_developer`. An update must be newer; if it asks for anything
    /// it was not granted before, it stays disabled until the person grants it again.
    pub fn install(&self, inspection: Inspection, accept_developer: bool) -> Result<(Installed, Vec<AuditEvent>), ExtError> {
        if inspection.trust == Trust::Developer && !accept_developer {
            return Err(ExtError::DeveloperNotAccepted);
        }
        let m = &inspection.manifest;
        let mut registry = self.registry();
        let previous = registry.installed.iter().find(|i| i.id == m.id).cloned();
        if let Some(old) = &previous {
            if parse_version(&m.version) <= parse_version(&old.version) {
                return Err(ExtError::NotOlder);
            }
            // A signed extension must not be replaced by an unsigned one under the same id.
            if old.trust == Trust::Verified && inspection.trust == Trust::Developer {
                return Err(ExtError::DeveloperNotAccepted);
            }
        }
        let requested: Vec<String> = m.capabilities.iter().map(|c| c.name.clone()).collect();
        let granted: Vec<String> = previous.as_ref().map(|o| o.granted.iter().filter(|g| requested.contains(g)).cloned().collect()).unwrap_or_default();
        let wants_more = previous.as_ref().is_some_and(|o| requested.iter().any(|r| !o.granted.contains(r)));
        let keep_enabled = previous.as_ref().is_some_and(|o| o.state == State::Enabled) && !wants_more;
        let target = self.dir(&m.id).join(&m.version);
        // Write the new files before touching the registry, so a failure leaves the old version working.
        for (path, bytes) in &inspection.files {
            let file = target.join(path);
            if let Some(parent) = file.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(file, bytes)?;
        }
        let record = Installed {
            id: m.id.clone(),
            version: m.version.clone(),
            name: m.name.clone(),
            publisher: m.publisher.clone(),
            trust: inspection.trust,
            state: if keep_enabled { State::Enabled } else { State::Disabled },
            requested,
            granted,
            failures: 0,
            installed_at: now(),
            disabled_reason: if wants_more { Some("An update asks for more than you agreed to. Review it, then enable.".into()) } else { None },
        };
        registry.installed.retain(|i| i.id != m.id);
        registry.installed.push(record.clone());
        self.save(&registry)?;
        if let Some(old) = previous.filter(|o| o.version != m.version) {
            let _ = std::fs::remove_dir_all(self.dir(&m.id).join(&old.version));
        }
        let action = if wants_more { "extension_updated_needs_consent" } else { "extension_installed" };
        Ok((record, vec![AuditEvent { action, extension: m.id.clone(), detail: format!("{} {} ({:?})", m.name, m.version, inspection.trust) }]))
    }

    /// Switches an extension on with exactly the capabilities the person grants (never more than it declared).
    pub fn enable(&self, id: &str, grant: &[String]) -> Result<Vec<AuditEvent>, ExtError> {
        let mut registry = self.registry();
        let item = registry.installed.iter_mut().find(|i| i.id == id).ok_or(ExtError::NotInstalled)?;
        if let Some(extra) = grant.iter().find(|g| !item.requested.contains(g)) {
            return Err(ExtError::Denied(format!("{extra} is not something this extension declared")));
        }
        item.granted = grant.to_vec();
        item.state = State::Enabled;
        item.failures = 0;
        item.disabled_reason = None;
        let detail = format!("granted: {}", if grant.is_empty() { "nothing".to_string() } else { grant.join(", ") });
        self.save(&registry)?;
        Ok(vec![AuditEvent { action: "extension_enabled", extension: id.to_string(), detail }])
    }

    pub fn disable(&self, id: &str, reason: Option<&str>) -> Result<Vec<AuditEvent>, ExtError> {
        let mut registry = self.registry();
        let item = registry.installed.iter_mut().find(|i| i.id == id).ok_or(ExtError::NotInstalled)?;
        item.state = State::Disabled;
        item.disabled_reason = reason.map(String::from);
        self.save(&registry)?;
        Ok(vec![AuditEvent { action: "extension_disabled", extension: id.to_string(), detail: reason.unwrap_or("by the person").to_string() }])
    }

    /// Removes the extension, its files and its storage.
    pub fn remove(&self, id: &str) -> Result<Vec<AuditEvent>, ExtError> {
        let mut registry = self.registry();
        if !registry.installed.iter().any(|i| i.id == id) {
            return Err(ExtError::NotInstalled);
        }
        registry.installed.retain(|i| i.id != id);
        self.save(&registry)?;
        let _ = std::fs::remove_dir_all(self.dir(id));
        Ok(vec![AuditEvent { action: "extension_removed", extension: id.to_string(), detail: "files and storage deleted".into() }])
    }

    fn require(&self, id: &str, capability: &str) -> Result<Installed, ExtError> {
        let item = self.get(id).ok_or(ExtError::NotInstalled)?;
        if item.state != State::Enabled {
            return Err(ExtError::Disabled);
        }
        if !item.granted.iter().any(|g| g == capability) {
            return Err(ExtError::Denied(capability.to_string()));
        }
        Ok(item)
    }

    /// Runs `work` on behalf of an extension that holds `capability`. The call is audited whether it runs or is
    /// refused. A panic in `work` is caught and counted; after `MAX_FAILURES` in a row the extension is switched off.
    /// A success resets the count. The caller (the app) still applies its own authorisation inside `work`.
    pub fn call<T>(&self, id: &str, capability: &str, work: impl FnOnce(&Installed) -> Result<T, Fault>) -> (Result<T, ExtError>, Vec<AuditEvent>) {
        let item = match self.require(id, capability) {
            Ok(i) => i,
            Err(e) => return (Err(e.clone()), vec![AuditEvent { action: "extension_call_refused", extension: id.to_string(), detail: format!("{capability}: {e}") }]),
        };
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(&item)));
        let failure = match outcome {
            Ok(Ok(value)) => {
                self.note_failure(id, false);
                return (Ok(value), vec![AuditEvent { action: "extension_call", extension: id.to_string(), detail: capability.to_string() }]);
            }
            Ok(Err(Fault::Refused(message))) => {
                return (Err(ExtError::Refused(message.clone())), vec![AuditEvent { action: "extension_call_refused", extension: id.to_string(), detail: format!("{capability}: {message}") }]);
            }
            Ok(Err(Fault::Broke(message))) => message,
            Err(_) => "the extension panicked".to_string(),
        };
        let mut events = vec![AuditEvent { action: "extension_call_failed", extension: id.to_string(), detail: format!("{capability}: {failure}") }];
        if self.note_failure(id, true) >= MAX_FAILURES {
            if let Ok(more) = self.disable(id, Some("It failed several times in a row and was switched off.")) {
                events.extend(more);
            }
        }
        (Err(ExtError::Failed(failure)), events)
    }

    fn note_failure(&self, id: &str, failed: bool) -> u32 {
        let mut registry = self.registry();
        let Some(item) = registry.installed.iter_mut().find(|i| i.id == id) else { return 0 };
        item.failures = if failed { item.failures + 1 } else { 0 };
        let n = item.failures;
        let _ = self.save(&registry);
        n
    }

    /// Reads one of the extension's own files (a template, a form, a reference table). Needs the capability the
    /// caller names; the path must be one the manifest listed, so nothing outside the package can be read.
    pub fn read_asset(&self, id: &str, capability: &str, path: &str) -> (Result<Vec<u8>, ExtError>, Vec<AuditEvent>) {
        let root = self.dir(id);
        self.call(id, capability, |item| {
            if !valid_path(path) {
                return Err(Fault::Refused("that is not a file of the extension".into()));
            }
            std::fs::read(root.join(&item.version).join(path)).map_err(|_| Fault::Refused("that is not a file of the extension".to_string()))
        })
    }

    /// The extension's private storage (needs `storage`), capped at `STORAGE_QUOTA` bytes in total.
    pub fn storage_put(&self, id: &str, key: &str, value: &[u8]) -> (Result<(), ExtError>, Vec<AuditEvent>) {
        let dir = self.dir(id).join("storage");
        self.call(id, "storage", |_| {
            if key.is_empty() || key.len() > 64 || !key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.')) || key.starts_with('.') {
                return Err(Fault::Refused("storage keys are short lower-case names".into()));
            }
            std::fs::create_dir_all(&dir).map_err(|e| Fault::Broke(e.to_string()))?;
            let used: u64 = std::fs::read_dir(&dir).map_err(|e| Fault::Broke(e.to_string()))?.filter_map(Result::ok).filter(|e| e.file_name().to_string_lossy() != key).filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum();
            if used as usize + value.len() > STORAGE_QUOTA {
                return Err(Fault::Refused("the extension's storage is full".into()));
            }
            std::fs::write(dir.join(key), value).map_err(|e| Fault::Broke(e.to_string()))
        })
    }

    pub fn storage_get(&self, id: &str, key: &str) -> (Result<Option<Vec<u8>>, ExtError>, Vec<AuditEvent>) {
        let dir = self.dir(id).join("storage");
        self.call(id, "storage", |_| {
            if key.is_empty() || key.len() > 64 || !key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-' | '.')) || key.starts_with('.') {
                return Err(Fault::Refused("storage keys are short lower-case names".into()));
            }
            Ok(std::fs::read(dir.join(key)).ok())
        })
    }

    /// Whether this extension may open a connection to `host`: only a host it declared and the person granted, exactly.
    pub fn may_connect(&self, id: &str, host: &str) -> (Result<(), ExtError>, Vec<AuditEvent>) {
        let capability = format!("network:{}", host.to_ascii_lowercase());
        self.call(id, &capability, |_| Ok(()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-ext-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }
    fn trusted(k: &SigningKey) -> Vec<[u8; 32]> {
        vec![*k.verifying_key().as_bytes()]
    }
    fn manifest(version: &str, capabilities: &[(&str, &str)]) -> Manifest {
        Manifest {
            schema: SCHEMA,
            id: "org.example.demand-letters".into(),
            version: version.into(),
            name: "Demand letters".into(),
            description: "Letter templates for recovering a debt.".into(),
            publisher: "Example Legal Tech".into(),
            targets: vec!["lawyers".into()],
            min_app_version: Some("0.1.0".into()),
            capabilities: capabilities.iter().map(|(n, r)| Capability { name: n.to_string(), reason: r.to_string() }).collect(),
            entry: None,
            files: vec![],
            signature: None,
        }
    }
    const TEMPLATE: &[u8] = br#"{"title":"Demand for payment","body":"We act for {{client}}. Pay {{amount}} within 14 days."}"#;

    /// The whole life of the example extension: inspect, install, enable, run, fail, update, remove.
    #[test]
    fn the_example_extension_lives_its_whole_life() {
        let base = temp();
        let host = Host::new(&base);
        let signer = key(7);
        let keys = trusted(&signer);
        let bytes = pack(manifest("1.0.0", &[("templates.documents", "Adds demand letter templates."), ("storage", "Remembers your last used amount.")]), &[("templates/demand.json", TEMPLATE)], Some(&signer));

        // Inspect changes nothing, and shows what will be asked.
        let inspection = inspect(&bytes, &keys, "lawyers", "0.1.4").unwrap();
        assert_eq!((inspection.trust, inspection.manifest.version.as_str()), (Trust::Verified, "1.0.0"));
        assert!(inspection.sensitive.is_empty());
        assert!(host.list().is_empty());

        // Installed, it is OFF and holds nothing. Nothing can be done with it yet.
        let (record, events) = host.install(inspection, false).unwrap();
        assert_eq!((record.state, record.granted.len()), (State::Disabled, 0));
        assert_eq!(events[0].action, "extension_installed");
        let (refused, events) = host.read_asset("org.example.demand-letters", "templates.documents", "templates/demand.json");
        assert_eq!(refused, Err(ExtError::Disabled));
        assert_eq!(events[0].action, "extension_call_refused");

        // The person enables it and grants one capability of the two it asked for. It cannot use the other.
        assert_eq!(host.enable("org.example.demand-letters", &["network:evil.example".to_string()]).unwrap_err().to_string().contains("not something this extension declared"), true);
        host.enable("org.example.demand-letters", &["templates.documents".to_string()]).unwrap();
        let (asset, events) = host.read_asset("org.example.demand-letters", "templates.documents", "templates/demand.json");
        assert_eq!(asset.unwrap(), TEMPLATE);
        assert_eq!(events[0].action, "extension_call");
        assert!(matches!(host.storage_put("org.example.demand-letters", "last", b"500000").0, Err(ExtError::Denied(_))), "asked for but not granted");
        // Paths outside the package are not reachable, even for a granted extension, and asking is not a crash.
        for path in ["../registry.json", "/etc/passwd", "templates/../../x", "storage/last", "templates/missing.json"] {
            assert!(matches!(host.read_asset("org.example.demand-letters", "templates.documents", path).0, Err(ExtError::Refused(_))), "{path}");
        }
        assert_eq!(host.get("org.example.demand-letters").unwrap().state, State::Enabled, "refusals are not held against the extension");
        assert_eq!(host.get("org.example.demand-letters").unwrap().failures, 0);
        assert!(matches!(host.may_connect("org.example.demand-letters", "example.com").0, Err(ExtError::Denied(_))), "no network was granted");

        // Failure isolation: a panicking extension is contained, counted, and switched off after three in a row.
        host.enable("org.example.demand-letters", &["templates.documents".to_string(), "storage".to_string()]).unwrap();
        for n in 1..=3 {
            let (result, events) = host.call::<()>("org.example.demand-letters", "storage", |_| panic!("boom"));
            assert!(matches!(result, Err(ExtError::Failed(_))));
            assert_eq!(events[0].action, "extension_call_failed");
            assert_eq!(events.len(), if n == 3 { 2 } else { 1 });
        }
        let after = host.get("org.example.demand-letters").unwrap();
        assert_eq!(after.state, State::Disabled);
        assert!(after.disabled_reason.unwrap().contains("failed several times"));
        assert_eq!(host.storage_get("org.example.demand-letters", "last").0, Err(ExtError::Disabled));
        // A success in between resets the count (so a flaky extension is not killed by old failures).
        host.enable("org.example.demand-letters", &["storage".to_string()]).unwrap();
        let _ = host.call::<()>("org.example.demand-letters", "storage", |_| Err(Fault::Broke("nope".into())));
        let _ = host.call::<()>("org.example.demand-letters", "storage", |_| Err(Fault::Broke("nope".into())));
        assert!(host.storage_put("org.example.demand-letters", "last", b"500000").0.is_ok());
        assert_eq!(host.get("org.example.demand-letters").unwrap().failures, 0);
        assert_eq!(host.storage_get("org.example.demand-letters", "last").0.unwrap().unwrap(), b"500000");
        // Storage is capped and keys cannot climb out.
        assert!(host.storage_put("org.example.demand-letters", "../escape", b"x").0.is_err());
        assert!(host.storage_put("org.example.demand-letters", "big", &vec![0u8; STORAGE_QUOTA + 1]).0.is_err());

        // An update that asks for MORE is installed disabled until the person agrees again; the older files are replaced.
        let more = pack(manifest("1.1.0", &[("templates.documents", "Adds demand letter templates."), ("storage", "Remembers."), ("documents.read", "Reads the matter to fill in names.")]), &[("templates/demand.json", TEMPLATE)], Some(&signer));
        let update = inspect(&more, &keys, "lawyers", "0.1.4").unwrap();
        assert_eq!(update.sensitive, vec!["documents.read".to_string()]);
        let (record, events) = host.install(update, false).unwrap();
        assert_eq!((record.state, record.version.as_str()), (State::Disabled, "1.1.0"));
        assert_eq!(events[0].action, "extension_updated_needs_consent");
        assert_eq!(record.granted, vec!["storage".to_string()], "what was agreed before stays, nothing new is granted");
        assert!(!base.join("extensions/org.example.demand-letters/1.0.0").exists());
        // Downgrades and replays are refused.
        assert_eq!(host.install(inspect(&bytes, &keys, "lawyers", "0.1.4").unwrap(), false).unwrap_err(), ExtError::NotOlder);
        // A signed extension cannot be replaced by an unsigned one of the same id.
        let unsigned = pack(manifest("9.0.0", &[]), &[], None);
        assert_eq!(host.install(inspect(&unsigned, &keys, "lawyers", "0.1.4").unwrap(), true).unwrap_err(), ExtError::DeveloperNotAccepted);

        // Removal deletes everything, including the storage, and the extension can no longer be called.
        assert!(base.join("extensions/org.example.demand-letters/storage/last").exists());
        host.remove("org.example.demand-letters").unwrap();
        assert!(!base.join("extensions/org.example.demand-letters").exists());
        assert!(host.list().is_empty());
        assert_eq!(host.read_asset("org.example.demand-letters", "templates.documents", "templates/demand.json").0, Err(ExtError::NotInstalled));
    }

    #[test]
    fn a_package_is_refused_unless_every_byte_and_claim_checks_out() {
        let signer = key(7);
        let keys = trusted(&signer);
        let good = pack(manifest("1.0.0", &[("templates.documents", "Adds templates.")]), &[("templates/demand.json", TEMPLATE)], Some(&signer));
        assert!(inspect(&good, &keys, "lawyers", "0.1.4").is_ok());

        // Tampered file, tampered manifest, truncated, trailing bytes, not a package.
        let mut tampered = good.clone();
        *tampered.last_mut().unwrap() ^= 1;
        assert!(matches!(inspect(&tampered, &keys, "lawyers", "0.1.4"), Err(ExtError::Integrity(_))));
        let mut edited = good.clone();
        let at = edited.windows(15).position(|w| w == b"Adds templates.").unwrap();
        edited[at + 14] = b'!'; // same length, different words
        assert_eq!(inspect(&edited, &keys, "lawyers", "0.1.4").unwrap_err(), ExtError::BadSignature, "a signed manifest cannot be edited");
        assert!(matches!(inspect(&good[..good.len() - 3], &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        let mut longer = good.clone();
        longer.push(0);
        assert!(matches!(inspect(&longer, &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        assert!(matches!(inspect(b"PK\x03\x04 a zip", &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        assert_eq!(inspect(&vec![0u8; MAX_PACKAGE + 1], &keys, "lawyers", "0.1.4").unwrap_err(), ExtError::TooLarge);

        // Another key's signature: well formed, but not trusted, so a Developer package; and it needs consent.
        let stranger = pack(manifest("1.0.0", &[]), &[], Some(&key(9)));
        assert_eq!(inspect(&stranger, &keys, "lawyers", "0.1.4").unwrap().trust, Trust::Developer);
        let unsigned = pack(manifest("1.0.0", &[]), &[], None);
        let inspection = inspect(&unsigned, &keys, "lawyers", "0.1.4").unwrap();
        assert_eq!(Host::new(&temp()).install(inspection, false).unwrap_err(), ExtError::DeveloperNotAccepted);

        // Compatibility: another app, a newer minimum version.
        assert!(matches!(inspect(&good, &keys, "police", "0.1.4"), Err(ExtError::NotCompatible(_))));
        let mut needs_new = manifest("1.0.0", &[]);
        needs_new.min_app_version = Some("0.9.0".into());
        assert!(matches!(inspect(&pack(needs_new, &[], None), &keys, "lawyers", "0.1.4"), Err(ExtError::NotCompatible(_))));

        // Capabilities: a closed list. Wildcards, addresses, ambient names and missing reasons are refused.
        for bad in ["fs.write", "network:*", "network:*.example.com", "network:10.0.0.1", "network:localhost", "shell", "database.read", "audit.write", "keys.read"] {
            let m = manifest("1.0.0", &[(bad, "why")]);
            assert_eq!(inspect(&pack(m, &[], None), &keys, "lawyers", "0.1.4").unwrap_err(), ExtError::UnknownCapability(bad.to_string()), "{bad}");
        }
        assert!(matches!(inspect(&pack(manifest("1.0.0", &[("storage", " ")]), &[], None), &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        assert!(inspect(&pack(manifest("1.0.0", &[("network:api.example.com", "Looks up exchange rates.")]), &[], None), &keys, "lawyers", "0.1.4").unwrap().sensitive.contains(&"network:api.example.com".to_string()));

        // Paths: nothing that climbs, is absolute, repeats, or is hidden.
        for path in ["../x", "/abs", "a//b", "a/./b", ".hidden/x", "UPPER.json", "a\\b", ""] {
            assert!(matches!(inspect(&pack(manifest("1.0.0", &[]), &[(path, b"x")], None), &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))), "{path:?}");
        }
        assert!(matches!(inspect(&pack(manifest("1.0.0", &[]), &[("a.json", b"1"), ("a.json", b"2")], None), &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        let mut with_entry = manifest("1.0.0", &[]);
        with_entry.entry = Some("missing.wasm".into());
        assert!(matches!(inspect(&pack(with_entry, &[], None), &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))));
        // Ids: reverse-domain only.
        for id in ["Demand", "a", "..", "org..x", "../evil"] {
            let mut m = manifest("1.0.0", &[]);
            m.id = id.into();
            assert!(matches!(inspect(&pack(m, &[], None), &keys, "lawyers", "0.1.4"), Err(ExtError::Malformed(_))), "{id}");
        }
    }

    #[test]
    fn network_is_only_the_exact_host_granted() {
        let base = temp();
        let host = Host::new(&base);
        let m = manifest("1.0.0", &[("network:api.example.com", "Looks up exchange rates.")]);
        host.install(inspect(&pack(m, &[], None), &[], "lawyers", "0.1.4").unwrap(), true).unwrap();
        host.enable("org.example.demand-letters", &["network:api.example.com".to_string()]).unwrap();
        assert!(host.may_connect("org.example.demand-letters", "API.example.com").0.is_ok());
        for other in ["example.com", "evil.api.example.com", "api.example.com.evil.net", "127.0.0.1"] {
            assert!(host.may_connect("org.example.demand-letters", other).0.is_err(), "{other}");
        }
    }
}
