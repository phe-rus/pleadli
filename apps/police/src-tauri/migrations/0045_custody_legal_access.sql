-- Whether a person held in custody has asked for a lawyer, and who. A record only: nothing is sent to anyone.
-- legal_access: own_advocate, legal_aid, duty_counsel, declined, not_yet_asked. NULL means nobody has recorded it.
ALTER TABLE custody_records ADD COLUMN legal_access TEXT;
ALTER TABLE custody_records ADD COLUMN legal_name TEXT;
ALTER TABLE custody_records ADD COLUMN legal_requested_at INTEGER;
ALTER TABLE custody_records ADD COLUMN legal_note TEXT;
