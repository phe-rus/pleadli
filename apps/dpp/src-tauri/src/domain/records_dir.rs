//! Pleadli DPP's records directory (docs/platform/RECORDS-DIRECTORY.md): each prosecution file
//! as a folder the office keeps in its own Documents folder, written by
//! `pleadli_node_core::records_db` and read back to rebuild the database.
//!
//! This file only says what DPP's main records are, which tables are machine-only, and which
//! tables may appear as a readable paper. The rest is the shared module.

use pleadli_node_core::orchestra::Orchestra;
use pleadli_node_core::records_db::{Layout, Root};
use sqlx::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use std::time::Duration;

/// Tables a first-run restore takes from the folder over the defaults a new database starts with.
pub const RESTORE_REPLACES: &[&str] = &[];

pub fn layout() -> Layout {
    Layout {
        institution: "dpp",
        roots: vec![
            Root { table: "prosecution_files", kind: "files", reference_cols: &["odpp_registration_number", "police_reference"], title_cols: &["title"], restricted_col: None },
            Root { table: "people", kind: "people", reference_cols: &[], title_cols: &["first_name", "last_name"], restricted_col: None },
        ],
        excluded: &[
            "orchestra_state", "orchestra_papers", "orchestra_backups", "interchange_identity", "active_session", "security_settings",
            "assist_settings", "court_links", "police_connections",
        ],
        station_only: &["audit_log"],
        open_tables: &[
            "prosecution_files", "charges", "decisions", "directions", "documents", "hearings", "hearing_minutes", "filings", "file_items",
            "referrals", "charging_reviews",
        ],
        redact_cols: &["secret", "api_key"],
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
        Some(d) => d.join("Pleadli DPP"),
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
                if let Ok(Some(Some(name))) = sqlx::query_scalar::<_, Option<String>>("SELECT office_name FROM installation LIMIT 1").fetch_optional(&pool).await {
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

    async fn office() -> (crate::db::Db, PathBuf) {
        let dir = std::env::temp_dir().join(format!("pleadli-dpp-records-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        (crate::db::startup(&dir, None).await.ok().unwrap(), dir)
    }

    /// The real schema: a prosecution file, its charge and a document, written to the records
    /// folder, then rebuilt into an empty office with only the folder and the recovery phrase.
    #[tokio::test]
    async fn an_office_is_rebuilt_from_its_records_folder() {
        let (a, a_dir) = office().await;
        let records_root = std::env::temp_dir().join(format!("pleadli-dpp-folder-{}", Uuid::new_v4()));
        sqlx::query("INSERT INTO prosecution_files (id, odpp_registration_number, title, police_station, police_reference, current_status, received_at, notes) VALUES ('f-1', 'ODPP/KLA/412/2026', 'Uganda v. Kibuuka: theft of a motorcycle', 'Kisenyi', 'CRB 412/2026', 'under_review', 1760000000000, 'Sanction file received from Kisenyi.')")
            .execute(&a.pool)
            .await
            .unwrap();

        let entropy = backup::read_recovery_phrase(PHRASE).unwrap();
        let institution = records_db::InstitutionKey::from(&backup::institution_key(&entropy));
        let report = records_db::sync(&a.pool, &a.vault_root, &records_root, &a_dir, &layout(), Some(&institution)).await.unwrap();
        assert!(report.records >= 1, "{report:?}");
        let paper = records_db::read_paper(&records_root, "f-1").expect("the file has a readable paper");
        assert!(paper.contains("ODPP/KLA/412/2026") && paper.contains("theft of a motorcycle"), "{paper}");

        let (b, b_dir) = office().await;
        let rk = records_db::unlock_with_phrase(&records_root, &b_dir, PHRASE).unwrap();
        let rep = records_db::recover(&b.pool, &b.vault_root, &records_root, &std::env::temp_dir().join("dpp-recover-marker"), &rk, &[]).await.unwrap();
        assert!(rep.skipped.is_empty(), "{rep:?}");
        let title: String = sqlx::query("SELECT title FROM prosecution_files WHERE id = 'f-1'").fetch_one(&b.pool).await.unwrap().get(0);
        assert_eq!(title, "Uganda v. Kibuuka: theft of a motorcycle");
        a.pool.close().await;
        b.pool.close().await;
    }
}
