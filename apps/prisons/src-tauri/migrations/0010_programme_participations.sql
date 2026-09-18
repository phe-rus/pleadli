-- Rehabilitation & Work Programmes (docs/prisons/PRODUCT.md, RESEARCH.md
-- §10, primary — UPS's own site) — real named programmes (vocational
-- training: tailoring/welding/agricultural engineering; prison industries:
-- furniture production; prison farms: livestock/cotton/maize/oil crops),
-- confirmed at real scale (21,996 participants in FY2021/22 alone).
-- Modeled as participation status, not a calendar — no attendance-tracking
-- system for programmes was found, unlike Visits.
CREATE TABLE programme_participations (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    category TEXT NOT NULL,
    programme_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
