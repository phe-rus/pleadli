-- Real documents, not a text field describing them (see
-- feedback_pleadli_document_centric_ux memory / docs/dpp/PRODUCT.md's
-- Documents section, revised 2026-09-11). Same DB-owns-facts /
-- Vault-owns-bytes split as Police: this table owns metadata only, the
-- actual file bytes live in the DPP Vault on disk (see domain/attachments.rs).
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
