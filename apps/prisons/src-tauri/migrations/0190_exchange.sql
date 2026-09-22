-- The exchange between a facility and Head Office (docs/prisons/product/04).
--
-- 1. The legacy snapshot push is retired. Head Office no longer holds a copy of
--    any facility's people: it keeps counts (`reported_*` on `facilities`) and
--    the returns it is sent. The triggers that fed the push, its class and its
--    queue go, and so do the prisoner copies Head Office already held. A copy is
--    a row that points at a facility Head Office knows; a facility's own
--    records point at none, so they are never touched.
DROP TRIGGER IF EXISTS sync_track_prisoner_insert;
DROP TRIGGER IF EXISTS sync_track_prisoner_update;
DROP TRIGGER IF EXISTS sync_track_prisoner_delete;
DELETE FROM sync_outbox WHERE class = 'legacy_snapshot';
DELETE FROM sync_classes WHERE class = 'legacy_snapshot';
DELETE FROM prisoners WHERE facility_id IN (SELECT id FROM facilities);

-- 2. The facility pins the certificate Head Office showed when a person
--    confirmed it. NULL means the address is a public one (a tunnel) that is
--    checked in the ordinary way.
ALTER TABLE peer_sync_config ADD COLUMN hq_fingerprint TEXT;

-- 3. The facility's own record of each round with Head Office. A row is opened
--    when a round starts and closed when it ends, so a round that never ended
--    (the app was closed mid-round) reads as what it is.
CREATE TABLE exchange_rounds (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'manual', 'startup')),
    outcome TEXT CHECK (outcome IN ('completed', 'nothing_to_send', 'failed', 'unreachable', 'refused', 'awaiting_approval')),
    sent_roster INTEGER NOT NULL DEFAULT 0,
    sent_status INTEGER NOT NULL DEFAULT 0,
    sent_returns INTEGER NOT NULL DEFAULT 0,
    received_policy INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
CREATE INDEX idx_exchange_rounds_started ON exchange_rounds (started_at);

-- 4. Head Office's record of what each facility did to it. Metadata only: which
--    facility, when, what kind, whether it was taken. Never the content.
CREATE TABLE exchange_events (
    id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES facilities(id),
    at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('roster', 'status', 'return', 'policy', 'connection')),
    result TEXT NOT NULL CHECK (result IN ('accepted', 'refused', 'duplicate')),
    detail TEXT,
    via TEXT NOT NULL DEFAULT 'unknown' CHECK (via IN ('lan', 'tunnel', 'unknown'))
);
CREATE INDEX idx_exchange_events_facility ON exchange_events (facility_id, at DESC);
CREATE INDEX idx_exchange_events_at ON exchange_events (at DESC);

-- 5. What a facility says about its own exchange, so a link that is up but not
--    delivering shows at Head Office even when the facility cannot be asked.
ALTER TABLE facilities ADD COLUMN reported_exchange_state TEXT;
ALTER TABLE facilities ADD COLUMN reported_pending INTEGER;
ALTER TABLE facilities ADD COLUMN reported_last_success_at INTEGER;
ALTER TABLE facilities ADD COLUMN reported_last_error TEXT;

-- 6. Whether Head Office accepts facilities on its local network. On by
--    default: it is the point of a Head Office on a LAN, and it can be turned
--    off from the network settings.
ALTER TABLE node_config ADD COLUMN network_lan INTEGER NOT NULL DEFAULT 1;
