//! Pleadli Orchestra for Courts: what pleadli_node_core::orchestra needs to
//! know about this application (docs/platform/ORCHESTRA-PLAN.md section 3).
//!
//! What is Courts' own: the vault holds recorded audio, one sealed file per
//! chunk at `recordings/<recording>/<seq>.enc`, sealed under the id
//! `<recording>-<seq>` (domain/recordings.rs). A backup reads each chunk plain
//! by that path; a restore leaves them plain in `vault-incoming` and
//! `seal_restored` seals them again at the same path under this computer's key.

use std::io::{self, Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use pleadli_node_core::orchestra::{App, Orchestra};
use pleadli_node_core::snapshot::Documents;
use pleadli_node_core::vault;
use sqlx::SqlitePool;

/// Papers that leave the court, and the kind /verify names them by. Orders,
/// warrants and judgments carry no code yet; these are their names once they do.
const PAPER_KINDS: &[(&str, &str)] = &[("order", "order"), ("warrant", "warrant"), ("judgment", "judgment")];

/// A Courts backup without these is not a Courts backup.
const REQUIRED_TABLES: &[&str] = &["cases", "sittings"];

/// `recordings/<recording>/<seq>` (no `.enc`) and the id the chunk is sealed under.
fn chunk(name: &str) -> Option<(String, String)> {
    let mut parts = name.split('/');
    let (Some("recordings"), Some(recording), Some(seq), None) = (parts.next(), parts.next(), parts.next(), parts.next()) else { return None };
    let ok = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if !ok(recording) || !seq.chars().all(|c| c.is_ascii_digit()) || seq.is_empty() {
        return None;
    }
    let n: i64 = seq.parse().ok()?;
    Some((format!("recordings/{recording}/{seq}.enc"), format!("{recording}-{n}")))
}

/// Known backup names only. The UUID is also the attachment's sealing id.
fn document(name: &str) -> Option<(String, String)> {
    if let Some(id) = name.strip_prefix("attachments/") {
        let parsed = uuid::Uuid::parse_str(id).ok()?;
        if parsed.to_string() != id { return None; }
        return Some((format!("attachments/{id}.enc"), id.to_string()));
    }
    chunk(name)
}

/// Recorded audio and case attachments in the sealed vault, read plain.
pub struct RecordingVault(pub PathBuf);

impl Documents for RecordingVault {
    fn list(&self) -> io::Result<Vec<String>> {
        let mut names = Vec::new();
        for folder in ["recordings", "attachments"] {
            let dir = self.0.join(folder);
            if !dir.exists() { continue; }
            for file in vault::walk(&dir)? {
                let Ok(rel) = file.strip_prefix(&self.0) else { continue };
                let rel = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
                let Some(name) = rel.strip_suffix(".enc") else { continue };
                if document(name).is_some() { names.push(name.to_string()); }
            }
        }
        names.sort();
        Ok(names)
    }

    fn open(&self, name: &str) -> io::Result<Box<dyn Read + Send>> {
        let (path, id) = document(name).ok_or_else(|| io::Error::other("bad name"))?;
        let bytes = vault::read(&self.0, &path, &id).map_err(|e| io::Error::other(e.to_string()))?;
        Ok(Box::new(Cursor::new(bytes)))
    }
}

/// Seals the restored audio left plain in `incoming` back into the vault at
/// its own path, checks each sealed copy, then destroys the plain file. Runs
/// at every start once the key is open, so an interrupted start finishes later.
pub fn seal_restored(incoming: &Path, vault_root: &Path) -> io::Result<usize> {
    if !incoming.exists() {
        return Ok(0);
    }
    let mut sealed = 0;
    for file in vault::walk(incoming)? {
        let Ok(rel) = file.strip_prefix(incoming) else { continue };
        let name = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
        let (path, id) = document(&name).ok_or_else(|| io::Error::other(format!("Unknown restored file {name}; original retained.")))?;
        let plain = std::fs::read(&file)?;
        vault::write_at(vault_root, &path, &id, &plain).map_err(|e| io::Error::other(e.to_string()))?;
        if vault::read(vault_root, &path, &id).map_err(|e| io::Error::other(e.to_string()))? != plain {
            return Err(io::Error::other(format!("the sealed copy of {name} does not match")));
        }
        vault::shred_file(&file)?;
        sealed += 1;
    }
    // Only remove the empty staging tree after every original was sealed and checked.
    std::fs::remove_dir_all(incoming)?;
    Ok(sealed)
}

pub fn start(pool: SqlitePool, data_dir: PathBuf, vault_root: PathBuf) -> Arc<Orchestra> {
    let app = App {
        application: "courts",
        version: env!("CARGO_PKG_VERSION"),
        keystore_service: super::keys::SERVICE,
        paper_kinds: PAPER_KINDS,
        required_tables: REQUIRED_TABLES,
        latest_migration: crate::db::latest_migration(),
    };
    Orchestra::new(app, pool, data_dir, Arc::new(RecordingVault(vault_root)))
}

#[cfg(test)]
mod tests {
    use super::{chunk, document, seal_restored};

    #[test]
    fn a_chunk_name_gives_its_path_and_sealing_id() {
        assert_eq!(chunk("recordings/rec-1/00000007"), Some(("recordings/rec-1/00000007.enc".into(), "rec-1-7".into())));
        assert_eq!(chunk("recordings/../x/1"), None);
        assert_eq!(chunk("attachments/a"), None);
    }
    #[test]
    fn attachment_backup_names_are_bounded_to_canonical_uuids() {
        let id = "fa260651-5d54-4fd4-b39f-a0a2b36df51f";
        assert_eq!(document(&format!("attachments/{id}")), Some((format!("attachments/{id}.enc"), id.into())));
        assert_eq!(document("attachments/../secret"), None);
        assert_eq!(document("attachments/not-an-id"), None);
    }

    #[test]
    fn unknown_restored_originals_are_retained_for_recovery() {
        let root = std::env::temp_dir().join(format!("courts-unknown-restore-{}", uuid::Uuid::new_v4()));
        let incoming = root.join("incoming");
        std::fs::create_dir_all(&incoming).unwrap();
        let file = incoming.join("unknown-original");
        std::fs::write(&file, b"original retained").unwrap();
        assert!(seal_restored(&incoming, &root.join("vault")).is_err());
        assert_eq!(std::fs::read(&file).unwrap(), b"original retained");
        std::fs::remove_dir_all(root).unwrap();
    }

}
