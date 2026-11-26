-- Spec 0001 step 2: what kind of file this is (the ODPP cover colour follows
-- from it) and how one matter's several files are linked. The seven stored
-- stages are untouched; kind says which of the office's five sorts of work a
-- file is.
ALTER TABLE prosecution_files ADD COLUMN kind TEXT NOT NULL DEFAULT 'perusal'
    CHECK (kind IN ('perusal', 'application', 'appeal', 'revision', 'complaint'));
ALTER TABLE prosecution_files ADD COLUMN cover TEXT NOT NULL DEFAULT 'pink'
    CHECK (cover IN ('pink', 'yellow', 'green', 'blue', 'white'));

CREATE TABLE file_links (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    linked_file_id TEXT NOT NULL REFERENCES prosecution_files(id),
    relation TEXT NOT NULL CHECK (relation IN ('trial', 'bail', 'appeal', 'revision', 'related')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    UNIQUE (file_id, linked_file_id),
    CHECK (file_id <> linked_file_id)
);
CREATE INDEX file_links_linked ON file_links(linked_file_id);
