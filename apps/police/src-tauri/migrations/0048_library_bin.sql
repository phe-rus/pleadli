-- The library's recycle bin. Deleting moves an item here for 30 days: a folder's whole
-- subtree is listed (batch = one delete), its files are set aside by changing their
-- attachment entity_type to 'library_trash', and only the item the officer chose
-- (is_root = 1) is shown in the bin. Restoring undoes the batch; purging shreds it.
CREATE TABLE library_trash (
    item_kind TEXT NOT NULL,
    item_id TEXT NOT NULL,
    batch TEXT NOT NULL,
    is_root INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    from_folder TEXT NOT NULL,
    deleted_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    deleted_by TEXT,
    PRIMARY KEY (item_kind, item_id)
);

CREATE INDEX idx_library_trash_batch ON library_trash(batch);
