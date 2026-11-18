-- Court -> prison exchange (docs/interchange/court-prison.md): the facilities
-- that invited this registry, the remand and release orders sent to them, and
-- their receipts. This registry's own identity is exchange_identity.

-- One row per invitation answered. status: answered (waiting for the facility
-- to confirm), trusted, declined.
CREATE TABLE prison_links (
    id TEXT PRIMARY KEY,
    prison_id TEXT NOT NULL,
    prison_name TEXT NOT NULL,
    prison_jurisdiction TEXT,
    prison_verifying_key TEXT NOT NULL,
    prison_encryption_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    responded_at INTEGER NOT NULL,
    trusted_at INTEGER,
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_live_prison_link ON prison_links (prison_id) WHERE status IN ('answered', 'trusted');

-- `id` is the package's own id; `order_id` the order it carried.
CREATE TABLE prison_outgoing (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES prison_links(id),
    order_id TEXT NOT NULL REFERENCES orders(id),
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL
);

CREATE TABLE prison_incoming (
    id TEXT PRIMARY KEY,
    link_id TEXT NOT NULL REFERENCES prison_links(id),
    order_id TEXT NOT NULL,
    order_package_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    package_sha256 TEXT NOT NULL
);
