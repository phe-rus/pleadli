//! The facility's postbox: the same sealed packages the file route carries, moved through pleadli.com
//! (docs/platform/RELAY-DESIGN.md). The driver is `node-core::hub`, shared with every other app; this module is only
//! what is the facility's own: it exchanges with court registries, and nothing else. It does not exchange with a
//! police station: no such path is defined (the permission table in `interchange::authorization` refuses it).
//!
//! A package is checked against the permission table, then against the address the registry answered from, then
//! handed to the same `import_package` the file route uses, inside one write transaction: it is kept whole or not
//! at all. That import verifies the signature, the trusted link, the kind of package and its content.

use std::sync::Arc;

use pleadli_interchange::identity::IdentityKind;
use pleadli_interchange::pairing::{self, KIND_RESPONSE};
use pleadli_node_core::hub::{self, Adapter, Fut, Hub, Links, Reject};
use pleadli_node_core::postbox::Arrived;
use serde_json::Value;
use sqlx::SqlitePool;

use super::audit::{self, AuditEntry};
use super::authz::Actor;
use super::court_orders;
use super::error::DomainError;
use crate::node::NodeRef;

pub const COURTS: Links = Links { table: "court_links", peer_col: "court_id", peer: IdentityKind::CourtRegistry };

pub struct FacilityAdapter {
    pub pool: SqlitePool,
}

impl FacilityAdapter {
    pub fn new(pool: SqlitePool) -> Arc<FacilityAdapter> {
        Arc::new(FacilityAdapter { pool })
    }

    async fn route(&self, item: &Arrived) -> Result<(), Reject> {
        let header = hub::admit(IdentityKind::PrisonFacility, &self.pool, &[COURTS], item).await?;
        // The answer to an invitation this facility issued must come from the address the invitation went to.
        if header.kind == KIND_RESPONSE {
            let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
            let sent_to: Option<Option<String>> = sqlx::query_scalar("SELECT address FROM court_links WHERE id = ?").bind(&response.invite_id).fetch_optional(&self.pool).await.map_err(|e| Reject::Retry(e.to_string()))?;
            if let Some(Some(address)) = sent_to {
                if address != item.from {
                    return Err(Reject::Refuse(format!("This answer came from {}, but the invitation was sent to {address}. Nothing was kept.", item.from)));
                }
            }
        }
        // One write transaction: the package is kept whole or not at all.
        let mut tx = crate::db::begin_write(&self.pool).await.map_err(|e| Reject::Retry(e.to_string()))?;
        match court_orders::import_package(&mut tx, &item.bytes).await {
            Ok(_) => {
                if header.kind == KIND_RESPONSE {
                    let response = pairing::read_response(&item.bytes).map_err(|e| Reject::Refuse(e.to_string()))?;
                    let sql = "UPDATE court_links SET address = COALESCE(address, ?) WHERE id = ?";
                    sqlx::query(sql).bind(&item.from).bind(&response.invite_id).execute(&mut *tx).await.map_err(|e| Reject::Retry(e.to_string()))?;
                }
                tx.commit().await.map_err(|e| Reject::Retry(e.to_string()))
            }
            Err(DomainError::Db(e)) => Err(Reject::Retry(e.to_string())),
            Err(DomainError::Rejected(m)) if m.contains("already been received") => Err(Reject::Duplicate),
            Err(e) => Err(Reject::Refuse(e.to_string())),
        }
    }
}

impl Adapter for FacilityAdapter {
    fn open<'a>(&'a self, item: &'a Arrived) -> Fut<'a, Result<(), Reject>> {
        Box::pin(self.route(item))
    }

    /// A facility invites the registry; no one invites a facility, so nothing waits for a person here.
    fn waits(&self, _kind: &str) -> bool {
        false
    }

    fn describe(&self, _item: &Arrived) -> Option<Value> {
        None
    }

    fn audit<'a>(&'a self, action: &'a str, detail: String) -> Fut<'a, ()> {
        Box::pin(async move {
            if let Ok(mut tx) = crate::db::begin_write(&self.pool).await {
                let entry = AuditEntry::new(action, "postbox", None).after(&serde_json::json!({ "detail": detail }));
                if audit::record(&mut tx, &Actor::system("postbox"), entry).await.is_ok() {
                    let _ = tx.commit().await;
                }
            }
        })
    }
}

/// Starts the facility's postbox once the licence is set: one driver for the life of the program.
pub fn start(node: &NodeRef) {
    if node.relay.get().is_some() {
        return;
    }
    let Some(orchestra) = node.orchestra.get().cloned() else { return };
    let hub = Hub::new(IdentityKind::PrisonFacility, node.pool.clone(), orchestra, FacilityAdapter::new(node.pool.clone()));
    if node.relay.set(hub.clone()).is_ok() {
        tauri::async_runtime::spawn(hub.run());
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

    /// The facility's postbox, with the registry played by the shared contract: an order is taken in only from the
    /// registry's address and only as a whole, a copy changes nothing, a police station cannot send a thing here
    /// even validly signed, and a registry cannot send a facility what its kind has no path for.
    #[tokio::test]
    async fn the_facility_takes_orders_only_from_its_registry_at_its_address_and_nothing_from_police() {
        let dir = std::env::temp_dir().join(format!("pleadli-prisons-postbox-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(dir.join("vault")).unwrap();
        let pool = match crate::db::startup(&dir, &dir.join("vault"), None).await {
            Ok(s) => s.pool,
            Err(_) => panic!("startup"),
        };
        let adapter = FacilityAdapter { pool: pool.clone() };
        let actor = Actor::system("postbox test");
        let mut c = pool.acquire().await.unwrap();
        court_orders::create_identity(&mut c, &actor, "Postbox Test Prison", Some("Kampala")).await.unwrap();
        let (link, invite_file) = court_orders::create_invite(&mut c, &actor, "Postbox Test Court", 7).await.unwrap();
        let me = court_orders::require_identity(&mut c).await.unwrap().public;
        drop(c);
        let invite = pairing::read_invite(&invite_file).unwrap();
        sqlx::query("UPDATE court_links SET address = 'ug.court.real' WHERE id = ?").bind(&link.id).execute(&pool).await.unwrap();

        let court = Identity::generate(IdentityKind::CourtRegistry, "Postbox Test Court", Some("Kampala"));
        let answer = pairing::make_response(&court, &invite, None).unwrap();
        let m = refused(adapter.open(&arrived(KIND_RESPONSE, "ug.court.impostor", answer.clone())).await);
        assert!(m.contains("invitation was sent to ug.court.real"), "{m}");
        adapter.open(&arrived(KIND_RESPONSE, "ug.court.real", answer)).await.unwrap();
        let mut c = pool.acquire().await.unwrap();
        let typed = court_orders::list_links(&mut c).await.unwrap()[0].fingerprint.clone().unwrap();
        court_orders::trust_link(&mut c, &actor, &link.id, &typed).await.unwrap();
        drop(c);

        let order = CustodyOrderPayload { order_key: "o1".into(), kind: "remand".into(), court_name: "Postbox Test Court".into(), court_number: "CO 5/2026".into(), case_title: "Uganda v X".into(), accused: "Test Accused".into(), prison: "Postbox Test Prison".into(), remand_until: Some(i64::MAX / 2), issued_at: 1, paragraphs: vec!["Test Accused is remanded in custody.".into()], content_sha256: Some("abc".into()), ..Default::default() };
        let seal = |kind: &str, seq: u64, json: serde_json::Value| envelope::seal(&court, &me, kind, seq, None, &Body::new(json)).unwrap().0;
        let one = seal(KIND_CUSTODY_ORDER, 1, serde_json::to_value(&order).unwrap());
        let m = refused(adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.court.other", one.clone())).await);
        assert!(m.contains("answered from ug.court.real"), "{m}");
        let held = || sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM custody_orders_in").fetch_one(&pool);
        let before = held().await;
        adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.court.real", one.clone())).await.unwrap();
        if let (Ok(b), Ok(a)) = (before, held().await) {
            assert_eq!(a, b + 1);
        }
        assert!(matches!(adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.court.real", one)).await, Err(Reject::Duplicate)));

        // An order with no wording is refused whole: the transaction leaves nothing.
        let empty = seal(KIND_CUSTODY_ORDER, 2, serde_json::to_value(CustodyOrderPayload { paragraphs: vec![], ..order.clone() }).unwrap());
        refused(adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.court.real", empty)).await);

        // A police station, validly signed, sends this facility a custody record: no such path is defined, so it is refused
        // by the permission table whatever the station is to anyone else, and the same package handed straight to the import is too.
        let police = Identity::generate(IdentityKind::PoliceStation, "Postbox Test Police Station", Some("Kampala"));
        let transfer = envelope::seal(&police, &me, KIND_CUSTODY_ORDER, 1, None, &Body::new(serde_json::to_value(&order).unwrap())).unwrap().0;
        let m = refused(adapter.open(&arrived(KIND_CUSTODY_ORDER, "ug.police.a", transfer.clone())).await);
        assert!(m.contains("police station is not allowed"), "{m}");
        let mut c = pool.acquire().await.unwrap();
        assert!(court_orders::import_package(&mut c, &transfer).await.is_err());
        // The registry, trusted and validly signed, sends a thing a registry does not send a prison.
        let filing = envelope::seal(&court, &me, KIND_FILING, 3, None, &Body::new(serde_json::json!({}))).unwrap().0;
        let m = refused(adapter.open(&arrived(KIND_FILING, "ug.court.real", filing.clone())).await);
        assert!(m.contains("court registry is not allowed"), "{m}");
        assert!(court_orders::import_package(&mut c, &filing).await.is_err());
        drop(c);
        pool.close().await;
    }
}
