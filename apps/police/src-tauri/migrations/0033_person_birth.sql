-- Date of birth on a person, as an ISO date (YYYY-MM-DD). Age decides whether someone is treated
-- as a juvenile (under 18), so it has to be on the record. Many people have no birth certificate,
-- so an officer can record an estimated date and mark it as an estimate.
ALTER TABLE people ADD COLUMN date_of_birth TEXT;
ALTER TABLE people ADD COLUMN date_of_birth_estimated INTEGER NOT NULL DEFAULT 0;
