-- Registers and practice compliance (docs/lawyers/REVIEW-2026-09-30.md, L5; D10).
--
-- 1. `register_entries`: the walk-in register of a commissioner for oaths and
--    of a notary public. Whether the law makes such a register compulsory is
--    not researched [U]; D10 builds it anyway, because it is what a
--    commissioner is asked for when a deponent's signature is disputed. An
--    entry is never edited or deleted: a wrong one is voided with a reason and
--    stays visible, so the register reads the same to anyone who inspects it.
--    Numbers run per register per year (OA/2026/0001, NP/2026/0001).
-- 2. `staff` gains what the Settings compliance card and the register check:
--    the year the Uganda Law Society subscription was paid (a practising
--    certificate is refused without it, Advocates Act s.12(1)(e)), and the
--    dates of appointment as commissioner for oaths and notary public.
-- 3. `time_entries.staff_id`: who did the work, so pro bono hours count
--    towards the right advocate's 40 a year (Pro Bono Regulations 2009 [S]).
--    Older entries have nobody and are counted for the practice only.

CREATE TABLE register_entries (
    id TEXT PRIMARY KEY,
    register TEXT NOT NULL CHECK (register IN ('oaths', 'notarial')),
    number TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN (
        'affidavit', 'statutory_declaration', 'affirmation', 'certified_copy',
        'attestation', 'acknowledgment', 'protest', 'other'
    )),
    on_day INTEGER NOT NULL,
    place TEXT,
    person_name TEXT NOT NULL,
    person_id_document TEXT,
    person_address TEXT,
    document_title TEXT NOT NULL,
    pages INTEGER CHECK (pages IS NULL OR pages > 0),
    -- Read over by an interpreter, named, when the person does not read the
    -- language of the document.
    interpreter TEXT,
    fee INTEGER CHECK (fee IS NULL OR fee >= 0),
    matter_id TEXT REFERENCES matters(id),
    notes TEXT,
    commissioner_id TEXT NOT NULL REFERENCES staff(id),
    commissioner_name TEXT NOT NULL,
    voided_at INTEGER,
    voided_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX register_entries_day ON register_entries (register, on_day);

ALTER TABLE staff ADD COLUMN uls_paid_year INTEGER;
ALTER TABLE staff ADD COLUMN commissioner_since INTEGER;
ALTER TABLE staff ADD COLUMN notary_since INTEGER;

ALTER TABLE time_entries ADD COLUMN staff_id TEXT REFERENCES staff(id);
