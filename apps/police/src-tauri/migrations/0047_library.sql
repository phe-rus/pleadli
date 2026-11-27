-- The Police library: folders an officer makes and fills themselves, like a
-- file manager. The files are ordinary sealed attachments with
-- entity_type = 'library' and entity_id = the folder's id ('root' for the top).
-- parent_id NULL means the folder sits at the top of the library.
CREATE TABLE library_folders (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES library_folders(id),
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE INDEX idx_library_folders_parent ON library_folders(parent_id);
