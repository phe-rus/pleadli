-- The court a matter belongs to, by the court registry's own identity (the id its signed packages carry).
-- A court number alone is not enough: case numbers repeat across courts. Set the first time a notice from a
-- court is filed on the matter, or a filing goes out; cleared if the matter's court number is changed.
ALTER TABLE matters ADD COLUMN court_id TEXT;
