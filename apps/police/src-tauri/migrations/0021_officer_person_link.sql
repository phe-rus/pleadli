-- Officers today are bare login records (badge number, name, password,
-- role) with nowhere to put a phone number, address, national ID, or
-- vehicle. Rather than duplicating those fields here, an officer can now
-- link to their own real Person record, which already has them.
-- Nullable: an officer account can exist before anyone gets around to
-- linking it, same as every other optional relationship in this app.
ALTER TABLE officers ADD COLUMN person_id TEXT REFERENCES people(id);
