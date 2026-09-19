//! The node API: the only way into the domain code
//! (docs/prisons/product-map/04, "The /api/** namespace").
//!
//! Namespaces:
//! * `/api/auth/**`     identity: sign-in, session, accounts, devices
//! * `/api/prisons/**`  the facility domain
//! * `/api/hq/**`       the Head Office domain
//! * `/api/capture/**`  phone photo links, authenticated by the link token
//! * `/api/system/**`   liveness, first-launch state, node operations, audit
//! * `/api/network/v1/**` inter-installation exchange (own router and
//!   listener, see `network.rs`; never mounted here)
//!
//! Nothing outside `/api/**` is an API. The desktop shell reaches this router
//! in process (`commands::api`); workstations reach it over the LAN listener;
//! debug builds also expose it on loopback for browser development. All three
//! pass the same guard.

pub mod auth;
pub mod capture;
pub mod error;
pub mod guard;
pub mod hq;
pub mod network;
pub mod numbering;
pub mod prisons;
pub mod recovery;
pub mod system;

use std::future::Future;
use std::pin::Pin;

use axum::extract::DefaultBodyLimit;
use axum::Router;
use sqlx::SqliteConnection;

use crate::node::NodeRef;
use error::ApiError;
use guard::{RouteSpec, RouteTable};

/// Large enough for a 25 MB document carried as base64 in JSON.
const MAX_BODY_BYTES: usize = 40 * 1024 * 1024;

pub type WriteFuture<'c, T> = Pin<Box<dyn Future<Output = Result<T, ApiError>> + Send + 'c>>;

/// Runs one state-changing operation in a single `BEGIN IMMEDIATE`
/// transaction: the change and its audit entry commit together, or neither
/// does. Any error rolls the whole thing back.
pub async fn write<T, F>(node: &NodeRef, f: F) -> Result<T, ApiError>
where
    F: for<'c> FnOnce(&'c mut SqliteConnection) -> WriteFuture<'c, T>,
{
    let mut tx = crate::db::begin_write(&node.pool).await?;
    let value = f(&mut tx).await?;
    tx.commit().await?;
    Ok(value)
}

/// Every guarded route of the node API, with the state, before it is turned
/// into a `Router`.
pub fn route_table(node: NodeRef) -> RouteTable {
    RouteTable::new(node.clone())
        .merge(auth::routes(node.clone()))
        .merge(prisons::routes(node.clone()))
        .merge(hq::routes(node.clone()))
        .merge(numbering::routes(node.clone()))
        .merge(capture::routes(node.clone()))
        .merge(system::routes(node))
}

pub fn router(node: NodeRef) -> Router {
    let (router, _) = route_table(node.clone()).into_parts();
    router.layer(DefaultBodyLimit::max(MAX_BODY_BYTES)).with_state(node)
}

pub fn route_specs(node: NodeRef) -> Vec<RouteSpec> {
    route_table(node).into_parts().1
}

#[cfg(test)]
mod tests;
