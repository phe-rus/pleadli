-- Head Office side: the people a facility last reported as past a limit the
-- law sets (past the mandatory-bail limit, or overheld past their release
-- date), as JSON. Names cross for these and nothing else (user decision D2,
-- docs/prisons/REVIEW-2026-10-08.md). Empty on a facility's own database.
ALTER TABLE facilities ADD COLUMN reported_urgent TEXT;
