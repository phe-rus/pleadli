//! The registry's postbox: the same sealed packages the file route carries, moved through pleadli.com
//! (docs/platform/RELAY-DESIGN.md). The driver is `node-core::hub`, shared with every other app. This module is
//! only what is the registry's own: which institutions it exchanges with, and which of its import functions
//! opens a package from each.
//!
//! Nothing here widens what an institution may do. A package is first checked against the permission table
//! (`interchange::authorization`), then against the address that institution answered from, then handed to
//! the same `import_package` the file route uses, which verifies the signature, the trusted link, the
//! package kind for that kind of institution, and the contents. A package that fails any of them is kept as
//! refused with the reason; none of them reaches the register.

use std::sync::Arc;

use pleadli_interchange::identity::IdentityKind;
use pleadli_interchange::pairing::{self, KIND_INVITE, KIND_RESPONSE};
use pleadli_node_core::hub::{self, Adapter, Fut, Links, Reject};
use pleadli_node_core::postbox::Arrived;
use serde_json::{json, Value};
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::error::DomainError;
use super::{custody_exchange, exchange, firm_exchange};

pub const DPP: Links = Links { table: "dpp_links", peer_col: "dpp_id", peer: IdentityKind::DppOffice };
pub const FIRMS: Links = Links { table: "firm_links", peer_col: "firm_id", peer: IdentityKind::LawFirm };
pub const PRISONS: Links = Links { table: "prison_links", peer_col: "prison_id", peer: IdentityKind::PrisonFacility };
pub const ALL: &[Links] = &[DPP, FIRMS, PRISONS];

pub struct CourtsAdapter {
    pub pool: SqlitePool,
}

impl CourtsAdapter {
    pub fn new(pool: SqlitePool) -> Arc<CourtsAdapter> {
        Arc::new(CourtsAdapter { pool })
    }

    async fn route(&self, item: &Arrived) -> Result<(), Reject> {
        let header = hub::admit(IdentityKind::CourtRegistry, &self.pool, ALL, item).await?;
        // The answer to an invitation this registry issued must come from the address the invitation went to.
        if header.kind == KIND_RESPONSE {
            let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
            let sent_to: Option<Option<String>> = sqlx::query_scalar("SELECT address FROM dpp_links WHERE id = ?").bind(&response.invite_id).fetch_optional(&self.pool).await.map_err(|e| Reject::Retry(e.to_string()))?;
            if let Some(Some(address)) = sent_to {
                if address != item.from {
                    return Err(Reject::Refuse(format!("This answer came from {}, but the invitation was sent to {address}. Nothing was kept.", item.from)));
                }
            }
        }
        let outcome = match header.from.kind {
            IdentityKind::DppOffice => exchange::import_package(&self.pool, &item.bytes).await.map(|_| ()),
            IdentityKind::LawFirm => firm_exchange::import_package(&self.pool, &item.bytes).await.map(|_| ()),
            IdentityKind::PrisonFacility => custody_exchange::import_package(&self.pool, &item.bytes).await.map(|_| ()),
            // Unreachable while the permission table has no other sender to a registry; refused rather than assumed.
            _ => return Err(Reject::Refuse("This registry does not exchange packages with that kind of institution.".to_string())),
        };
        match outcome {
            Ok(()) => {
                if header.kind == KIND_RESPONSE {
                    let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
                    hub::bind(&self.pool, DPP, &response.invite_id, &item.from).await.map_err(|e| Reject::Retry(e.to_string()))?;
                }
                Ok(())
            }
            Err(DomainError::Db(e)) => Err(Reject::Retry(e.to_string())),
            Err(DomainError::Invalid(m)) if m.contains("already been received") => Err(Reject::Duplicate),
            Err(e) => Err(Reject::Refuse(e.to_string())),
        }
    }
}

impl Adapter for CourtsAdapter {
    fn open<'a>(&'a self, item: &'a Arrived) -> Fut<'a, Result<(), Reject>> {
        Box::pin(self.route(item))
    }

    fn waits(&self, kind: &str) -> bool {
        kind == KIND_INVITE
    }

    /// An invitation a person may answer: only from the kinds of institution that invite a registry.
    fn describe(&self, item: &Arrived) -> Option<Value> {
        let invite = pairing::read_invite(&item.bytes).ok()?;
        if !matches!(invite.office.kind, IdentityKind::LawFirm | IdentityKind::PrisonFacility) {
            return None;
        }
        pleadli_interchange::authorization::check(invite.office.kind, IdentityKind::CourtRegistry, KIND_INVITE).ok()?;
        Some(json!({
            "fingerprint": invite.office.fingerprint(),
            "name": invite.office.name,
            "kind": pleadli_interchange::authorization::label(invite.office.kind),
            "intendedFor": invite.intended_station,
            "expiresAt": invite.expires_at,
        }))
    }

    fn audit<'a>(&'a self, action: &'a str, detail: String) -> Fut<'a, ()> {
        Box::pin(async move {
            let _ = audit::log(&self.pool, Entry::new(action).detail(detail)).await;
        })
    }
}

/// A person answers an invitation that arrived. Returns the answer's package id and its bytes, with the
/// address the invitation came from bound to the new link, so the confirmation that follows is accepted
/// only from there.
pub async fn answer(pool: &SqlitePool, item: &Arrived, contact: Option<&str>) -> Result<(String, Vec<u8>), DomainError> {
    let invite = pairing::read_invite(&item.bytes).map_err(|e| DomainError::Invalid(e.to_string()))?;
    pleadli_interchange::authorization::check(invite.office.kind, IdentityKind::CourtRegistry, KIND_INVITE).map_err(DomainError::Invalid)?;
    let (table, link_id, bytes) = match invite.office.kind {
        IdentityKind::LawFirm => {
            let (link, bytes) = firm_exchange::accept_invite(pool, &item.bytes, contact).await?;
            (FIRMS, link.id, bytes)
        }
        IdentityKind::PrisonFacility => {
            let (link, bytes) = custody_exchange::accept_invite(pool, &item.bytes, contact).await?;
            (PRISONS, link.id, bytes)
        }
        _ => return Err(DomainError::Invalid("This registry answers invitations from law firms and prisons only.".into())),
    };
    hub::bind(pool, table, &link_id, &item.from).await?;
    let id = pleadli_interchange::envelope::peek(&bytes).map(|p| p.header.id).map_err(|e| DomainError::Invalid(e.to_string()))?;
    Ok((id, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_interchange::envelope::{self, Body};
    use pleadli_interchange::identity::Identity;
    use pleadli_interchange::messages::*;

    async fn registry() -> SqlitePool {
        let dir = std::env::temp_dir().join(format!("pleadli-courts-postbox-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        exchange::create_identity(&pool, "Postbox Test Chief Magistrates Court", Some("Kampala")).await.unwrap();
        pool
    }

    fn arrived(kind: &str, from: &str, bytes: Vec<u8>) -> Arrived {
        Arrived { id: uuid::Uuid::new_v4().to_string(), from: from.to_string(), kind: kind.to_string(), sha256: String::new(), bytes, arrived_at: 1 }
    }

    async fn count(pool: &SqlitePool, table: &str) -> i64 {
        sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM {table}"))).fetch_one(pool).await.unwrap()
    }

    fn refused(r: Result<(), Reject>) -> String {
        match r {
            Err(Reject::Refuse(m)) => m,
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    fn seal(from: &Identity, to: &pleadli_interchange::identity::PublicIdentity, kind: &str, seq: u64, body: serde_json::Value) -> Vec<u8> {
        envelope::seal(from, to, kind, seq, None, &Body::new(body)).unwrap().0
    }

    fn filing(key: &str) -> serde_json::Value {
        serde_json::to_value(FilingPayload {
            dpp_file_key: key.into(),
            title: "Uganda v Test".into(),
            court_level: "magistrate".into(),
            summary: "Theft".into(),
            parties: vec![FilingParty { key: "a".into(), role: "accused".into(), name: "Accused One".into(), ..Default::default() }],
            filed_at: 1,
            ..Default::default()
        })
        .unwrap()
    }

    /// The DPP path through the postbox: the answer and every later package must come from the address the
    /// invitation went to, a copy changes nothing, and a damaged or mislabelled package keeps nothing.
    #[tokio::test]
    async fn the_dpp_path_through_the_postbox_checks_address_kind_replay_and_damage() {
        let pool = registry().await;
        let adapter = CourtsAdapter { pool: pool.clone() };
        let dpp = Identity::generate(IdentityKind::DppOffice, "Postbox Test DPP", Some("Kampala"));
        let (link, invite_file) = exchange::create_invite(&pool, "Postbox Test DPP", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        hub::bind(&pool, DPP, &link.id, "ug.dpp.real").await.unwrap();
        let answer = pairing::make_response(&dpp, &invite, None).unwrap();

        let m = refused(adapter.open(&arrived(KIND_RESPONSE, "ug.dpp.impostor", answer.clone())).await);
        assert!(m.contains("invitation was sent to ug.dpp.real"), "{m}");
        assert_eq!(count(&pool, "dpp_links WHERE dpp_id IS NOT NULL").await, 0, "the impostor's answer kept nothing");
        adapter.open(&arrived(KIND_RESPONSE, "ug.dpp.real", answer)).await.unwrap();
        let typed = exchange::list_links(&pool).await.unwrap()[0].fingerprint.clone().unwrap();
        exchange::trust_link(&pool, &link.id, &typed).await.unwrap();

        let one = seal(&dpp, &invite.office, KIND_FILING, 1, filing("F-1"));
        let m = refused(adapter.open(&arrived(KIND_FILING, "ug.dpp.other", one.clone())).await);
        assert!(m.contains("answered from ug.dpp.real"), "{m}");
        assert_eq!(count(&pool, "exchange_incoming").await, 0);
        adapter.open(&arrived(KIND_FILING, "ug.dpp.real", one.clone())).await.unwrap();
        assert_eq!(count(&pool, "exchange_incoming").await, 1);
        assert!(matches!(adapter.open(&arrived(KIND_FILING, "ug.dpp.real", one.clone())).await, Err(Reject::Duplicate)), "a copy is not a failure and adds nothing");
        assert_eq!(count(&pool, "exchange_incoming").await, 1);

        let mut damaged = seal(&dpp, &invite.office, KIND_FILING, 2, filing("F-2"));
        let last = damaged.len() - 3;
        damaged[last] ^= 1;
        refused(adapter.open(&arrived(KIND_FILING, "ug.dpp.real", damaged)).await);
        // The relay's label must be the package's own.
        let wd = seal(&dpp, &invite.office, KIND_FILING, 3, filing("F-3"));
        let m = refused(adapter.open(&arrived(KIND_WITHDRAWAL, "ug.dpp.real", wd)).await);
        assert!(m.contains("labelled"), "{m}");
        assert_eq!(count(&pool, "exchange_incoming").await, 1);
        pool.close().await;
    }

    /// A sender the registry fully trusts, with a valid signature, still cannot send what its kind of
    /// institution has no path for: through the postbox or by calling the import directly, as a modified
    /// client of the file route would.
    #[tokio::test]
    async fn a_trusted_sender_cannot_send_what_its_kind_has_no_path_for() {
        let pool = registry().await;
        let adapter = CourtsAdapter { pool: pool.clone() };
        let registry_public = exchange::require_identity(&pool).await.unwrap().public;

        // A firm and a prison, both invited the registry, answered, and confirmed: fully trusted links.
        let firm = Identity::generate(IdentityKind::LawFirm, "Postbox Test Advocates", Some("Kampala"));
        let (firm_invite_file, firm_invite) = pairing::make_invite(&firm, "Postbox Test Court", i64::MAX).unwrap();
        let (flink, f_answer) = firm_exchange::accept_invite(&pool, &firm_invite_file, None).await.unwrap();
        hub::bind(&pool, FIRMS, &flink.id, "ug.firm.a").await.unwrap();
        let f_response = pairing::read_response(&f_answer).unwrap();
        adapter.open(&arrived(pairing::KIND_CONFIRMATION, "ug.firm.a", pairing::make_confirmation(&firm, &f_response.station, &firm_invite.invite_id, "trusted", None).unwrap())).await.unwrap();

        let prison = Identity::generate(IdentityKind::PrisonFacility, "Postbox Test Prison", Some("Kampala"));
        let (p_invite_file, p_invite) = pairing::make_invite(&prison, "Postbox Test Court", i64::MAX).unwrap();
        let (plink, p_answer) = custody_exchange::accept_invite(&pool, &p_invite_file, None).await.unwrap();
        hub::bind(&pool, PRISONS, &plink.id, "ug.prison.a").await.unwrap();
        let p_response = pairing::read_response(&p_answer).unwrap();
        adapter.open(&arrived(pairing::KIND_CONFIRMATION, "ug.prison.a", pairing::make_confirmation(&prison, &p_response.station, &p_invite.invite_id, "trusted", None).unwrap())).await.unwrap();
        assert_eq!(firm_exchange::list_links(&pool).await.unwrap()[0].status, "trusted");
        assert_eq!(custody_exchange::list_links(&pool).await.unwrap()[0].status, "trusted");

        // The firm, validly signed and trusted, sends things that are not its to send.
        let report = serde_json::to_value(CustodyReportPayload { order_key: "o1".into(), court_number: "X".into(), accused: "A".into(), event: "released".into(), occurred_at: 1, ..Default::default() }).unwrap();
        let firm_custody_report = seal(&firm, &registry_public, KIND_CUSTODY_REPORT, 1, report.clone());
        let firm_case_filing = seal(&firm, &registry_public, KIND_FILING, 2, filing("F-9"));
        for (kind, bytes) in [(KIND_CUSTODY_REPORT, firm_custody_report), (KIND_FILING, firm_case_filing)] {
            let m = refused(adapter.open(&arrived(kind, "ug.firm.a", bytes.clone())).await);
            assert!(m.contains("law firm is not allowed"), "{m}");
            // The same package handed straight to every import function, as a modified client of the file route would.
            assert!(firm_exchange::import_package(&pool, &bytes).await.is_err());
            assert!(exchange::import_package(&pool, &bytes).await.is_err());
            assert!(custody_exchange::import_package(&pool, &bytes).await.is_err());
        }
        // The prison, validly signed and trusted, files a document in a case: not its path either.
        let prison_filing = seal(&prison, &registry_public, KIND_FIRM_FILING, 1, serde_json::to_value(FirmFilingPayload { filing_key: "k".into(), kind: "other".into(), title: "T".into(), court_number: "X".into(), firm_name: "P".into(), paragraphs: vec!["x".into()], filed_at: 1, ..Default::default() }).unwrap());
        let m = refused(adapter.open(&arrived(KIND_FIRM_FILING, "ug.prison.a", prison_filing.clone())).await);
        assert!(m.contains("prison facility is not allowed"), "{m}");
        assert!(firm_exchange::import_package(&pool, &prison_filing).await.is_err());
        assert!(custody_exchange::import_package(&pool, &prison_filing).await.is_err());
        assert_eq!((count(&pool, "firm_filings").await, count(&pool, "prison_incoming").await, count(&pool, "exchange_incoming").await), (0, 0, 0));

        // What each is allowed to send is taken in.
        let ok_report = seal(&prison, &registry_public, KIND_CUSTODY_REPORT, 2, report);
        // The report names an order this registry never sent, so the registry's own rule turns it away: the path is open, the content is checked.
        let m = refused(adapter.open(&arrived(KIND_CUSTODY_REPORT, "ug.prison.a", ok_report)).await);
        assert!(!m.contains("not allowed to send"), "an allowed kind is judged on its content, not its sender: {m}");
        let ok_filing = seal(&firm, &registry_public, KIND_FIRM_FILING, 3, serde_json::to_value(FirmFilingPayload { filing_key: "k2".into(), kind: "other".into(), title: "T".into(), court_number: "X".into(), firm_name: "Postbox Test Advocates".into(), paragraphs: vec!["The applicant prays.".into()], filed_at: 1, ..Default::default() }).unwrap());
        adapter.open(&arrived(KIND_FIRM_FILING, "ug.firm.a", ok_filing)).await.unwrap();
        assert_eq!(count(&pool, "firm_filings").await, 1);
        pool.close().await;
    }
}
