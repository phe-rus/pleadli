-- Health & Welfare (docs/prisons/PRODUCT.md) — tracks health-related
-- events without pretending Prisons runs its own hospital system
-- (RESEARCH.md §5: health care is statutorily hybrid with the Ministry of
-- Health, s.26). Two confirmed event pairs: sick-prisoner hospital
-- referral/return (ss.75-76) and mental-hospital transfer (s.74).
--
-- Deliberately does NOT touch `prisoners.current_status` — ss.75-76 state
-- the prisoner is "deemed still under detention in the prison from which
-- he or she was so removed" throughout hospitalisation, so custody status
-- is legally unchanged; only this event log reflects the physical move.
CREATE TABLE health_events (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    event_type TEXT NOT NULL,
    facility_name TEXT,
    occurred_at INTEGER NOT NULL,
    authorized_by TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
