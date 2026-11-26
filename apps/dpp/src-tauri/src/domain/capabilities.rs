//! What each person may do with files, kept apart from who administers the
//! application.
//!
//! Running the installation (people, sign-in, backups, settings) is one thing;
//! prosecuting is another. An administrator does not become a prosecutor by
//! administering, so every file power is its own capability, granted to a role
//! in `role_capabilities` and changed by an administrator in Settings:
//!
//! - register_files: enter a file in the registers when it arrives
//! - allocate_files: give a file nobody holds yet to someone
//! - reassign_files: take a file from one holder and give it to another
//! - self_assign: take a file nobody holds yet
//! - review_files: read, review, decide on and prepare papers for files
//!
//! Two things are not in the table. Approving the decisions only the Director
//! may take comes from the Director flag on the person (Constitution Art.
//! 120(3)(d), Trial on Indictments Act s.135), and the Director also holds every
//! file power. Administering needs the administrator role.
//!
//! One installation with sign-in switched off has one person, always acting, so
//! there is nobody to keep the powers apart from: that person holds them all.
//!
//! UNRESOLVED: who allocates is the client's policy and is not confirmed. The
//! seeded defaults in migration 0044 are a starting point, not a rule.

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use std::collections::HashSet;

use super::error::{invalid, DomainError};
use super::staff::{Actor, Protection};

pub const CAPABILITIES: [&str; 5] = ["register_files", "allocate_files", "reassign_files", "self_assign", "review_files"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    RegisterFiles,
    AllocateFiles,
    ReassignFiles,
    SelfAssign,
    ReviewFiles,
}

impl Capability {
    pub fn key(self) -> &'static str {
        match self {
            Self::RegisterFiles => "register_files",
            Self::AllocateFiles => "allocate_files",
            Self::ReassignFiles => "reassign_files",
            Self::SelfAssign => "self_assign",
            Self::ReviewFiles => "review_files",
        }
    }

    pub fn needs_words(self) -> &'static str {
        match self {
            Self::RegisterFiles => "register files",
            Self::AllocateFiles => "give files out",
            Self::ReassignFiles => "move a file from one person to another",
            Self::SelfAssign => "take a file for yourself",
            Self::ReviewFiles => "review files and decide on them",
        }
    }
}

/// What one person may do, as every screen and rule sees it.
#[derive(Debug, Clone, Copy, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Set {
    pub register_files: bool,
    pub allocate_files: bool,
    pub reassign_files: bool,
    pub self_assign: bool,
    pub review_files: bool,
    /// Take the decisions only the Director may take.
    pub approve_director_decisions: bool,
    /// Run the installation: people, sign-in, backups, settings.
    pub administer: bool,
}

impl Set {
    pub fn has(&self, c: Capability) -> bool {
        match c {
            Capability::RegisterFiles => self.register_files,
            Capability::AllocateFiles => self.allocate_files,
            Capability::ReassignFiles => self.reassign_files,
            Capability::SelfAssign => self.self_assign,
            Capability::ReviewFiles => self.review_files,
        }
    }

    /// Whether this person may hold a file: someone who cannot review it cannot be given it.
    pub fn can_hold(&self) -> bool {
        self.review_files
    }
}

#[derive(Debug, Clone, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub role: String,
    pub capability: String,
    pub granted: bool,
    pub updated_by: Option<String>,
    pub updated_at: i64,
}

pub async fn grants(pool: &SqlitePool) -> Result<Vec<Grant>, sqlx::Error> {
    sqlx::query_as("SELECT role, capability, granted, updated_by, updated_at FROM role_capabilities ORDER BY role, capability").fetch_all(pool).await
}

/// The grants as a set of `role:capability` pairs.
async fn granted_pairs(pool: &SqlitePool) -> Result<HashSet<String>, sqlx::Error> {
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT role, capability FROM role_capabilities WHERE granted = 1").fetch_all(pool).await?;
    Ok(rows.into_iter().map(|(r, c)| format!("{r}:{c}")).collect())
}

/// The pure rule: a person's powers from their role, the Director flag, the
/// installation's sign-in level and the grants. Everything else calls this.
pub fn resolve(actor: &Actor, protection: Protection, grants: &HashSet<String>) -> Set {
    let administer = actor.role == "administrator";
    // One person, always acting: nobody to separate duties from.
    if protection == Protection::None {
        return Set { register_files: true, allocate_files: true, reassign_files: true, self_assign: true, review_files: true, approve_director_decisions: actor.is_dpp || administer, administer };
    }
    let by_role = |c: Capability| actor.is_dpp || grants.contains(&format!("{}:{}", actor.role, c.key()));
    Set {
        register_files: by_role(Capability::RegisterFiles),
        allocate_files: by_role(Capability::AllocateFiles),
        reassign_files: by_role(Capability::ReassignFiles),
        self_assign: by_role(Capability::SelfAssign),
        review_files: by_role(Capability::ReviewFiles),
        approve_director_decisions: actor.is_dpp,
        administer,
    }
}

/// How strictly this installation signs people in; it decides whether powers are kept apart.
pub async fn protection(pool: &SqlitePool) -> Result<Protection, sqlx::Error> {
    let level: Option<String> = sqlx::query_scalar("SELECT protection FROM installation WHERE id = 'this'").fetch_optional(pool).await?;
    Ok(level.as_deref().and_then(Protection::parse).unwrap_or(Protection::Basic))
}

pub async fn for_actor(pool: &SqlitePool, protection: Protection, actor: &Actor) -> Result<Set, sqlx::Error> {
    Ok(resolve(actor, protection, &granted_pairs(pool).await?))
}

/// What a member of staff could do if they were the one signed in, for the
/// people on the list who are not (the person a file is given to).
pub async fn for_staff(pool: &SqlitePool, protection: Protection, staff_id: &str) -> Result<Option<Set>, sqlx::Error> {
    let actor = super::staff::actor(pool, staff_id).await?;
    match actor {
        Some(a) => Ok(Some(for_actor(pool, protection, &a).await?)),
        None => Ok(None),
    }
}

/// Fails with a plain sentence when the person lacks the power.
pub fn require(set: &Set, c: Capability) -> Result<(), DomainError> {
    if set.has(c) {
        Ok(())
    } else {
        Err(DomainError::Forbidden(format!("You are not set up to {}. An administrator can change who may, in Settings.", c.needs_words())))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantInput {
    pub role: String,
    pub capability: String,
    pub granted: bool,
}

pub async fn set_grant(pool: &SqlitePool, input: GrantInput, by: Option<&str>) -> Result<Vec<Grant>, DomainError> {
    if !super::staff::ROLES.contains(&input.role.as_str()) {
        return invalid("That role is not known.");
    }
    if !CAPABILITIES.contains(&input.capability.as_str()) {
        return invalid("That is not something a role can be allowed to do.");
    }
    // Never leave the office with nobody who can review: files would have no one to hold them.
    if input.capability == "review_files" && !input.granted {
        let others: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM staff s WHERE s.active = 1 AND (s.is_dpp = 1 OR (s.role <> ? AND EXISTS (SELECT 1 FROM role_capabilities c WHERE c.role = s.role AND c.capability = 'review_files' AND c.granted = 1)))",
        )
        .bind(&input.role)
        .fetch_one(pool)
        .await?;
        if others == 0 {
            return invalid("That would leave nobody able to review files. Allow another role first.");
        }
    }
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query("UPDATE role_capabilities SET granted = ?, updated_by = ?, updated_at = ? WHERE role = ? AND capability = ?")
        .bind(input.granted)
        .bind(by)
        .bind(now)
        .bind(&input.role)
        .bind(&input.capability)
        .execute(pool)
        .await?;
    Ok(grants(pool).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn actor(role: &str, is_dpp: bool) -> Actor {
        Actor { id: role.into(), name: role.into(), rank: None, role: role.into(), is_dpp }
    }

    fn defaults() -> HashSet<String> {
        ["prosecutor:self_assign", "prosecutor:review_files", "clerk:register_files", "clerk:allocate_files"].iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn administering_gives_no_prosecution_authority() {
        let s = resolve(&actor("administrator", false), Protection::Basic, &defaults());
        assert!(s.administer);
        assert!(!s.review_files && !s.allocate_files && !s.self_assign && !s.approve_director_decisions);
    }

    #[test]
    fn a_clerk_registers_and_allocates_but_does_not_review_or_reassign() {
        let s = resolve(&actor("clerk", false), Protection::Basic, &defaults());
        assert!(s.register_files && s.allocate_files);
        assert!(!s.review_files && !s.reassign_files && !s.administer);
    }

    #[test]
    fn a_prosecutor_takes_and_reviews_but_does_not_give_out() {
        let s = resolve(&actor("prosecutor", false), Protection::Basic, &defaults());
        assert!(s.self_assign && s.review_files);
        assert!(!s.allocate_files && !s.reassign_files && !s.approve_director_decisions);
    }

    #[test]
    fn the_director_holds_every_file_power_whatever_the_table_says() {
        let s = resolve(&actor("prosecutor", true), Protection::Basic, &HashSet::new());
        assert!(s.register_files && s.allocate_files && s.reassign_files && s.self_assign && s.review_files && s.approve_director_decisions);
    }

    #[test]
    fn a_solo_installation_has_one_person_who_does_everything() {
        let s = resolve(&actor("administrator", false), Protection::None, &HashSet::new());
        assert!(s.administer && s.review_files && s.allocate_files && s.approve_director_decisions);
    }

    #[test]
    fn a_grant_in_the_table_changes_the_answer() {
        let mut g = defaults();
        g.insert("administrator:review_files".into());
        assert!(resolve(&actor("administrator", false), Protection::Basic, &g).review_files);
    }
}
