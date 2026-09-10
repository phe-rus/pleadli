-- PF53 "Charge" — verified to exist by name on upf.go.ug
-- (docs/police/PRODUCT.md's audit, §G.3). Structure corroborated (not
-- primary-verified) against Magistrates Courts Act ss.85/86/88 and Trial
-- on Indictments Act ss.22/23/25 via secondary legal reproductions: a
-- charge has commencement (station, date, CRB/case reference), statement
-- of the offence (with statutory section), particulars, and a conclusion
-- (officer's signature; a magistrate signs before plea, not modeled here
-- since Police doesn't own that step). Only the fields nothing else in
-- the system already owns live here — case reference, person identity,
-- and station name (no Station entity exists — PRODUCT.md leaves that
-- scope unresolved, so this stays a plain free-text field) are read live
-- from their real records, not duplicated.
CREATE TABLE charge_sheets (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    accused_person_id TEXT REFERENCES people(id),
    offence TEXT NOT NULL,
    statutory_section TEXT NOT NULL,
    particulars TEXT NOT NULL,
    charged_at INTEGER NOT NULL,
    officer_name TEXT,
    station_name TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
