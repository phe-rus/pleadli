//! The sealed document vault. Shared with every other Pleadli node
//! (`packages/node-core`); re-exported here so the application's own code keeps
//! saying `vault::write`, `vault::read` and so on.

pub use pleadli_node_core::vault::*;
