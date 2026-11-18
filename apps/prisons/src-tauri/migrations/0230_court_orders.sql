-- Court -> prison exchange (docs/interchange/court-prison.md), the facility's
-- half: this facility's identity, the court registries it invited, the orders
-- they sent (held as claims until a person records them against a prisoner),
-- and the receipts sent back.

CREATE TABLE court_identity (
    id TEXT PRIMARY KEY CHECK (id = 'default'),
    facility_id TEXT NOT NULL,
    facility_name TEXT NOT NULL,
    jurisdiction TEXT,
    verifying_key TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    encryption_secret TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- status: invited, awaiting_confirmation (the registry answered), trusted, declined.
CREATE TABLE court_links (
    id TEXT PRIMARY KEY,
    intended_court TEXT NOT NULL,
    status TEXT NOT NULL,
    invite_nonce TEXT NOT NULL,
    invite_expires_at INTEGER NOT NULL,
    court_id TEXT,
    court_name TEXT,
    court_jurisdiction TEXT,
    court_verifying_key TEXT,
    court_encryption_key TEXT,
    fingerprint TEXT,
    responded_at INTEGER,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_live_court_link ON court_links (court_id) WHERE status IN ('awaiting_confirmation', 'trusted');

-- `id` is the package's own id: one cannot arrive twice.
-- status: received, recorded, returned.
CREATE TABLE custody_orders_in (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    decided_at INTEGER,
    decided_by TEXT,
    reason TEXT,
    prisoner_id TEXT,
    instrument_id TEXT
);

CREATE TABLE custody_receipts_out (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    in_reply_to TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL
);
