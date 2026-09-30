-- What happened on a matter, with the day it happened: a summons served, the
-- other side's defence received, a decision delivered, a cause of action that
-- arose. Deadlines are counted from these by the application
-- (`domain/clocks.rs`), from the country's rules, never typed in and never
-- worked out by an assistant (docs/lawyers/REVIEW-2026-09-30.md, D7).
--
-- `kind` is checked by the domain (the list grows with the rules), `on_day` is
-- the calendar day in East Africa Time as milliseconds at its start.
CREATE TABLE matter_events (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    kind TEXT NOT NULL,
    on_day INTEGER NOT NULL,
    note TEXT,
    recorded_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX matter_events_matter ON matter_events (matter_id, on_day);
