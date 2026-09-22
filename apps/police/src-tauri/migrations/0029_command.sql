-- Command (HQ) side: the stations under this command, how they asked to
-- connect, and what they last reported. A Command holds no case or person
-- records: `station_reports` is figures and a roster, replaced by each report.
--
-- A station is registered here first and given a number. It connects by
-- presenting that number and a sync token it made itself; only the SHA-256 of
-- the token is sent, so this table never holds a usable secret. A valid
-- activation code connects it at once; without one an administrator here
-- approves the request.
CREATE TABLE command_stations (
    id TEXT PRIMARY KEY,
    station_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    region TEXT,
    district TEXT,
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'revoked')),
    activation_code_hash TEXT,
    activation_expires_at INTEGER,
    token_hash TEXT,
    connected_at INTEGER,
    last_report_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX command_stations_token ON command_stations (token_hash) WHERE token_hash IS NOT NULL;

CREATE TABLE connection_requests (
    id TEXT PRIMARY KEY,
    station_id TEXT NOT NULL REFERENCES command_stations(id),
    token_hash TEXT NOT NULL,
    requested_by_badge TEXT NOT NULL,
    requested_by_name TEXT NOT NULL,
    requested_from TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'superseded')),
    decided_by_badge TEXT,
    decided_by_name TEXT,
    decided_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX connection_requests_status ON connection_requests (status, created_at);

-- The latest report of each station. `figures` and `roster` are JSON: the
-- counts the station chose to send and its officers (name, rank, post, badge,
-- role, active), never a password and never a record.
CREATE TABLE station_reports (
    station_id TEXT PRIMARY KEY REFERENCES command_stations(id),
    figures TEXT NOT NULL,
    roster TEXT NOT NULL,
    reported_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL
);

-- Station side: the link to a command, if any. `token` is the station's own
-- sync token; HQ holds only its hash. Stored as it is for now: the security
-- stage seals it with the rest of the station's secrets.
CREATE TABLE command_link (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    address TEXT NOT NULL,
    station_number TEXT NOT NULL,
    station_name TEXT,
    token TEXT NOT NULL,
    request_id TEXT,
    state TEXT NOT NULL CHECK (state IN ('pending', 'connected', 'rejected')),
    requested_by TEXT,
    connected_at INTEGER,
    last_report_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
