-- Officer profile details and photo. `photo_data` is a small JPEG data URL,
-- validated and size-capped by the node. `posted_facility_id` names the
-- facility a Head Office account is posted to or oversees; it is a plain
-- id, not a foreign key, because the account may outlive the facility row.
ALTER TABLE officers ADD COLUMN rank TEXT;
ALTER TABLE officers ADD COLUMN phone TEXT;
ALTER TABLE officers ADD COLUMN email TEXT;
ALTER TABLE officers ADD COLUMN photo_data TEXT;
ALTER TABLE officers ADD COLUMN posted_facility_id TEXT;
