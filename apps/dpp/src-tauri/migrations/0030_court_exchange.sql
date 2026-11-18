-- DPP -> Court exchange (docs/interchange/dpp-court.md): the court registries
-- that invited this office, the filings it sent, and the receipts that came
-- back. This office's own identity is the one in interchange_identity.

-- One row per invitation answered. status: answered (waiting for the registry
-- to confirm), trusted, declined.
CREATE TABLE court_links (
    id TEXT PRIMARY KEY,
    court_id TEXT NOT NULL,
    court_name TEXT NOT NULL,
    court_jurisdiction TEXT,
    court_verifying_key TEXT NOT NULL,
    court_encryption_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    responded_at INTEGER NOT NULL,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_live_court_link ON court_links (court_id) WHERE status IN ('answered', 'trusted');

CREATE TABLE court_outgoing (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    route TEXT
);

-- Receipts from the registry. `id` is the package's own id: one cannot arrive twice.
CREATE TABLE court_incoming (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL
);
