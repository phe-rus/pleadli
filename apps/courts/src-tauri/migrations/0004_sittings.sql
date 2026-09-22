-- A sitting is one appearance of a case before the court: the core object of
-- this product (docs/courts/PROPOSAL.md). It is scheduled, and then closed in
-- exactly one of three ways: held (with what was done), adjourned (with a
-- structured reason, below) or cancelled. Nothing is closed by silence.
CREATE TABLE sittings (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    scheduled_at INTEGER NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('mention', 'plea', 'bail_application', 'hearing', 'ruling', 'judgment', 'sentencing', 'other')),
    courtroom TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'adjourned', 'cancelled')),
    outcome TEXT,
    closed_at INTEGER,
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX sittings_case ON sittings (case_id);
CREATE INDEX sittings_when ON sittings (scheduled_at);

-- Why a sitting did not go ahead, as fields rather than free text. This is the
-- one thing the Auditor-General's 2011 review of the High Court found missing
-- (about ten adjournments per case, reasons seldom written on the file), and
-- the field that later closes the loop to Prisons (a prisoner not produced),
-- Police (a witness, the file) and DPP (review). `next_sitting_id` is set when
-- the court fixed the next date at the time; it is empty when the date is still
-- to be fixed, which is an open item on Today, never an invisible one.
CREATE TABLE adjournments (
    id TEXT PRIMARY KEY,
    sitting_id TEXT NOT NULL UNIQUE REFERENCES sittings(id),
    case_id TEXT NOT NULL REFERENCES cases(id),
    reason TEXT NOT NULL CHECK (reason IN ('witness_absent', 'prisoner_not_produced', 'file_incomplete', 'counsel_absent', 'court_not_sitting', 'other')),
    responsible TEXT NOT NULL CHECK (responsible IN ('prosecution', 'defence', 'court', 'prisons', 'police', 'witness', 'other')),
    note TEXT,
    next_date INTEGER,
    next_sitting_id TEXT REFERENCES sittings(id),
    recorded_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX adjournments_case ON adjournments (case_id);
