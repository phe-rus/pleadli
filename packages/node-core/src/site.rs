//! Which Pleadli server this build is for, in one place.
//!
//! A release build talks to pleadli.com. A debug build (what `tauri dev` and
//! `cargo test` make) talks to the local development server
//! (`bun run dev` in `www`, port 3000), so working on an app never touches
//! the live site, and a paper printed while developing points at the server
//! that knows its code. `PLEADLI_ORCHESTRA_URL` overrides either, for
//! example to test a debug build against the live site on purpose.

pub const PRODUCTION: &str = "https://pleadli.com";
pub const LOCAL: &str = "http://localhost:3000";
pub const URL_ENV: &str = "PLEADLI_ORCHESTRA_URL";

/// The pure rule, so it is tested without touching the environment.
pub fn choose(override_url: Option<&str>, debug_build: bool) -> String {
    let chosen = override_url.map(str::trim).filter(|u| !u.is_empty()).unwrap_or(if debug_build { LOCAL } else { PRODUCTION });
    chosen.trim_end_matches('/').to_string()
}

/// The server this build talks to, without a trailing slash.
pub fn base() -> String {
    choose(std::env::var(URL_ENV).ok().as_deref(), cfg!(debug_assertions))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_builds_use_the_live_site_and_debug_builds_the_local_one() {
        assert_eq!(choose(None, false), "https://pleadli.com");
        assert_eq!(choose(None, true), "http://localhost:3000");
    }

    #[test]
    fn the_environment_variable_wins_in_both_and_is_tidied() {
        assert_eq!(choose(Some("https://staging.example.test/"), false), "https://staging.example.test");
        assert_eq!(choose(Some(" https://pleadli.com "), true), "https://pleadli.com");
        assert_eq!(choose(Some("   "), true), "http://localhost:3000");
        assert_eq!(choose(Some(""), false), "https://pleadli.com");
    }
}
