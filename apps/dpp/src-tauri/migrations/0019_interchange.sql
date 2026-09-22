-- Police <-> DPP interchange (docs/interchange/police-dpp.md).
--
-- A station may send to this office only if this office invited it and a person
-- here confirmed its fingerprint. Everything below serves that: this office's
-- own identity, the connections to stations, what has arrived (held apart from
-- the records until a person accepts it), and what is waiting to be sent back.

-- This office's identity. The secrets are held only here, inside the encrypted
-- database, and are never written into a package.
CREATE TABLE interchange_identity (
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

-- One row per invitation this office has issued, and what became of it. `id` is
-- the invitation's id. `status`: invited (waiting for the station's answer),
-- awaiting_confirmation (answered; not trusted until a person confirms the
-- fingerprint), trusted, declined, revoked.
CREATE TABLE police_connections (
    id TEXT PRIMARY KEY,
    intended_station TEXT NOT NULL,
    status TEXT NOT NULL,
    invite_nonce TEXT NOT NULL,
    invite_expires_at INTEGER NOT NULL,
    station_id TEXT,
    station_name TEXT,
    station_jurisdiction TEXT,
    station_verifying_key TEXT,
    station_encryption_key TEXT,
    officer_in_charge TEXT,
    fingerprint TEXT,
    responded_at INTEGER,
    confirmed_at INTEGER,
    confirmed_by TEXT,
    revoked_at INTEGER,
    revoked_reason TEXT,
    -- Packages this office has addressed to the station, and the highest the
    -- station has sent, so a gap can be seen. Neither refuses a package.
    next_seq_out INTEGER NOT NULL DEFAULT 1,
    last_seq_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- A station answers to one connection at a time.
CREATE UNIQUE INDEX one_live_connection_per_station ON police_connections (station_id)
    WHERE station_id IS NOT NULL AND status IN ('awaiting_confirmation', 'trusted');

-- What has arrived. `id` is the package's own id, so the same package cannot
-- arrive twice (replay protection), even after it was rejected. The content is
-- held as received; nothing in it is a DPP record until it is accepted.
CREATE TABLE incoming_packages (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES police_connections(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    sender_fingerprint TEXT NOT NULL,
    package_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received',
    payload TEXT NOT NULL,
    -- The files that came with it: [{id, name, mime, sha256, size}]. The bytes
    -- are sealed in the vault under incoming/.
    files TEXT NOT NULL DEFAULT '[]',
    decided_at INTEGER,
    decided_by TEXT,
    reject_reason TEXT,
    prosecution_file_id TEXT REFERENCES prosecution_files(id)
);

-- What this office will send: a receipt for a referral, a decision notice, the
-- confirmation of a connection. Built into a package when it is exported.
CREATE TABLE outgoing_packages (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL REFERENCES police_connections(id),
    kind TEXT NOT NULL,
    seq INTEGER NOT NULL,
    in_reply_to TEXT,
    prosecution_file_id TEXT REFERENCES prosecution_files(id),
    decision_id TEXT REFERENCES decisions(id),
    payload TEXT NOT NULL,
    prepared_at INTEGER NOT NULL,
    exported_at INTEGER
);

-- Where a file came from, so a decision goes back to the station that referred
-- it and a resubmission is checked against it.
ALTER TABLE prosecution_files ADD COLUMN police_connection_id TEXT REFERENCES police_connections(id);
ALTER TABLE referrals ADD COLUMN source_package_id TEXT REFERENCES incoming_packages(id);
