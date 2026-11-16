//! Pleadli Orchestra for DPP: what pleadli_node_core::orchestra needs to know
//! about this application (docs/platform/ORCHESTRA-PLAN.md section 3).
//!
//! What is DPP's own: restoring either kind of backup (this one, or the
//! passphrase backup in backup.rs) goes through `backup::apply_pending_restore`
//! at the next start, since both stage the same way.

use std::path::PathBuf;
use std::sync::Arc;

use pleadli_node_core::orchestra::{App, Orchestra};
use pleadli_node_core::snapshot::SealedVault;
use sqlx::SqlitePool;

/// Papers that leave the office, and the kind /verify names them by. The
/// office's own file papers (covers, minute sheets, reviews) stay inside.
/// Issued documents are recorded under their own code when they are issued.
const PAPER_KINDS: &[(&str, &str)] = &[("issued_charge_sheet", "charge_sheet"), ("issued_document", "letter")];

/// A DPP backup without these is not a DPP backup.
const REQUIRED_TABLES: &[&str] = &["prosecution_files", "installation"];

/// Documents come from the sealed vault (`SealedVault`: each attachment read
/// plain, by its id). Packages received from stations (`incoming/`) are not in
/// a backup, as with the passphrase backup: they are claims waiting to be
/// read, not records.
pub fn start(pool: SqlitePool, data_dir: PathBuf, vault_root: PathBuf) -> Arc<Orchestra> {
    let app = App {
        application: "dpp",
        version: env!("CARGO_PKG_VERSION"),
        keystore_service: super::keys::SERVICE,
        paper_kinds: PAPER_KINDS,
        required_tables: REQUIRED_TABLES,
        latest_migration: crate::db::latest_migration(),
    };
    Orchestra::new(app, pool, data_dir, Arc::new(SealedVault(vault_root)))
}
