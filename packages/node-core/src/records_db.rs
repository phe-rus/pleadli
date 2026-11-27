//! Bridges an application's database and its records directory
//! (docs/platform/RECORDS-DIRECTORY.md): writes each case, file or prisoner as a
//! folder (`sync`), and rebuilds the database from the folders (`recover`).
//!
//! The same code serves Police, DPP and Prisons. Each app only says what its
//! *main records* are (cases, prosecution files, prisoners), which tables are
//! machine-only and stay out, and which tables may be shown as readable
//! Markdown. Everything else is found from the schema: a row belongs to the
//! record its `*_id` columns lead to, and attachments follow their `entity_id`.
//!
//! What goes where in a record folder:
//! - `record.md`: the human-readable paper, only for ordinary (not restricted)
//!   records and only from the tables the app lists as `open_tables`.
//! - `data.sealed`: every row of the record, sealed under the **records key**.
//! - `attachments/...sealed`: each attachment, re-sealed under the records key.
//!
//! The records key is not the installation's vault key. It is kept wrapped for
//! every computer that uses the directory and once for the institution's
//! recovery key, so a reinstall or a new computer can reach it with the
//! recovery phrase and no installation is the only way in.

use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};
use rand_core::{OsRng, RngCore};
use serde::Serialize;
use serde_json::{json, Map, Value};
use sqlx::{Column, Row, SqlitePool, TypeInfo, ValueRef};
use x25519_dalek::PublicKey;

use crate::records::{self, RecordFile, RecordHeader, RecordsError, FORMAT_VERSION};
use crate::{backup, vault};

const RK_CONTEXT: &str = "pleadli/records-key/v1";
const SEALED_MAGIC: &[u8; 6] = b"PLREC1";
/// Larger attachments stay in the vault only, and are reported, never silently dropped.
const MAX_SEALED_ATTACHMENT: u64 = 256 * 1024 * 1024;
const DATA_FILE: &str = "data.sealed";
const MD_FILE: &str = "record.md";
/// Bumped when the readable paper is laid out differently, so every paper is rewritten once.
const RENDER_VERSION: &str = "paper-3";

/// One kind of main record an application keeps.
pub struct Root {
    pub table: &'static str,
    /// The folder under the records directory ("cases", "people", "prisoners").
    pub kind: &'static str,
    pub reference_cols: &'static [&'static str],
    pub title_cols: &'static [&'static str],
    /// A column that is 1 for a restricted record, if the app has one.
    pub restricted_col: Option<&'static str>,
}

pub struct Layout {
    pub institution: &'static str,
    pub roots: Vec<Root>,
    /// Machine-only tables (sessions, private keys, pairing codes): never written.
    pub excluded: &'static [&'static str],
    /// Tables whose rows stay together in one station-wide record (the audit chain).
    pub station_only: &'static [&'static str],
    /// Tables a readable `record.md` may show. Everything else stays sealed.
    pub open_tables: &'static [&'static str],
    /// Credential columns: never copied, restored empty.
    pub redact_cols: &'static [&'static str],
    /// Columns the readable paper leaves out: numbering internals, who-did-it plumbing.
    pub hidden_cols: &'static [&'static str],
}

#[derive(Debug)]
pub enum Error {
    Records(RecordsError),
    Db(sqlx::Error),
    Io(std::io::Error),
    Json(serde_json::Error),
    /// The directory's key cannot be opened here: say what is needed.
    Locked(String),
    /// A records folder of an institution exists that this database has not been restored from.
    NotAttached,
    Other(String),
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Records(e) => write!(f, "{e}"),
            Error::Db(e) => write!(f, "{e}"),
            Error::Io(e) => write!(f, "{e}"),
            Error::Json(e) => write!(f, "{e}"),
            Error::Locked(m) | Error::Other(m) => write!(f, "{m}"),
            Error::NotAttached => write!(f, "This records folder belongs to an institution that has not been restored here yet."),
        }
    }
}
impl std::error::Error for Error {}
impl From<RecordsError> for Error {
    fn from(e: RecordsError) -> Self {
        Error::Records(e)
    }
}
impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        Error::Db(e)
    }
}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Json(e)
    }
}

type Result<T> = std::result::Result<T, Error>;
type RowMap = Map<String, Value>;

// ---------------------------------------------------------------- attachment
/// An existing institution found in a records folder.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub institution: String,
    pub records: usize,
    pub last_saved: i64,
}

#[derive(Debug)]
pub enum Attach {
    /// No institution in the folder yet: this database may start one.
    Empty,
    /// This database was started from, or has restored, this folder.
    Attached,
    /// The folder holds an institution this database is not part of.
    Foreign(Found),
}

fn marker(data_dir: &Path) -> PathBuf {
    data_dir.join("records.attached")
}

/// The institution already in a records folder, if there is one.
pub fn discover(root: &Path) -> Option<Found> {
    let info: records::RootInfo = serde_json::from_slice(&std::fs::read(root.join(records::ROOT_FILE)).ok()?).ok()?;
    let scan = records::scan(root).ok()?;
    if scan.records.is_empty() {
        return None;
    }
    let last = scan.records.iter().map(|r| r.header.updated_at).max().unwrap_or(0);
    let institution = if info.name.trim().is_empty() { info.institution } else { info.name };
    Some(Found { institution, records: scan.records.len(), last_saved: last })
}

pub fn attach_state(root: &Path, data_dir: &Path) -> Attach {
    let Some(found) = discover(root) else { return Attach::Empty };
    let created = std::fs::read(root.join(records::ROOT_FILE)).ok().and_then(|b| serde_json::from_slice::<records::RootInfo>(&b).ok()).map(|i| i.created_at.to_string());
    match (std::fs::read_to_string(marker(data_dir)).ok(), created) {
        (Some(m), Some(c)) if m.trim() == c => Attach::Attached,
        _ => Attach::Foreign(found),
    }
}

/// Make this database the one that keeps the folder.
pub fn attach(root: &Path, data_dir: &Path) -> Result<()> {
    let info: records::RootInfo = serde_json::from_slice(&std::fs::read(root.join(records::ROOT_FILE))?)?;
    std::fs::create_dir_all(data_dir)?;
    records::write_atomic(&marker(data_dir), info.created_at.to_string().as_bytes())?;
    Ok(())
}

/// Records the office's name in the folder, so the folder can say whose it is.
pub fn set_name(root: &Path, name: &str) {
    let file = root.join(records::ROOT_FILE);
    let Some(mut info) = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice::<records::RootInfo>(&b).ok()) else { return };
    if info.name != name && !name.trim().is_empty() {
        info.name = name.trim().to_string();
        if let Ok(bytes) = serde_json::to_vec_pretty(&info) {
            let _ = records::write_atomic(&file, &bytes);
        }
    }
}

static SAVE: std::sync::OnceLock<tokio::sync::Notify> = std::sync::OnceLock::new();

/// Work was just saved: write it to the records folder now, not on the next cycle.
pub fn request_save() {
    SAVE.get_or_init(tokio::sync::Notify::new).notify_one();
}

/// Waits for a save request (then a short pause so a burst of edits is one write) or for
/// the periodic reconciliation, whichever comes first.
pub async fn wait_for_save(period: std::time::Duration) {
    let n = SAVE.get_or_init(tokio::sync::Notify::new);
    tokio::select! {
        _ = n.notified() => tokio::time::sleep(std::time::Duration::from_millis(800)).await,
        _ = tokio::time::sleep(period) => {}
    }
}

// ---------------------------------------------------------------- keys

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect()
}

/// This installation's id (the file `keys.rs` keeps beside the database).
pub fn install_id(data_dir: &Path) -> String {
    std::fs::read_to_string(data_dir.join("install.id")).map(|s| s.trim().to_string()).unwrap_or_default()
}

pub fn seal_with_key(key: &[u8; 32], id: &str, plain: &[u8]) -> Vec<u8> {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = ChaCha20Poly1305::new(key.into())
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plain, aad: id.as_bytes() })
        .expect("sealing does not fail");
    let mut out = Vec::with_capacity(SEALED_MAGIC.len() + 12 + ct.len());
    out.extend_from_slice(SEALED_MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    out
}

pub fn open_with_key(key: &[u8; 32], id: &str, sealed: &[u8]) -> Option<Vec<u8>> {
    if sealed.len() < SEALED_MAGIC.len() + 12 + 16 || &sealed[..SEALED_MAGIC.len()] != SEALED_MAGIC {
        return None;
    }
    let nonce = &sealed[SEALED_MAGIC.len()..SEALED_MAGIC.len() + 12];
    ChaCha20Poly1305::new(key.into())
        .decrypt(Nonce::from_slice(nonce), Payload { msg: &sealed[SEALED_MAGIC.len() + 12..], aad: id.as_bytes() })
        .ok()
}

/// Finds or makes the records key for a directory, so this computer can open it.
/// `institution` is the institution's recovery public key when this computer has
/// one; with it, the key is also wrapped so the recovery phrase can open it.
pub fn open_keys(root: &Path, institution_name: &str, data_dir: &Path, institution: Option<&PublicKey>) -> Result<[u8; 32]> {
    let mut info = records::init_root(root, institution_name, chrono::Utc::now().timestamp_millis())?;
    let me = install_id(data_dir);
    let mut keys = info.keys.clone().unwrap_or_default();

    let mut rk: Option<[u8; 32]> = None;
    if let Some(wrapped) = keys.computers.get(&me).and_then(|h| unhex(h)) {
        if let Ok(plain) = vault::open_bytes("records-key", &wrapped) {
            rk = plain.try_into().ok();
        }
    }
    let rk = match rk {
        Some(k) => k,
        None if keys.computers.is_empty() && keys.institution.is_none() => {
            let mut k = [0u8; 32];
            OsRng.fill_bytes(&mut k);
            k
        }
        // Another computer or installation made this directory: its key must come from the phrase.
        None => {
            return Err(Error::Locked(
                "This records folder was made by another installation. Enter the institution's recovery phrase to open it.".into(),
            ))
        }
    };

    let mut changed = false;
    if !keys.computers.contains_key(&me) {
        let sealed = vault::seal_bytes("records-key", &rk).map_err(|_| Error::Other("could not seal the records key".into()))?;
        keys.computers.insert(me, hex(&sealed));
        changed = true;
    }
    if let Some(inst) = institution {
        let fp = backup::fingerprint(inst.as_bytes());
        if keys.institution.is_none() || keys.institution_fingerprint.as_deref() != Some(&fp) {
            keys.institution = Some(backup::seal(inst, &rk, RK_CONTEXT));
            keys.institution_fingerprint = Some(fp);
            changed = true;
        }
    }
    if changed {
        info.keys = Some(keys);
        records::write_atomic(&root.join(records::ROOT_FILE), &serde_json::to_vec_pretty(&info)?)?;
    }
    Ok(rk)
}

/// `replace` names singleton tables (the station's own profile and sign-in policy) that a restore into a
/// not-yet-set-up database must take from the folder instead of keeping its defaults.
/// Opens the records key with the institution's recovery phrase and makes this
/// computer able to open the directory from now on.
pub fn unlock_with_phrase(root: &Path, data_dir: &Path, phrase: &str) -> Result<[u8; 32]> {
    let info = records::init_root(root, "", 0)?;
    let keys = info.keys.clone().unwrap_or_default();
    let sealed = keys.institution.as_deref().ok_or_else(|| Error::Locked("This records folder was never locked to a recovery phrase.".into()))?;
    let entropy = backup::read_recovery_phrase(phrase).map_err(|e| Error::Locked(e.to_string()))?;
    let secret = backup::institution_key(&entropy);
    let plain = backup::open_seal(&secret, sealed, RK_CONTEXT).map_err(|_| Error::Locked("That recovery phrase does not open these records.".into()))?;
    let rk: [u8; 32] = plain.try_into().map_err(|_| Error::Other("the records key is damaged".into()))?;
    let mut info = info;
    let mut keys = keys;
    let sealed_here = vault::seal_bytes("records-key", &rk).map_err(|_| Error::Other("could not seal the records key".into()))?;
    keys.computers.insert(install_id(data_dir), hex(&sealed_here));
    info.keys = Some(keys);
    records::write_atomic(&root.join(records::ROOT_FILE), &serde_json::to_vec_pretty(&info)?)?;
    Ok(rk)
}

// ---------------------------------------------------------------- rows

fn q(name: &str) -> String {
    format!("\"{}\"", name.replace('"', ""))
}

async fn table_names(pool: &SqlitePool) -> Result<Vec<String>> {
    let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sqlx%' ESCAPE '\\' ORDER BY name")
        .fetch_all(pool)
        .await?;
    Ok(rows.iter().map(|r| r.get::<String, _>(0)).collect())
}

async fn columns(pool: &SqlitePool, table: &str) -> Result<Vec<String>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!("PRAGMA table_info({})", q(table)))).fetch_all(pool).await?;
    Ok(rows.iter().map(|r| r.get::<String, _>("name")).collect())
}

fn row_json(row: &sqlx::sqlite::SqliteRow, redact: &[&str]) -> RowMap {
    let mut m = Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        let name = col.name().to_string();
        if redact.contains(&name.as_str()) {
            m.insert(name, Value::Null);
            continue;
        }
        let kind = match row.try_get_raw(i) {
            Ok(raw) if raw.is_null() => "NULL".to_string(),
            Ok(raw) => raw.type_info().name().to_string(),
            Err(_) => "NULL".to_string(),
        };
        let v = match kind.as_str() {
            "NULL" => Value::Null,
            "INTEGER" | "BOOLEAN" | "INT8" => row.try_get::<i64, _>(i).map(Value::from).unwrap_or(Value::Null),
            "REAL" | "NUMERIC" => row.try_get::<f64, _>(i).map(Value::from).unwrap_or(Value::Null),
            "BLOB" => row.try_get::<Vec<u8>, _>(i).map(|b| json!({ "$hex": hex(&b) })).unwrap_or(Value::Null),
            _ => row.try_get::<String, _>(i).map(Value::from).unwrap_or(Value::Null),
        };
        m.insert(name, v);
    }
    m
}

async fn load_rows(pool: &SqlitePool, table: &str, redact: &[&str]) -> Result<Vec<RowMap>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT * FROM {} ORDER BY rowid", q(table)))).fetch_all(pool).await;
    // A table WITHOUT ROWID has no rowid: read it unordered rather than fail.
    let rows = match rows {
        Ok(r) => r,
        Err(_) => sqlx::query(sqlx::AssertSqlSafe(format!("SELECT * FROM {}", q(table)))).fetch_all(pool).await?,
    };
    Ok(rows.iter().map(|r| row_json(r, redact)).collect())
}

fn text(row: &RowMap, col: &str) -> Option<String> {
    match row.get(col) {
        Some(Value::String(s)) if !s.is_empty() => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

// ---------------------------------------------------------------- sync

struct Build {
    root_idx: usize,
    id: String,
    reference: String,
    title: String,
    restricted: bool,
    tables: BTreeMap<String, Vec<RowMap>>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub records: usize,
    pub written: usize,
    pub unchanged: usize,
    pub attachments_sealed: usize,
    /// Attachments whose file is not in the vault (the database knows it; the disk does not).
    pub attachments_missing: Vec<String>,
    pub attachments_too_large: Vec<String>,
    /// True when the records key is also wrapped for the institution's recovery phrase.
    pub recoverable_by_phrase: bool,
}

fn max_time(rows: &[RowMap]) -> i64 {
    rows.iter()
        .flat_map(|r| r.iter())
        .filter(|(k, _)| k.ends_with("_at"))
        .filter_map(|(_, v)| v.as_i64())
        .max()
        .unwrap_or(0)
}

/// Writes what changed. Never deletes: a record that left the database stays in the
/// directory (the institution's work is not removed by a screen's delete button).
pub async fn sync(
    pool: &SqlitePool,
    vault_root: &Path,
    records_root: &Path,
    data_dir: &Path,
    layout: &Layout,
    institution: Option<&PublicKey>,
) -> Result<SyncReport> {
    match attach_state(records_root, data_dir) {
        Attach::Foreign(_) => return Err(Error::NotAttached),
        Attach::Empty | Attach::Attached => {}
    }
    let rk = open_keys(records_root, layout.institution, data_dir, institution)?;
    attach(records_root, data_dir)?;
    let mut report = SyncReport { recoverable_by_phrase: institution.is_some(), ..Default::default() };

    let tables = table_names(pool).await?;
    let mut data: BTreeMap<String, Vec<RowMap>> = BTreeMap::new();
    for t in &tables {
        if layout.excluded.contains(&t.as_str()) {
            continue;
        }
        data.insert(t.clone(), load_rows(pool, t, layout.redact_cols).await?);
    }

    // Main records first.
    let mut builds: HashMap<String, Build> = HashMap::new(); // key: id
    let mut owner_of: HashMap<String, String> = HashMap::new(); // any row id -> record id
    for (idx, root) in layout.roots.iter().enumerate() {
        for row in data.get(root.table).cloned().unwrap_or_default() {
            let Some(id) = text(&row, "id") else { continue };
            let reference = root.reference_cols.iter().find_map(|c| text(&row, c)).unwrap_or_default();
            let title = root.title_cols.iter().filter_map(|c| text(&row, c)).collect::<Vec<_>>().join(" ");
            let restricted = root.restricted_col.map(|c| row.get(c).and_then(Value::as_i64).unwrap_or(0) == 1).unwrap_or(false);
            let mut tables = BTreeMap::new();
            tables.insert(root.table.to_string(), vec![row]);
            owner_of.insert(id.clone(), id.clone());
            builds.insert(id.clone(), Build { root_idx: idx, id, reference, title, restricted, tables });
        }
    }

    // Every other row belongs to the record its *_id columns lead to; the earliest
    // root wins (a statement with a case and a person belongs to the case).
    let root_tables: Vec<&str> = layout.roots.iter().map(|r| r.table).collect();
    let mut pending: Vec<(String, RowMap)> = Vec::new();
    for (t, rows) in &data {
        if root_tables.contains(&t.as_str()) {
            continue;
        }
        for row in rows {
            pending.push((t.clone(), row.clone()));
        }
    }
    let mut stationed: Vec<(String, RowMap)> = Vec::new();
    for _ in 0..5 {
        let mut next = Vec::new();
        for (t, row) in pending {
            if layout.station_only.contains(&t.as_str()) {
                stationed.push((t, row));
                continue;
            }
            let mut best: Option<(usize, String)> = None;
            for (k, v) in &row {
                if !(k.ends_with("_id") || k == "entity_id") {
                    continue;
                }
                if let Value::String(s) = v {
                    if let Some(owner) = owner_of.get(s) {
                        let idx = builds[owner].root_idx;
                        if best.as_ref().map(|(b, _)| idx < *b).unwrap_or(true) {
                            best = Some((idx, owner.clone()));
                        }
                    }
                }
            }
            match best {
                Some((_, owner)) => {
                    if let Some(id) = text(&row, "id") {
                        owner_of.insert(id, owner.clone());
                    }
                    builds.get_mut(&owner).expect("owner exists").tables.entry(t).or_default().push(row);
                }
                None => next.push((t, row)),
            }
        }
        pending = next;
    }
    stationed.extend(pending);
    let mut station: BTreeMap<String, Vec<RowMap>> = BTreeMap::new();
    for (t, row) in stationed {
        station.entry(t).or_default().push(row);
    }

    let located = records::locate(records_root);

    // Station-wide tables: one record each, by table.
    let mut work: Vec<(String, String, String, String, bool, BTreeMap<String, Vec<RowMap>>, usize)> = Vec::new();
    for (t, rows) in station {
        let mut tables = BTreeMap::new();
        tables.insert(t.clone(), rows);
        work.push((format!("station-{t}"), "station".into(), String::new(), label(&t), false, tables, usize::MAX));
    }
    for b in builds.into_values() {
        let kind = layout.roots[b.root_idx].kind.to_string();
        work.push((b.id, kind, b.reference, b.title, b.restricted, b.tables, b.root_idx));
    }
    work.sort_by(|a, b| a.0.cmp(&b.0));

    for (id, kind, reference, title, restricted, tables, root_idx) in work {
        report.records += 1;
        let updated_at = tables.values().map(|r| max_time(r)).max().unwrap_or(0);
        let content = json!({ "format": FORMAT_VERSION, "id": id, "kind": kind, "tables": tables });
        let plain = serde_json::to_vec(&content)?;

        // Attachments follow the record.
        let mut files: Vec<RecordFile> = Vec::new();
        let mut attach_hash = String::new();
        let existing = located.get(&id).cloned();
        let manifest = existing.as_deref().and_then(|f| records::read_manifest(f).ok().flatten());
        if let Some(rows) = tables.get("attachments") {
            for a in rows {
                let (Some(aid), Some(stored)) = (text(a, "id"), text(a, "stored_path")) else { continue };
                let name = text(a, "file_name").unwrap_or_else(|| aid.clone());
                let rel = attachment_path(&aid, &name, restricted);
                attach_hash.push_str(&aid);
                let have = manifest.as_ref().map(|m| m.files.iter().any(|e| e.path == rel)).unwrap_or(false)
                    && existing.as_deref().map(|f| f.join(&rel).is_file()).unwrap_or(false);
                if have {
                    continue;
                }
                let path = vault_root.join(&stored);
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                if !path.is_file() {
                    report.attachments_missing.push(name);
                    continue;
                }
                if size > MAX_SEALED_ATTACHMENT {
                    report.attachments_too_large.push(name);
                    continue;
                }
                match vault::read(vault_root, &stored, &aid) {
                    Ok(bytes) => {
                        files.push(RecordFile { path: rel, bytes: seal_with_key(&rk, &aid, &bytes), sealed: true });
                        report.attachments_sealed += 1;
                    }
                    Err(_) => report.attachments_missing.push(name),
                }
            }
        }

        let content_hash = records::sha256_hex(&[RENDER_VERSION.as_bytes(), plain.as_slice(), attach_hash.as_bytes()].concat());
        let unchanged = existing
            .as_deref()
            .and_then(|f| std::fs::read(f.join(records::RECORD_FILE)).ok())
            .and_then(|b| serde_json::from_slice::<RecordHeader>(&b).ok())
            .map(|h| h.content_hash == content_hash)
            .unwrap_or(false)
            && files.is_empty();
        if unchanged {
            report.unchanged += 1;
            continue;
        }

        // Saved work replaces the record's current state. What it replaces is kept, sealed, as a
        // version, so a correction, a removed draft or an amendment never destroys its history.
        if let Some(old) = existing.as_deref().and_then(|f| std::fs::read(f.join(DATA_FILE)).ok()) {
            let name = format!("versions/{}.sealed", chrono::Utc::now().timestamp_millis());
            files.push(RecordFile { path: name, bytes: old, sealed: true });
        }
        files.push(RecordFile { path: DATA_FILE.into(), bytes: seal_with_key(&rk, &id, &plain), sealed: true });
        let md = if restricted {
            format!("# {}\n\nThis record is restricted. Open it in Pleadli to read it.\n", if reference.is_empty() { &title } else { &reference })
        } else if root_idx == usize::MAX {
            format!("# {title}\n\nStation records. Open in Pleadli to read them.\n")
        } else {
            let root = &layout.roots[root_idx];
            let skip: Vec<&str> = root.title_cols.iter().chain(root.reference_cols.iter()).chain(layout.hidden_cols.iter()).copied().collect();
            render_markdown(&reference, &title, &tables, layout.open_tables, &skip)
        };
        files.push(RecordFile { path: MD_FILE.into(), bytes: md.into_bytes(), sealed: false });

        let header = RecordHeader {
            format_version: FORMAT_VERSION,
            id: id.clone(),
            kind,
            reference,
            title,
            updated_at,
            content_hash,
        };
        records::write_record(records_root, existing.as_deref(), &header, &files)?;
        report.written += 1;
    }
    Ok(report)
}

fn attachment_path(id: &str, name: &str, restricted: bool) -> String {
    let short: String = id.chars().filter(|c| c.is_ascii_alphanumeric()).take(8).collect();
    if restricted {
        return format!("attachments/{short}.sealed");
    }
    let clean: String = name.chars().map(|c| if c.is_control() || "/\\:*?\"<>|".contains(c) { '-' } else { c }).take(80).collect();
    format!("attachments/{} [{short}].sealed", clean.trim())
}

fn rich_to_plain(raw: &str) -> Option<String> {
    let v: Value = serde_json::from_str(raw).ok()?;
    if v.get("type")?.as_str()? != "doc" {
        return None;
    }
    fn walk(n: &Value, out: &mut String) {
        if let Some(t) = n.get("text").and_then(Value::as_str) {
            out.push_str(t);
        }
        if let Some(c) = n.get("content").and_then(Value::as_array) {
            for ch in c {
                walk(ch, out);
            }
            if matches!(n.get("type").and_then(Value::as_str), Some("paragraph" | "heading")) {
                out.push('\n');
            }
        }
    }
    let mut s = String::new();
    walk(&v, &mut s);
    Some(s.trim().to_string())
}

fn label(key: &str) -> String {
    let mut out = String::new();
    for (i, ch) in key.replace('_', " ").chars().enumerate() {
        if i == 0 {
            out.extend(ch.to_uppercase());
        } else {
            out.push(ch);
        }
    }
    out
}

fn shown(key: &str, v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) if s.is_empty() => None,
        Value::String(s) => Some(rich_to_plain(s).unwrap_or_else(|| s.clone())),
        Value::Number(n) => {
            if key.ends_with("_at") {
                                // The institution's own zone, as every other paper in the app shows it.
                n.as_i64().map(crate::timezone::show)
            } else {
                Some(n.to_string())
            }
        }
        _ => None,
    }
}

/// The readable paper of an ordinary record. Only tables the app lists; the rest are
/// counted, never shown, and stay in `data.sealed`.
fn render_markdown(reference: &str, title: &str, tables: &BTreeMap<String, Vec<RowMap>>, open: &[&str], skip: &[&str]) -> String {
    let mut md = if reference.is_empty() { format!("# {title}\n\n") } else { format!("# {reference}\n\n{title}\n\n") };
    let mut sealed_counts = Vec::new();
    for (t, rows) in tables {
        if t == "attachments" {
            md.push_str(&format!("## Attached files\n\n"));
            for r in rows {
                if let Some(n) = text(r, "file_name") {
                    md.push_str(&format!("- {n}\n"));
                }
            }
            md.push('\n');
            continue;
        }
        if !open.contains(&t.as_str()) {
            sealed_counts.push(format!("{} {}", rows.len(), label(t).to_lowercase()));
            continue;
        }
        md.push_str(&format!("## {}\n\n", label(t)));
        for r in rows {
            for (k, v) in r {
                if k == "id" || k.ends_with("_id") || skip.contains(&k.as_str()) {
                    continue;
                }
                if let Some(s) = shown(k, v) {
                    if s.contains('\n') {
                        md.push_str(&format!("**{}:**\n\n{}\n\n", label(k), s));
                    } else {
                        md.push_str(&format!("- **{}:** {}\n", label(k), s));
                    }
                }
            }
            md.push('\n');
        }
    }
    if !sealed_counts.is_empty() {
        md.push_str(&format!("---\nKept sealed, open them in Pleadli: {}.\n", sealed_counts.join(", ")));
    }
    md
}

// ---------------------------------------------------------------- recover

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverReport {
    pub records_found: usize,
    pub rows_restored: usize,
    pub rows_already_there: usize,
    pub attachments_restored: usize,
    /// Records whose sealed data does not open or whose file was changed outside the app: not restored.
    pub skipped: Vec<String>,
    pub conflicts: usize,
}

fn add_value(args: &mut sqlx::sqlite::SqliteArguments, v: &Value) {
    use sqlx::Arguments;
    let _ = match v {
        Value::Null => args.add(None::<i64>),
        Value::Bool(b) => args.add(*b as i64),
        Value::Number(n) => match n.as_i64() {
            Some(i) => args.add(i),
            None => args.add(n.as_f64().unwrap_or(0.0)),
        },
        Value::String(s) => args.add(s.clone()),
        Value::Object(o) if o.contains_key("$hex") => args.add(o.get("$hex").and_then(Value::as_str).and_then(unhex).unwrap_or_default()),
        other => args.add(other.to_string()),
    };
}

/// Rebuilds the database's rows from the folders. Existing rows are never overwritten,
/// so recovering into a database that has newer work loses nothing.
pub async fn recover(pool: &SqlitePool, vault_root: &Path, records_root: &Path, data_dir: &Path, rk: &[u8; 32], replace: &[&str]) -> Result<RecoverReport> {
    let scan = records::scan(records_root)?;
    let mut report = RecoverReport { conflicts: scan.conflicts.len(), ..Default::default() };

    let known: HashMap<String, Vec<String>> = {
        let mut m = HashMap::new();
        for t in table_names(pool).await? {
            m.insert(t.clone(), columns(pool, &t).await?);
        }
        m
    };
    let mut conn = pool.acquire().await?;
    sqlx::query("PRAGMA foreign_keys = OFF").execute(&mut *conn).await?;

    let mut ordered = scan.records;
    ordered.sort_by(|a, b| a.header.id.cmp(&b.header.id));
    for rec in ordered {
        report.records_found += 1;
        let name = format!("{} {}", rec.header.reference, rec.header.title).trim().to_string();
        if rec.modified.iter().any(|p| p == DATA_FILE) || rec.missing.iter().any(|p| p == DATA_FILE) {
            report.skipped.push(format!("{name}: its sealed data was changed or is missing"));
            continue;
        }
        let Some(sealed) = std::fs::read(rec.folder.join(DATA_FILE)).ok() else {
            report.skipped.push(format!("{name}: no sealed data"));
            continue;
        };
        let Some(plain) = open_with_key(rk, &rec.header.id, &sealed) else {
            report.skipped.push(format!("{name}: the sealed data does not open with this key"));
            continue;
        };
        let content: Value = serde_json::from_slice(&plain)?;
        let Some(tables) = content.get("tables").and_then(Value::as_object) else { continue };

        for (t, rows) in tables {
            let Some(cols) = known.get(t) else { continue };
            for row in rows.as_array().cloned().unwrap_or_default() {
                let Some(obj) = row.as_object() else { continue };
                let use_cols: Vec<&String> = obj.keys().filter(|k| cols.contains(k)).collect();
                if use_cols.is_empty() {
                    continue;
                }
                let sql = format!(
                    "INSERT OR {} INTO {} ({}) VALUES ({})",
                    if replace.contains(&t.as_str()) { "REPLACE" } else { "IGNORE" },
                    q(t),
                    use_cols.iter().map(|c| q(c)).collect::<Vec<_>>().join(","),
                    vec!["?"; use_cols.len()].join(",")
                );
                let mut args = sqlx::sqlite::SqliteArguments::default();
                for c in &use_cols {
                    add_value(&mut args, &obj[*c]);
                }
                let done = sqlx::query_with(sqlx::AssertSqlSafe(sql), args).execute(&mut *conn).await?;
                if done.rows_affected() > 0 {
                    report.rows_restored += 1;
                } else {
                    report.rows_already_there += 1;
                }
            }
            if t == "attachments" {
                for a in rows.as_array().cloned().unwrap_or_default() {
                    let Some(a) = a.as_object() else { continue };
                    let (Some(aid), Some(stored)) = (a.get("id").and_then(Value::as_str), a.get("stored_path").and_then(Value::as_str)) else { continue };
                    if vault_root.join(stored).is_file() {
                        continue;
                    }
                    let restricted = rec.header.kind != "station" && tables_restricted(tables);
                    let name = a.get("file_name").and_then(Value::as_str).unwrap_or(aid);
                    let file = rec.folder.join(attachment_path(aid, name, restricted));
                    let file = if file.is_file() { file } else { rec.folder.join(attachment_path(aid, name, !restricted)) };
                    let Some(bytes) = std::fs::read(&file).ok().and_then(|s| open_with_key(rk, aid, &s)) else {
                        report.skipped.push(format!("{name}: the attached file is missing or does not open"));
                        continue;
                    };
                    if vault::write_at(vault_root, stored, aid, &bytes).is_ok() {
                        report.attachments_restored += 1;
                    }
                }
            }
        }
    }
    sqlx::query("PRAGMA foreign_keys = ON").execute(&mut *conn).await?;
    attach(records_root, data_dir)?;
    Ok(report)
}

fn tables_restricted(tables: &Map<String, Value>) -> bool {
    tables.values().filter_map(Value::as_array).flatten().any(|r| r.get("restricted").and_then(Value::as_i64) == Some(1))
}

/// A quick description of what a directory holds, for a screen: no key needed.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub path: PathBuf,
    pub institution: Option<String>,
    pub records: Vec<OverviewRecord>,
    pub conflicts: usize,
    pub changed_outside: usize,
    pub added_outside: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewRecord {
    pub id: String,
    pub kind: String,
    pub reference: String,
    pub title: String,
    pub updated_at: i64,
    pub folder: PathBuf,
    pub intact: bool,
}

pub fn overview(records_root: &Path) -> Result<Overview> {
    let scan = records::scan(records_root)?;
    let info = std::fs::read(records_root.join(records::ROOT_FILE)).ok().and_then(|b| serde_json::from_slice::<records::RootInfo>(&b).ok());
    let mut changed = 0;
    let mut added = 0;
    let mut recs = Vec::new();
    for r in &scan.records {
        if !r.modified.is_empty() || !r.missing.is_empty() {
            changed += 1;
        }
        added += r.unlisted.len();
        recs.push(OverviewRecord {
            id: r.header.id.clone(),
            kind: r.header.kind.clone(),
            reference: r.header.reference.clone(),
            title: r.header.title.clone(),
            updated_at: r.header.updated_at,
            folder: r.folder.clone(),
            intact: r.is_intact(),
        });
    }
    Ok(Overview { path: records_root.to_path_buf(), institution: info.map(|i| i.institution), records: recs, conflicts: scan.conflicts.len(), changed_outside: changed, added_outside: added })
}


pub use x25519_dalek::PublicKey as InstitutionKey;

/// True when the directory was made under another installation's key: this computer can
/// only open it with the institution's recovery phrase.
pub fn is_locked(records_root: &Path, data_dir: &Path) -> bool {
    let Some(info) = std::fs::read(records_root.join(records::ROOT_FILE)).ok().and_then(|b| serde_json::from_slice::<records::RootInfo>(&b).ok()) else {
        return false;
    };
    match info.keys {
        Some(k) if !k.computers.is_empty() => !k.computers.contains_key(&install_id(data_dir)),
        _ => false,
    }
}

/// The readable paper of one record, for showing in the Library without opening any key.
pub fn read_paper(records_root: &Path, id: &str) -> Option<String> {
    let folder = records::locate(records_root).remove(id)?;
    std::fs::read_to_string(folder.join(MD_FILE)).ok()
}
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    const PHRASE: &str = "000G-40R4-0M30-E209-185G-R38E-1YZ4-BJS6";

    fn scratch() -> PathBuf {
        let p = std::env::temp_dir().join(format!("pleadli-recdb-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    async fn pool_with_schema() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        for ddl in [
            "CREATE TABLE cases (id TEXT PRIMARY KEY, reference TEXT NOT NULL, summary TEXT, restricted INTEGER NOT NULL DEFAULT 0, created_at INTEGER)",
            "CREATE TABLE people (id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT)",
            "CREATE TABLE statements (id TEXT PRIMARY KEY, case_id TEXT, person_id TEXT, content TEXT, created_at INTEGER)",
            "CREATE TABLE exhibits (id TEXT PRIMARY KEY, case_id TEXT, description TEXT)",
            "CREATE TABLE exhibit_movements (id TEXT PRIMARY KEY, exhibit_id TEXT, note TEXT)",
            "CREATE TABLE attachments (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT, file_name TEXT, stored_path TEXT, size_bytes INTEGER)",
            "CREATE TABLE officers (id TEXT PRIMARY KEY, name TEXT, password_hash TEXT)",
            "CREATE TABLE app_sessions (id TEXT PRIMARY KEY, token TEXT)",
        ] {
            sqlx::query(sqlx::AssertSqlSafe(ddl.to_string())).execute(&pool).await.unwrap();
        }
        pool
    }

    fn layout() -> Layout {
        Layout {
            institution: "police",
            roots: vec![
                Root { table: "cases", kind: "cases", reference_cols: &["reference"], title_cols: &["summary"], restricted_col: Some("restricted") },
                Root { table: "people", kind: "people", reference_cols: &[], title_cols: &["first_name", "last_name"], restricted_col: None },
            ],
            excluded: &["app_sessions"],
            station_only: &[],
            open_tables: &["cases", "exhibits"],
            redact_cols: &["password_hash"],
            hidden_cols: &[],
        }
    }

    async fn seed(pool: &SqlitePool, vault_root: &Path) {
        let file = vault::write(vault_root, "att-1", b"%PDF-1.4 the exhibit photograph").unwrap();
        for sql in [
            "INSERT INTO cases VALUES ('c1','CRB 123/2026','Theft of a motorcycle at Kisenyi',0,1000)",
            "INSERT INTO cases VALUES ('c2','CRB 124/2026','Sexual offence, child victim',1,1001)",
            "INSERT INTO people VALUES ('p1','Moses','Kibuuka')",
            "INSERT INTO statements VALUES ('s1','c1','p1','{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"I saw the accused push the motorcycle.\"}]}]}',1002)",
            "INSERT INTO exhibits VALUES ('e1','c1','Red Bajaj Boxer, frame 44')",
            "INSERT INTO exhibit_movements VALUES ('m1','e1','Booked into the exhibits store')",
            "INSERT INTO officers VALUES ('o1','Sgt Auma','$argon2id$secret')",
            "INSERT INTO app_sessions VALUES ('x','TOKEN')",
        ] {
            sqlx::query(sqlx::AssertSqlSafe(sql.to_string())).execute(pool).await.unwrap();
        }
        sqlx::query("INSERT INTO attachments VALUES ('att-1','exhibits','e1','motorcycle.pdf',?,31)").bind(file).execute(pool).await.unwrap();
    }

    fn institution() -> PublicKey {
        let entropy = backup::read_recovery_phrase(PHRASE).unwrap();
        PublicKey::from(&backup::institution_key(&entropy))
    }

    #[tokio::test]
    async fn the_database_can_be_rebuilt_from_the_records_directory_alone() {
        let (data, vault_a, records) = (scratch(), scratch(), scratch());
        let pool = pool_with_schema().await;
        seed(&pool, &vault_a).await;

        let r = sync(&pool, &vault_a, &records, &data, &layout(), Some(&institution())).await.unwrap();
        assert!(r.recoverable_by_phrase);
        assert_eq!(r.attachments_sealed, 1);
        // Nothing changed, so a second pass writes nothing.
        let again = sync(&pool, &vault_a, &records, &data, &layout(), Some(&institution())).await.unwrap();
        assert_eq!(again.written, 0, "{again:?}");

        // The readable paper shows the ordinary case and never the statement, the restricted case or a credential.
        let scan = records::scan(&records).unwrap();
        let c1 = scan.records.iter().find(|x| x.header.id == "c1").unwrap();
        let md = std::fs::read_to_string(c1.folder.join(MD_FILE)).unwrap();
        assert!(md.contains("Theft of a motorcycle") && md.contains("Red Bajaj Boxer"));
        assert!(!md.contains("push the motorcycle") && !md.contains("argon2id"));
        let c2 = scan.records.iter().find(|x| x.header.id == "c2").unwrap();
        let md2 = std::fs::read_to_string(c2.folder.join(MD_FILE)).unwrap();
        assert!(!md2.contains("child victim"));
        for r in &scan.records {
            let all = std::fs::read(r.folder.join(DATA_FILE)).unwrap();
            assert!(!String::from_utf8_lossy(&all).contains("Kibuuka"));
            assert!(r.is_intact());
        }

        // Start again with no database and no vault: only the folder and the phrase.
        let (fresh_data, vault_b) = (scratch(), scratch());
        let rk = unlock_with_phrase(&records, &fresh_data, PHRASE).unwrap();
        let fresh = pool_with_schema().await;
        let rep = recover(&fresh, &vault_b, &records, &fresh_data, &rk, &[]).await.unwrap();
        assert!(rep.skipped.is_empty(), "{rep:?}");
        assert_eq!(rep.attachments_restored, 1);
        for (table, n) in [("cases", 2), ("people", 1), ("statements", 1), ("exhibits", 1), ("exhibit_movements", 1), ("attachments", 1), ("officers", 1)] {
            let got: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}"))).fetch_one(&fresh).await.unwrap();
            assert_eq!(got, n, "{table}");
        }
        let hash: Option<String> = sqlx::query_scalar("SELECT password_hash FROM officers").fetch_one(&fresh).await.unwrap();
        assert_eq!(hash, None, "credentials are never copied");
        let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM app_sessions").fetch_one(&fresh).await.unwrap();
        assert_eq!(sessions, 0);
        assert_eq!(vault::read(&vault_b, "attachments/att-1", "att-1").ok().or_else(|| None), None::<Vec<u8>>);
        let stored: String = sqlx::query_scalar("SELECT stored_path FROM attachments").fetch_one(&fresh).await.unwrap();
        assert_eq!(vault::read(&vault_b, &stored, "att-1").unwrap(), b"%PDF-1.4 the exhibit photograph");

        // Recovering again changes nothing.
        let twice = recover(&fresh, &vault_b, &records, &fresh_data, &rk, &[]).await.unwrap();
        assert_eq!(twice.rows_restored, 0);
    }

    #[tokio::test]
    async fn a_wrong_phrase_and_an_edited_sealed_file_do_not_open_anything() {
        let (data, vault_a, records) = (scratch(), scratch(), scratch());
        let pool = pool_with_schema().await;
        seed(&pool, &vault_a).await;
        sync(&pool, &vault_a, &records, &data, &layout(), Some(&institution())).await.unwrap();
        assert!(unlock_with_phrase(&records, &data, "000G-40R4-0M30-E209-185G-R38E-1YZ4-BJSA").is_err());

        let rk = open_keys(&records, "police", &data, None).unwrap();
        let scan = records::scan(&records).unwrap();
        let c1 = scan.records.iter().find(|x| x.header.id == "c1").unwrap();
        std::fs::write(c1.folder.join(DATA_FILE), b"tampered").unwrap();
        let fresh = pool_with_schema().await;
        let rep = recover(&fresh, &scratch(), &records, &data, &rk, &[]).await.unwrap();
        assert!(rep.skipped.iter().any(|s| s.contains("CRB 123/2026")));
        let cases: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM cases").fetch_one(&fresh).await.unwrap();
        assert_eq!(cases, 1, "only the untouched record came back");
    }
}

#[cfg(test)]
mod keep_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    fn dirs() -> (PathBuf, PathBuf, PathBuf) {
        let t = |p: &str| std::env::temp_dir().join(format!("{p}-{}", uuid::Uuid::new_v4()));
        let d = (t("kd"), t("kv"), t("kr"));
        std::fs::create_dir_all(&d.0).unwrap();
        std::fs::create_dir_all(&d.1).unwrap();
        d
    }
    fn layout() -> Layout {
        Layout { institution: "police", roots: vec![], excluded: &[], station_only: &["audit_log"], open_tables: &[], redact_cols: &[], hidden_cols: &[] }
    }
    async fn make() -> SqlitePool {
        let pool = SqlitePoolOptions::new().max_connections(1).connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE audit_log (id TEXT PRIMARY KEY, what TEXT)").execute(&pool).await.unwrap();
        pool
    }

    /// A database that starts again empty is not allowed to write over a folder it has not restored.
    #[tokio::test]
    async fn a_fresh_database_cannot_write_over_an_institutions_folder_until_it_restores_it() {
        let (data, vault_root, records) = dirs();
        let a = make().await;
        sqlx::query("INSERT INTO audit_log VALUES ('1','opened case'), ('2','took a statement')").execute(&a).await.unwrap();
        sync(&a, &vault_root, &records, &data, &layout(), None).await.unwrap();
        assert!(matches!(attach_state(&records, &data), Attach::Attached));

        // Lost database and data folder: nothing attaches it.
        let (data2, vault2, _) = dirs();
        let b = make().await;
        assert!(matches!(attach_state(&records, &data2), Attach::Foreign(_)));
        assert!(matches!(sync(&b, &vault2, &records, &data2, &layout(), None).await, Err(Error::NotAttached)));
        assert!(discover(&records).is_some());

        // Restoring brings the work back and attaches it; saving then works.
        let rk = open_keys(&records, "police", &data, None).unwrap();
        recover(&b, &vault2, &records, &data2, &rk, &[]).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log").fetch_one(&b).await.unwrap();
        assert_eq!(n, 2);
        sync(&b, &vault2, &records, &data2, &layout(), None).await.unwrap();
    }

    /// A correction or a removed draft replaces the current record, and the earlier state is kept.
    #[tokio::test]
    async fn a_correction_replaces_the_record_and_keeps_the_earlier_version() {
        let (data, vault_root, records) = dirs();
        let a = make().await;
        sqlx::query("INSERT INTO audit_log VALUES ('1','draft'), ('2','kept')").execute(&a).await.unwrap();
        sync(&a, &vault_root, &records, &data, &layout(), None).await.unwrap();
        sqlx::query("DELETE FROM audit_log WHERE id='1'").execute(&a).await.unwrap();
        sync(&a, &vault_root, &records, &data, &layout(), None).await.unwrap();

        let rk = open_keys(&records, "police", &data, None).unwrap();
        let fresh = make().await;
        let (d2, v2, _) = dirs();
        recover(&fresh, &v2, &records, &d2, &rk, &[]).await.unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log").fetch_one(&fresh).await.unwrap();
        assert_eq!(n, 1, "the removed draft is no longer current");
        let rec = &records::scan(&records).unwrap().records[0];
        let versions = std::fs::read_dir(rec.folder.join("versions")).unwrap().count();
        assert_eq!(versions, 1, "the earlier state is kept");
        assert!(rec.is_intact());
    }
}

/// Development builds only: an institution key made from the phrase in PLEADLI_TEST_RECOVERY_PHRASE, so
/// recovery by phrase can be run on a test installation that has no Orchestra account. A release build
/// has no such thing: the institution's key comes only from its own Orchestra account.
#[cfg(debug_assertions)]
pub fn debug_institution_key() -> Option<PublicKey> {
    let phrase = std::env::var("PLEADLI_TEST_RECOVERY_PHRASE").ok()?;
    let entropy = backup::read_recovery_phrase(&phrase).ok()?;
    Some(PublicKey::from(&backup::institution_key(&entropy)))
}
#[cfg(not(debug_assertions))]
pub fn debug_institution_key() -> Option<PublicKey> {
    None
}
