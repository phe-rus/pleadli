-- Pleadli Orchestra on this computer: the trial and licence, papers sent to
-- pleadli.com/verify, and daily backups to the institution's own storage
-- (pleadli_node_core::orchestra::TABLE_SQL, docs/platform/ORCHESTRA-API.md).
CREATE TABLE orchestra_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE orchestra_papers (
    code TEXT PRIMARY KEY,
    sent_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE TABLE orchestra_backups (
    id TEXT PRIMARY KEY,
    storage_id TEXT,
    storage_label TEXT,
    at INTEGER NOT NULL,
    size_bytes INTEGER,
    ok INTEGER NOT NULL,
    message TEXT,
    reported INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX orchestra_backups_at ON orchestra_backups (at);

-- Papers that can be checked (pleadli_node_core::paper::TABLE_SQL), which
-- Orchestra reads. Orders and warrants carry no code yet; when they do,
-- they go here and are sent to /verify.
CREATE TABLE paper_prints (
    code TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    reference TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    body_sha256 TEXT NOT NULL,
    printed_by TEXT,
    printed_at INTEGER NOT NULL
);

CREATE INDEX paper_prints_entity ON paper_prints (entity_type, entity_id, printed_at);

CREATE TRIGGER paper_prints_no_update BEFORE UPDATE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;

CREATE TRIGGER paper_prints_no_delete BEFORE DELETE ON paper_prints
BEGIN SELECT RAISE(ABORT, 'A printed paper is never changed.'); END;
