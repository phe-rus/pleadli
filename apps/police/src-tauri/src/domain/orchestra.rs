//! Pleadli Orchestra for Police: what pleadli_node_core::orchestra needs to
//! know about this application (docs/platform/ORCHESTRA-PLAN.md section 3).

use std::path::PathBuf;
use std::sync::Arc;

use pleadli_node_core::orchestra::{App, Orchestra};
use pleadli_node_core::snapshot::FolderDocuments;
use sqlx::SqlitePool;

/// Papers that leave the station, and the kind /verify names them by. Station
/// registers, rosters and diaries stay inside and are not sent.
const PAPER_KINDS: &[(&str, &str)] = &[("charge_sheet", "charge_sheet"), ("bond", "police_bond"), ("referral", "letter")];

/// A Police backup without these is not a Police backup.
const REQUIRED_TABLES: &[&str] = &["officers", "installation"];

pub fn start(pool: SqlitePool, data_dir: PathBuf, vault_root: PathBuf) -> Arc<Orchestra> {
    let app = App {
        application: "police",
        version: env!("CARGO_PKG_VERSION"),
        keystore_service: super::keys::SERVICE,
        paper_kinds: PAPER_KINDS,
        required_tables: REQUIRED_TABLES,
        latest_migration: crate::db::latest_migration(),
    };
    Orchestra::new(app, pool, data_dir, Arc::new(FolderDocuments(vault_root)))
}
