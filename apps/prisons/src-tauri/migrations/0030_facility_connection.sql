-- Select-your-facility connection (F1). A facility asks Head Office to link
-- an installation to a facility Head Office already knows. The facility makes
-- its own sync token and sends only its SHA-256, so Head Office holds nothing
-- secret at rest. Head Office approves the request (or the facility presents
-- an activation code) and the hash becomes the facility's sync credential.
CREATE TABLE facility_connection_requests (
    id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES facilities(id),
    token_hash TEXT NOT NULL,
    requested_by_badge TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    requested_from TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
    replaces_existing INTEGER NOT NULL DEFAULT 0,
    decided_by_badge TEXT,
    decided_by_name TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_connection_requests_token ON facility_connection_requests (token_hash);
CREATE INDEX idx_connection_requests_status ON facility_connection_requests (status, created_at);
CREATE INDEX idx_connection_requests_facility ON facility_connection_requests (facility_id);

-- The accounts a connected facility reports to Head Office. Never carries a
-- password hash. Replaced wholesale on every roster push.
CREATE TABLE facility_officers (
    facility_id TEXT NOT NULL REFERENCES facilities(id),
    badge_number TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    synced_at INTEGER NOT NULL,
    PRIMARY KEY (facility_id, badge_number)
);

-- The facility side of the connection. NULL connection_state on a row that
-- has a facility_id is a legacy pairing-code registration and counts as
-- connected.
ALTER TABLE peer_sync_config ADD COLUMN connection_state TEXT;
ALTER TABLE peer_sync_config ADD COLUMN connection_request_id TEXT;
ALTER TABLE peer_sync_config ADD COLUMN requested_by_badge TEXT;
ALTER TABLE peer_sync_config ADD COLUMN requested_by_name TEXT;
ALTER TABLE peer_sync_config ADD COLUMN facility_display_name TEXT;
ALTER TABLE peer_sync_config ADD COLUMN roster_pushed_at INTEGER;
ALTER TABLE peer_sync_config ADD COLUMN roster_count INTEGER;
