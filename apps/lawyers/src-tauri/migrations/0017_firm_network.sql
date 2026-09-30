-- A firm on one network (docs/lawyers/REVIEW-2026-09-30.md, L6; D6).
--
-- One computer in the office holds the practice: its matters, money,
-- documents and people. The others join it and work on the same records over
-- the office network; nothing is copied to them. Each joined computer has its
-- own person signed in, so the audit trail and every "only an advocate" rule
-- name the right person whichever desk they sit at.
--
-- 1. `network`: what this computer is. `standalone` (the default, alone or a
--    single-computer firm), `office` (holds the practice and lets computers
--    join), or `terminal` (works on another computer's practice). A terminal
--    keeps the office's address, the certificate fingerprint it was shown and
--    confirmed (pinned: it trusts nothing else), and its own device key.
-- 2. `devices`: on the office, every computer that has joined. The key is
--    stored only as a SHA-256 hash; a removed computer is kept, marked
--    revoked, so the record says who had access and until when.
-- 3. `pairing_codes`: one-time codes an administrator shows on the office
--    screen, valid ten minutes, stored hashed.

CREATE TABLE network (
    id TEXT PRIMARY KEY DEFAULT 'this' CHECK (id = 'this'),
    mode TEXT NOT NULL DEFAULT 'standalone' CHECK (mode IN ('standalone', 'office', 'terminal')),
    office_address TEXT,
    office_fingerprint TEXT,
    office_name TEXT,
    device_id TEXT,
    device_key TEXT,
    joined_at INTEGER,
    updated_at INTEGER NOT NULL
);
INSERT INTO network (id, mode, updated_at) VALUES ('this', 'standalone', cast(unixepoch('subsecond') * 1000 as integer));

CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    paired_at INTEGER NOT NULL,
    paired_by TEXT,
    last_seen_at INTEGER,
    last_address TEXT,
    revoked_at INTEGER,
    revoked_by TEXT
);

CREATE TABLE pairing_codes (
    code_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_by TEXT,
    used_at INTEGER
);
