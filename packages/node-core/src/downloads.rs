//! Saving a finished file (a paper, a table, an export) to the computer's
//! Downloads folder without a Save window. Shared by all five apps so the
//! rules are the same everywhere:
//!
//! * the web layer supplies only a file *name*, never a folder, so it can
//!   never choose where bytes land;
//! * a name that is taken gets "(2)", "(3)" and so on, nothing is overwritten;
//! * the file is created with `create_new`, so two saves at once cannot
//!   write into the same file.
//!
//! A test copy points the folder elsewhere with `PLEADLI_DOWNLOADS_DIR`.

use std::io::Write;
use std::path::{Path, PathBuf};

/// The folder to save into: the test override, else the OS Downloads folder,
/// else `<home>/Downloads`.
pub fn resolve_dir(os_downloads: Option<PathBuf>, home: Option<PathBuf>) -> Result<PathBuf, String> {
    let dir = match std::env::var_os("PLEADLI_DOWNLOADS_DIR") {
        Some(custom) if !custom.is_empty() => PathBuf::from(custom),
        _ => os_downloads
            .or_else(|| home.map(|h| h.join("Downloads")))
            .ok_or_else(|| "This computer has no Downloads folder.".to_string())?,
    };
    std::fs::create_dir_all(&dir).map_err(|_| "The Downloads folder could not be opened.".to_string())?;
    Ok(dir)
}

/// Only the file's own name: no folders, no characters a file system dislikes,
/// no leading or trailing dots, never empty.
pub fn clean_file_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or("file");
    let cleaned: String = last
        .chars()
        .map(|c| if c.is_control() || "<>:\"|?*".contains(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim().to_string();
    let cleaned: String = cleaned.chars().take(120).collect();
    // Windows reserves these names whatever the extension.
    let stem = cleaned.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL"].contains(&stem.as_str())
        || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit());
    if cleaned.is_empty() {
        "file".to_string()
    } else if reserved {
        format!("_{cleaned}")
    } else {
        cleaned
    }
}

/// Writes `bytes` under `file_name` in `dir`, picking a free name, and returns the path used.
pub fn save_unique(dir: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let clean = clean_file_name(file_name);
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (clean.clone(), String::new()),
    };
    for n in 1..=999 {
        let candidate = if n == 1 { dir.join(format!("{stem}{ext}")) } else { dir.join(format!("{stem} ({n}){ext}")) };
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&candidate) {
            Ok(mut file) => {
                file.write_all(bytes)
                    .and_then(|_| file.sync_all())
                    .map_err(|_| "The file could not be saved. Check the free space on this computer.".to_string())?;
                return Ok(candidate);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                return Err("This computer does not allow saving in the Downloads folder.".to_string())
            }
            Err(_) => return Err("The file could not be saved in the Downloads folder.".to_string()),
        }
    }
    Err("Too many files with that name are in the Downloads folder.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pleadli-downloads-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn names_lose_folders_and_bad_characters() {
        assert_eq!(clean_file_name("../../etc/passwd"), "passwd");
        assert_eq!(clean_file_name("C:\\Users\\x\\Statement: 1?.pdf"), "Statement_ 1_.pdf");
        assert_eq!(clean_file_name(""), "file");
        assert_eq!(clean_file_name("..."), "file");
        assert_eq!(clean_file_name("CON.pdf"), "_CON.pdf");
        assert_eq!(clean_file_name("com1.txt"), "_com1.txt");
        assert_eq!(clean_file_name("conference.pdf"), "conference.pdf");
    }

    #[test]
    fn a_taken_name_is_never_overwritten() {
        let dir = scratch("unique");
        let a = save_unique(&dir, "Statement.pdf", b"one").unwrap();
        let b = save_unique(&dir, "Statement.pdf", b"two").unwrap();
        let c = save_unique(&dir, "Statement.pdf", b"three").unwrap();
        assert_eq!(a.file_name().unwrap(), "Statement.pdf");
        assert_eq!(b.file_name().unwrap(), "Statement (2).pdf");
        assert_eq!(c.file_name().unwrap(), "Statement (3).pdf");
        assert_eq!(std::fs::read(&a).unwrap(), b"one");
        assert_eq!(std::fs::read(&b).unwrap(), b"two");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_in_the_name_cannot_escape_the_folder() {
        let dir = scratch("escape");
        let p = save_unique(&dir, "../../outside.txt", b"x").unwrap();
        assert_eq!(p.parent().unwrap(), dir);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
