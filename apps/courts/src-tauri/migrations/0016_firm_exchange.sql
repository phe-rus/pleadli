-- Court -> law firm exchange (docs/interchange/court-firm.md): the firms that
-- invited this registry, the notices (hearing dates, order copies) sent to
-- them, and their receipts.
CREATE TABLE firm_links (
    id TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL,
    firm_name TEXT NOT NULL,
    firm_jurisdiction TEXT,
    firm_verifying_key TEXT NOT NULL,
    firm_encryption_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    responded_at INTEGER NOT NULL,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_live_firm_link ON firm_links (firm_id) WHERE status IN ('answered', 'trusted');

-- `id` is the package's own id; `notice_key` the sitting or order it carried.
CREATE TABLE firm_outgoing (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES firm_links(id),
    notice_key TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL
);

CREATE TABLE firm_incoming (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES firm_links(id),
    notice_key TEXT NOT NULL,
    notice_package_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL
);
