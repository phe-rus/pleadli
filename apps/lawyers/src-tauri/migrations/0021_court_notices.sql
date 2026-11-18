-- Court -> firm exchange (docs/interchange/court-firm.md): this firm's identity,
-- the court registries it invited and confirmed, the notices that arrive (held apart
-- from the matters until a person files them) and the receipts it sends back.

CREATE TABLE firm_identity (
    id TEXT PRIMARY KEY DEFAULT 'default',
    office_id TEXT NOT NULL,
    office_name TEXT NOT NULL,
    jurisdiction TEXT,
    verifying_key TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    encryption_secret TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- One row per invitation to a court registry. status: invited, awaiting_confirmation,
-- trusted, declined, revoked.
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
CREATE UNIQUE INDEX one_live_court_link ON court_links (court_id) WHERE court_id IS NOT NULL AND status IN ('awaiting_confirmation', 'trusted');

-- `id` is the package's own id, so the same package cannot arrive twice.
CREATE TABLE notices_in (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    decided_at INTEGER,
    decided_by TEXT,
    return_reason TEXT,
    matter_id TEXT REFERENCES matters(id),
    outcome_ref TEXT
);

CREATE TABLE notice_receipts_out (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES court_links(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    exported_at INTEGER
);
