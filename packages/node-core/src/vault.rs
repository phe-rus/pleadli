//! The document vault at rest (each application's SECURITY.md, decision D14).
//!
//! Every attachment is one file under `<data folder>/vault/attachments/`,
//! named by its attachment id and sealed with ChaCha20-Poly1305 (chunked
//! STREAM construction) under the vault key from `keys.rs`. The name carries
//! nothing about the person or the document, and the database records only
//! the path *relative to the vault*, so the whole data folder can move to
//! another machine (or be restored there) without a path that points at the
//! old one. The file's id is bound into every chunk, so a sealed file copied
//! over another attachment's does not open.
//!
//! Older builds kept plaintext files in the user's Documents folder, in
//! folders named after the person, with absolute paths in the database.
//! `adopt` moves those into the sealed vault at startup, and does the same for
//! plaintext files a restore has just unpacked. A source file is destroyed
//! only after its sealed copy has been read back and matched, and never when
//! that could not be done.

use std::fs;
use std::io::{self, Write};
use std::path::{Component, Path, PathBuf};

use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::{KeyInit, Payload};
use chacha20poly1305::ChaCha20Poly1305;
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

const MAGIC: &[u8; 8] = b"PLVAULT1";
const NONCE_LEN: usize = 7;
const CHUNK: usize = 64 * 1024;
const TAG: usize = 16;
const HEADER: usize = MAGIC.len() + NONCE_LEN;

/// Where plaintext files unpacked by a restore wait to be sealed.
pub const INCOMING_DIR: &str = "vault-incoming";
const ORPHANS: &str = "orphans";

#[derive(Debug)]
pub enum VaultError {
    Io(io::Error),
    /// The file is not a sealed vault file, or is damaged, or is another
    /// attachment's. These cannot be told apart, and that is intended.
    Unreadable,
    /// The database names a path that is not a plain relative path.
    BadPath,
}

impl From<io::Error> for VaultError {
    fn from(e: io::Error) -> Self {
        VaultError::Io(e)
    }
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            VaultError::Io(e) => write!(f, "{e}"),
            VaultError::Unreadable => write!(f, "the document could not be opened from the vault"),
            VaultError::BadPath => write!(f, "the document's stored path is not valid"),
        }
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// The vault-relative path a new attachment is stored at.
pub fn relative_path_for(id: &str) -> String {
    format!("attachments/{id}.enc")
}

/// A stored path is relative when it is a plain path inside the vault. Anything
/// else (an absolute path from an older build) is still to be adopted.
pub fn is_relative(stored: &str) -> bool {
    let path = Path::new(stored);
    !stored.is_empty() && !path.is_absolute() && path.components().all(|c| matches!(c, Component::Normal(_)))
}

fn cipher() -> ChaCha20Poly1305 {
    ChaCha20Poly1305::new(crate::keys::current().vault().into())
}

pub fn seal_bytes(id: &str, plain: &[u8]) -> Result<Vec<u8>, VaultError> {
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    let mut enc = Some(EncryptorBE32::from_aead(cipher(), &nonce.into()));
    let mut out = Vec::with_capacity(HEADER + plain.len() + TAG * (plain.len() / CHUNK + 1));
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);

    let aad = id.as_bytes();
    let chunks: Vec<&[u8]> = if plain.is_empty() { vec![&[][..]] } else { plain.chunks(CHUNK).collect() };
    let last = chunks.len() - 1;
    for (i, chunk) in chunks.into_iter().enumerate() {
        let payload = Payload { msg: chunk, aad };
        if i == last {
            let sealed = enc.take().expect("the last chunk is sealed once").encrypt_last(payload).map_err(|_| VaultError::Unreadable)?;
            out.extend_from_slice(&sealed);
        } else {
            let sealed = enc.as_mut().expect("still sealing").encrypt_next(payload).map_err(|_| VaultError::Unreadable)?;
            out.extend_from_slice(&sealed);
        }
    }
    Ok(out)
}

pub fn open_bytes(id: &str, sealed: &[u8]) -> Result<Vec<u8>, VaultError> {
    if sealed.len() < HEADER + TAG || &sealed[..MAGIC.len()] != MAGIC {
        return Err(VaultError::Unreadable);
    }
    let nonce: [u8; NONCE_LEN] = sealed[MAGIC.len()..HEADER].try_into().map_err(|_| VaultError::Unreadable)?;
    let mut dec = Some(DecryptorBE32::from_aead(cipher(), &nonce.into()));
    let aad = id.as_bytes();
    let frames: Vec<&[u8]> = sealed[HEADER..].chunks(CHUNK + TAG).collect();
    let last = frames.len() - 1;
    let mut out = Vec::with_capacity(sealed.len());
    for (i, frame) in frames.into_iter().enumerate() {
        let payload = Payload { msg: frame, aad };
        let plain = if i == last {
            dec.take().ok_or(VaultError::Unreadable)?.decrypt_last(payload)
        } else {
            dec.as_mut().ok_or(VaultError::Unreadable)?.decrypt_next(payload)
        };
        out.extend_from_slice(&plain.map_err(|_| VaultError::Unreadable)?);
    }
    Ok(out)
}

fn resolve(vault_root: &Path, stored: &str) -> Result<PathBuf, VaultError> {
    if !is_relative(stored) {
        return Err(VaultError::BadPath);
    }
    Ok(vault_root.join(stored))
}

/// Seals `plain` into the vault for attachment `id` and returns the relative
/// path to record. Written beside its destination and renamed, so a crash
/// never leaves half a file under the real name.
pub fn write(vault_root: &Path, id: &str, plain: &[u8]) -> Result<String, VaultError> {
    let relative = relative_path_for(id);
    write_at(vault_root, &relative, id, plain)?;
    Ok(relative)
}

pub fn write_at(vault_root: &Path, relative: &str, id: &str, plain: &[u8]) -> Result<(), VaultError> {
    let target = resolve(vault_root, relative)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let sealed = seal_bytes(id, plain)?;
    let partial = target.with_extension("enc.partial");
    let mut file = fs::File::create(&partial)?;
    file.write_all(&sealed)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&partial, &target)?;
    Ok(())
}

/// Reads and opens the file at `stored` (relative to the vault) for `id`.
pub fn read(vault_root: &Path, stored: &str, id: &str) -> Result<Vec<u8>, VaultError> {
    open_bytes(id, &fs::read(resolve(vault_root, stored)?)?)
}

/// Overwrites a file with zeros, flushes it, and removes it. Best effort: on
/// flash storage or a journalling file system the old blocks can survive, so
/// this narrows the exposure and does not remove it (each application's SECURITY.md).
pub fn shred_file(path: &Path) -> io::Result<()> {
    let Ok(meta) = fs::metadata(path) else { return Ok(()) };
    if meta.is_file() {
        if let Ok(mut file) = fs::OpenOptions::new().write(true).open(path) {
            let zeros = vec![0u8; 64 * 1024];
            let mut left = meta.len();
            while left > 0 {
                let n = left.min(zeros.len() as u64) as usize;
                if file.write_all(&zeros[..n]).is_err() {
                    break;
                }
                left -= n as u64;
            }
            let _ = file.sync_all();
        }
    }
    fs::remove_file(path)
}

pub fn walk(root: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !root.exists() {
        return Ok(files);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let kind = entry.file_type()?;
            if kind.is_dir() {
                stack.push(entry.path());
            } else if kind.is_file() {
                files.push(entry.path());
            }
        }
    }
    files.sort();
    Ok(files)
}

/// Removes directories left empty by moving files out of them, from the
/// deepest up, never removing `root` itself.
fn prune_empty(root: &Path) {
    let mut dirs = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        if let Ok(read) = fs::read_dir(&dir) {
            for entry in read.flatten() {
                if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    stack.push(entry.path());
                    dirs.push(entry.path());
                }
            }
        }
    }
    dirs.sort_by_key(|d| std::cmp::Reverse(d.components().count()));
    for dir in dirs {
        let _ = fs::remove_dir(&dir);
    }
}

/// The attachment id a plaintext file was stored under: its name up to the
/// first dot. Older builds named files `<id>.<extension>` and the restore
/// archive names them `<id>`.
fn id_of(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    Some(name.split('.').next()?.to_string()).filter(|id| !id.is_empty())
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Adopted {
    /// Documents moved into the vault from an absolute path or a restore.
    pub sealed: usize,
    /// Documents whose file could not be found. Their rows are left as they
    /// were so the gap is visible, not papered over.
    pub missing: usize,
    /// Plaintext files that belonged to no document, sealed under `orphans/`.
    pub orphans: usize,
}

/// Brings every document into the sealed vault. See the module note.
///
/// `legacy_dirs` are the folders older builds kept documents in. They are the
/// user's own space (Documents), so a file there is touched only when a
/// document in the database claims it by id. `incoming` is the directory a
/// restore unpacks into, which is ours: everything in it is sealed, and a file
/// no document claims is kept under `orphans/`.
pub async fn adopt(pool: &SqlitePool, vault_root: &Path, legacy_dirs: &[PathBuf], incoming: &Path) -> Result<Adopted, VaultError> {
    let mut report = Adopted::default();

    let mut candidates: std::collections::HashMap<String, PathBuf> = std::collections::HashMap::new();
    let mut incoming_ids = std::collections::HashSet::new();
    for file in walk(incoming)? {
        if let Some(id) = id_of(&file) {
            incoming_ids.insert(id.clone());
            candidates.entry(id).or_insert(file);
        }
    }
    for dir in legacy_dirs {
        for file in walk(dir)? {
            if let Some(id) = id_of(&file) {
                candidates.entry(id).or_insert(file);
            }
        }
    }

    let rows: Vec<(String, String)> = sqlx::query_as("SELECT id, stored_path FROM attachments").fetch_all(pool).await.map_err(|e| VaultError::Io(io::Error::other(e)))?;
    let mut known = std::collections::HashSet::new();
    for (id, stored) in rows {
        known.insert(id.clone());
        let already_sealed = is_relative(&stored) && vault_root.join(&stored).exists();
        if already_sealed {
            if let Some(source) = candidates.get(&id).filter(|p| !p.starts_with(vault_root)) {
                // A plaintext duplicate of a document that is already sealed.
                if sealed_matches(vault_root, &stored, &id, &fs::read(source)?) {
                    shred_file(source)?;
                }
            }
            continue;
        }
        let source = if !is_relative(&stored) && Path::new(&stored).is_file() { Some(PathBuf::from(&stored)) } else { candidates.get(&id).cloned() };
        let Some(source) = source else {
            report.missing += 1;
            continue;
        };
        let plain = fs::read(&source)?;
        let relative = write(vault_root, &id, &plain)?;
        if !sealed_matches(vault_root, &relative, &id, &plain) {
            // Do not touch the source: the sealed copy is not proven.
            return Err(VaultError::Unreadable);
        }
        sqlx::query("UPDATE attachments SET stored_path = ?, content_sha256 = ? WHERE id = ?")
            .bind(&relative)
            .bind(sha256_hex(&plain))
            .bind(&id)
            .execute(pool)
            .await
            .map_err(|e| VaultError::Io(io::Error::other(e)))?;
        shred_file(&source)?;
        report.sealed += 1;
    }

    // Restored plaintext that no document claims: keep it, sealed.
    for (id, source) in candidates {
        if known.contains(&id) || !incoming_ids.contains(&id) || !source.exists() || !source.starts_with(incoming) {
            continue;
        }
        let name = source.file_name().and_then(|n| n.to_str()).unwrap_or("file").to_string();
        let plain = fs::read(&source)?;
        let relative = format!("{ORPHANS}/{}.enc", name.replace(['/', '\\'], "_"));
        write_at(vault_root, &relative, &id, &plain)?;
        if sealed_matches(vault_root, &relative, &id, &plain) {
            shred_file(&source)?;
            report.orphans += 1;
        }
    }

    prune_empty(incoming);
    for dir in legacy_dirs {
        prune_empty(dir);
    }
    Ok(report)
}

fn sealed_matches(vault_root: &Path, stored: &str, id: &str, plain: &[u8]) -> bool {
    read(vault_root, stored, id).map(|back| back == plain).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-vault-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_sealed_file_opens_only_as_the_attachment_it_was_sealed_for() {
        let plain = b"a sealed court document".to_vec();
        let sealed = seal_bytes("att-1", &plain).unwrap();
        assert!(!sealed.windows(plain.len()).any(|w| w == &plain[..]), "the content is not readable in the file");
        assert_eq!(open_bytes("att-1", &sealed).unwrap(), plain);
        assert!(open_bytes("att-2", &sealed).is_err(), "another attachment's id does not open it");
        let mut damaged = sealed.clone();
        *damaged.last_mut().unwrap() ^= 1;
        assert!(open_bytes("att-1", &damaged).is_err(), "a damaged file is refused, not half read");
    }

    #[test]
    fn empty_small_exact_and_multi_chunk_files_round_trip() {
        for len in [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, 3 * CHUNK, 3 * CHUNK + 17] {
            let plain: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            assert_eq!(open_bytes("x", &seal_bytes("x", &plain).unwrap()).unwrap(), plain, "length {len}");
        }
    }

    #[test]
    fn the_stored_path_is_relative_and_never_escapes_the_vault() {
        assert!(is_relative("attachments/abc.enc"));
        assert!(!is_relative("/home/x/Documents/Pleadli/files/R1/a.pdf"));
        assert!(!is_relative("../outside.enc"));
        assert!(!is_relative("attachments/../../x"));
        assert!(!is_relative(""));
        assert!(matches!(resolve(Path::new("/v"), "../x"), Err(VaultError::BadPath)));
    }

    #[test]
    fn writing_names_the_file_by_id_only() {
        let root = dir();
        let relative = write(&root, "11111111-2222", b"scan").unwrap();
        assert_eq!(relative, "attachments/11111111-2222.enc");
        assert_eq!(read(&root, &relative, "11111111-2222").unwrap(), b"scan");
        let names: Vec<String> = walk(&root).unwrap().iter().map(|p| p.file_name().unwrap().to_string_lossy().to_string()).collect();
        assert_eq!(names, ["11111111-2222.enc"]);
    }

    #[test]
    fn shredding_removes_the_file() {
        let root = dir();
        let file = root.join("plain.txt");
        fs::write(&file, b"secret").unwrap();
        shred_file(&file).unwrap();
        assert!(!file.exists());
        shred_file(&file).unwrap();
    }
}
