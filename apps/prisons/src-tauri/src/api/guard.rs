//! The route guard: the one place authentication, device enrolment and
//! permission are decided, in front of every handler. A route cannot be
//! registered without stating what it needs (`RouteTable`), and a test walks
//! the whole table, so an unguarded route cannot ship by accident.

use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, Method};
use axum::middleware::{from_fn_with_state, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, post, put, MethodRouter};
use axum::Router;

use super::error::ApiError;
use crate::domain::authz::Actor;
use crate::domain::{devices, sessions};
use crate::node::NodeRef;

pub const DEVICE_HEADER: &str = "x-pleadli-device";

/// How a request reached the node. Inserted by the entry point, never read
/// from the request itself, so a caller cannot claim to be local.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ingress {
    /// The desktop shell on the node's own machine, in process. No socket.
    Local,
    /// A workstation over the facility LAN. Must present an enrolled device.
    Lan,
    /// Debug builds only: the browser dev workflow on loopback.
    DevLoopback,
}

impl Ingress {
    pub fn is_local(self) -> bool {
        matches!(self, Ingress::Local | Ingress::DevLoopback)
    }
}

/// What a route requires.
#[derive(Debug, Clone, Copy)]
pub enum Need {
    /// Anyone, including a workstation that is not enrolled: liveness and
    /// device enrolment only.
    Public,
    /// An enrolled device (or a local caller), no sign-in: the sign-in
    /// screen and first-launch state.
    Device,
    /// First-launch onboarding on the node's own machine only.
    Onboarding,
    /// A phone capture link: no enrolled device and no sign-in. The handler
    /// itself must check the link token, which is the only credential.
    CaptureToken,
    /// A signed-in officer, any role.
    Session,
    /// A signed-in officer holding this permission.
    Perm(&'static str),
    /// A signed-in officer holding at least one of these permissions.
    AnyPerm(&'static [&'static str]),
}

#[derive(Clone)]
struct Guard {
    node: NodeRef,
    need: Need,
}

/// One registered route, kept for the guard-coverage test.
#[derive(Debug, Clone)]
#[cfg_attr(not(test), allow(dead_code))]
pub struct RouteSpec {
    pub method: Method,
    pub path: &'static str,
    pub need: Need,
}

pub struct RouteTable {
    node: NodeRef,
    router: Router<NodeRef>,
    specs: Vec<RouteSpec>,
}

impl RouteTable {
    pub fn new(node: NodeRef) -> Self {
        RouteTable { node, router: Router::new(), specs: Vec::new() }
    }

    fn add(mut self, method: Method, path: &'static str, need: Need, handler: MethodRouter<NodeRef>) -> Self {
        let guarded = handler.route_layer(from_fn_with_state(Guard { node: self.node.clone(), need }, guard));
        self.router = self.router.route(path, guarded);
        self.specs.push(RouteSpec { method, path, need });
        self
    }

    pub fn get<H, T>(self, path: &'static str, need: Need, handler: H) -> Self
    where
        H: axum::handler::Handler<T, NodeRef>,
        T: 'static,
    {
        self.add(Method::GET, path, need, get(handler))
    }

    pub fn post<H, T>(self, path: &'static str, need: Need, handler: H) -> Self
    where
        H: axum::handler::Handler<T, NodeRef>,
        T: 'static,
    {
        self.add(Method::POST, path, need, post(handler))
    }

    pub fn put<H, T>(self, path: &'static str, need: Need, handler: H) -> Self
    where
        H: axum::handler::Handler<T, NodeRef>,
        T: 'static,
    {
        self.add(Method::PUT, path, need, put(handler))
    }

    pub fn delete<H, T>(self, path: &'static str, need: Need, handler: H) -> Self
    where
        H: axum::handler::Handler<T, NodeRef>,
        T: 'static,
    {
        self.add(Method::DELETE, path, need, delete(handler))
    }

    /// Merges another table's routes into this one, keeping every spec.
    pub fn merge(mut self, other: RouteTable) -> Self {
        self.router = self.router.merge(other.router);
        self.specs.extend(other.specs);
        self
    }

    pub fn into_parts(self) -> (Router<NodeRef>, Vec<RouteSpec>) {
        (self.router, self.specs)
    }
}

fn bearer(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::AUTHORIZATION)?.to_str().ok()?.strip_prefix("Bearer ")
}

/// The enrolled device a LAN request came from, when there is one. A sign-in
/// handler binds the new session to it.
#[derive(Debug, Clone)]
pub struct CallerDevice(pub Option<String>);

async fn guard(State(g): State<Guard>, mut req: Request, next: Next) -> Response {
    // Strictest assumption if an entry point ever forgot to say.
    let ingress = req.extensions().get::<Ingress>().copied().unwrap_or(Ingress::Lan);
    // Only the (Sync) headers are held across the await: a request body is
    // not Sync, and the future must be Send.
    let outcome = authorise(&g, ingress, req.headers()).await;
    match outcome {
        Ok((actor, device)) => {
            if let Some(actor) = actor {
                req.extensions_mut().insert(actor);
            }
            req.extensions_mut().insert(CallerDevice(device));
        }
        Err(err) => return err.into_response(),
    }
    next.run(req).await
}

async fn authorise(g: &Guard, ingress: Ingress, headers: &HeaderMap) -> Result<(Option<Actor>, Option<String>), ApiError> {
    if matches!(g.need, Need::Public | Need::CaptureToken) {
        return Ok((None, None));
    }
    if matches!(g.need, Need::Onboarding) && !ingress.is_local() {
        return Err(ApiError::local_only());
    }

    // A workstation on the LAN must present an enrolled device, for every
    // route that is not public.
    let device_id = if ingress == Ingress::Lan {
        let token = headers.get(DEVICE_HEADER).and_then(|v| v.to_str().ok()).ok_or_else(ApiError::device_not_enrolled)?;
        Some(devices::validate(&g.node.pool, token).await?.ok_or_else(ApiError::device_not_enrolled)?)
    } else {
        None
    };

    if matches!(g.need, Need::Device | Need::Onboarding) {
        return Ok((None, device_id));
    }

    let token = bearer(headers).ok_or_else(ApiError::unauthenticated)?;
    let actor = sessions::resolve(&g.node.pool, token).await?.ok_or_else(ApiError::unauthenticated)?;

    // A session opened on one workstation is not valid from another.
    if ingress == Ingress::Lan && actor.device_id != device_id {
        return Err(ApiError::unauthenticated());
    }

    match g.need {
        Need::Perm(p) => actor.require(p)?,
        Need::AnyPerm(ps) => {
            if !ps.iter().any(|p| actor.can(p)) {
                actor.require(ps[0])?;
            }
        }
        _ => {}
    }
    Ok((Some(actor), device_id))
}
