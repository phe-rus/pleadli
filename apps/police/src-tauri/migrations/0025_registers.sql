-- Register numbers. A station keeps its registers by year: the Station Diary
-- and the Crime Record Book each run 1, 2, 3 from the start of the year, and an
-- entry is cited as "n/year". One counter row per register per year; the next
-- number is taken inside the same transaction that writes the entry, so two
-- entries can never share a number.
--
-- Only the diary and the CRB are numbered here. Other registers (cells, exhibits,
-- bonds) are not, because their numbering practice has not been verified
-- (docs/police/research/file-structure-and-numbering.md).
CREATE TABLE register_counters (
    kind TEXT NOT NULL,
    year INTEGER NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (kind, year)
);

ALTER TABLE station_diary_entries ADD COLUMN entry_year INTEGER;
ALTER TABLE station_diary_entries ADD COLUMN entry_number INTEGER;

-- Existing entries are numbered in the order they were made, per year, so the
-- register reads as it would have if it had been numbered from the start.
-- The year is the station's own (East Africa Time, UTC+3, no daylight saving).
UPDATE station_diary_entries
   SET entry_year = CAST(strftime('%Y', created_at / 1000, 'unixepoch', '+3 hours') AS INTEGER);

UPDATE station_diary_entries
   SET entry_number = (
       SELECT COUNT(*) FROM station_diary_entries other
        WHERE other.entry_year = station_diary_entries.entry_year
          AND (other.created_at < station_diary_entries.created_at
               OR (other.created_at = station_diary_entries.created_at AND other.id <= station_diary_entries.id))
   );

INSERT INTO register_counters (kind, year, last_number)
SELECT 'sd', entry_year, MAX(entry_number) FROM station_diary_entries GROUP BY entry_year;

CREATE UNIQUE INDEX station_diary_entry_number ON station_diary_entries(entry_year, entry_number);

-- A case numbered by the register keeps its number apart from the reference
-- text, so the sequence can be found again. A reference typed by hand (every
-- case before this) has neither and is left exactly as written.
ALTER TABLE cases ADD COLUMN crb_year INTEGER;
ALTER TABLE cases ADD COLUMN crb_number INTEGER;
CREATE UNIQUE INDEX cases_crb_number ON cases(crb_year, crb_number) WHERE crb_number IS NOT NULL;
