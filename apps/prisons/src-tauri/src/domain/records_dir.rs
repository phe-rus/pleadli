//! Pleadli Prisons' records directory (docs/platform/RECORDS-DIRECTORY.md): each prisoner's record
//! as a folder the office keeps in its own Documents folder, written by
//! `pleadli_node_core::records_db` and read back to rebuild the database.
//!
//! This file only says what Prisons' main records are, which tables are machine-only, and which
//! tables may appear as a readable paper. The rest is the shared module.

use pleadli_node_core::orchestra::Orchestra;
use pleadli_node_core::records_db::{Layout, Root};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// Tables a first-run restore takes from the folder over the defaults a new database starts with.
pub const RESTORE_REPLACES: &[&str] = &["auth_policy", "hq_config"];

pub fn layout() -> Layout {
    Layout {
        institution: "prisons",
        roots: vec![Root {
            table: "prisoners",
            kind: "prisoners",
            reference_cols: &["reference"],
            title_cols: &["first_name", "last_name"],
            restricted_col: None,
        }],
        excluded: &[
            "officers_v2", "hq_session", "hq_pairing_codes", "cloudflare_config", "cloudflare_tunnel_state",
            "peer_sync_config", "sync_classes", "sync_outbox", "auth_policy_new", "sessions", "devices", "device_enrolment_codes",
            "node_config", "court_identity", "court_links", "orchestra_state", "orchestra_papers", "orchestra_backups",
            "facility_connection_requests", "facility_officers", "facility_connection", "capture_sessions",
        ],
        station_only: &["audit_log"],
        open_tables: &[
            "prisoners", "receptions", "instruments", "sentences", "stays", "releases", "transfers", "transfers_v2", "court_productions",
            "custody_orders_in", "custody_receipts_out", "court_reports_out", "issued_documents",
        ],
        redact_cols: &["secret"],
        hidden_cols: &["created_by", "updated_by"],
    }
}

/// Where the office's records live: its Documents folder. A development installation keeps
/// them beside its own data.
pub fn home(documents: Option<PathBuf>, data_dir: &Path) -> PathBuf {
    if let Ok(p) = std::env::var("PLEADLI_RECORDS_DIR") {
        if !p.trim().is_empty() {
            return PathBuf::from(p);
        }
    }
    match documents {
        Some(d) => d.join("Pleadli Prisons"),
        None => data_dir.join("records"),
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
                if let Ok(Some(Some(name))) = sqlx::query_scalar::<_, Option<String>>("SELECT name FROM facility_profile WHERE id = 'default'").fetch_optional(&pool).await {
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
    use pleadli_node_core::{backup, records_db};
    use sqlx::Row;
    use uuid::Uuid;

    const PHRASE: &str = "000G-40R4-0M30-E209-185G-R38E-1YZ4-BJS6";

    async fn facility() -> (SqlitePool, PathBuf, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-prisons-records-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let vault = dir.join("vault");
        let started = crate::db::startup(&dir, &vault, None).await.ok().unwrap();
        (started.pool, vault, dir)
    }

    /// The real schema: a prisoner admitted on a remand warrant, written to the records folder,
    /// then rebuilt into an empty facility with only the folder and the recovery phrase.
    #[tokio::test]
    async fn a_facility_is_rebuilt_from_its_records_folder() {
        let (a, a_vault, a_dir) = facility().await;
        let records_root = std::env::temp_dir().join(format!("pleadli-prisons-folder-{}", Uuid::new_v4()));
        sqlx::query("INSERT INTO prisoners (id, first_name, last_name, reference, status, admission_instrument_type, admission_authority, admitted_at) VALUES ('p-1', 'Moses', 'Kibuuka', 'LUZ/412/2026', 'unconvicted', 'remand_warrant', 'Buganda Road Chief Magistrates Court', 1760000000000)")
            .execute(&a)
            .await
            .unwrap();

        let entropy = backup::read_recovery_phrase(PHRASE).unwrap();
        let institution = records_db::InstitutionKey::from(&backup::institution_key(&entropy));
        let report = records_db::sync(&a, &a_vault, &records_root, &a_dir, &layout(), Some(&institution)).await.unwrap();
        assert!(report.records >= 1, "{report:?}");
        let paper = records_db::read_paper(&records_root, "p-1").expect("the prisoner has a readable paper");
        assert!(paper.contains("LUZ/412/2026") && paper.contains("Buganda Road"), "{paper}");

        let (b, b_vault, b_dir) = facility().await;
        let rk = records_db::unlock_with_phrase(&records_root, &b_dir, PHRASE).unwrap();
        let rep = records_db::recover(&b, &b_vault, &records_root, &std::env::temp_dir().join("prisons-recover-marker"), &rk, &[]).await.unwrap();
        assert!(rep.skipped.is_empty(), "{rep:?}");
        let name: String = sqlx::query("SELECT last_name FROM prisoners WHERE id = 'p-1'").fetch_one(&b).await.unwrap().get(0);
        assert_eq!(name, "Kibuuka");
        a.close().await;
        b.close().await;
    }
}
