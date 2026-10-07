//! Which office programs this computer has, so a paper can be handed to the
//! one the person already works in: Microsoft Word or Excel where Office is
//! installed, LibreOffice where it is not. Read from the system each time it
//! is asked; nothing is stored.

use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeApps {
    /// "windows", "macos" or "linux".
    pub os: &'static str,
    pub word: bool,
    pub excel: bool,
    pub libre_office: bool,
}

#[cfg(target_os = "windows")]
fn registered(exe: &str) -> bool {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    // Office registers its programs under App Paths, for the machine or the user.
    ["HKLM", "HKCU"].iter().any(|hive| {
        std::process::Command::new("reg")
            .args(["query", &format!(r"{hive}\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{exe}")])
            .creation_flags(NO_WINDOW)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

#[cfg(target_os = "windows")]
pub fn detect() -> OfficeApps {
    let libre = registered("soffice.exe")
        || Path::new(r"C:\Program Files\LibreOffice\program\soffice.exe").exists()
        || Path::new(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe").exists();
    OfficeApps { os: "windows", word: registered("Winword.exe"), excel: registered("excel.exe"), libre_office: libre }
}

#[cfg(target_os = "macos")]
pub fn detect() -> OfficeApps {
    OfficeApps {
        os: "macos",
        word: Path::new("/Applications/Microsoft Word.app").exists(),
        excel: Path::new("/Applications/Microsoft Excel.app").exists(),
        libre_office: Path::new("/Applications/LibreOffice.app").exists(),
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn detect() -> OfficeApps {
    let on_path = |name: &str| {
        std::env::var_os("PATH").is_some_and(|paths| std::env::split_paths(&paths).any(|dir| dir.join(name).exists()))
    };
    OfficeApps { os: "linux", word: false, excel: false, libre_office: on_path("soffice") || on_path("libreoffice") || Path::new("/usr/lib/libreoffice").exists() }
}

#[cfg(test)]
mod tests {
    #[test]
    fn detect_answers_without_failing() {
        let apps = super::detect();
        assert!(["windows", "macos", "linux"].contains(&apps.os));
    }
}
