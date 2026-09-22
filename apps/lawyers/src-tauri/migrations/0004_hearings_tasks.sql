-- The advocate's diary: hearings in a matter, and the tasks that fall due around
-- them. A hearing is closed as attended, adjourned (with the same structured
-- reason and responsible party the court records, so the two sides describe an
-- adjournment in the same words), missed (the advocate was not there: recorded
-- honestly, never hidden) or cancelled.
CREATE TABLE hearings (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    at INTEGER NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('mention', 'plea', 'bail_application', 'hearing', 'ruling', 'judgment', 'sentencing', 'other')),
    courtroom TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'attended', 'adjourned', 'missed', 'cancelled')),
    outcome TEXT,
    adjourn_reason TEXT CHECK (adjourn_reason IN ('witness_absent', 'prisoner_not_produced', 'file_incomplete', 'counsel_absent', 'court_not_sitting', 'other')),
    adjourn_responsible TEXT CHECK (adjourn_responsible IN ('prosecution', 'defence', 'court', 'prisons', 'police', 'witness', 'other')),
    next_date INTEGER,
    note TEXT,
    closed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX hearings_matter ON hearings (matter_id);
CREATE INDEX hearings_when ON hearings (at);

-- A task with a due day. `source` says who made it: the advocate (`manual`) or a
-- rule of the state-funded scheme (`state_rule`, with a `rule_key`), so a duty
-- with a date is never left to memory. A rule task tied to a hearing goes away
-- with the hearing if the hearing is adjourned or cancelled before it is done.
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    matter_id TEXT REFERENCES matters(id),
    hearing_id TEXT REFERENCES hearings(id),
    title TEXT NOT NULL,
    detail TEXT,
    due_on INTEGER,
    done_at INTEGER,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'state_rule')),
    rule_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX tasks_matter ON tasks (matter_id);
CREATE UNIQUE INDEX tasks_rule ON tasks (matter_id, rule_key) WHERE rule_key IS NOT NULL;

CREATE TABLE matter_notes (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    at INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX matter_notes_matter ON matter_notes (matter_id, at);

-- Time spent, in minutes, on a matter. Whether it is billed depends on the
-- engagement (private time is billed; state-funded and pro bono work is paid by
-- schedule or not at all), so this only records the time; it prices nothing.
CREATE TABLE time_entries (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    worked_on INTEGER NOT NULL,
    minutes INTEGER NOT NULL CHECK (minutes > 0 AND minutes <= 1440),
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX time_entries_matter ON time_entries (matter_id, worked_on);
