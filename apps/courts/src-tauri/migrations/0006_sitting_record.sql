-- The record of a sitting (docs/courts/PROPOSAL.md, section 6). The law makes
-- the judicial officer's own signed record the record of proceedings (MCA
-- s.136(2) and s.138, TIA s.86(2) and s.143), so this is what a sitting holds:
-- who appeared, and the notes taken as it ran, each with the moment it was
-- written. The sitting's record is unsigned until the officer signs it; signing
-- stores a SHA-256 of exactly what was signed and freezes the notes and
-- appearances (the triggers below).
ALTER TABLE sittings ADD COLUMN record_signed_at INTEGER;
ALTER TABLE sittings ADD COLUMN record_signed_by TEXT;
ALTER TABLE sittings ADD COLUMN record_sha256 TEXT;

-- Who was there. `unrecorded` is the honest starting point: presence is never
-- assumed. `not_produced` is for a person in custody the prison did not bring,
-- which is what closes the loop to Prisons on an adjournment.
CREATE TABLE appearances (
    id TEXT PRIMARY KEY,
    sitting_id TEXT NOT NULL REFERENCES sittings(id),
    party_id TEXT REFERENCES case_parties(id),
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('accused', 'complainant', 'prosecutor', 'defence_counsel', 'witness', 'interpreter', 'other')),
    attendance TEXT NOT NULL DEFAULT 'unrecorded' CHECK (attendance IN ('unrecorded', 'present', 'absent', 'represented', 'not_produced')),
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX appearances_sitting ON appearances (sitting_id);

-- Notes taken as the sitting runs. `at` is when the note was written, in
-- milliseconds, so a recording can be lined up against it later (Stage 3).
-- Evidence is taken down as a narrative, not question and answer (MCA s.138),
-- so a note is prose with an optional speaker.
CREATE TABLE bench_notes (
    id TEXT PRIMARY KEY,
    sitting_id TEXT NOT NULL REFERENCES sittings(id),
    at INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'evidence', 'submission', 'objection', 'ruling', 'direction')),
    speaker TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX bench_notes_sitting ON bench_notes (sitting_id, at);

CREATE TRIGGER appearances_signed_no_insert BEFORE INSERT ON appearances
WHEN (SELECT record_signed_at FROM sittings WHERE id = NEW.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;
CREATE TRIGGER appearances_signed_no_update BEFORE UPDATE ON appearances
WHEN (SELECT record_signed_at FROM sittings WHERE id = OLD.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;
CREATE TRIGGER appearances_signed_no_delete BEFORE DELETE ON appearances
WHEN (SELECT record_signed_at FROM sittings WHERE id = OLD.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;

CREATE TRIGGER bench_notes_signed_no_insert BEFORE INSERT ON bench_notes
WHEN (SELECT record_signed_at FROM sittings WHERE id = NEW.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;
CREATE TRIGGER bench_notes_signed_no_update BEFORE UPDATE ON bench_notes
WHEN (SELECT record_signed_at FROM sittings WHERE id = OLD.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;
CREATE TRIGGER bench_notes_signed_no_delete BEFORE DELETE ON bench_notes
WHEN (SELECT record_signed_at FROM sittings WHERE id = OLD.sitting_id) IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;

-- Once a record is signed the signature itself cannot be cleared or changed.
CREATE TRIGGER sittings_signed_record_fixed BEFORE UPDATE OF record_signed_at, record_signed_by, record_sha256 ON sittings
WHEN OLD.record_signed_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'The record of this sitting is signed.'); END;
