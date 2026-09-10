-- Station Admin — scope resolved (2026-09): two small records, nothing
-- invented. Station Profile is the canonical source for station identity
-- (name/address/jurisdiction/contact/OC Station), replacing the
-- free-text/hardcoded duplicates that existed in Charge Sheets and
-- Overview. Station Establishment is who is posted to this station in a
-- standing role, distinct from Duty Roster's shift-by-shift scheduling.
-- Deliberately excludes: shift scheduling (Duty Roster), equipment
-- (Stores/Armory), handover notes (already a Station Diary category),
-- app preferences (Settings), any multi-station directory, and anything
-- procedural (discipline, promotions, HR) — none of that is verified
-- anywhere.
--
-- `id = 'default'` makes station_profile behave as a singleton without a
-- special constraint — always the one row every read/write targets.
CREATE TABLE station_profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT,
    address TEXT,
    jurisdiction TEXT,
    contact TEXT,
    oc_station_name TEXT,
    oc_station_rank TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- References the existing `people` row rather than duplicating officer
-- identity (name/phone already live there) — only `rank` and `post` are
-- genuinely new information People doesn't own. `post` is plain text, not
-- a constrained enum: the verified sub-county staffing roles (OC Station,
-- OC CID, Crime Intelligence Officer, Child & Family Protection Officer,
-- Community Liaison Officer, General Officer) are offered as UI
-- suggestions only — no fixed headcount or full-establishment
-- requirement is enforced. `active` distinguishes a current posting from
-- one that has ended, without deleting the record.
CREATE TABLE station_establishment (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    post TEXT,
    rank TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
