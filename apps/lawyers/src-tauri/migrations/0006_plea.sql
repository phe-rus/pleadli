-- The defence side of a plea negotiation. The research found the plea agreement
-- to be co-authored (prosecutor, accused and advocate all sign), and the duty of
-- explaining the agreement to the accused before they sign to fall on the
-- advocate or a justice of the peace, not the prosecutor (docs/lawyers/RESEARCH.md,
-- section 3, from the Plea Bargain Rules; the Rules' primary text was not re-read
-- when this was written). So this records what only the defence can: the steps
-- and dates on this side, with the explanation as a required step before an
-- agreement counts as reached. It is one record per matter, kept apart from the
-- DPP's own, and matched by court number when the two sides are connected.
CREATE TABLE plea_negotiations (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL UNIQUE REFERENCES matters(id),
    status TEXT NOT NULL DEFAULT 'considering' CHECK (status IN ('considering', 'negotiating', 'agreed', 'confirmed', 'abandoned')),
    summary TEXT,
    explained_on INTEGER,
    explained_by TEXT CHECK (explained_by IN ('advocate', 'justice_of_the_peace')),
    signed_on INTEGER,
    confirmed_on INTEGER,
    abandoned_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
