-- The offline law library: texts the bench keeps on this computer and can search
-- with no connection. Nothing is bundled. The text of a statute, guideline or
-- authority is added by the person, with where it came from and its licence, so
-- what is stored is only ever text someone put there on purpose and can check
-- against its source. (Bundling the Laws.Africa consolidations, which are CC-BY,
-- is a later step once the texts are read against the source.)
CREATE TABLE library_items (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('statute', 'guideline', 'authority', 'practice_direction', 'note')),
    title TEXT NOT NULL,
    citation TEXT,
    source TEXT,
    licence TEXT,
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
