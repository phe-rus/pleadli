-- First-launch setup, the people of the practice, and what the practice does
-- (docs/lawyers/REVIEW-2026-09-30.md, decisions D1, D3, D5).
--
-- Lawyers was one advocate with a single profile row and an optional PIN lock.
-- A practice is now set up once, alone or as a firm or office, and chooses its
-- usages (civil litigation, criminal defence, land, ...):
--
-- 1. `installation`: what setup decided. Country (jurisdiction pack),
--    language, alone or a firm, what kind of practice it is, its name and
--    region, the protection level, colour and logo, and the licence accepted.
-- 2. `staff`: everyone who uses it. The role says what the law lets them do:
--    only an `advocate` signs, files or issues (Advocates Act ss.64, 66, 67);
--    a `paralegal` (clerk, legal assistant) drafts for an advocate to sign;
--    `accounts` keeps the money. Administering the installation is separate
--    from the role, so a paralegal working alone can still run their own copy.
--    A PIN or password is stored only as an Argon2id hash.
-- 3. `active_session`: who is acting on this computer right now.
-- 4. `usages`: the kinds of work switched on. The app shows only these.
-- 5. `advocate_profile` becomes a view of the person acting, so the audit trail
--    and filing, which asked "who is the advocate", now ask "who is signed in",
--    unchanged. The old single row is kept, renamed, and its person becomes the
--    first administrator, an advocate.

CREATE TABLE installation (
    id TEXT PRIMARY KEY DEFAULT 'this' CHECK (id = 'this'),
    jurisdiction TEXT NOT NULL,
    language TEXT NOT NULL,
    setting TEXT NOT NULL CHECK (setting IN ('alone', 'firm')),
    practice_kind TEXT NOT NULL CHECK (practice_kind IN ('private', 'government', 'in_house', 'legal_aid')),
    office_name TEXT NOT NULL,
    region TEXT,
    protection TEXT NOT NULL CHECK (protection IN ('none', 'basic', 'full')),
    -- Minutes of inactivity before whoever is signed in is signed out; 0 is
    -- never. Five, as the old app lock had (spec 0001).
    idle_minutes INTEGER NOT NULL DEFAULT 5 CHECK (idle_minutes IN (0, 5, 15, 30, 60)),
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
    title TEXT,
    role TEXT NOT NULL CHECK (role IN ('advocate', 'paralegal', 'accounts')),
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
    phone TEXT,
    email TEXT,
    practising_number TEXT,
    certificate_expires_on INTEGER,
    secret_kind TEXT CHECK (secret_kind IN ('pin', 'password')),
    secret_hash TEXT,
    totp_secret TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE active_session (
    id TEXT PRIMARY KEY DEFAULT 'current' CHECK (id = 'current'),
    staff_id TEXT NOT NULL REFERENCES staff (id),
    signed_in_at INTEGER NOT NULL
);

CREATE TABLE usages (
    usage TEXT PRIMARY KEY CHECK (usage IN (
        'civil', 'criminal', 'appeals', 'land', 'companies', 'family', 'employment',
        'advisory', 'government', 'legal_aid', 'oaths', 'prosecution'
    )),
    enabled_at INTEGER NOT NULL
);

ALTER TABLE advocate_profile RENAME TO advocate_profile_before_staff;

INSERT INTO staff (id, name, role, is_admin, phone, email, created_at, updated_at)
SELECT 'staff-' || lower(hex(randomblob(8))), name, 'advocate', 1, phone, email, updated_at, updated_at
FROM advocate_profile_before_staff;

CREATE VIEW advocate_profile AS
SELECT 'default' AS id, s.id AS staff_id, s.name, s.title, s.role, s.is_admin,
       coalesce(i.office_name, (SELECT firm FROM advocate_profile_before_staff LIMIT 1)) AS firm,
       s.phone, s.email, s.updated_at
FROM active_session a
JOIN staff s ON s.id = a.staff_id
LEFT JOIN installation i ON i.id = 'this';
