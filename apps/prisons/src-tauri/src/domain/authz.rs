//! Permissions, role templates and the acting identity
//! (docs/prisons/product-map/05 M.2 to M.4).
//!
//! Permissions are checked by the node on every request, deny by default;
//! the UI hides what a user cannot do as a courtesy only. Role templates are
//! a function-based starting point (the vocabulary is provisional, research
//! item R-07): they live here, in one place, so the permission a route needs
//! and the permissions a role grants are always read from the same source.

use std::collections::BTreeSet;
use std::fmt;

/// Every permission the node knows. A route names exactly one.
pub mod perm {
    pub const PRISONER_READ: &str = "prisoner.read";
    pub const CUSTODY_ADMIT: &str = "custody.admit";
    pub const CUSTODY_EDIT: &str = "custody.edit";
    pub const DISCHARGE_EXECUTE: &str = "discharge.execute";
    pub const AUTHORISE_EXCEPTION: &str = "authorise.exception";
    pub const TRANSFER_MANAGE: &str = "transfer.manage";
    pub const COURT_MANAGE: &str = "court.manage";
    pub const VISIT_MANAGE: &str = "visit.manage";
    pub const HEALTH_MANAGE: &str = "health.manage";
    pub const PROPERTY_MANAGE: &str = "property.manage";
    pub const PROGRAMME_MANAGE: &str = "programme.manage";
    pub const REQUEST_MANAGE: &str = "request.manage";
    pub const DOCUMENT_READ: &str = "document.read";
    pub const DOCUMENT_WRITE: &str = "document.write";
    pub const DOCUMENT_VOID: &str = "document.void";
    pub const REPORT_READ: &str = "report.read";

    pub const ACCOUNTS_MANAGE: &str = "accounts.manage";
    pub const DEVICES_MANAGE: &str = "devices.manage";
    pub const NODE_MANAGE: &str = "node.manage";
    pub const AUDIT_READ: &str = "audit.read";

    pub const HQ_ESTATE_READ: &str = "hq.estate.read";
    pub const HQ_LOCATE: &str = "hq.locate";
    pub const HQ_NETWORK_MANAGE: &str = "hq.network.manage";
    pub const HQ_OVERSIGHT: &str = "hq.oversight";
    pub const HQ_COORDINATION: &str = "hq.coordination";
    pub const HQ_DECISIONS: &str = "hq.decisions";
    pub const HQ_DIRECTIVES: &str = "hq.directives";
    pub const HQ_REPORTS: &str = "hq.reports";
}

use perm::*;

pub const FACILITY_ROLES: &[&str] = &["oic", "officer", "records", "facility_admin"];
pub const HQ_ROLES: &[&str] = &["hq_admin", "hq_officer", "hq_commander"];

pub fn is_known_role(role: &str, head_office: bool) -> bool {
    if head_office {
        HQ_ROLES.contains(&role)
    } else {
        FACILITY_ROLES.contains(&role)
    }
}

const FACILITY_ROUTINE: &[&str] = &[
    PRISONER_READ,
    CUSTODY_ADMIT,
    CUSTODY_EDIT,
    DISCHARGE_EXECUTE,
    TRANSFER_MANAGE,
    COURT_MANAGE,
    VISIT_MANAGE,
    HEALTH_MANAGE,
    PROPERTY_MANAGE,
    PROGRAMME_MANAGE,
    REQUEST_MANAGE,
    DOCUMENT_READ,
    DOCUMENT_WRITE,
    REPORT_READ,
];

const HQ_WORKING: &[&str] = &[
    HQ_ESTATE_READ,
    HQ_LOCATE,
    HQ_OVERSIGHT,
    HQ_COORDINATION,
    HQ_DECISIONS,
    HQ_DIRECTIVES,
    HQ_REPORTS,
];

/// Permissions granted by a role template. `is_admin` adds account, device,
/// node and audit administration on top of the role: an administrator role
/// (`facility_admin`, `hq_admin`) has no record access of its own, so
/// administering accounts never implies reading prisoner records.
pub fn role_permissions(role: &str, is_admin: bool) -> BTreeSet<&'static str> {
    let mut set: BTreeSet<&'static str> = BTreeSet::new();
    match role {
        // Officer in Charge: everything operational plus the authority the
        // Act attaches to the post (s.30), including recording an exception
        // to a discharge gate.
        "oic" => {
            set.extend(FACILITY_ROUTINE);
            set.extend([AUTHORISE_EXCEPTION, DOCUMENT_VOID]);
        }
        // General duty (the legacy 'officer'): routine work, no authorisations.
        "officer" => set.extend(FACILITY_ROUTINE),
        // Reception and records work.
        "records" => set.extend([
            PRISONER_READ,
            CUSTODY_ADMIT,
            CUSTODY_EDIT,
            COURT_MANAGE,
            PROPERTY_MANAGE,
            DOCUMENT_READ,
            DOCUMENT_WRITE,
            REPORT_READ,
        ]),
        // Administration only; no access to records by default.
        "facility_admin" => {}
        "hq_admin" => {
            set.extend(HQ_WORKING);
            set.insert(HQ_NETWORK_MANAGE);
        }
        "hq_officer" => set.extend(HQ_WORKING),
        // Regional and District Commanders: read-only oversight. Region
        // scoping is a later slice (R-23).
        "hq_commander" => set.extend([HQ_ESTATE_READ, HQ_LOCATE, HQ_OVERSIGHT, HQ_REPORTS]),
        _ => {}
    }
    if is_admin {
        set.extend([ACCOUNTS_MANAGE, DEVICES_MANAGE, NODE_MANAGE, AUDIT_READ]);
    }
    set
}

#[derive(Debug)]
pub struct Forbidden {
    pub permission: &'static str,
}

impl fmt::Display for Forbidden {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "You do not have permission to do that ({}).", self.permission)
    }
}

impl std::error::Error for Forbidden {}

/// Who is acting. Every state-changing domain function takes one, so
/// attribution cannot be forgotten: there is no way to write without saying
/// who is writing. Built only from a verified session (`api/auth.rs`) or as
/// a named system actor for the few events that have no officer (first
/// launch, pairing, background schedules).
#[derive(Debug, Clone)]
pub struct Actor {
    pub officer_id: Option<String>,
    pub badge_number: Option<String>,
    pub name: String,
    pub role: String,
    pub is_admin: bool,
    pub device_id: Option<String>,
    permissions: BTreeSet<&'static str>,
}

impl Actor {
    pub fn officer(
        officer_id: String,
        badge_number: String,
        name: String,
        role: String,
        is_admin: bool,
        device_id: Option<String>,
    ) -> Self {
        let permissions = role_permissions(&role, is_admin);
        Actor { officer_id: Some(officer_id), badge_number: Some(badge_number), name, role, is_admin, device_id, permissions }
    }

    /// An automated or pre-sign-in actor. Holds no permissions: a system
    /// actor can be recorded in audit but can never pass a permission check.
    pub fn system(label: &str) -> Self {
        Actor {
            officer_id: None,
            badge_number: None,
            name: format!("system: {label}"),
            role: "system".to_string(),
            is_admin: false,
            device_id: None,
            permissions: BTreeSet::new(),
        }
    }

    pub fn can(&self, permission: &str) -> bool {
        self.permissions.contains(permission)
    }

    pub fn require(&self, permission: &'static str) -> Result<(), Forbidden> {
        if self.permissions.contains(permission) {
            Ok(())
        } else {
            Err(Forbidden { permission })
        }
    }

    pub fn permissions(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.permissions.iter().copied()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_role_has_no_record_access() {
        let p = role_permissions("facility_admin", true);
        assert!(p.contains(ACCOUNTS_MANAGE));
        assert!(!p.contains(PRISONER_READ), "administering accounts must not imply reading prisoner records");
    }

    #[test]
    fn only_oic_can_record_a_gate_exception() {
        assert!(role_permissions("oic", false).contains(AUTHORISE_EXCEPTION));
        assert!(!role_permissions("officer", false).contains(AUTHORISE_EXCEPTION));
        assert!(!role_permissions("records", false).contains(AUTHORISE_EXCEPTION));
    }

    #[test]
    fn facility_and_head_office_permissions_do_not_overlap() {
        for role in FACILITY_ROLES {
            assert!(role_permissions(role, true).iter().all(|p| !p.starts_with("hq.")));
        }
        for role in HQ_ROLES {
            assert!(!role_permissions(role, true).contains(PRISONER_READ), "Head Office holds no prisoners of its own");
        }
    }

    #[test]
    fn system_actor_can_do_nothing() {
        let actor = Actor::system("test");
        assert!(actor.require(PRISONER_READ).is_err());
        assert_eq!(actor.permissions().count(), 0);
    }
}
