-- What this installation is, who may sign in, and the trail of sign-ins.
--
-- `installation` is empty until first launch. Its one row says whether this is
-- a Station (holds every record for one station) or a Command (an HQ that holds
-- no case or person records, only what stations report to it). The answer is
-- made once; nothing in the application changes it afterwards.
CREATE TABLE installation (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    mode TEXT NOT NULL CHECK (mode IN ('station', 'command')),
    -- Command only. A suggestion (region, district, headquarters), not a
    -- claim about how the force is organised.
    command_level TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Who needs what to sign in. A Station starts on badge only: the badge
-- identifies who is at the keyboard and is not a secret. An administrator can
-- require passwords. A Command ignores this and always needs badge and
-- password. Only an administrator changes it.
CREATE TABLE auth_policy (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    mode TEXT NOT NULL DEFAULT 'badge_only' CHECK (mode IN ('badge_only', 'password')),
    idle_timeout_minutes INTEGER NOT NULL DEFAULT 240 CHECK (idle_timeout_minutes BETWEEN 5 AND 720),
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO auth_policy (id) VALUES ('default');

-- Sign-ins on this machine. Distinct from `remote_sessions`, which are the
-- phone sessions of remote access. Only the SHA-256 of the token is kept.
CREATE TABLE app_sessions (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    ended_at INTEGER
);
CREATE INDEX idx_app_sessions_officer ON app_sessions (officer_id);

-- Every sign-in, refusal, sign-out and change of policy. The badge and name
-- are copied so the trail still reads if an officer is later renamed.
CREATE TABLE auth_events (
    id TEXT PRIMARY KEY,
    officer_id TEXT REFERENCES officers(id),
    badge TEXT,
    name TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    occurred_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_auth_events_time ON auth_events (occurred_at);
