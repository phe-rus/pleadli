-- Statements, bonds, charge sheets and referrals each carried a typed officer
-- name. They now point at an officer on the station's books as well. The typed
-- name stays on the record as written (a printed charge sheet must not change
-- when an officer is renamed later), and is linked to an officer here only
-- where exactly one officer has that name.
ALTER TABLE statements ADD COLUMN officer_id TEXT REFERENCES officers(id);
ALTER TABLE bonds ADD COLUMN officer_id TEXT REFERENCES officers(id);
ALTER TABLE charge_sheets ADD COLUMN officer_id TEXT REFERENCES officers(id);
ALTER TABLE referrals ADD COLUMN officer_id TEXT REFERENCES officers(id);

UPDATE statements SET officer_id = (SELECT o.id FROM officers o WHERE lower(o.name) = lower(statements.officer_name))
 WHERE officer_name IS NOT NULL AND (SELECT COUNT(*) FROM officers o WHERE lower(o.name) = lower(statements.officer_name)) = 1;
UPDATE bonds SET officer_id = (SELECT o.id FROM officers o WHERE lower(o.name) = lower(bonds.officer_name))
 WHERE officer_name IS NOT NULL AND (SELECT COUNT(*) FROM officers o WHERE lower(o.name) = lower(bonds.officer_name)) = 1;
UPDATE charge_sheets SET officer_id = (SELECT o.id FROM officers o WHERE lower(o.name) = lower(charge_sheets.officer_name))
 WHERE officer_name IS NOT NULL AND (SELECT COUNT(*) FROM officers o WHERE lower(o.name) = lower(charge_sheets.officer_name)) = 1;
UPDATE referrals SET officer_id = (SELECT o.id FROM officers o WHERE lower(o.name) = lower(referrals.officer_name))
 WHERE officer_name IS NOT NULL AND (SELECT COUNT(*) FROM officers o WHERE lower(o.name) = lower(referrals.officer_name)) = 1;
