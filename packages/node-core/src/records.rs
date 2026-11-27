//! The institution's records directory (docs/platform/RECORDS-DIRECTORY.md).
//!
//! Orchestra owns the tools, not the institution's work. A record is a folder
//! the institution can open, copy, back up and keep without Pleadli:
//!
//! ```text
//! <records root>/
//!   RECORDS.json                      format version, institution, kind of records
//!   <kind>/<readable name> [<id8>]/
//!     record.json                     stable id, kind, format version, display reference
//!     MANIFEST.json                   every file in the record with size and sha-256
//!     ...the record's own files (Markdown, PDFs, sealed evidence, attachments)
//! ```
//!
//! Rules this module keeps, so each app does not re-decide them:
//! - **Identity is `record.json`, never the folder name.** A folder can be
//!   renamed by a person or by a new reference; the id stays.
//! - **Writes are crash-safe.** Each file goes to a temporary name in the same
//!   folder, is flushed to disk, then renamed over the target. The manifest is
//!   written last, so a record whose manifest matches its files is complete,
//!   and a crash leaves either the old state or the new one, never half of one.
//! - **No crypto here.** A caller passes bytes. Protected material (sealed
//!   evidence, restricted records) is handed in already sealed and marked
//!   `sealed`, so this module can never weaken the vault by writing it plain.
//! - **The index is rebuildable.** `scan` reads only the directory, so the
//!   database can be rebuilt from it, and says what is missing, changed,
//!   unlisted (made outside Orchestra) or in conflict, instead of guessing.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Bumped only when a reader of the old format could misread the new one.
pub const FORMAT_VERSION: u32 = 1;
pub const ROOT_FILE: &str = "RECORDS.json";
pub const RECORD_FILE: &str = "record.json";
pub const MANIFEST_FILE: &str = "MANIFEST.json";
const TEMP_SUFFIX: &str = ".pleadli-tmp";

#[derive(Debug)]
pub enum RecordsError {
    Io(io::Error),
    Json(serde_json::Error),
    /// A name that would leave the record's folder, or cannot be a file name.
    BadPath(String),
    /// The folder holds a record written by a newer format than this build reads.
    NewerFormat(u32),
}

impl std::fmt::Display for RecordsError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RecordsError::Io(e) => write!(f, "{e}"),
            RecordsError::Json(e) => write!(f, "{e}"),
            RecordsError::BadPath(p) => write!(f, "'{p}' cannot be a file inside a record"),
            RecordsError::NewerFormat(v) => {
                write!(f, "these records use format {v}; this version of the app reads up to {FORMAT_VERSION}")
            }
        }
    }
}

impl std::error::Error for RecordsError {}

impl From<io::Error> for RecordsError {
    fn from(e: io::Error) -> Self {
        RecordsError::Io(e)
    }
}
impl From<serde_json::Error> for RecordsError {
    fn from(e: serde_json::Error) -> Self {
        RecordsError::Json(e)
    }
}

type Result<T> = std::result::Result<T, RecordsError>;

/// The one file at the top of a records directory.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RootInfo {
    pub format_version: u32,
    /// "police", "dpp", "prisons", ...
    pub institution: String,
    pub created_at: i64,
    /// The office's own name ("Kisenyi Police Station"), for people to recognise it by.
    #[serde(default)]
    pub name: String,
    /// How the records key is kept so the institution can always reach it.
    #[serde(default)]
    pub keys: Option<RecordKeys>,
}

/// The records key (RK) seals what is private in the directory. It is kept twice: wrapped for
/// each computer that uses the directory (opened by that computer's own key), and wrapped for the
/// institution (opened only by its recovery phrase), so no one computer or installation is the
/// only way back in.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordKeys {
    /// install id -> hex of the key sealed by that installation's vault key.
    #[serde(default)]
    pub computers: BTreeMap<String, String>,
    /// The key sealed to the institution's recovery key (`backup::seal`), once it has one.
    #[serde(default)]
    pub institution: Option<String>,
    #[serde(default)]
    pub institution_fingerprint: Option<String>,
}

/// What a record is, in its own folder. `id` never changes.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordHeader {
    pub format_version: u32,
    pub id: String,
    /// Where the record lives: "cases", "persons", "custody", "correspondence"...
    pub kind: String,
    /// What people call it: a CRB number, a file number. May change; not an identity.
    pub reference: String,
    pub title: String,
    pub updated_at: i64,
    /// Hash of the content when last written, so an unchanged record is not rewritten.
    #[serde(default)]
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub path: String,
    pub size: u64,
    pub sha256: String,
    /// Sealed by the vault before it reached this folder. Never written plain.
    pub sealed: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub files: Vec<ManifestEntry>,
}

/// One file to put in a record.
pub struct RecordFile {
    pub path: String,
    pub bytes: Vec<u8>,
    pub sealed: bool,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// Write `bytes` to `path` so a crash leaves the old file or the new one.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = dir.join(format!(".{name}{TEMP_SUFFIX}"));
    {
        let mut f = OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    // Persist the rename itself where the platform lets a folder be opened.
    if let Ok(d) = File::open(dir) {
        let _ = d.sync_all();
    }
    Ok(())
}

/// A relative path made only of ordinary names, so a record can never write outside itself.
fn checked_relative(path: &str) -> Result<PathBuf> {
    let p = Path::new(path);
    if path.is_empty() || p.is_absolute() {
        return Err(RecordsError::BadPath(path.into()));
    }
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::Normal(n) => out.push(n),
            _ => return Err(RecordsError::BadPath(path.into())),
        }
    }
    if matches!(path, RECORD_FILE | MANIFEST_FILE) {
        return Err(RecordsError::BadPath(path.into()));
    }
    Ok(out)
}

/// A folder name a person can read, safe on Windows, macOS and Linux.
pub fn folder_name(reference: &str, title: &str, id: &str) -> String {
    let base = if reference.trim().is_empty() { title.trim().to_string() } else { format!("{} {}", reference.trim(), title.trim()) };
    let cleaned: String = base
        .chars()
        .map(|c| if c.is_control() || "/\\:*?\"<>|".contains(c) { '-' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').chars().take(80).collect::<String>();
    let short: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    if cleaned.is_empty() {
        format!("[{short}]")
    } else {
        format!("{} [{short}]", cleaned.trim())
    }
}

/// Create the records directory's top file if it is not there yet.
pub fn init_root(root: &Path, institution: &str, now_ms: i64) -> Result<RootInfo> {
    let file = root.join(ROOT_FILE);
    if file.exists() {
        let info: RootInfo = serde_json::from_slice(&fs::read(&file)?)?;
        if info.format_version > FORMAT_VERSION {
            return Err(RecordsError::NewerFormat(info.format_version));
        }
        return Ok(info);
    }
    let info = RootInfo { format_version: FORMAT_VERSION, institution: institution.into(), created_at: now_ms, name: String::new(), keys: None };
    write_atomic(&file, &serde_json::to_vec_pretty(&info)?)?;
    Ok(info)
}

/// Write (or rewrite) one record. `folder` is the existing folder if the record
/// is already on disk (found by `scan`), so a renamed folder is kept, not duplicated.
/// Files not in `files` are left alone: a person may have added their own.
pub fn write_record(root: &Path, existing_folder: Option<&Path>, header: &RecordHeader, files: &[RecordFile]) -> Result<PathBuf> {
    let folder = match existing_folder {
        Some(f) => f.to_path_buf(),
        None => root.join(&header.kind).join(folder_name(&header.reference, &header.title, &header.id)),
    };
    // Validate every name before anything is written.
    let mut planned = Vec::with_capacity(files.len());
    for f in files {
        planned.push((checked_relative(&f.path)?, f));
    }
    fs::create_dir_all(&folder)?;

    // Start from what the manifest already lists so untouched files stay listed.
    let mut entries: BTreeMap<String, ManifestEntry> = match read_manifest(&folder) {
        Ok(Some(m)) => m.files.into_iter().map(|e| (e.path.clone(), e)).collect(),
        _ => BTreeMap::new(),
    };
    for (rel, f) in planned {
        write_atomic(&folder.join(&rel), &f.bytes)?;
        let key = rel.to_string_lossy().replace('\\', "/");
        entries.insert(key.clone(), ManifestEntry { path: key, size: f.bytes.len() as u64, sha256: sha256_hex(&f.bytes), sealed: f.sealed });
    }
    // The header, then the manifest last: a matching manifest means a complete record.
    write_atomic(&folder.join(RECORD_FILE), &serde_json::to_vec_pretty(header)?)?;
    let manifest = Manifest { format_version: FORMAT_VERSION, files: entries.into_values().collect() };
    write_atomic(&folder.join(MANIFEST_FILE), &serde_json::to_vec_pretty(&manifest)?)?;
    Ok(folder)
}

/// Record id -> folder, reading only each `record.json` (no hashing), for a quick lookup.
pub fn locate(root: &Path) -> BTreeMap<String, PathBuf> {
    let mut out = BTreeMap::new();
    let Ok(kinds) = fs::read_dir(root) else { return out };
    for kind in kinds.flatten() {
        let Ok(recs) = fs::read_dir(kind.path()) else { continue };
        for rec in recs.flatten() {
            let p = rec.path();
            if let Some(h) = fs::read(p.join(RECORD_FILE)).ok().and_then(|b| serde_json::from_slice::<RecordHeader>(&b).ok()) {
                out.entry(h.id).or_insert(p);
            }
        }
    }
    out
}

pub fn read_manifest(folder: &Path) -> Result<Option<Manifest>> {
    match fs::read(folder.join(MANIFEST_FILE)) {
        Ok(b) => Ok(Some(serde_json::from_slice(&b)?)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// How one record folder stands against its own manifest.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecordReport {
    pub folder: PathBuf,
    pub header: RecordHeader,
    /// Listed in the manifest, not on disk.
    pub missing: Vec<String>,
    /// On disk, but its hash is not the one the manifest holds.
    pub modified: Vec<String>,
    /// On disk, not in the manifest: added by a person or another program.
    pub unlisted: Vec<String>,
    /// No manifest, so the record may have been interrupted while it was written.
    pub incomplete: bool,
}

impl RecordReport {
    pub fn is_intact(&self) -> bool {
        self.missing.is_empty() && self.modified.is_empty() && self.unlisted.is_empty() && !self.incomplete
    }
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub records: Vec<RecordReport>,
    /// Two folders claiming one id (a copied folder): never merged, left for a person.
    pub conflicts: Vec<(String, Vec<PathBuf>)>,
    /// Folders with a `record.json` that could not be read.
    pub unreadable: Vec<PathBuf>,
    /// Leftovers of a write the computer stopped in the middle of.
    pub stale_temp: Vec<PathBuf>,
}

fn walk_files(dir: &Path, base: &Path, out: &mut Vec<String>, temps: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type()?.is_dir() {
            walk_files(&path, base, out, temps)?;
        } else if name.ends_with(TEMP_SUFFIX) {
            temps.push(path);
        } else {
            let rel = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            out.push(rel);
        }
    }
    Ok(())
}

/// Read the directory and nothing else: what a rebuilt index is made from.
pub fn scan(root: &Path) -> Result<ScanReport> {
    let mut report = ScanReport::default();
    if let Ok(b) = fs::read(root.join(ROOT_FILE)) {
        let info: RootInfo = serde_json::from_slice(&b)?;
        if info.format_version > FORMAT_VERSION {
            return Err(RecordsError::NewerFormat(info.format_version));
        }
    }
    let mut by_id: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();
    let mut headers: BTreeMap<PathBuf, RecordHeader> = BTreeMap::new();

    // A record folder is any folder directly holding record.json, one or two levels down.
    let mut candidates = Vec::new();
    if root.is_dir() {
        for kind in fs::read_dir(root)? {
            let kind = kind?.path();
            if !kind.is_dir() {
                continue;
            }
            for rec in fs::read_dir(&kind)? {
                let rec = rec?.path();
                if rec.join(RECORD_FILE).is_file() {
                    candidates.push(rec);
                }
            }
        }
    }
    for folder in candidates {
        match fs::read(folder.join(RECORD_FILE)).ok().and_then(|b| serde_json::from_slice::<RecordHeader>(&b).ok()) {
            Some(h) if h.format_version <= FORMAT_VERSION => {
                by_id.entry(h.id.clone()).or_default().push(folder.clone());
                headers.insert(folder, h);
            }
            _ => report.unreadable.push(folder),
        }
    }
    for (id, folders) in &by_id {
        if folders.len() > 1 {
            report.conflicts.push((id.clone(), folders.clone()));
        }
    }
    for (folder, header) in headers {
        let manifest = read_manifest(&folder).ok().flatten();
        let mut on_disk = Vec::new();
        walk_files(&folder, &folder, &mut on_disk, &mut report.stale_temp)?;
        let on_disk: BTreeSet<String> =
            on_disk.into_iter().filter(|p| p != RECORD_FILE && p != MANIFEST_FILE).collect();
        let mut r = RecordReport { folder: folder.clone(), header, missing: vec![], modified: vec![], unlisted: vec![], incomplete: manifest.is_none() };
        if let Some(m) = manifest {
            let listed: BTreeSet<&str> = m.files.iter().map(|e| e.path.as_str()).collect();
            for e in &m.files {
                match fs::read(folder.join(&e.path)) {
                    Ok(bytes) => {
                        if sha256_hex(&bytes) != e.sha256 {
                            r.modified.push(e.path.clone());
                        }
                    }
                    Err(_) => r.missing.push(e.path.clone()),
                }
            }
            r.unlisted = on_disk.iter().filter(|p| !listed.contains(p.as_str())).cloned().collect();
        } else {
            r.unlisted = on_disk.into_iter().collect();
        }
        report.records.push(r);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch() -> PathBuf {
        let p = std::env::temp_dir().join(format!("pleadli-records-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn header(id: &str, reference: &str) -> RecordHeader {
        RecordHeader { format_version: FORMAT_VERSION, id: id.into(), kind: "cases".into(), reference: reference.into(), title: "Kibuuka theft".into(), updated_at: 1, content_hash: String::new() }
    }

    fn file(path: &str, text: &str) -> RecordFile {
        RecordFile { path: path.into(), bytes: text.as_bytes().to_vec(), sealed: false }
    }

    #[test]
    fn a_written_record_scans_as_intact_and_keeps_its_id() {
        let root = scratch();
        init_root(&root, "police", 0).unwrap();
        let h = header("11111111-aaaa", "CRB 123/2026");
        write_record(&root, None, &h, &[file("case.md", "# Case\n"), file("statements/pf2b-1.md", "x")]).unwrap();
        let scan = scan(&root).unwrap();
        assert_eq!(scan.records.len(), 1);
        assert!(scan.records[0].is_intact());
        assert_eq!(scan.records[0].header.id, "11111111-aaaa");
    }

    #[test]
    fn edits_deletions_and_foreign_files_are_reported_not_hidden() {
        let root = scratch();
        let h = header("22222222-bbbb", "CRB 9/2026");
        let folder = write_record(&root, None, &h, &[file("a.md", "one"), file("b.md", "two")]).unwrap();
        fs::write(folder.join("a.md"), "changed outside").unwrap();
        fs::remove_file(folder.join("b.md")).unwrap();
        fs::write(folder.join("from-the-station.docx"), "added").unwrap();
        let r = &scan(&root).unwrap().records[0];
        assert_eq!(r.modified, vec!["a.md"]);
        assert_eq!(r.missing, vec!["b.md"]);
        assert_eq!(r.unlisted, vec!["from-the-station.docx"]);
    }

    #[test]
    fn renaming_the_folder_does_not_change_which_record_it_is() {
        let root = scratch();
        let h = header("33333333-cccc", "CRB 1/2026");
        let folder = write_record(&root, None, &h, &[file("case.md", "v1")]).unwrap();
        let renamed = folder.parent().unwrap().join("Renamed by an officer");
        fs::rename(&folder, &renamed).unwrap();
        // Rewriting through the folder the scan found updates it in place.
        let found = scan(&root).unwrap().records[0].folder.clone();
        write_record(&root, Some(&found), &header("33333333-cccc", "CRB 1/2026-A"), &[file("case.md", "v2")]).unwrap();
        let s = scan(&root).unwrap();
        assert_eq!(s.records.len(), 1);
        assert!(s.records[0].is_intact());
        assert_eq!(s.records[0].header.reference, "CRB 1/2026-A");
    }

    #[test]
    fn a_copied_folder_is_a_conflict_and_is_never_merged() {
        let root = scratch();
        let h = header("44444444-dddd", "CRB 2/2026");
        let folder = write_record(&root, None, &h, &[file("case.md", "v1")]).unwrap();
        let copy = folder.parent().unwrap().join("Copy of case");
        fs::create_dir_all(&copy).unwrap();
        for f in fs::read_dir(&folder).unwrap() {
            let f = f.unwrap().path();
            fs::copy(&f, copy.join(f.file_name().unwrap())).unwrap();
        }
        assert_eq!(scan(&root).unwrap().conflicts.len(), 1);
    }

    #[test]
    fn a_record_without_a_manifest_is_incomplete_and_leftover_temp_files_are_listed() {
        let root = scratch();
        let h = header("55555555-eeee", "CRB 3/2026");
        let folder = write_record(&root, None, &h, &[file("case.md", "v1")]).unwrap();
        fs::remove_file(folder.join(MANIFEST_FILE)).unwrap();
        fs::write(folder.join(".case.md.pleadli-tmp"), "half").unwrap();
        let s = scan(&root).unwrap();
        assert!(s.records[0].incomplete);
        assert_eq!(s.stale_temp.len(), 1);
    }

    #[test]
    fn a_name_that_escapes_the_record_is_refused_before_anything_is_written() {
        let root = scratch();
        let h = header("66666666-ffff", "CRB 4/2026");
        for bad in ["../outside.md", "/etc/passwd", "a/../../b", "", MANIFEST_FILE] {
            assert!(write_record(&root, None, &h, &[file("ok.md", "x"), file(bad, "y")]).is_err(), "{bad}");
        }
        assert!(scan(&root).unwrap().records.is_empty());
    }

    #[test]
    fn rewriting_a_record_keeps_files_it_did_not_touch_and_marks_sealed_ones() {
        let root = scratch();
        let h = header("77777777-0000", "CRB 5/2026");
        let folder = write_record(&root, None, &h, &[file("a.md", "one")]).unwrap();
        let sealed = RecordFile { path: "evidence/e1.sealed".into(), bytes: vec![1, 2, 3], sealed: true };
        write_record(&root, Some(&folder), &h, &[sealed]).unwrap();
        let m = read_manifest(&folder).unwrap().unwrap();
        assert_eq!(m.files.len(), 2);
        assert!(m.files.iter().any(|e| e.path == "evidence/e1.sealed" && e.sealed));
        assert!(scan(&root).unwrap().records[0].is_intact());
    }

    #[test]
    fn a_newer_format_is_refused_not_misread() {
        let root = scratch();
        write_atomic(&root.join(ROOT_FILE), br#"{"formatVersion":99,"institution":"police","createdAt":0}"#).unwrap();
        assert!(matches!(scan(&root), Err(RecordsError::NewerFormat(99))));
    }

    #[test]
    fn folder_names_are_readable_and_safe() {
        let n = folder_name("CRB 123/2026", "Kibuuka: theft?", "abcdef12-3456");
        assert_eq!(n, "CRB 123-2026 Kibuuka- theft- [abcdef12]");
    }
}
