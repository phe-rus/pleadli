-- First-launch setup and the people who use the installation, the same shape
-- as every other Pleadli app (DPP migrations 0018 and 0020). What differs is
-- who the people are: judicial officers and registry staff.
--
-- `security_settings` holds the idle time and the old optional lock;
-- `installation` is what setup decided once (country, language, court or
-- headquarters, name, protection level, colour, crest, licence accepted);
-- `staff` is everyone who may use it, PIN or password only as an Argon2id hash;
-- `active_session` is who is signed in on this computer right now.

CREATE TABLE security_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE installation (
    id TEXT PRIMARY KEY DEFAULT 'this' CHECK (id = 'this'),
    jurisdiction TEXT NOT NULL,
    language TEXT NOT NULL,
    model TEXT NOT NULL CHECK (model IN ('office', 'headquarters')),
    office_name TEXT NOT NULL,
    region TEXT,
    protection TEXT NOT NULL CHECK (protection IN ('none', 'basic', 'full')),
    accent TEXT NOT NULL,
    logo TEXT,
    licence_version TEXT NOT NULL,
    licence_accepted_at INTEGER NOT NULL,
    licence_accepted_by TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rank TEXT,
    role TEXT NOT NULL CHECK (role IN ('administrator', 'judicial_officer', 'registrar')),
    is_head INTEGER NOT NULL DEFAULT 0,
    secret_kind TEXT CHECK (secret_kind IN ('pin', 'password')),
    secret_hash TEXT,
    totp_secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- An installation that already had a judicial officer keeps them as the first
-- administrator, so setup can offer their name.
INSERT INTO staff (id, name, rank, role, is_head, created_at, updated_at)
SELECT 'staff-' || lower(hex(randomblob(8))), name, title, 'administrator', 0, updated_at, updated_at
FROM bench_profile;

CREATE TABLE active_session (
    id TEXT PRIMARY KEY DEFAULT 'current' CHECK (id = 'current'),
    staff_id TEXT NOT NULL REFERENCES staff (id),
    signed_in_at INTEGER NOT NULL
);
