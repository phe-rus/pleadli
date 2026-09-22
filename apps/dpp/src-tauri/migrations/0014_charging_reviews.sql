-- The charging review (docs/dpp/PRODUCT.md, Charging Review; RESEARCH.md §3).
-- A review applies one standard to a file: the Two-Stage Test (Evidential Test,
-- then Public Interest Test only if the first is passed) or the Threshold Test.
-- The outcomes are recorded as the prosecutor's own conclusions, and the
-- server allows a charging decision only when they support it.
--
-- One review may be open per file at a time. A review that has produced its
-- decision is concluded and frozen; a later look at the file (a resubmission,
-- or the counts still undecided) starts a new review.
CREATE TABLE charging_reviews (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    standard TEXT NOT NULL,
    evidential_outcome TEXT,
    public_interest_outcome TEXT,
    threshold_outcome TEXT,
    started_by TEXT,
    started_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    concluded_at INTEGER
);

CREATE UNIQUE INDEX one_open_review_per_file ON charging_reviews (prosecution_file_id) WHERE concluded_at IS NULL;

-- One finding per named criterion of the test being applied. `criterion` is
-- validated in the server against the standard's own list.
CREATE TABLE review_assessments (
    id TEXT PRIMARY KEY,
    review_id TEXT NOT NULL REFERENCES charging_reviews(id),
    test TEXT NOT NULL,
    criterion TEXT NOT NULL,
    finding TEXT NOT NULL,
    note TEXT,
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    UNIQUE (review_id, criterion)
);

-- A decision can now be about one count (`charge_id`, the accused being the
-- count's own accused), can conclude the review it came from, and can correct
-- an earlier decision. History stays append-only: a correction is a new row
-- that points at the one it corrects.
ALTER TABLE decisions ADD COLUMN charge_id TEXT REFERENCES charges(id);
ALTER TABLE decisions ADD COLUMN review_id TEXT REFERENCES charging_reviews(id);
ALTER TABLE decisions ADD COLUMN corrects_decision_id TEXT REFERENCES decisions(id);
