-- The shared protection vocabulary: besides badge only and password, a station
-- can ask a 6-digit PIN of everyone, or a password and an authenticator code.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE auth_policy_new (
    id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
    mode TEXT NOT NULL DEFAULT 'badge_only' CHECK (mode IN ('badge_only', 'password', 'pin', 'full')),
    idle_timeout_minutes INTEGER NOT NULL DEFAULT 240 CHECK (idle_timeout_minutes BETWEEN 5 AND 720),
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO auth_policy_new SELECT id, mode, idle_timeout_minutes, updated_at, updated_by FROM auth_policy;
DROP TABLE auth_policy;
ALTER TABLE auth_policy_new RENAME TO auth_policy;

-- The key of an officer's authenticator app, kept only in the encrypted database.
ALTER TABLE officers ADD COLUMN totp_secret TEXT;
