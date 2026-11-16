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

-- A filed document carries its own verification code (QR and line on the
-- paper), set when it is filed, and is printed from the document itself, not
-- stamped. So that pleadli.com/verify can answer for it, each filed document
-- is also kept in paper_prints under that code (documents::seal does it from
-- now on); the ones already filed are added here. The body is the sealed
-- content, so body_sha256 is the document's own content_sha256.
INSERT OR IGNORE INTO paper_prints (code, entity_type, entity_id, reference, title, body, body_sha256, printed_by, printed_at)
SELECT json_extract(content, '$.verifyCode'),
       CASE WHEN kind LIKE '%letter' OR kind IN ('legal_opinion', 'government_notice') THEN 'filed_letter' ELSE 'filed_document' END,
       id, reference, title, content, content_sha256, filed_by, filed_at
FROM documents
WHERE status = 'filed' AND json_extract(content, '$.verifyCode') IS NOT NULL AND content_sha256 IS NOT NULL AND filed_at IS NOT NULL;
