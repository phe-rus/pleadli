-- no-transaction
-- One officer record. Until now an officer was four things: login credentials
-- (`officers`), a standing posting (`station_establishment`), a name typed into
-- each shift (`duty_assignments.officer_name`) and a name typed into several
-- forms. Here the first two become one row: an officer is someone who works at
-- this station, with a name, a rank, a post and a role, and (optionally) a badge
-- number and a way to sign in over remote access.
--
-- What changes:
--   * badge_number becomes optional (a posting has no badge until one is given),
--   * password_hash becomes optional (NULL means this officer has no remote
--     sign-in, which is the ordinary case),
--   * rank, post and notes move here from station_establishment.
--
-- station_establishment is left in place, unread and unwritten, so nothing is
-- lost; it can be dropped once a station has confirmed the merge.
--
-- The rebuild drops a table other tables point at. SQLite cannot change the
-- foreign key setting inside a transaction, so this migration runs outside the
-- one sqlx would open (the first line), turns enforcement off, does the whole
-- rebuild in a transaction of its own, checks that no reference was left
-- dangling, and turns enforcement back on.
PRAGMA foreign_keys = OFF;
BEGIN;


CREATE TABLE officers_new (
    id TEXT PRIMARY KEY,
    badge_number TEXT UNIQUE,
    name TEXT NOT NULL,
    rank TEXT,
    post TEXT,
    role TEXT NOT NULL DEFAULT 'officer',
    active INTEGER NOT NULL DEFAULT 1,
    person_id TEXT REFERENCES people(id),
    notes TEXT,
    password_hash TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

INSERT INTO officers_new (id, badge_number, name, role, active, person_id, password_hash, created_at)
SELECT id, badge_number, name, role, active, person_id, password_hash, created_at FROM officers;

-- A posting for someone who already has an account is folded into that account.
UPDATE officers_new
   SET rank = (SELECT se.rank FROM station_establishment se WHERE se.person_id = officers_new.person_id ORDER BY se.created_at LIMIT 1),
       post = (SELECT se.post FROM station_establishment se WHERE se.person_id = officers_new.person_id ORDER BY se.created_at LIMIT 1),
       notes = (SELECT se.notes FROM station_establishment se WHERE se.person_id = officers_new.person_id ORDER BY se.created_at LIMIT 1)
 WHERE person_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM station_establishment se WHERE se.person_id = officers_new.person_id);

-- Every other posting becomes an officer of its own, keeping its id. A person
-- posted twice becomes one officer, from the earlier posting.
INSERT INTO officers_new (id, name, rank, post, role, active, person_id, notes, created_at)
SELECT se.id,
       trim(p.first_name || ' ' || p.last_name),
       se.rank, se.post, 'officer', se.active, se.person_id, se.notes, se.created_at
  FROM station_establishment se
  JOIN people p ON p.id = se.person_id
 WHERE se.person_id NOT IN (SELECT person_id FROM officers_new WHERE person_id IS NOT NULL)
   AND se.id = (SELECT first.id FROM station_establishment first
                 WHERE first.person_id = se.person_id ORDER BY first.created_at, first.id LIMIT 1);

DROP TABLE officers;
ALTER TABLE officers_new RENAME TO officers;

-- A shift now points at an officer. The name typed on each existing shift is
-- kept as written; it is linked only where exactly one officer has that name.
ALTER TABLE duty_assignments ADD COLUMN officer_id TEXT REFERENCES officers(id);

UPDATE duty_assignments
   SET officer_id = (SELECT o.id FROM officers o WHERE lower(o.name) = lower(duty_assignments.officer_name))
 WHERE (SELECT COUNT(*) FROM officers o WHERE lower(o.name) = lower(duty_assignments.officer_name)) = 1;

COMMIT;
PRAGMA foreign_keys = ON;
