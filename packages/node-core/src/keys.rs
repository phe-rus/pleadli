//! The keys that protect this node's data at rest (each application's
//! SECURITY.md, decision D14).
//!
//! One 32 byte master key per installation. Two working keys are derived from
//! it by domain separation, so a leak of one purpose does not reveal the other:
//!
//! - the **database key** opens the SQLCipher database (each application's `db.rs`);
//! - the **vault key** seals every attachment file (`vault.rs`).
//!
//! Where the master key lives, best first:
//!
//! 1. the operating system's keystore (Windows Credential Manager, macOS
//!    Keychain, the Secret Service on Linux), under a name that carries this
//!    installation's id. Copying the whole data folder to another machine then
//!    copies nothing that opens it;
//! 2. a key file, `node.key`, in the data folder with owner-only permissions,
//!    used only when there is no keystore to ask (a headless server, a Linux
//!    session without a Secret Service). This defends against a copy of the
//!    database or the vault on its own, and **not** against a copy of the whole
//!    data folder. `Protection` says which one is in force so the settings can
//!    say so honestly instead of implying more.
//!
//! A key file found while a keystore is available is moved into the keystore
//! and destroyed. A key is never invented for a database that is already
//! encrypted: without its key that database cannot be opened, and a fresh key
//! would only hide the fact. That case is `KeyError::Missing`, which the node
//! turns into recovery mode (restore from a backup with its passphrase).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use rand_core::{OsRng, RngCore};
use serde::Serialize;
use sha2::{Digest, Sha256};

const INSTALL_ID_FILE: &str = "install.id";
const KEY_FILE: &str = "node.key";
/// Set to `1` to keep the key in a file even where a keystore exists: for a
/// headless node whose Secret Service would need a person to unlock it.
pub const FILE_ONLY_ENV: &str = "PLEADLI_KEY_FILE_ONLY";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Protection {
    /// The key is held by the operating system's keystore.
    Keystore,
    /// The key is a file beside the data. Weaker: see the module note.
    KeyFile,
}

#[derive(Debug)]
pub enum KeyError {
    /// The database is encrypted and this machine holds no key for it.
    Missing,
    /// The key store or key file exists but cannot be used.
    Unusable(String),
    Io(io::Error),
}

impl std::fmt::Display for KeyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            KeyError::Missing => write!(f, "this machine does not hold the key for the encrypted database"),
            KeyError::Unusable(reason) => write!(f, "the encryption key cannot be used: {reason}"),
            KeyError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<io::Error> for KeyError {
    fn from(e: io::Error) -> Self {
        KeyError::Io(e)
    }
}

#[derive(Clone)]
pub struct Keys {
    db: [u8; 32],
    vault: [u8; 32],
    pub protection: Protection,
}

fn derive(label: &str, master: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(label.as_bytes());
    hasher.update(master);
    hasher.finalize().into()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn unhex32(text: &str) -> Option<[u8; 32]> {
    let text = text.trim();
    if text.len() != 64 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

impl Keys {
    fn from_master(master: [u8; 32], protection: Protection) -> Keys {
        Keys { db: derive("pleadli/db/v1", &master), vault: derive("pleadli/vault/v1", &master), protection }
    }

    /// The value for `PRAGMA key`: a raw 256 bit key, so SQLCipher does no
    /// password stretching of its own (the key is already random).
    pub fn db_pragma(&self) -> String {
        format!("\"x'{}'\"", hex(&self.db))
    }

    pub fn vault(&self) -> &[u8; 32] {
        &self.vault
    }
}

// ---------------------------------------------------------------------
// The keystore, behind two calls
// ---------------------------------------------------------------------

enum Stored {
    Found([u8; 32]),
    /// A keystore answered and holds nothing under this name.
    Absent,
    /// There is no usable keystore on this machine.
    Unavailable,
}

fn entry(service: &str, install_id: &str) -> Result<keyring::Entry, keyring::Error> {
    keyring::Entry::new(service, &format!("node-key-{install_id}"))
}

fn keystore_get(service: &str, install_id: &str) -> Stored {
    let Ok(entry) = entry(service, install_id) else { return Stored::Unavailable };
    match entry.get_password() {
        Ok(text) => match unhex32(&text) {
            Some(key) => Stored::Found(key),
            None => Stored::Unavailable,
        },
        Err(keyring::Error::NoEntry) => Stored::Absent,
        Err(_) => Stored::Unavailable,
    }
}

/// Stores the key and reads it back: a keystore that accepts a write and then
/// forgets it (a locked collection, a session keyring) must not be trusted
/// with the only copy.
fn keystore_put(service: &str, install_id: &str, master: &[u8; 32]) -> bool {
    let Ok(entry) = entry(service, install_id) else { return false };
    if entry.set_password(&hex(master)).is_err() {
        return false;
    }
    matches!(keystore_get(service, install_id), Stored::Found(found) if &found == master)
}

// ---------------------------------------------------------------------
// The key file
// ---------------------------------------------------------------------

fn install_id(data_dir: &Path) -> io::Result<String> {
    let path = data_dir.join(INSTALL_ID_FILE);
    if let Ok(text) = fs::read_to_string(&path) {
        let text = text.trim();
        if !text.is_empty() && text.len() <= 64 && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Ok(text.to_string());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    fs::create_dir_all(data_dir)?;
    fs::write(&path, &id)?;
    Ok(id)
}

fn key_file(data_dir: &Path) -> PathBuf {
    data_dir.join(KEY_FILE)
}

fn write_key_file(data_dir: &Path, master: &[u8; 32]) -> io::Result<()> {
    let path = key_file(data_dir);
    fs::write(&path, hex(master))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

/// `Ok(None)` when there is no key file. A file that is there but is not a key
/// is an error, not an absence: quietly making a new key over it could
/// overwrite the only copy of a real one that was damaged.
fn read_key_file(data_dir: &Path) -> Result<Option<[u8; 32]>, KeyError> {
    let Ok(text) = fs::read_to_string(key_file(data_dir)) else { return Ok(None) };
    unhex32(&text).map(Some).ok_or_else(|| KeyError::Unusable("the key file is damaged".into()))
}

/// Finds this installation's key, or makes one when `may_create` allows. See
/// the module note for the order and for why creation is the caller's call.
///
/// `service` names the application in the operating system's keystore
/// (`com.pleadli.prisons`), so two Pleadli applications on one machine never
/// share or overwrite each other's key.
pub fn open(service: &str, data_dir: &Path, may_create: bool, use_keystore: bool) -> Result<Keys, KeyError> {
    let use_keystore = use_keystore && std::env::var(FILE_ONLY_ENV).map(|v| v != "1").unwrap_or(true);
    let id = install_id(data_dir)?;
    let stored = if use_keystore { keystore_get(service, &id) } else { Stored::Unavailable };
    let file = read_key_file(data_dir)?;

    match (stored, file) {
        (Stored::Found(master), file) => {
            // A key file that is only a stale copy of the keystore's is now a hazard.
            if file.is_some() {
                let _ = crate::vault::shred_file(&key_file(data_dir));
            }
            Ok(Keys::from_master(master, Protection::Keystore))
        }
        (Stored::Absent, Some(master)) => {
            if keystore_put(service, &id, &master) {
                let _ = crate::vault::shred_file(&key_file(data_dir));
                Ok(Keys::from_master(master, Protection::Keystore))
            } else {
                Ok(Keys::from_master(master, Protection::KeyFile))
            }
        }
        (Stored::Unavailable, Some(master)) => Ok(Keys::from_master(master, Protection::KeyFile)),
        (stored, None) => {
            if !may_create {
                return Err(KeyError::Missing);
            }
            let mut master = [0u8; 32];
            OsRng.fill_bytes(&mut master);
            if matches!(stored, Stored::Absent) && keystore_put(service, &id, &master) {
                return Ok(Keys::from_master(master, Protection::Keystore));
            }
            write_key_file(data_dir, &master)?;
            Ok(Keys::from_master(master, Protection::KeyFile))
        }
    }
}

// ---------------------------------------------------------------------
// The process-wide copy
// ---------------------------------------------------------------------

static CURRENT: OnceLock<Keys> = OnceLock::new();

/// Makes `keys` the ones the vault uses. The first call wins, which is what a
/// node needs and what tests that start several nodes in one process rely on.
pub fn install(keys: Keys) {
    let _ = CURRENT.set(keys);
}

/// Tests call domain functions without a startup, so they get a fixed key. The
/// `test-keys` feature is enabled only by an application's dev-dependencies, so
/// a release build never has this path.
#[cfg(any(test, feature = "test-keys"))]
pub fn current() -> &'static Keys {
    CURRENT.get_or_init(|| Keys::from_master([9u8; 32], Protection::KeyFile))
}

#[cfg(not(any(test, feature = "test-keys")))]
pub fn current() -> &'static Keys {
    CURRENT.get().expect("keys::install runs in db::startup before anything reads the vault")
}

/// What the settings say about how this node's data is protected.
pub fn protection() -> Option<Protection> {
    CURRENT.get().map(|keys| keys.protection)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SERVICE: &str = "com.pleadli.node-core-test";

    fn dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-keys-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_new_installation_gets_a_key_file_where_there_is_no_keystore() {
        let d = dir();
        let first = open(SERVICE, &d, true, false).unwrap();
        assert_eq!(first.protection, Protection::KeyFile);
        assert!(key_file(&d).exists());
        let again = open(SERVICE, &d, false, false).unwrap();
        assert_eq!(first.db_pragma(), again.db_pragma(), "the same installation reopens with the same key");
        assert_eq!(first.vault(), again.vault());
    }

    #[test]
    fn a_damaged_key_file_is_an_error_and_is_left_alone() {
        let d = dir();
        fs::write(key_file(&d), "not a key").unwrap();
        assert!(matches!(open(SERVICE, &d, true, false), Err(KeyError::Unusable(_))));
        assert_eq!(fs::read_to_string(key_file(&d)).unwrap(), "not a key", "the file is not overwritten");
    }

    #[test]
    fn the_working_keys_are_different_from_each_other() {
        let keys = Keys::from_master([3u8; 32], Protection::KeyFile);
        assert_ne!(hex(&derive("pleadli/db/v1", &[3u8; 32])), hex(keys.vault()));
        assert!(keys.db_pragma().starts_with("\"x'") && keys.db_pragma().ends_with("'\""));
    }

    #[test]
    fn an_encrypted_database_without_its_key_is_missing_not_re_keyed() {
        let d = dir();
        assert!(matches!(open(SERVICE, &d, false, false), Err(KeyError::Missing)));
        assert!(!key_file(&d).exists(), "nothing was invented");
    }

    #[cfg(unix)]
    #[test]
    fn the_key_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let d = dir();
        open(SERVICE, &d, true, false).unwrap();
        assert_eq!(fs::metadata(key_file(&d)).unwrap().permissions().mode() & 0o777, 0o600);
    }

    /// Talks to this machine's real keystore, so it only runs when asked:
    /// `cargo test -- --ignored keystore`.
    #[test]
    #[ignore]
    fn keystore_round_trip_on_this_machine() {
        let d = dir();
        let first = open(SERVICE, &d, true, true).unwrap();
        assert_eq!(first.protection, Protection::Keystore, "a keystore must be available for this test");
        assert!(!key_file(&d).exists(), "with a keystore there is no key file");
        let again = open(SERVICE, &d, false, true).unwrap();
        assert_eq!(first.db_pragma(), again.db_pragma());

        // A key file left by an older run is moved into the keystore and destroyed.
        let e = entry(SERVICE, &install_id(&d).unwrap()).unwrap();
        e.delete_credential().unwrap();
        write_key_file(&d, &[5u8; 32]).unwrap();
        let moved = open(SERVICE, &d, false, true).unwrap();
        assert_eq!(moved.protection, Protection::Keystore);
        assert!(!key_file(&d).exists());
        e.delete_credential().unwrap();
    }
}
