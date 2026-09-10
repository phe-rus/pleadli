-- Officer credentials — the first accounts/auth concept in this app.
-- Deliberately separate from station_establishment: that table is a
-- roster (who is posted here), this one is login credentials (badge
-- number, password, role). A person can exist in one, both, or neither.
-- Scoped narrowly to what remote access needs: local desktop use stays
-- completely unauthenticated, exactly as it always has been.
CREATE TABLE officers (
    id TEXT PRIMARY KEY,
    badge_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'officer',
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Opaque bearer tokens issued on login, not JWTs — this app has no other
-- consumer of the token's contents, so a random token looked up
-- server-side is simpler and just as revocable (delete the row).
CREATE TABLE remote_sessions (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    expires_at INTEGER NOT NULL
);

-- Every remote request, kept regardless of whether the law requires it —
-- the compliance question around remote/cross-border access is genuinely
-- unresolved (docs/police/PRODUCT.md), so an auditable trail is the
-- responsible default while that gets settled.
CREATE TABLE remote_access_log (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    action TEXT NOT NULL,
    detail TEXT,
    occurred_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Whether this station has remote access turned on at all — off unless
-- explicitly enabled, matching the app's offline-first default.
CREATE TABLE remote_access_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    enabled INTEGER NOT NULL DEFAULT 0
);
