-- "Where is this person right now" (docs/prisons/PRODUCT.md's "Current
-- location" section) — a plain free-text field, deliberately not a
-- structured Facility/Block/Wing/Cell hierarchy, since no such hierarchy
-- was verified for Uganda (RESEARCH.md §9).
ALTER TABLE prisoners ADD COLUMN current_location TEXT;
