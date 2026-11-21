//! A write to a place the person chose, without letting the web layer pick the place.
//!
//! The web layer used to receive a path from the Save window and hand it back to a command, so any script running
//! in the window could ask a command to write over any file the user can write. Now the Save window is opened by
//! the application itself (`approve` is called with what the person picked), and a command that writes accepts a
//! path only if it was approved, once, in the last few minutes (`take`). A path the person did not choose in a
//! native window is refused.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const LIFETIME: Duration = Duration::from_secs(10 * 60);
const MAX_OPEN: usize = 64;

fn table() -> &'static Mutex<HashMap<PathBuf, Instant>> {
    static TABLE: OnceLock<Mutex<HashMap<PathBuf, Instant>>> = OnceLock::new();
    TABLE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Records a path the person picked in a native Save window.
pub fn approve(path: &Path) {
    let mut grants = table().lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    grants.retain(|_, at| now.duration_since(*at) < LIFETIME);
    if grants.len() >= MAX_OPEN {
        return;
    }
    grants.insert(path.to_path_buf(), now);
}

/// Spends the approval for `path`. Fails when the person did not choose this path in a Save window, when the
/// approval is old, or when it was already used.
pub fn take(path: &str) -> Result<PathBuf, String> {
    let wanted = PathBuf::from(path);
    let mut grants = table().lock().unwrap_or_else(|e| e.into_inner());
    match grants.remove(&wanted) {
        Some(at) if at.elapsed() < LIFETIME => Ok(wanted),
        _ => Err("That place was not chosen in a Save window, so nothing was written.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_chosen_path_is_accepted_and_only_once() {
        let chosen = Path::new("/tmp/grant-test-chosen.pdf");
        assert!(take("/tmp/grant-test-chosen.pdf").is_err());
        approve(chosen);
        assert!(take("/etc/passwd").is_err());
        assert_eq!(take("/tmp/grant-test-chosen.pdf").unwrap(), chosen);
        assert!(take("/tmp/grant-test-chosen.pdf").is_err(), "an approval is spent by its first use");
    }
}
