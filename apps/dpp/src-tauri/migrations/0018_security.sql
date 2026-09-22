-- Security foundation (docs/dpp/SECURITY.md). Three additions.
--
-- 1. `content_sha256` on attachments: the SHA-256 of the document as it was
--    received, taken when it is sealed into the vault, so a document read back
--    can be proven to be the one that was stored.
-- 2. `security_settings`: the app lock (an Argon2 hash of the passphrase, never
--    the passphrase) and how long the app may sit idle before it locks.
-- 3. `audit_log`: an append-only, hash-chained record of the events that matter
--    (decisions, reviews, documents issued, attachments, the lock, backups).
--    Each entry commits to the one before it, so removing or altering an entry
--    breaks the chain, and the triggers refuse to update or delete a row at all.
ALTER TABLE attachments ADD COLUMN content_sha256 TEXT;

CREATE TABLE security_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE audit_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    actor TEXT,
    action TEXT NOT NULL,
    subject_type TEXT,
    subject_id TEXT,
    file_id TEXT,
    detail TEXT,
    prev_hash TEXT NOT NULL,
    hash TEXT NOT NULL
);

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit trail is append-only.'); END;
