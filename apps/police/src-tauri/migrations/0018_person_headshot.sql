-- Optional headshot per person — a single designated photo (out of
-- however many files are attached to them) shown as an avatar in
-- lists, the person's own page, and the remote civilian-lookup view,
-- where visually confirming identity is the whole point. Points at an
-- existing attachment row rather than duplicating file storage; unset
-- until an officer picks one via "Set as headshot".
ALTER TABLE people ADD COLUMN headshot_attachment_id TEXT REFERENCES attachments(id);
