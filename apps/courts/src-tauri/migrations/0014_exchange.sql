-- DPP -> Court exchange (docs/interchange/dpp-court.md): this registry's identity,
-- the DPP offices it invited and confirmed, the filings that arrive (held apart
-- from the register until a person accepts them) and the receipts it sends back.

CREATE TABLE exchange_identity (
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

-- One row per invitation to a DPP office. status: invited, awaiting_confirmation,
-- trusted, declined, revoked.
CREATE TABLE dpp_links (
    id TEXT PRIMARY KEY,
    intended_office TEXT NOT NULL,
    status TEXT NOT NULL,
    invite_nonce TEXT NOT NULL,
    invite_expires_at INTEGER NOT NULL,
    dpp_id TEXT,
    dpp_name TEXT,
    dpp_jurisdiction TEXT,
    dpp_verifying_key TEXT,
    dpp_encryption_key TEXT,
    fingerprint TEXT,
    responded_at INTEGER,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_live_dpp_link ON dpp_links (dpp_id) WHERE dpp_id IS NOT NULL AND status IN ('awaiting_confirmation', 'trusted');

-- `id` is the package's own id, so the same package cannot arrive twice.
CREATE TABLE exchange_incoming (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES dpp_links(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    decided_at INTEGER,
    decided_by TEXT,
    reject_reason TEXT,
    case_id TEXT REFERENCES cases(id)
);

CREATE TABLE exchange_outgoing (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES dpp_links(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    exported_at INTEGER
);
