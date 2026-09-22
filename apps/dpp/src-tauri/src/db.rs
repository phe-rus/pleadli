//! Opening the database: the full start of an installation's data, in the order
//! that keeps it safe (docs/dpp/SECURITY.md).
//!
//! Apply a staged restore, find (or make) the key, encrypt a database that is
//! still plaintext, check integrity, snapshot before migrating, migrate, then
//! bring every document into the sealed vault. A database that fails its
//! integrity check is never opened for normal work: the app starts in recovery
//! and offers a restore from a backup.
//!
//! The steps that do not depend on the application live in
//! `packages/node-core` (`db`); this file keeps the order and what is DPP's own.

use sqlx::sqlite::SqlitePool;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use pleadli_node_core::db as core;
pub use pleadli_node_core::db::StartupError;

use crate::domain::backup;
use crate::domain::keys;
use crate::domain::security::Security;

pub struct Db {
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
    /// Where the sealed documents are: `<data dir>/vault`.
    pub vault_root: PathBuf,
    pub security: Arc<Security>,
}

const DB_FILE: &str = "dpp.db";

/// `legacy_vault` is where older builds kept plaintext documents (in the user's
/// own Documents folder); it is read only to move what is there into the sealed
/// vault, and a file there is touched only when a document in the database
/// claims it by id.
pub async fn startup(data_dir: &Path, legacy_vault: Option<&Path>) -> Result<Db, StartupError> {
    let db_path = data_dir.join(DB_FILE);
    let vault_root = data_dir.join("vault");
    let incoming = data_dir.join("vault-incoming");
    std::fs::create_dir_all(data_dir).map_err(|e| StartupError::Fatal(format!("could not create the data folder: {e}")))?;
    crate::domain::attachments::clear_opened(&data_dir.join("opened"));

    core::finish_interrupted_encryption(&db_path);
    let restored = backup::apply_pending_restore(data_dir, &db_path, &vault_root, &incoming).map_err(|e| StartupError::Fatal(format!("could not apply the staged restore: {e}")))?;

    let (db_keys, state) = core::open_keys(keys::SERVICE, data_dir, &db_path)?;
    let opened = core::open_pool(&db_path, data_dir, &db_keys, state, 5).await?;
    let pool = opened.pool;

    let migrator = sqlx::migrate!("./migrations");
    core::snapshot_if_migrating(&pool, &migrator, data_dir, opened.existed, "dpp").await;
    migrator.run(&pool).await.map_err(|e| StartupError::Fatal(format!("migration failed: {e}")))?;

    if let Some(applied) = &restored {
        backup::record_restore(&pool, applied).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    core::adopt_documents(&pool, &vault_root, legacy_vault, &incoming).await?;

    #[cfg(debug_assertions)]
    {
        crate::domain::people::seed_if_empty(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
        crate::domain::prosecution_files::seed_if_empty(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;
    }

    let security = Arc::new(Security::new());
    security.load(&pool).await.map_err(|e| StartupError::Fatal(e.to_string()))?;

    Ok(Db { pool, data_dir: data_dir.to_path_buf(), vault_root, security })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::vault;
    use pleadli_node_core::db::{connect_options, is_plaintext, sibling};
    use sqlx::sqlite::SqlitePoolOptions;

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dpp-startup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// A database from before encryption, as the app used to leave it: plain,
    /// migrated, with one file in it.
    async fn plain_database(dir: &Path) -> PathBuf {
        let path = dir.join(DB_FILE);
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&path)).await.unwrap();
        sqlx::migrate!("./migrations").run(&pool).await.unwrap();
        sqlx::query("INSERT INTO prosecution_files (id, title, received_at) VALUES ('f1', 'State v. Secret Name', 1)").execute(&pool).await.unwrap();
        pool.close().await;
        path
    }

    #[tokio::test]
    async fn an_existing_plain_database_is_encrypted_in_place_and_keeps_every_row() {
        let dir = temp_dir();
        let path = plain_database(&dir).await;
        assert!(is_plaintext(&path));
        assert!(std::fs::read(&path).unwrap().windows(11).any(|w| w == b"Secret Name"), "the name is readable before");

        let db = startup(&dir, None).await.ok().unwrap();
        assert!(!is_plaintext(&path), "the file on disk is no longer a readable SQLite database");
        let bytes = std::fs::read(&path).unwrap();
        assert!(!bytes.windows(11).any(|w| w == b"Secret Name"), "the name is not readable on disk after");
        let title: String = sqlx::query_scalar("SELECT title FROM prosecution_files WHERE id = 'f1'").fetch_one(&db.pool).await.unwrap();
        assert_eq!(title, "State v. Secret Name");
        assert!(!sibling(&path, ".plain-old").exists() && !sibling(&path, ".encrypting").exists(), "no plain leftover");
        db.pool.close().await;

        // Started again, it opens with the same key.
        let again = startup(&dir, None).await.ok().unwrap();
        let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prosecution_files").fetch_one(&again.pool).await.unwrap();
        assert_eq!(n, 1);
    }

    #[tokio::test]
    async fn an_encrypted_database_without_its_key_starts_in_recovery_and_is_not_re_keyed() {
        let dir = temp_dir();
        plain_database(&dir).await;
        drop(startup(&dir, None).await.ok().unwrap());
        std::fs::remove_file(dir.join("node.key")).unwrap();
        match startup(&dir, None).await {
            Err(StartupError::Recovery(_)) => {}
            _ => panic!("expected recovery"),
        }
        assert!(!dir.join("node.key").exists(), "no key was invented for a database that already exists");
    }

    #[tokio::test]
    async fn a_document_left_in_the_old_documents_folder_is_sealed_and_the_plain_file_destroyed() {
        let dir = temp_dir();
        let legacy = temp_dir();
        let path = plain_database(&dir).await;
        let old = legacy.join("files").join("ODPP-0142");
        std::fs::create_dir_all(&old).unwrap();
        let stored = old.join("att-1.pdf");
        std::fs::write(&stored, b"%PDF plain statement").unwrap();
        let pool = SqlitePoolOptions::new().max_connections(1).connect_with(connect_options(&path)).await.unwrap();
        sqlx::query("INSERT INTO attachments (id, entity_type, entity_id, file_name, stored_path, mime_type, size_bytes) VALUES ('att-1', 'prosecution_file', 'f1', 'statement.pdf', ?, 'application/pdf', 20)")
            .bind(stored.to_string_lossy().to_string())
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let db = startup(&dir, Some(&legacy)).await.ok().unwrap();
        assert!(!stored.exists(), "the plain file is gone");
        let (relative, sha): (String, Option<String>) = sqlx::query_as("SELECT stored_path, content_sha256 FROM attachments WHERE id = 'att-1'").fetch_one(&db.pool).await.unwrap();
        assert_eq!(relative, "attachments/att-1.enc");
        assert!(sha.is_some());
        assert_eq!(vault::read(&db.vault_root, &relative, "att-1").unwrap(), b"%PDF plain statement");
    }

    #[tokio::test]
    async fn a_backup_made_on_one_machine_restores_on_another_with_its_documents_and_only_with_its_passphrase() {
        let source = temp_dir();
        plain_database(&source).await;
        let a = startup(&source, None).await.ok().unwrap();
        let doc = crate::domain::attachments::add_attachment_bytes(&a.pool, &a.vault_root, "prosecution_file", "f1", "statement.pdf", b"%PDF the statement").await.unwrap();

        let mut backup_bytes = Vec::new();
        let meta = backup::write_backup(&a.pool, &a.vault_root, &a.data_dir, "a good backup passphrase", &mut backup_bytes).await.ok().unwrap();
        assert_eq!(meta.documents, 1);
        assert!(!backup_bytes.windows(11).any(|w| w == b"Secret Name"), "the backup does not show the record");
        assert!(!backup_bytes.windows(13).any(|w| w == b"the statement"), "the backup does not show the document");
        assert!(std::fs::read_dir(a.data_dir.join("backup-tmp")).unwrap().next().is_none(), "the plain export was destroyed");

        // Another machine: a different data folder, so a different key.
        let target = temp_dir();
        assert!(backup::stage_restore(&target, &backup_bytes[..], "the wrong passphrase").await.is_err());
        assert!(!backup::pending(&target), "a wrong passphrase stages nothing");
        let staged = backup::stage_restore(&target, &backup_bytes[..], "a good backup passphrase").await.ok().unwrap();
        assert_eq!(staged.documents, 1);
        assert!(backup::pending(&target));

        let b = startup(&target, None).await.ok().unwrap();
        assert!(!is_plaintext(&target.join(DB_FILE)), "the restored database is encrypted under this machine's key");
        let title: String = sqlx::query_scalar("SELECT title FROM prosecution_files WHERE id = 'f1'").fetch_one(&b.pool).await.unwrap();
        assert_eq!(title, "State v. Secret Name");
        let (_, bytes) = crate::domain::attachments::read_attachment(&b.pool, &b.vault_root, &doc.id).await.ok().unwrap().unwrap();
        assert_eq!(bytes, b"%PDF the statement");
        let restored: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'backup_restored'").fetch_one(&b.pool).await.unwrap();
        assert_eq!(restored, 1);
        assert!(!backup::pending(&target));
        assert!(std::fs::read_dir(target.join("vault-incoming")).map(|mut d| d.next().is_none()).unwrap_or(true), "no plain document is left behind");
    }
}
