-- App lock (docs/specs/lawyers/0001-app-lock): a PIN gate over the whole app,
-- single advocate, no roster. One row. `pin_hash` and `recovery_code_hash` are
-- Argon2 hashes, never the plain value. `failed_attempts` and `locked_until`
-- are shared by PIN and recovery code attempts on purpose, so recovery cannot
-- be used to route around a PIN cooldown.
CREATE TABLE app_lock (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    pin_hash TEXT,
    recovery_code_hash TEXT,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

INSERT INTO app_lock (id) VALUES ('default');
