-- Corrects two things the development seed wrote before the rules were
-- settled: an em-dash in the seeded file title (the product never uses them),
-- and a police reference without its station prefix (Police CRB numbers read
-- `{station} CRB {number}/{year}`, docs/dpp/RESEARCH.md). Both statements
-- match only the seeded rows.
UPDATE prosecution_files SET title = replace(title, ' — ', ': ') WHERE title LIKE '% — %';
UPDATE prosecution_files SET police_reference = 'KIRA ROAD CRB 221/2026'
 WHERE police_reference = 'CRB 221/2026' AND odpp_registration_number = 'ODPP/KLA/0142/2026';
UPDATE referrals SET police_reference = 'KIRA ROAD CRB 221/2026' WHERE police_reference = 'CRB 221/2026';
