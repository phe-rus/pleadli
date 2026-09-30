//! Which computer a request came from, and who is acting on it, for the length
//! of that request (docs/lawyers/REVIEW-2026-09-30.md, L6).
//!
//! In a firm, the office computer serves every paired computer at once, and
//! each has its own person signed in. The router's gate opens a scope for each
//! request; domain code reads it here instead of a single "who is signed in"
//! row. Outside any request (startup, a domain test) the device is this
//! computer and nobody is acting.

use std::sync::{Arc, Mutex};

use super::staff::Actor;

/// This computer, as opposed to a paired one.
pub const LOCAL: &str = "local";
/// A request over the office network that carries no device key (saying hello,
/// joining with a code). Nobody is ever signed in as it.
pub const UNPAIRED: &str = "unpaired";

#[derive(Clone)]
pub struct Context {
    pub device: String,
    acting: Arc<Mutex<Option<Actor>>>,
}

tokio::task_local! {
    static CONTEXT: Context;
}

impl Context {
    pub fn new(device: String, acting: Option<Actor>) -> Self {
        Context { device, acting: Arc::new(Mutex::new(acting)) }
    }
}

/// Runs `f` as a request from `context`.
pub async fn scope<F: std::future::Future>(context: Context, f: F) -> F::Output {
    CONTEXT.scope(context, f).await
}

pub fn device() -> String {
    CONTEXT.try_with(|c| c.device.clone()).unwrap_or_else(|_| LOCAL.to_string())
}

/// The person acting in this request.
pub fn actor() -> Option<Actor> {
    CONTEXT.try_with(|c| c.acting.lock().unwrap().clone()).ok().flatten()
}

/// Sign-in and sign-out change who is acting part-way through a request; what
/// is recorded after that (the audit entry for the sign-in) names them.
pub fn set_actor(actor: Option<Actor>) {
    let _ = CONTEXT.try_with(|c| *c.acting.lock().unwrap() = actor);
}
