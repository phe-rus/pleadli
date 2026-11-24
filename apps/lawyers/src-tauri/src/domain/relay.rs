//! The firm's postbox: the same sealed packages the file route carries, moved through pleadli.com
//! (docs/platform/RELAY-DESIGN.md). The driver is `node-core::hub`, shared with every other app; this module is only
//! what is the firm's own: it exchanges with court registries, and nothing else.
//!
//! A package is checked against the permission table (`interchange::authorization`), then against the address
//! the registry answered from, then handed to the same `import_package` the file route uses, which verifies the
//! signature, the trusted link, the kind of package and its content. Nothing here widens what a registry may send a firm.

use std::sync::Arc;

use pleadli_interchange::identity::IdentityKind;
use pleadli_interchange::pairing::{self, KIND_RESPONSE};
use pleadli_node_core::hub::{self, Adapter, Fut, Links, Reject};
use pleadli_node_core::postbox::Arrived;
use serde_json::Value;
use sqlx::SqlitePool;

use super::audit::{self, Entry};
use super::court_notices;
use super::error::DomainError;

pub const COURTS: Links = Links { table: "court_links", peer_col: "court_id", peer: IdentityKind::CourtRegistry };
const ALL: &[Links] = &[COURTS];

pub struct FirmAdapter {
    pub pool: SqlitePool,
}

impl FirmAdapter {
    pub fn new(pool: SqlitePool) -> Arc<FirmAdapter> {
        Arc::new(FirmAdapter { pool })
    }

    async fn route(&self, item: &Arrived) -> Result<(), Reject> {
        let header = hub::admit(IdentityKind::LawFirm, &self.pool, &[COURTS], item).await?;
        // The answer to an invitation this firm issued must come from the address the invitation went to.
        if header.kind == KIND_RESPONSE {
            let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
            let sent_to: Option<Option<String>> = sqlx::query_scalar("SELECT address FROM court_links WHERE id = ?").bind(&response.invite_id).fetch_optional(&self.pool).await.map_err(|e| Reject::Retry(e.to_string()))?;
            if let Some(Some(address)) = sent_to {
                if address != item.from {
                    return Err(Reject::Refuse(format!("This answer came from {}, but the invitation was sent to {address}. Nothing was kept.", item.from)));
                }
            }
        }
        match court_notices::import_package(&self.pool, &item.bytes).await {
            Ok(_) => {
                if header.kind == KIND_RESPONSE {
                    let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
                    hub::bind(&self.pool, COURTS, &response.invite_id, &item.from).await.map_err(|e| Reject::Retry(e.to_string()))?;
                }
                Ok(())
            }
            Err(DomainError::Db(e)) => Err(Reject::Retry(e.to_string())),
            Err(DomainError::Invalid(m)) if m.contains("already been received") => Err(Reject::Duplicate),
            Err(e) => Err(Reject::Refuse(e.to_string())),
        }
    }
}

impl Adapter for FirmAdapter {
    fn open<'a>(&'a self, item: &'a Arrived) -> Fut<'a, Result<(), Reject>> {
        Box::pin(self.route(item))
    }

    /// A firm invites the registry; no one invites a firm, so nothing waits for a person here.
    fn waits(&self, _kind: &str) -> bool {
        false
    }

    fn describe(&self, _item: &Arrived) -> Option<Value> {
        None
    }

    fn audit<'a>(&'a self, action: &'a str, detail: String) -> Fut<'a, ()> {
        Box::pin(async move {
            let _ = audit::log(&self.pool, Entry::new(action).detail(detail)).await;
        })
    }

    /// This firm issues the invitations to court registries, so it is the one that ends those links.
    fn issued(&self) -> &'static [Links] {
        ALL
    }

    fn peers(&self) -> &'static [Links] {
        ALL
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pleadli_interchange::envelope::{self, Body};
    use pleadli_interchange::identity::Identity;
    use pleadli_interchange::messages::*;

    fn arrived(kind: &str, from: &str, bytes: Vec<u8>) -> Arrived {
        Arrived { id: uuid::Uuid::new_v4().to_string(), from: from.to_string(), kind: kind.to_string(), sha256: String::new(), bytes, arrived_at: 1 }
    }
    fn refused(r: Result<(), Reject>) -> String {
        match r {
            Err(Reject::Refuse(m)) => m,
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    /// The firm's postbox, with the registry played by the shared contract: the answer and everything after must come
    /// from the address the invitation went to, a copy changes nothing, a registry cannot send what its kind has no
    /// path for (a custody order is not a firm's), and a notice arrives to be filed by a person.
    #[tokio::test]
    async fn the_firm_takes_notices_only_from_its_registry_at_its_address() {
        let dir = std::env::temp_dir().join(format!("pleadli-lawyers-postbox-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        court_notices::create_identity(&pool, "Postbox Test Advocates", Some("Kampala")).await.unwrap();
        let adapter = FirmAdapter { pool: pool.clone() };

        let court = Identity::generate(IdentityKind::CourtRegistry, "Postbox Test Registry", Some("Kampala"));
        let (link, invite_file) = court_notices::create_invite(&pool, "Postbox Test Registry", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        hub::bind(&pool, COURTS, &link.id, "ug.court.real").await.unwrap();
        let answer = pairing::make_response(&court, &invite, None).unwrap();
        let m = refused(adapter.open(&arrived(KIND_RESPONSE, "ug.court.impostor", answer.clone())).await);
        assert!(m.contains("invitation was sent to ug.court.real"), "{m}");
        let linked: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM court_links WHERE court_id IS NOT NULL").fetch_one(&pool).await.unwrap();
        assert_eq!(linked, 0);
        adapter.open(&arrived(KIND_RESPONSE, "ug.court.real", answer)).await.unwrap();
        let typed = court_notices::list_links(&pool).await.unwrap()[0].fingerprint.clone().unwrap();
        court_notices::trust_link(&pool, &link.id, &typed).await.unwrap();

        let firm = court_notices::require_identity(&pool).await.unwrap().public;
        let notice = serde_json::to_value(CourtNoticePayload { notice_key: "s1".into(), kind: "hearing".into(), court_name: "Registry".into(), court_number: "CR 1/2026".into(), case_title: "Uganda v T".into(), title: "Notice of hearing".into(), at: Some(1), issued_at: 1, ..Default::default() }).unwrap();
        let seal = |kind: &str, seq: u64, json: serde_json::Value| envelope::seal(&court, &firm, kind, seq, None, &Body::new(json)).unwrap().0;
        let one = seal(KIND_COURT_NOTICE, 1, notice.clone());
        let m = refused(adapter.open(&arrived(KIND_COURT_NOTICE, "ug.court.other", one.clone())).await);
        assert!(m.contains("answered from ug.court.real"), "{m}");
        let held = || sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM notices_in").fetch_one(&pool);
        assert_eq!(held().await.unwrap(), 0);
        adapter.open(&arrived(KIND_COURT_NOTICE, "ug.court.real", one.clone())).await.unwrap();
        assert_eq!(held().await.unwrap(), 1);
        assert!(matches!(adapter.open(&arrived(KIND_COURT_NOTICE, "ug.court.real", one)).await, Err(Reject::Duplicate)));
        assert_eq!(held().await.unwrap(), 1);

        // Validly signed by the trusted registry, but not a kind a registry sends a firm.
        let order = seal(KIND_CUSTODY_ORDER, 2, serde_json::json!({}));
        let m = refused(adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.court.real", order.clone())).await);
        assert!(m.contains("court registry is not allowed"), "{m}");
        assert!(court_notices::import_package(&pool, &order).await.is_err(), "the same package handed straight to the import, as a modified client would");
        // Tampered.
        let mut bad = seal(KIND_COURT_NOTICE, 3, notice);
        let last = bad.len() - 3;
        bad[last] ^= 1;
        refused(adapter.open(&arrived(KIND_COURT_NOTICE, "ug.court.real", bad)).await);
        assert_eq!(held().await.unwrap(), 1);
        pool.close().await;
    }

    /// The firm ends a registry's connection: a reason is required, the registry gets a signed notice with it, nothing more
    /// is taken from the registry, and ending it twice is refused.
    #[tokio::test]
    async fn a_firm_that_ends_a_registrys_connection_tells_it_and_takes_nothing_more_from_it() {
        let dir = std::env::temp_dir().join(format!("pleadli-lawyers-revoke-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = crate::db::startup(&dir).await.ok().unwrap().pool;
        court_notices::create_identity(&pool, "Revoke Test Advocates", Some("Kampala")).await.unwrap();
        let adapter = FirmAdapter { pool: pool.clone() };
        let court = Identity::generate(IdentityKind::CourtRegistry, "Revoke Test Registry", Some("Kampala"));
        let (link, invite_file) = court_notices::create_invite(&pool, "Revoke Test Registry", 7).await.unwrap();
        let invite = pairing::read_invite(&invite_file).unwrap();
        hub::bind(&pool, COURTS, &link.id, "ug.court.real").await.unwrap();
        adapter.open(&arrived(KIND_RESPONSE, "ug.court.real", pairing::make_response(&court, &invite, None).unwrap())).await.unwrap();
        assert!(court_notices::revoke_link(&pool, &link.id, "Too early.").await.is_err(), "only a trusted registry can be ended");
        let typed = court_notices::list_links(&pool).await.unwrap()[0].fingerprint.clone().unwrap();
        court_notices::trust_link(&pool, &link.id, &typed).await.unwrap();

        assert!(court_notices::revoke_link(&pool, &link.id, "   ").await.is_err(), "a reason is required");
        let (ended, notice_file) = court_notices::revoke_link(&pool, &link.id, "Registry key was lost.").await.unwrap();
        assert_eq!((ended.status.as_str(), ended.revoked_reason.as_deref()), ("revoked", Some("Registry key was lost.")));
        assert!(ended.revoked_at.is_some());
        // The registry reads a signed notice from the firm that carries the reason.
        let firm = court_notices::require_identity(&pool).await.unwrap().public;
        let (_, said) = pairing::read_confirmation(&court, &firm, &notice_file).unwrap();
        assert_eq!((said.outcome.as_str(), said.reason.as_deref()), ("revoked", Some("Registry key was lost.")));
        assert!(court_notices::revoke_link(&pool, &link.id, "Again.").await.is_err(), "ending it twice is refused");

        // Nothing more is taken from the registry, and the refusal says why.
        let notice = serde_json::to_value(CourtNoticePayload { notice_key: "s9".into(), kind: "hearing".into(), court_name: "Registry".into(), court_number: "CR 9/2026".into(), case_title: "Uganda v R".into(), title: "Notice".into(), at: Some(1), issued_at: 1, ..Default::default() }).unwrap();
        let late = envelope::seal(&court, &firm, KIND_COURT_NOTICE, 1, None, &Body::new(notice)).unwrap().0;
        let m = refused(adapter.open(&arrived(KIND_COURT_NOTICE, "ug.court.real", late)).await);
        assert!(m.contains("ended its connection"), "{m}");
        let held: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM notices_in").fetch_one(&pool).await.unwrap();
        assert_eq!(held, 0);
        // The relay link is ended later, so nothing is recorded as ended there yet.
        let relay_ended: Option<i64> = sqlx::query_scalar("SELECT relay_ended_at FROM court_links WHERE id = ?").bind(&link.id).fetch_one(&pool).await.unwrap();
        assert!(relay_ended.is_none());
        pool.close().await;
    }
}
