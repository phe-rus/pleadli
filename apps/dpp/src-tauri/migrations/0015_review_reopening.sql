-- A review that brings a concluded file back: it names the decision it reopens
-- and why (wrong decision, new evidence, an inquest finding; RESEARCH.md §4).
-- The decision it produces corrects that one. Added after 0014 had already been
-- applied on a machine, so it is its own migration and 0014 is left as it was.
ALTER TABLE charging_reviews ADD COLUMN reopens_decision_id TEXT REFERENCES decisions(id);
ALTER TABLE charging_reviews ADD COLUMN reopen_reason TEXT;
