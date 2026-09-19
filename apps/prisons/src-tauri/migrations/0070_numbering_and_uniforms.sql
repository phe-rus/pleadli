-- Prisoner numbering and uniform colours. No official Uganda Prisons Service
-- numbering format or uniform colour arrangement was found in public sources
-- (docs/prisons/RESEARCH.md), so the default pattern is provisional and every
-- colour starts unset. Both are configurable; numbering locks at first admission.
ALTER TABLE prisoners ADD COLUMN prisoner_number TEXT;
CREATE UNIQUE INDEX idx_prisoners_prisoner_number ON prisoners (prisoner_number) WHERE prisoner_number IS NOT NULL;

CREATE TABLE numbering_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    pattern TEXT NOT NULL DEFAULT '{SEQ:4}/{YEAR}',
    reset TEXT NOT NULL DEFAULT 'yearly' CHECK (reset IN ('yearly', 'never')),
    source TEXT NOT NULL DEFAULT 'default' CHECK (source IN ('default', 'facility', 'head_office')),
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO numbering_config (id) VALUES ('default');

CREATE TABLE numbering_counters (
    scope_key TEXT PRIMARY KEY,
    next_value INTEGER NOT NULL
);

CREATE TABLE uniform_scheme (
    category TEXT PRIMARY KEY,
    colour TEXT,
    label TEXT,
    source TEXT CHECK (source IN ('facility', 'head_office')),
    updated_at INTEGER
);
INSERT INTO uniform_scheme (category) VALUES ('unconvicted'), ('convicted'), ('civil');

CREATE TABLE hq_estate_policy (
    id TEXT PRIMARY KEY DEFAULT 'default',
    pattern TEXT NOT NULL DEFAULT '{SEQ:4}/{YEAR}',
    reset TEXT NOT NULL DEFAULT 'yearly' CHECK (reset IN ('yearly', 'never')),
    uniform_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER,
    updated_by TEXT
);
INSERT INTO hq_estate_policy (id) VALUES ('default');

ALTER TABLE facilities ADD COLUMN numbering_pattern TEXT;
ALTER TABLE facilities ADD COLUMN numbering_source TEXT;
ALTER TABLE facilities ADD COLUMN numbering_locked INTEGER;
ALTER TABLE facilities ADD COLUMN numbering_reported_at INTEGER;
