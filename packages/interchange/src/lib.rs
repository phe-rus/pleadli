//! The contract between Pleadli Police and Pleadli DPP.
//!
//! Two applications with two databases and no shared network exchange packages:
//! a station sends a referral to the DPP office that handles it, and that office
//! sends back a receipt and its decisions. This crate is the whole contract, so
//! each side implements it identically:
//!
//! - **identities** (`identity`): a signing key and an encryption key per
//!   station and per office, and the short fingerprint two people read out to
//!   each other to confirm they are talking to who they think;
//! - **pairing** (`pairing`): how a station comes to be trusted by exactly one
//!   DPP office, and that office by the station, before anything is sent;
//! - **packages** (`envelope`): a file that is signed by the sender, sealed so
//!   only the addressee can read it, and self-describing, so it can travel by USB
//!   stick, e-mail attachment, local network or tunnel without the carrier
//!   mattering;
//! - **messages** (`messages`): what a referral, a receipt and a decision
//!   notice contain.
//!
//! Nothing here opens a socket or touches a database.

pub mod envelope;
pub mod identity;
pub mod messages;
pub mod pairing;

pub use envelope::{open, peek, seal, sign_open, Body, Header, Opened, PackageError, Peeked};
pub use identity::{Identity, IdentityKind, PublicIdentity};
