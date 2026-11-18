-- A restricted case: its summary, people and papers are shown only to administrators and to the
-- officer who restricted it. Used for sensitive matters (child victims, sexual offences, informants).
ALTER TABLE cases ADD COLUMN restricted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases ADD COLUMN restricted_by TEXT;
