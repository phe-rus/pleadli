-- Directions to Police on a return for further investigation (RESEARCH.md §3:
-- the Prosecutor "should advise investigators as to what further evidence or
-- steps must be taken", and the file is resubmitted). A return carries one or
-- more directions instead of one free-text box, so the loop is actionable: each
-- direction can later be recorded as met or not met when the file comes back.
--
-- `kind` is validated in the server. The confirmed substance is further
-- evidence and further steps; the other kinds come from the product brief and
-- are for structure only.
CREATE TABLE directions (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    decision_id TEXT NOT NULL REFERENCES decisions(id),
    kind TEXT NOT NULL,
    instruction TEXT NOT NULL,
    person_id TEXT REFERENCES people(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    response TEXT NOT NULL DEFAULT 'open',
    response_note TEXT,
    responded_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

-- The return a resubmission answers.
ALTER TABLE referrals ADD COLUMN answers_decision_id TEXT REFERENCES decisions(id);
