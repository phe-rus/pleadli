-- Polymorphic: entity_type + entity_id together identify the record this
-- file belongs to (no FK, since a single column can't reference multiple
-- tables). entity_type is a plain string discriminator, not a Rust enum,
-- matching how status/category fields are handled elsewhere in this app.
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

CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
