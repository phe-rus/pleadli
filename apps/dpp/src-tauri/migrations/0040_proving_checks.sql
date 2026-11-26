-- What the prosecutor ticked as shown by the papers, per file and per thing the
-- offence needs proved, with the page it rests on. Kept on the file so it moves
-- with it; the signed decision also carries a copy in its reasons.
CREATE TABLE proving_checks (
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    page TEXT,
    updated_by TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (prosecution_file_id, item)
);
