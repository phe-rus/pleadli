-- Matters of every kind of work, not only criminal defence
-- (docs/lawyers/REVIEW-2026-09-30.md, sections 4.3 and 4.4).
--
-- A matter now has a type (civil suit, appeal, land transaction, ...) that
-- belongs to one usage, and a stage from that type's own list; the stages are
-- the columns of the board. Which stages a type has is the domain's
-- (`domain/matter_types.rs`), so a new stage never needs a migration. Every
-- matter from before is criminal defence, the only kind the app had.
--
-- `parties` are the other people in a matter: the other side, their advocate,
-- witnesses, a co-accused. With the clients, they are what the conflict check
-- searches before a new matter is opened.

ALTER TABLE matters ADD COLUMN matter_type TEXT NOT NULL DEFAULT 'criminal_defence';
ALTER TABLE matters ADD COLUMN stage TEXT NOT NULL DEFAULT 'instructions';
CREATE INDEX matters_type_stage ON matters (matter_type, stage);

ALTER TABLE clients ADD COLUMN kind TEXT NOT NULL DEFAULT 'person' CHECK (kind IN ('person', 'organisation'));
ALTER TABLE clients ADD COLUMN email TEXT;

CREATE TABLE parties (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    role TEXT NOT NULL CHECK (role IN ('opposing_party', 'opposing_counsel', 'co_party', 'witness', 'complainant', 'other')),
    name TEXT NOT NULL,
    organisation TEXT,
    contact TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX parties_matter ON parties (matter_id);
CREATE INDEX parties_name ON parties (name COLLATE NOCASE);
