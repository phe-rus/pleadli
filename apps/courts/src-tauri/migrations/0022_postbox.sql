-- The postbox (docs/platform/RELAY-DESIGN.md): the registry's sealed packages for DPP offices, firms and prisons
-- travel through pleadli.com when the institution on the other side has a postbox address.
-- The two tables are node-core's postbox::TABLE_SQL, copied here as every app must.
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

-- Where each institution answers on the relay: learned from the relay's own word for who posted the
-- answer (never from inside a package), kept once, and checked on every package that claims to come from it.
ALTER TABLE dpp_links ADD COLUMN address TEXT;
ALTER TABLE firm_links ADD COLUMN address TEXT;
ALTER TABLE prison_links ADD COLUMN address TEXT;
