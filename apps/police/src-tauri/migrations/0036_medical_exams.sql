-- Medical examinations a case depends on: the police medical form (PF3) for an injured or
-- assaulted person, and a post-mortem for a death. The record holds who was examined, where, by
-- whom, when it was asked for and done, and what was found.
CREATE TABLE medical_exams (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    person_id TEXT NOT NULL REFERENCES people(id),
    case_id TEXT REFERENCES cases(id),
    facility TEXT,
    examiner_name TEXT,
    requested_at INTEGER NOT NULL,
    examined_at INTEGER,
    status TEXT NOT NULL,
    findings TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
);
CREATE INDEX medical_exams_case ON medical_exams (case_id);
CREATE INDEX medical_exams_person ON medical_exams (person_id);
