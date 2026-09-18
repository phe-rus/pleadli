//! A headless Pleadli Prisons node: the same database, domain and API as the
//! desktop app, without a window. The seed of the optional headless facility
//! node (docs/prisons/product-map/04 I.1); for now it runs the node against a
//! data directory and serves the debug loopback API, so the frontend data
//! layer can be exercised end to end without a GUI.
//!
//! Usage: `cargo run --bin node -- <data-dir>`

fn main() {
    let data_dir = match std::env::args().nth(1) {
        Some(dir) => std::path::PathBuf::from(dir),
        None => {
            eprintln!("usage: node <data-dir>");
            std::process::exit(2);
        }
    };
    if let Err(e) = prisons_lib::run_headless(data_dir) {
        eprintln!("node stopped: {e}");
        std::process::exit(1);
    }
}
