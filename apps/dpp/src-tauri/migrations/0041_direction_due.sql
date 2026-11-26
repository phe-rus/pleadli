-- When Police are to have done what a direction asks. Optional: a direction
-- without a date is still a direction.
ALTER TABLE directions ADD COLUMN due_at INTEGER;
