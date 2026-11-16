//! Pleadli Orchestra for Lawyers: what pleadli_node_core::orchestra needs to
//! know about this application (docs/platform/ORCHESTRA-PLAN.md section 3).
//!
//! In a firm the office computer holds the record and runs Orchestra for it:
//! a computer joined to the office passes its calls there (api/network.rs),
//! so the licence, the papers and the backups shown are the office's.

use std::path::PathBuf;
use std::sync::Arc;

use pleadli_node_core::orchestra::{App, Orchestra};
use pleadli_node_core::snapshot::SealedVault;
use sqlx::SqlitePool;

/// Papers that leave the practice, and the kind /verify names them by. Filed
/// documents are recorded under their own code when they are filed: letters
/// (and opinions and statutory notices) as letters, pleadings, affidavits,
/// agreements and the rest as legal documents.
const PAPER_KINDS: &[(&str, &str)] = &[("filed_document", "legal_document"), ("filed_letter", "letter")];

/// A Lawyers backup without these is not a Lawyers backup.
const REQUIRED_TABLES: &[&str] = &["matters", "installation"];

/// Papers come from the sealed vault (`SealedVault`: each read plain, by its id).
pub fn start(pool: SqlitePool, data_dir: PathBuf, vault_root: PathBuf) -> Arc<Orchestra> {
    let app = App {
        application: "lawyers",
        version: env!("CARGO_PKG_VERSION"),
        keystore_service: super::keys::SERVICE,
        paper_kinds: PAPER_KINDS,
        required_tables: REQUIRED_TABLES,
        latest_migration: crate::db::latest_migration(),
    };
    Orchestra::new(app, pool, data_dir, Arc::new(SealedVault(vault_root)))
}
