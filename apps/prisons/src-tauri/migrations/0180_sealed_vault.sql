-- D14: documents are sealed files in the vault, named by attachment id and
-- recorded by a path relative to the vault. `content_sha256` is the hash of the
-- plain bytes, so a document can be checked against what was stored without
-- trusting the file's name. Rows written by older builds hold an absolute path
-- and no hash; `vault::adopt` seals them at startup and fills both in.
ALTER TABLE attachments ADD COLUMN content_sha256 TEXT;
