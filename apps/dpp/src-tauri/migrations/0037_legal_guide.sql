-- The legal guide: the office's own list of offences, what has to be proved for
-- each, the papers usually needed and what is often missing. It is data, not
-- code: the office edits it in plain words, every change keeps the version it
-- replaced, and one action puts the starter text back.
CREATE TABLE guide_offences (
    id TEXT PRIMARY KEY,
    jurisdiction TEXT NOT NULL,
    title TEXT NOT NULL,
    section_refs TEXT,
    charge_wording TEXT,
    particulars_template TEXT,
    proving_json TEXT NOT NULL DEFAULT '[]',
    papers_json TEXT NOT NULL DEFAULT '[]',
    gaps_json TEXT NOT NULL DEFAULT '[]',
    words_json TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'office' CHECK (source IN ('starter', 'office')),
    starter_key TEXT,
    state TEXT NOT NULL DEFAULT 'in_use' CHECK (state IN ('in_use', 'waiting_for_director')),
    archived_at INTEGER,
    updated_by TEXT,
    updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX guide_offences_juris ON guide_offences (jurisdiction, title);
CREATE UNIQUE INDEX guide_offences_starter ON guide_offences (jurisdiction, starter_key) WHERE starter_key IS NOT NULL;

CREATE TABLE guide_versions (
    id TEXT PRIMARY KEY,
    offence_id TEXT NOT NULL REFERENCES guide_offences(id),
    snapshot_json TEXT NOT NULL,
    changed_by TEXT,
    changed_at INTEGER NOT NULL,
    note TEXT
);
CREATE INDEX guide_versions_offence ON guide_versions (offence_id, changed_at);
