-- Officer identity and sign in (spec: docs/specs/_root/0001-officer-identity-sign-in).
-- No `person_id` link, unlike Police's own `officers` table, since Prisons
-- has no separate Person entity for an officer to link to. `role` is
-- constrained at the DB level (Police's own version leaves it a free
-- string, which this deliberately does not repeat) so an unvalidated
-- value like 'administrator' can never silently fail to count as admin.
-- No delete operation exists anywhere for officers, only deactivation via
-- the `active` flag, which removes an entire class of dangling-reference
-- problems outright.
CREATE TABLE officers (
    id TEXT PRIMARY KEY,
    badge_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('officer', 'admin')),
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- Whether this installation is a Head Office (feature 22, Head Office and
-- peer prison sync network, sets this; this spec only defines and reads
-- it). Singleton row, same `id = 'default'` upsert pattern Police already
-- uses for `cloudflare_config`.
CREATE TABLE hq_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    is_head_office INTEGER NOT NULL DEFAULT 0
);
INSERT INTO hq_config (id, is_head_office) VALUES ('default', 0);

-- At most one row: a persisted Head Office sign in, surviving a full app
-- restart until explicit sign out or the officer becomes inactive.
-- `signed_in_at` is informational only, not read by any check in this
-- spec. No foreign key enforcement needed in practice (officers are never
-- deleted), but `get_current_hq_session` still reads this through a LEFT
-- JOIN so a missing officer degrades to "signed out" rather than erroring.
CREATE TABLE hq_session (
    id TEXT PRIMARY KEY DEFAULT 'default',
    officer_id TEXT NOT NULL,
    signed_in_at INTEGER NOT NULL
);
