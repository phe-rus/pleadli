-- Which of a person's four identification-photo slots (front, left
-- profile, right profile, back) this attachment fills. Only meaningful
-- for entity_type = 'person' image attachments; every other attachment
-- (and any non-angle person file) leaves this null. A proper mugshot set
-- replaces the old single "pick one file and star it" headshot picker.
ALTER TABLE attachments ADD COLUMN photo_angle TEXT;
