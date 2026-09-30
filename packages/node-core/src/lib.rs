//! What every Pleadli node needs to keep its data safe at rest, shared so a fix
//! to it is made once: the keys (`keys`) and the sealed document vault
//! (`vault`), the safe start of a database (`db`) and the tamper-evident audit
//! trail (`audit`). Each application decides its own name in the keystore and its own
//! database; nothing here knows about a court, a prison or a police station.

#[cfg(feature = "ai")]
pub mod ai;
pub mod audit;
pub mod db;
pub mod keys;
#[cfg(feature = "lan")]
pub mod lan;
pub mod vault;
