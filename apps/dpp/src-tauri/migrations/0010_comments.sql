-- Real review commentary on any structured record (a statement, an
-- evidence item, a charge, a decision, a review note, or the file itself),
-- not a single free-text field per domain. Same generic entity_type /
-- entity_id keying as attachments, so any current or future domain gets a
-- comment thread without its own migration. `body` is a rich-text JSON
-- document (@pleadli/rich-text), same as every other narrative field.
CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    author TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
