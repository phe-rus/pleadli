//! Builds Pleadli Orchestra's root public key into the apps, once
//! `www/scripts/orchestra-keys.ts init` has made it. Until then there is none,
//! and a release build trusts no licence (ORCHESTRA-API.md, Keys and recovery).
fn main() {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../docs/platform/orchestra-root-public-key.txt");
    // While the file is missing, watch its folder: a missing file would rerun
    // this on every build.
    let watch = if path.exists() { path.clone() } else { path.parent().unwrap().to_path_buf() };
    println!("cargo:rerun-if-changed={}", watch.display());
    if let Ok(text) = std::fs::read_to_string(&path) {
        let key = text.trim();
        if !key.is_empty() {
            println!("cargo:rustc-env=PLEADLI_ORCHESTRA_ROOT={key}");
        }
    }
}
