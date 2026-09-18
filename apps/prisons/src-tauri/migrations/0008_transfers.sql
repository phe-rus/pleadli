-- Transfers (docs/prisons/PRODUCT.md §Transfers). Confirmed: a transfer
-- preserves one continuous custody identity (s.73(5)-(6): "deemed to be
-- in the custody of the prison officer" throughout) — this is an event on
-- the existing Prisoner record, never a new admission/episode.
--
-- `direction`: 'out' (this prison sends the prisoner elsewhere) or 'in'
-- (this prison receives them back — see domain/transfers.rs for why a
-- wholly new arrival still goes through Admission, not this table).
CREATE TABLE transfers (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    direction TEXT NOT NULL,
    other_prison_name TEXT,
    transferred_at INTEGER NOT NULL,
    ordering_authority TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
