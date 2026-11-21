-- The postbox (docs/platform/RELAY-DESIGN.md): the sealed packages of the
-- exchange travel through pleadli.com instead of a USB stick. The two tables
-- are node-core's postbox::TABLE_SQL, copied here as every app must.
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

-- Where an office answers from on the relay: the relay's own word for who
-- posted its invitation, checked again on everything that claims to be from it.
ALTER TABLE dpp_connections ADD COLUMN office_address TEXT;
