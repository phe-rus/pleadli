//! Pleadli Police's records directory (docs/platform/RECORDS-DIRECTORY.md): the station's cases
//! and people as folders the station keeps in its own Documents folder, written by
//! `pleadli_node_core::records_db` and read back to rebuild the database.
//!
//! This file only says what Police's main records are, which tables are machine-only, and which
//! tables may appear as a readable paper. The rest is the shared module.

use pleadli_node_core::orchestra::Orchestra;
use pleadli_node_core::records_db::{Layout, Root};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// Tables a first-run restore takes from the folder over the defaults a new database starts with.
pub const RESTORE_REPLACES: &[&str] = &["auth_policy", "station_profile"];

pub fn layout() -> Layout {
    Layout {
        institution: "police",
        roots: vec![
            Root { table: "cases", kind: "cases", reference_cols: &["reference"], title_cols: &["summary"], restricted_col: Some("restricted") },
            Root { table: "people", kind: "people", reference_cols: &[], title_cols: &["first_name", "last_name"], restricted_col: None },
        ],
        excluded: &[
            "app_sessions", "auth_events", "auth_policy_new", "remote_sessions", "remote_access_log", "remote_access_settings",
            "cloudflare_config", "cloudflare_tunnel_state", "orchestra_state", "orchestra_papers", "orchestra_backups", "exchange_identity",
            "library_folders", "library_trash", "backup_alerts", "command_link", "connection_requests", "dpp_connections",
        ],
        station_only: &["audit_log"],
        open_tables: &["cases", "exhibits", "exhibit_movements", "charge_sheets", "referrals"],
        redact_cols: &["secret"],
        hidden_cols: &["crb_number", "crb_year", "restricted", "restricted_by", "incident_id"],
    }
}

/// Where the station's records live: its Documents folder, in a folder named for the app. A
/// development installation keeps them beside its own data so it never touches a real station's.
pub fn home(documents: Option<PathBuf>, data_dir: &Path, own_data: bool) -> PathBuf {
    if let Ok(p) = std::env::var("PLEADLI_RECORDS_DIR") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    match (own_data, documents) {
        (false, Some(d)) => d.join("Pleadli Police"),
        _ => data_dir.join("records"),
    }
}

pub struct Context {
    pub root: PathBuf,
    pub data_dir: PathBuf,
    pub vault_root: PathBuf,
    pub orchestra: Option<Arc<Orchestra>>,
}

static CONTEXT: OnceLock<Context> = OnceLock::new();

pub fn install(ctx: Context) {
    let _ = CONTEXT.set(ctx);
}

pub fn context() -> Result<&'static Context, String> {
    CONTEXT.get().ok_or_else(|| "The records folder is not set up yet.".to_string())
}

/// Writes saved work to the folder as soon as it is saved (see `request_save`), and reconciles every 45 s.
/// The database is still the working copy; this
/// mirrors it, never deletes, and says nothing unless something is wrong.
pub fn start_mirror(pool: SqlitePool) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(4)).await;
        loop {
            if let Ok(ctx) = context() {
                if !pleadli_node_core::records_db::is_locked(&ctx.root, &ctx.data_dir) {
                    let key = match &ctx.orchestra {
                        Some(o) => o.institution_key().await,
                        None => None,
                    }
                    .or_else(pleadli_node_core::records_db::debug_institution_key);
                    if let Err(e) = pleadli_node_core::records_db::sync(&pool, &ctx.vault_root, &ctx.root, &ctx.data_dir, &layout(), key.as_ref()).await {
                        if !matches!(e, pleadli_node_core::records_db::Error::NotAttached) {
                            log::warn!("records folder: {e}");
                        }
                    }
                }
            }
            if let Ok(ctx) = context() {
                if let Ok(Some(Some(name))) = sqlx::query_scalar::<_, Option<String>>("SELECT name FROM station_profile WHERE id = 'default'").fetch_optional(&pool).await {
                    pleadli_node_core::records_db::set_name(&ctx.root, &name);
                }
            }
            pleadli_node_core::records_db::wait_for_save(Duration::from_secs(45)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{attachments, cases, exhibits, people, statements};
    use pleadli_node_core::{backup, records, records_db};
    use sqlx::Row;
    use std::collections::BTreeMap;
    use uuid::Uuid;

    const PHRASE: &str = "000G-40R4-0M30-E209-185G-R38E-1YZ4-BJS6";

    async fn station() -> (crate::db::Db, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-records-station-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        (crate::db::startup(&dir, dir.join("legacy")).await.ok().unwrap(), dir)
    }

    async fn counts(pool: &SqlitePool) -> BTreeMap<String, i64> {
        let layout = layout();
        let names: Vec<String> = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_sqlx%' ESCAPE '\\'")
            .fetch_all(pool)
            .await
            .unwrap()
            .iter()
            .map(|r| r.get::<String, _>(0))
            .collect();
        let mut out = BTreeMap::new();
        for t in names.into_iter().filter(|t| !layout.excluded.contains(&t.as_str())) {
            let n: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT COUNT(*) FROM \"{t}\""))).fetch_one(pool).await.unwrap();
            out.insert(t, n);
        }
        out
    }

    /// The real schema, real domain functions: a theft case with a witness statement and an
    /// exhibit photograph, written to the records folder, then rebuilt into an empty station.
    #[tokio::test]
    async fn a_station_is_rebuilt_from_its_records_folder() {
        let (a, a_dir) = station().await;
        let records_root = std::env::temp_dir().join(format!("pleadli-records-{}", Uuid::new_v4()));

        let witness = people::create_person(
            &a.pool,
            &a.vault_root,
            people::CreatePersonInput { first_name: "Moses".into(), last_name: "Kibuuka".into(), other_names: None, phone: Some("0772 000 111".into()), national_id: None, address: Some("Kisenyi, Kampala".into()), date_of_birth: None, date_of_birth_estimated: false },
        )
        .await
        .unwrap();
        let case = cases::create_case(
            &a.pool,
            &a.vault_root,
            cases::CreateCaseInput {
                reference: "CRB 412/2026".into(),
                summary: "Theft of a motorcycle, Kisenyi Police Station".into(),
                status: "open".into(),
                incident_id: None,
                people: vec![cases::CasePersonInput { person_id: witness.id.clone(), role: "witness".into() }],
                restricted: false,
                actor_id: None,
                access_officer_ids: None,
            },
        )
        .await
        .unwrap();
        statements::create_statement(
            &a.pool,
            &a.vault_root,
            statements::CreateStatementInput {
                content: crate::domain::seed_support::plain_text_to_rich_text_json("On Tuesday morning I saw two men push a red Bajaj Boxer out of the compound."),
                person_id: witness.id.clone(),
                case_id: Some(case.id.clone()),
                officer_id: None,
                officer_name: Some("Sgt Auma".into()),
                given_at: 1_760_000_000_000,
            },
        )
        .await
        .unwrap();
        let exhibit = exhibits::create_exhibit(
            &a.pool,
            &a.vault_root,
            exhibits::CreateExhibitInput {
                case_id: Some(case.id.clone()),
                incident_id: None,
                person_id: None,
                description: "Red Bajaj Boxer, frame no. 44021".into(),
                identification_mark: None,
                recovered_at: 1_760_000_100_000,
                recovered_from_location: Some("Nakawa".into()),
                handed_over_by: None,
                witnesses: None,
                receiving_officer_name: Some("Sgt Auma".into()),
                storage_location: Some("Exhibits store".into()),
                status: "in_store".into(),
                notes: None,
            },
        )
        .await
        .unwrap();
        attachments::add_attachment_bytes(&a.pool, &a.vault_root, "exhibit", &exhibit.id, "frame-number.jpg", b"\xff\xd8\xff photo of the frame number").await.unwrap();

        let entropy = backup::read_recovery_phrase(PHRASE).unwrap();
        let institution = records_db::InstitutionKey::from(&backup::institution_key(&entropy));
        let report = records_db::sync(&a.pool, &a.vault_root, &records_root, &a_dir, &layout(), Some(&institution)).await.unwrap();
        assert_eq!(report.attachments_sealed, 1, "{report:?}");
        assert!(report.attachments_missing.is_empty(), "{report:?}");

        // The case reads as a paper, the statement does not appear in it.
        let scan = records::scan(&records_root).unwrap();
        let folder = &scan.records.iter().find(|r| r.header.id == case.id).expect("the case has a folder").folder;
        let paper = std::fs::read_to_string(folder.join("record.md")).unwrap();
        assert!(paper.contains("CRB 412/2026") && paper.contains("Red Bajaj Boxer"), "{paper}");
        assert!(!paper.contains("push a red Bajaj"), "{paper}");
        assert!(scan.records.iter().all(|r| r.is_intact()));
        // The case's statement and exhibit photograph are in the case's folder, not loose.
        let in_case = std::fs::read_dir(folder.join("attachments")).unwrap().count();
        assert_eq!(in_case, 1);

        // A new computer: nothing but the folder and the phrase.
        let (b, b_dir) = station().await;
        let rk = records_db::unlock_with_phrase(&records_root, &b_dir, PHRASE).unwrap();
        let rep = records_db::recover(&b.pool, &b.vault_root, &records_root, &std::env::temp_dir().join("police-recover-marker"), &rk, &[]).await.unwrap();
        assert!(rep.skipped.is_empty(), "{rep:?}");
        assert_eq!(rep.attachments_restored, 1);

        let (before, after) = (counts(&a.pool).await, counts(&b.pool).await);
        for (table, n) in &before {
            // A fresh station has its own starting rows (settings, rule packs); everything the first
            // station's work added must be there.
            let got = after.get(table).copied().unwrap_or(0);
            assert!(got >= *n, "{table}: {got} restored, {n} expected");
        }
        let restored: String = sqlx::query_scalar("SELECT summary FROM cases WHERE reference = 'CRB 412/2026'").fetch_one(&b.pool).await.unwrap();
        assert_eq!(restored, "Theft of a motorcycle, Kisenyi Police Station");
        let stmt: String = sqlx::query_scalar("SELECT content FROM statements WHERE content LIKE '%Bajaj%'").fetch_one(&b.pool).await.unwrap();
        assert!(stmt.contains("red Bajaj Boxer"), "restored statement was: {stmt}");
        let stored: String = sqlx::query_scalar("SELECT stored_path FROM attachments WHERE entity_id = ?").bind(&exhibit.id).fetch_one(&b.pool).await.unwrap();
        let aid: String = sqlx::query_scalar("SELECT id FROM attachments WHERE entity_id = ?").bind(&exhibit.id).fetch_one(&b.pool).await.unwrap();
        assert_eq!(pleadli_node_core::vault::read(&b.vault_root, &stored, &aid).unwrap(), b"\xff\xd8\xff photo of the frame number");
        a.pool.close().await;
        b.pool.close().await;
    }
}
