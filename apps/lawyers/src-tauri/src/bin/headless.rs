//! `cargo run --bin headless -- <data-dir>`: the API on 127.0.0.1:47921 with no
//! window. Development only; a release build has nothing to run.

#[cfg(debug_assertions)]
#[tokio::main]
async fn main() {
    let dir = std::env::args().nth(1).expect("usage: headless <data-dir>");
    if let Err(e) = lawyers_lib::run_headless(dir.into()).await {
        eprintln!("headless API failed: {e}");
        std::process::exit(1);
    }
}

#[cfg(not(debug_assertions))]
fn main() {}
