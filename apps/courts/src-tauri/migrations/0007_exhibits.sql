-- The exhibits register of a case. An exhibit is marked in a sitting, by the
-- side that produced it, and the court then admits or rejects it. The label
-- (P1, D1, C1) is made from the side and the next number in the case; that this
-- is the labelling a Ugandan court uses is not yet field-checked (D10).
CREATE TABLE exhibits (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    sitting_id TEXT REFERENCES sittings(id),
    label TEXT NOT NULL,
    produced_by TEXT NOT NULL CHECK (produced_by IN ('prosecution', 'defence', 'court')),
    description TEXT NOT NULL,
    witness TEXT,
    status TEXT NOT NULL DEFAULT 'marked' CHECK (status IN ('marked', 'admitted', 'rejected')),
    note TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX exhibits_label ON exhibits (case_id, label COLLATE NOCASE);
