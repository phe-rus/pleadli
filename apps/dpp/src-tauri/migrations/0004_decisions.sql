-- Auditable decision log (docs/dpp/PRODUCT.md §Decisions & Reviews).
-- Append-only by convention: no update/delete commands are exposed for this
-- table anywhere in the app — a corrected decision is a new row, never a
-- mutation of history (RESEARCH.md §4: reopening a declined charge is
-- itself a new reviewed event, not a silent status flip).
--
-- `decision_type` is intentionally free text validated in the TS layer
-- against the confirmed set in docs/dpp/PRODUCT.md's decision table
-- (sanction, decline, threshold_charge, divert, return_for_investigation,
-- take_over, discontinue, nolle_prosequi, plea_bargain_accepted,
-- committal_venue_high_court, amend_charge) rather than a SQL CHECK
-- constraint, so a future confirmed addition doesn't require a migration.
--
-- `decided_by` is a plain name, not a user/officer foreign key — no local
-- auth exists yet, same precedent as Police's officer_name fields
-- (src-tauri/src/domain/bonds.rs).
CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    prosecution_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    decision_type TEXT NOT NULL,
    decided_by TEXT,
    decided_at INTEGER NOT NULL,
    reasons TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
