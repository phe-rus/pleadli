-- Station <-> DPP exchange (docs/interchange/police-dpp.md): this station's own
-- identity, the DPP offices it has been invited by, and the packages that go
-- and come, by file or through the postbox. A package is a claim: what arrives
-- is held here and a person reads it; nothing in it changes a case by itself.

CREATE TABLE exchange_identity (
    id TEXT PRIMARY KEY DEFAULT 'default',
    station_id TEXT NOT NULL,
    station_name TEXT NOT NULL,
    jurisdiction TEXT,
    verifying_key TEXT NOT NULL,
    encryption_key TEXT NOT NULL,
    signing_secret TEXT NOT NULL,
    encryption_secret TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- One row per invitation this station accepted. `id` is the invitation's id.
-- status: answered (waiting for the office to confirm), trusted, declined, revoked.
CREATE TABLE dpp_connections (
    id TEXT PRIMARY KEY,
    office_id TEXT NOT NULL,
    office_name TEXT NOT NULL,
    office_jurisdiction TEXT,
    office_verifying_key TEXT NOT NULL,
    office_encryption_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    responded_at INTEGER NOT NULL,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE UNIQUE INDEX one_live_dpp_connection ON dpp_connections (office_id) WHERE status IN ('answered', 'trusted');

-- What this station sent: a referral, built into a package when exported.
CREATE TABLE exchange_outgoing (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES dpp_connections(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    referral_id TEXT REFERENCES referrals(id),
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    exported_at INTEGER,
    -- how it left: file or postbox
    route TEXT
);

-- What the office sent back: receipts and decision notices. `id` is the
-- package's own id, so one cannot arrive twice.
CREATE TABLE exchange_incoming (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES dpp_connections(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received'
);
