-- First-launch setup and the people who use the installation
-- (docs/platform/REVIEW-2026-09-28.md §5.4, decision D1).
--
-- DPP was a one-prosecutor installation with a single profile row. An office
-- now has several people and a protection level chosen at setup:
--
-- 1. `installation`: what setup decided, once. Country (jurisdiction pack),
--    language, office or headquarters, the office's name and region, the
--    protection level, the institution's colour and crest (kept here, so every
--    computer of the office shows the same one), and which licence was accepted.
-- 2. `staff`: everyone who may use it. A PIN or password is stored only as an
--    Argon2id hash; the authenticator key (full protection) sits in the
--    encrypted database like every other record.
-- 3. `active_session`: who is signed in on this computer right now.
-- 4. `prosecutor_profile` becomes a view of the signed-in person, so every rule
--    and document that asked "who is the prosecutor" now asks "who is signed
--    in", unchanged. The old single row is kept, renamed, and its person
--    becomes the first administrator.

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
    role TEXT NOT NULL CHECK (role IN ('administrator', 'prosecutor', 'clerk')),
    is_dpp INTEGER NOT NULL DEFAULT 0,
    secret_kind TEXT CHECK (secret_kind IN ('pin', 'password')),
    secret_hash TEXT,
    totp_secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

ALTER TABLE prosecutor_profile RENAME TO prosecutor_profile_before_staff;

INSERT INTO staff (id, name, rank, role, is_dpp, created_at, updated_at)
SELECT 'staff-' || lower(hex(randomblob(8))), name, rank, 'administrator', is_dpp, updated_at, updated_at
FROM prosecutor_profile_before_staff;

CREATE TABLE active_session (
    id TEXT PRIMARY KEY DEFAULT 'current' CHECK (id = 'current'),
    staff_id TEXT NOT NULL REFERENCES staff (id),
    signed_in_at INTEGER NOT NULL
);

CREATE VIEW prosecutor_profile AS
SELECT 'default' AS id, s.id AS staff_id, s.name, s.rank, s.role, s.is_dpp, s.updated_at
FROM active_session a
JOIN staff s ON s.id = a.staff_id;
