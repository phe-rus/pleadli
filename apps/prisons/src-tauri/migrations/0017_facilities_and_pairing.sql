-- Peer registration and pairing (spec: docs/specs/prisons/0001-head-office-peer-sync-network/0002-peer-registration-and-pairing.md).
-- Present on every installation, peer or Head Office; stays empty on a peer
-- except for its own `peer_sync_config` row.

-- A facility Head Office has paired with (or is still verifying). Region is
-- Uganda Prisons Service's real 19 region structure (docs/prisons/RESEARCH.md
-- §1), not a free string, so a typo can't silently create a 20th region.
CREATE TABLE facilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    facility_number TEXT NOT NULL,
    location TEXT NOT NULL,
    region TEXT NOT NULL CHECK (region IN (
        'Southern', 'Northern', 'Kigezi', 'Mid Central', 'Central', 'Kampala Extra', 'Eastern',
        'North Central', 'Mid Western', 'Mid Northern', 'Mid Eastern', 'South Western',
        'East Central', 'North Eastern', 'Iganga', 'Western', 'North Western', 'Kooki', 'South Eastern'
    )),
    head_officer_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_verification', 'active', 'revoked')) DEFAULT 'pending_verification',
    -- Hashed the same way as officers.password_hash is not: these are
    -- high entropy random values, not low entropy secrets a human chose, so
    -- a fast hash (SHA-256) is the right, standard tradeoff, not Argon2.
    verification_code_hash TEXT NOT NULL,
    verification_expires_at INTEGER NOT NULL,
    verifying_officer_email TEXT NOT NULL,
    -- Present from registration onward; whether it can actually be *used*
    -- is decided by `status`, not by whether this column is set (see the
    -- spec's Key invariants: the sync token is issued immediately but inert
    -- until verified).
    sync_token_hash TEXT NOT NULL,
    last_synced_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- A short lived, single use code a Head Office officer generates to onboard
-- one new facility. `officer_email` is the verifying officer for that
-- facility, copied into `facilities.verifying_officer_email` at registration.
CREATE TABLE hq_pairing_codes (
    id TEXT PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    officer_email TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- A peer's own record of what it needs to sync: which Head Office, which
-- facility id it registered as, and its own sync token in plaintext (this
-- is the peer's own bearer credential, analogous to a browser holding its
-- own session cookie, not analogous to a password). Singleton row, same
-- `id = 'default'` pattern as `hq_config`. Meaningless on a Head Office
-- installation, which never registers with anyone.
CREATE TABLE peer_sync_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    hq_hostname TEXT,
    facility_id TEXT,
    sync_token TEXT,
    last_synced_at INTEGER,
    last_sync_status TEXT,
    last_error TEXT
);
INSERT INTO peer_sync_config (id) VALUES ('default');

-- Head Office's own Cloudflare Tunnel configuration, ported unchanged from
-- Police (apps/police/src-tauri/migrations/0016_cloudflare_tunnel.sql),
-- reused for the same purpose here: exposing hq_server.rs publicly so
-- facilities can reach `/peers/register` and (child 3) `/sync/prisoners`.
CREATE TABLE cloudflare_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    api_token TEXT NOT NULL,
    account_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    station_name TEXT NOT NULL
);

CREATE TABLE cloudflare_tunnel_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    tunnel_id TEXT NOT NULL,
    hostname TEXT NOT NULL,
    run_token TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
