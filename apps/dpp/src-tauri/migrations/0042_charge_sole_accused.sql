-- A charge on a file with exactly one accused belongs to that accused. Charges
-- made before this was assumed were left without a name.
UPDATE charges
   SET accused_person_id = (SELECT p.person_id FROM prosecution_file_people p WHERE p.prosecution_file_id = charges.prosecution_file_id AND p.role = 'accused')
 WHERE accused_person_id IS NULL
   AND (SELECT COUNT(*) FROM prosecution_file_people p WHERE p.prosecution_file_id = charges.prosecution_file_id AND p.role = 'accused') = 1;
