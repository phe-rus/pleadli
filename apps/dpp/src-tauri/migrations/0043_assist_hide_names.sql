-- Whether names, national ID numbers and phone numbers are swapped for stand-ins
-- in the text sent to a model the office does not host. On by default: an
-- office has to choose to let an online model see who the people are.
ALTER TABLE assist_settings ADD COLUMN hide_names INTEGER NOT NULL DEFAULT 1;
