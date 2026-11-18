-- The shared protection vocabulary: besides a password, a PIN or badge only,
-- a facility can ask for a password and an authenticator code.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE auth_policy_new (
    id TEXT PRIMARY KEY DEFAULT 'default',
    mode TEXT NOT NULL DEFAULT 'password' CHECK (mode IN ('password', 'pin', 'badge_only', 'full')),
    idle_timeout_minutes INTEGER NOT NULL DEFAULT 240 CHECK (idle_timeout_minutes BETWEEN 5 AND 720),
    absolute_lifetime_hours INTEGER NOT NULL DEFAULT 12 CHECK (absolute_lifetime_hours BETWEEN 1 AND 24),
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO auth_policy_new SELECT id, mode, idle_timeout_minutes, absolute_lifetime_hours, updated_at, updated_by FROM auth_policy;
DROP TABLE auth_policy;
ALTER TABLE auth_policy_new RENAME TO auth_policy;

-- The key of an officer's authenticator app, kept only in the encrypted database.
ALTER TABLE officers ADD COLUMN totp_secret TEXT;
