-- Money (docs/lawyers/REVIEW-2026-09-30.md, L4; D9). Amounts are whole
-- Uganda shillings.
--
-- 1. `ledger_entries`: the books. Every advocate keeps each client's money
--    apart from any other money and keeps the books six years (Advocates Act,
--    First Schedule, Accounts Rules r.9; breaking them is an offence, s.43).
--    So the ledger is append-only: nothing is edited or deleted, a mistake is
--    put right by a reversing entry that names the one it reverses.
--      client account: `received` (money held for the client), `paid_out` (paid
--        for the client from their money), `to_office` (moved to office money
--        against a fee note delivered to that client).
--      office account: `fee_received` (paid straight to the practice against a
--        fee note), `disbursement` (the practice paid for the client from its
--        own money, recoverable on a fee note).
--    A client's balance never goes below nothing: the app refuses it.
-- 2. `fee_notes` and `fee_note_lines`: what the practice bills. Not a tax
--    invoice: a VAT-registered practice issues its fiscal invoice through URA's
--    EFRIS, which this app does not do. State brief and pro bono matters are
--    never billed. A time entry is billed once.
CREATE TABLE ledger_entries (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id),
    matter_id TEXT REFERENCES matters(id),
    account TEXT NOT NULL CHECK (account IN ('client', 'office')),
    kind TEXT NOT NULL CHECK (kind IN ('received', 'paid_out', 'to_office', 'fee_received', 'disbursement')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    on_day INTEGER NOT NULL,
    -- Receipt number, cheque, bank or mobile money reference.
    reference TEXT,
    description TEXT NOT NULL,
    fee_note_id TEXT REFERENCES fee_notes(id),
    reverses TEXT REFERENCES ledger_entries(id),
    recorded_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX ledger_client ON ledger_entries (client_id, on_day);
CREATE INDEX ledger_fee_note ON ledger_entries (fee_note_id);
CREATE UNIQUE INDEX ledger_reversed_once ON ledger_entries (reverses) WHERE reverses IS NOT NULL;

CREATE TABLE fee_notes (
    id TEXT PRIMARY KEY,
    -- FN/2026/0001, given when issued.
    number TEXT UNIQUE,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    client_id TEXT NOT NULL REFERENCES clients(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'cancelled')),
    issued_on INTEGER,
    due_on INTEGER,
    note TEXT,
    issued_by TEXT,
    cancelled_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX fee_notes_matter ON fee_notes (matter_id);

CREATE TABLE fee_note_lines (
    id TEXT PRIMARY KEY,
    fee_note_id TEXT NOT NULL REFERENCES fee_notes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('fee', 'time', 'disbursement')),
    description TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    -- For time: the entry billed, its minutes and the hourly rate used.
    time_entry_id TEXT UNIQUE REFERENCES time_entries(id),
    minutes INTEGER,
    rate INTEGER
);
CREATE INDEX fee_note_lines_note ON fee_note_lines (fee_note_id, position);

ALTER TABLE installation ADD COLUMN hourly_rate INTEGER;
