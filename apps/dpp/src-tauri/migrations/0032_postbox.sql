-- The postbox (docs/platform/RELAY-DESIGN.md): packages already sealed by the
-- interchange layer travel through pleadli.com instead of a USB stick. The two
-- tables are node-core's postbox::TABLE_SQL, copied here as every app must.
CREATE TABLE postbox_outbox (
    id TEXT PRIMARY KEY,
    to_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    bytes BLOB NOT NULL,
    queued_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_try_at INTEGER NOT NULL,
    posted_at INTEGER,
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    delivered_at INTEGER,
    acked_at INTEGER
);

CREATE INDEX postbox_outbox_due ON postbox_outbox (status, next_try_at);

CREATE TABLE postbox_inbox (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    bytes BLOB NOT NULL,
    arrived_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    note TEXT,
    handled_at INTEGER
);

-- Where a station answers from on the relay, learned from the relay's own
-- word for who posted the answer (never from inside the package), and checked
-- again on every package that claims to come from that station.
ALTER TABLE police_connections ADD COLUMN station_address TEXT;

-- The id the sealed package carries, which is the id the relay and the
-- postbox know it by (the row id above is the office's own).
ALTER TABLE outgoing_packages ADD COLUMN relay_package_id TEXT;
