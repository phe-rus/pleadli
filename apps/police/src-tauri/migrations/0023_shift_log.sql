-- Officer check-in: a real, identifiable "reported in" event, badge-entry
-- (desktop) or remote-scan (phone, already authenticated via the existing
-- badge+password login). Deliberately separate from duty_assignments,
-- which is a free-text schedule with no link to a real officer.
CREATE TABLE officer_check_ins (
    id TEXT PRIMARY KEY,
    officer_id TEXT NOT NULL REFERENCES officers(id),
    method TEXT NOT NULL,
    checked_in_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- One shift handover: who took over from whom, and what happened. A plain
-- log entry, not a workflow — outgoing officer is nullable since the
-- previous officer isn't always known/recorded.
CREATE TABLE shift_handovers (
    id TEXT PRIMARY KEY,
    outgoing_officer_id TEXT REFERENCES officers(id),
    incoming_officer_id TEXT NOT NULL REFERENCES officers(id),
    unit TEXT,
    notes TEXT,
    handed_over_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
