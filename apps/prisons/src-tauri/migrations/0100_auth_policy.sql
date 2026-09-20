-- Who needs what to sign in, and for how long a session lasts. Facility-owned,
-- changed only by an administrator and always audited. The defaults are the
-- values that were fixed in code before this table existed.
CREATE TABLE auth_policy (
    id TEXT PRIMARY KEY DEFAULT 'default',
    mode TEXT NOT NULL DEFAULT 'password' CHECK (mode IN ('password', 'pin', 'badge_only')),
    idle_timeout_minutes INTEGER NOT NULL DEFAULT 240 CHECK (idle_timeout_minutes BETWEEN 5 AND 720),
    absolute_lifetime_hours INTEGER NOT NULL DEFAULT 12 CHECK (absolute_lifetime_hours BETWEEN 1 AND 24),
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO auth_policy (id) VALUES ('default');

-- An account that signs in with its badge alone. Honoured only while the
-- policy mode is `badge_only`, never for administrators or Head Office, and
-- never from a LAN workstation. Its stored hash is random and unusable.
ALTER TABLE officers ADD COLUMN passwordless INTEGER NOT NULL DEFAULT 0;
