-- Real documents from the first slice, not retrofitted (docs/prisons/
-- PRODUCT.md's standing correction from the DPP cycle) — the four
-- admission instruments, production orders, reception/transfer letters are
-- all real physical artifacts (RESEARCH.md §4, §6). Same DB-owns-facts /
-- Vault-owns-bytes split as Police and DPP.
CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
