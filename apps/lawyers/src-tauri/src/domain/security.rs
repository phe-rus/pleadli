//! Who may use the application right now, after setup.
//!
//! The installation's protection level (chosen at setup, `installation.rs`)
//! decides it:
//! - none: nobody signs in; the first administrator is always the person acting;
//! - basic: each person signs in with a 6-digit PIN;
//! - full: a password and a code from the person's authenticator app.
//! With basic or full the app signs the person out after the idle time, and
//! while nobody is signed in the API refuses everything but signing in.
//!
//! Before setup, the old optional PIN lock (`lock.rs`, spec 0001) still guards
//! an installation that had turned it on; setup retires it.
//!
//! None of this is what protects the data on disk: the database is encrypted
//! under a key the operating system's keystore holds (`keys.rs`) at every level.
//! Wrong attempts are slowed down, and every sign-in event is audited.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::error::{invalid, DomainError};
use super::installation;
use super::request;
use super::staff::{self, Actor, Protection};
use super::totp::{self, Enrolment};

const FREE_ATTEMPTS: u32 = 5;
pub const ISSUER: &str = "Pleadli Lawyers";

/// One computer's session: who is signed in there, when it was last used,
/// and its wrong attempts. In a firm the office keeps one for itself and one
/// for each paired computer (L6); alone, there is only this computer's.
struct Session {
    actor: Option<Actor>,
    last_activity: Instant,
    failures: u32,
    blocked_until: Option<Instant>,
}

impl Session {
    fn new() -> Self {
        Session { actor: None, last_activity: Instant::now(), failures: 0, blocked_until: None }
    }
}

struct State {
    installed: bool,
    protection: Protection,
    /// With no sign-in, the first administrator acts on this computer.
    default_actor: Option<Actor>,
    idle_minutes: u32,
    sessions: HashMap<String, Session>,
}

impl State {
    /// The session of the computer this request came from.
    fn here(&mut self) -> &mut Session {
        self.sessions.entry(request::device()).or_insert_with(Session::new)
    }
}

pub struct Security {
    state: Mutex<State>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    /// `ready`, or `recovery` when the data could not be opened.
    pub state: &'static str,
    /// Whether first-launch setup has been completed.
    pub installed: bool,
    /// `none`, `basic` or `full`; null before setup.
    pub level: Option<&'static str>,
    /// Someone has to sign in before anything else works.
    pub locked: bool,
    /// Before setup: the old PIN lock is on and closed.
    pub legacy_locked: bool,
    /// The person acting, when there is one.
    pub actor: Option<Actor>,
    /// Minutes of inactivity before it signs out; 0 means never.
    pub idle_minutes: u32,
    pub retry_after_seconds: u64,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInInput {
    pub staff_id: String,
    pub secret: String,
    #[serde(default)]
    pub code: Option<String>,
    /// The key shown during a first sign-in under full protection.
    #[serde(default)]
    pub enrol_secret: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SignInOutcome {
    SignedIn,
    /// Right password; now the code from the phone.
    Code,
    /// Right password, no phone linked yet: link it, then give its code.
    Enrol { enrolment: Enrolment },
}

impl Security {
    pub fn new() -> Self {
        Security {
            state: Mutex::new(State { installed: false, protection: Protection::None, default_actor: None, idle_minutes: 5, sessions: HashMap::new() }),
        }
    }

    /// Reads the installation. Under basic or full protection the app always
    /// starts with nobody signed in.
    pub async fn load(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let install = installation::get(pool).await?;
        let idle: Option<i64> = sqlx::query_scalar("SELECT idle_minutes FROM installation WHERE id = 'this'").fetch_optional(pool).await?;
        let protection = install.as_ref().map(|i| i.protection_level()).unwrap_or(Protection::None);
        let actor = match (&install, protection) {
            (Some(_), Protection::None) => staff::first_administrator(pool).await?,
            _ => None,
        };
        match &actor {
            Some(a) => {
                let mut conn = pool.acquire().await?;
                staff::set_active_session(&mut conn, &a.id).await?;
            }
            None => staff::clear_active_session(pool).await?,
        }
        let mut s = self.state.lock().unwrap();
        s.installed = install.is_some();
        s.protection = protection;
        s.default_actor = actor;
        s.idle_minutes = idle.unwrap_or(5) as u32;
        s.sessions.clear();
        Ok(())
    }

    pub fn is_installed(&self) -> bool {
        self.state.lock().unwrap().installed
    }

    pub fn protection(&self) -> Protection {
        self.state.lock().unwrap().protection
    }

    /// The person acting on the computer this request came from.
    pub fn actor(&self) -> Option<Actor> {
        if request::device() == request::UNPAIRED {
            return None;
        }
        let mut s = self.state.lock().unwrap();
        if s.protection == Protection::None && request::device() == request::LOCAL {
            return s.default_actor.clone();
        }
        s.here().actor.clone()
    }

    /// Whether nobody may use the app right now. An idle session ends here.
    pub fn is_locked(&self) -> bool {
        let mut s = self.state.lock().unwrap();
        if !s.installed || s.protection == Protection::None {
            return false;
        }
        let idle = s.idle_minutes;
        let here = s.here();
        if here.actor.is_some() && idle > 0 && here.last_activity.elapsed() >= Duration::from_secs(idle as u64 * 60) {
            here.actor = None;
        }
        here.actor.is_none()
    }

    /// Marks the app as in use, which is what postpones the idle sign-out.
    pub fn touch(&self) {
        self.state.lock().unwrap().here().last_activity = Instant::now();
    }

    pub fn status(&self, legacy_locked: bool) -> SessionStatus {
        let locked = self.is_locked();
        let actor = self.actor();
        let mut s = self.state.lock().unwrap();
        let (installed, protection, idle_minutes) = (s.installed, s.protection, s.idle_minutes);
        let blocked_until = s.here().blocked_until;
        SessionStatus {
            state: "ready",
            installed,
            level: installed.then(|| protection.as_str()),
            locked,
            legacy_locked: !installed && legacy_locked,
            actor,
            idle_minutes,
            retry_after_seconds: blocked_until.map(|t| t.saturating_duration_since(Instant::now()).as_secs()).unwrap_or(0),
            reason: None,
        }
    }

    /// Signs the person out (basic, full). With no sign-in there is nobody to sign out.
    pub async fn sign_out(&self, pool: &SqlitePool) {
        let signed_out = {
            let mut s = self.state.lock().unwrap();
            s.installed && s.protection != Protection::None && s.here().actor.is_some()
        };
        if signed_out {
            // Recorded while the person is still named, then they are gone.
            let _ = audit::log(pool, Entry::new("signed_out")).await;
            self.state.lock().unwrap().here().actor = None;
            request::set_actor(None);
        }
    }

    fn check_not_blocked(&self) -> Result<(), DomainError> {
        let mut s = self.state.lock().unwrap();
        match s.here().blocked_until.filter(|t| *t > Instant::now()) {
            Some(until) => Err(DomainError::Forbidden(format!("Too many wrong attempts. Try again in {} seconds.", until.saturating_duration_since(Instant::now()).as_secs() + 1))),
            None => Ok(()),
        }
    }

    fn record_success(&self) {
        let mut s = self.state.lock().unwrap();
        let here = s.here();
        here.failures = 0;
        here.blocked_until = None;
        here.last_activity = Instant::now();
    }

    /// Counts a wrong attempt and, past the free ones, slows the next.
    fn record_failure(&self) -> u32 {
        let mut s = self.state.lock().unwrap();
        let here = s.here();
        here.failures += 1;
        if here.failures >= FREE_ATTEMPTS {
            let wait = (1u64 << (here.failures - FREE_ATTEMPTS).min(8)) * 5;
            here.blocked_until = Some(Instant::now() + Duration::from_secs(wait.min(300)));
        }
        here.failures
    }

    async fn refuse(&self, pool: &SqlitePool, who: &str, message: &str) -> DomainError {
        let failures = self.record_failure();
        let _ = audit::log(pool, Entry::new("sign_in_failed").subject("staff", who).detail(format!("attempt {failures}"))).await;
        DomainError::Forbidden(message.to_string())
    }

    pub async fn sign_in(&self, pool: &SqlitePool, input: SignInInput) -> Result<SignInOutcome, DomainError> {
        self.check_not_blocked()?;
        let protection = {
            let s = self.state.lock().unwrap();
            if !s.installed || s.protection == Protection::None {
                return invalid("Nobody signs in on this copy.");
            }
            s.protection
        };
        let wrong = "That PIN or password is not right.";
        let Some(creds) = staff::credentials(pool, &input.staff_id).await? else {
            return Err(self.refuse(pool, &input.staff_id, wrong).await);
        };
        let right_kind = creds.secret_kind.as_deref() == protection.secret_kind();
        if !right_kind || !creds.secret_hash.as_deref().is_some_and(|h| staff::secret_matches(h, &input.secret)) {
            return Err(self.refuse(pool, &input.staff_id, wrong).await);
        }

        if protection == Protection::Full {
            match (&creds.totp_secret, &input.enrol_secret, &input.code) {
                // First sign-in: show a key to link, then check a code for it.
                (None, None, _) => {
                    let name = staff::get(pool, &input.staff_id).await?.map(|p| p.name).unwrap_or_default();
                    let enrolment = totp::enrol(ISSUER, &name).map_err(DomainError::Invalid)?;
                    return Ok(SignInOutcome::Enrol { enrolment });
                }
                (None, Some(key), Some(code)) => {
                    if !totp::verify(key, code) {
                        return Err(self.refuse(pool, &input.staff_id, "The code from the phone is not right.").await);
                    }
                    staff::set_second_factor(pool, &input.staff_id, Some(key)).await?;
                    let _ = audit::log(pool, Entry::new("second_factor_linked").subject("staff", &input.staff_id)).await;
                }
                (None, Some(_), None) | (Some(_), _, None) => return Ok(SignInOutcome::Code),
                (Some(key), _, Some(code)) => {
                    if !totp::verify(key, code) {
                        return Err(self.refuse(pool, &input.staff_id, "The code from the phone is not right.").await);
                    }
                }
            }
        }

        let actor = staff::actor(pool, &input.staff_id).await?.ok_or_else(|| DomainError::Forbidden(wrong.to_string()))?;
        self.adopt(pool, actor).await?;
        let _ = audit::log(pool, Entry::new("signed_in")).await;
        Ok(SignInOutcome::SignedIn)
    }

    /// Makes `actor` the person acting, when they have just proved who they are
    /// another way (finishing setup, changing the protection level).
    pub async fn adopt(&self, pool: &SqlitePool, actor: Actor) -> Result<(), sqlx::Error> {
        {
            let mut conn = pool.acquire().await?;
            staff::set_active_session(&mut conn, &actor.id).await?;
        }
        self.record_success();
        {
            let mut s = self.state.lock().unwrap();
            if s.protection == Protection::None && request::device() == request::LOCAL {
                s.default_actor = Some(actor.clone());
            }
            s.here().actor = Some(actor.clone());
        }
        request::set_actor(Some(actor));
        Ok(())
    }

    /// Keeps the cached person in step after their record changes.
    pub async fn refresh_actor(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let id = self.actor().map(|a| a.id);
        if let Some(id) = id {
            let fresh = staff::actor(pool, &id).await?;
            if fresh.is_none() {
                staff::clear_active_session(pool).await?;
            }
            let mut s = self.state.lock().unwrap();
            if s.default_actor.as_ref().is_some_and(|a| a.id == id) {
                s.default_actor = fresh.clone();
            }
            // Everyone signed in as this person, on any computer.
            for session in s.sessions.values_mut() {
                if session.actor.as_ref().is_some_and(|a| a.id == id) {
                    session.actor = fresh.clone();
                }
            }
            drop(s);
            request::set_actor(fresh);
        }
        Ok(())
    }

    /// A computer removed from the office is signed out at once.
    pub fn forget_device(&self, device: &str) {
        self.state.lock().unwrap().sessions.remove(device);
    }

    pub async fn set_idle_minutes(&self, pool: &SqlitePool, minutes: u32) -> Result<(), DomainError> {
        if ![0, 5, 15, 30, 60].contains(&minutes) {
            return invalid("Choose 5, 15, 30 or 60 minutes, or never.");
        }
        sqlx::query("UPDATE installation SET idle_minutes = ? WHERE id = 'this'").bind(minutes).execute(pool).await?;
        self.state.lock().unwrap().idle_minutes = minutes;
        Ok(())
    }
}

impl Default for Security {
    fn default() -> Self {
        Self::new()
    }
}
