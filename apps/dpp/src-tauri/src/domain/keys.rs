//! The keys that protect this node's data at rest. The mechanism is shared
//! (`packages/node-core`); the only thing that is this application's own is
//! the name it keeps its key under in the operating system's keystore.

pub use pleadli_node_core::keys::{protection, Protection};

pub const SERVICE: &str = "com.pleadli.dpp";
