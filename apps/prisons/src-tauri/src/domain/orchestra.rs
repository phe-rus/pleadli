//! Pleadli Orchestra for Prisons: what pleadli_node_core::orchestra needs to
//! know about this application (docs/platform/ORCHESTRA-PLAN.md section 3).
//!
//! Each node (a facility, or Head Office) runs it for its own record. The
//! passphrase backups in backup.rs stay as they are; an Orchestra restore is
//! put in place by `snapshot::apply_pending_sealed` (db.rs), and its documents
//! are sealed again by the same `adopt_documents` step as a passphrase restore.

use std::path::PathBuf;
use std::sync::Arc;

use pleadli_node_core::orchestra::{App, Orchestra};
use pleadli_node_core::snapshot::SealedVault;
use sqlx::SqlitePool;

/// Papers that leave the facility, and the kind /verify names them by. None
/// carries a code yet; release and production warrants will, as `release_warrant`
/// and `warrant`, once they are printed as papers.
const PAPER_KINDS: &[(&str, &str)] = &[("release_warrant", "release_warrant"), ("production_warrant", "warrant")];

/// A Prisons backup without these is not a Prisons backup.
const REQUIRED_TABLES: &[&str] = &["prisoners", "officers"];

/// Documents come from the sealed vault (`SealedVault`: each attachment read plain, by its id).
pub fn start(pool: SqlitePool, data_dir: PathBuf, vault_root: PathBuf) -> Arc<Orchestra> {
    let app = App {
        application: "prisons",
        version: env!("CARGO_PKG_VERSION"),
        keystore_service: super::keys::SERVICE,
        paper_kinds: PAPER_KINDS,
        required_tables: REQUIRED_TABLES,
        latest_migration: crate::db::latest_migration(),
    };
    Orchestra::new(app, pool, data_dir, Arc::new(SealedVault(vault_root)))
}
