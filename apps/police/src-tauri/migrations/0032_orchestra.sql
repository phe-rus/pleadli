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
