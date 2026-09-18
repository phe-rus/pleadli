-- Custody spine (docs/prisons/product-map/02 W1 to W5, 03 G.1; build phase 2).
-- Forward-only: nothing from 0001 to 0022 is rewritten except the `transfers`
-- table, which is rebuilt because the two-ended workflow needs an incoming
-- transfer that exists before any local prisoner row does (prisoner_id must
-- become nullable, and SQLite cannot drop NOT NULL in place).

-- ---------------------------------------------------------------------
-- Facility profile (singleton). The facility's own identity and approved
-- capacity: needed on a transfer dossier (who sent this person) and for
-- occupancy on Today. Until now the name lived only at Head Office.
-- ---------------------------------------------------------------------
CREATE TABLE facility_profile (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT,
    facility_number TEXT,
    location TEXT,
    region TEXT,
    approved_capacity INTEGER,
    updated_at INTEGER
);
INSERT INTO facility_profile (id) VALUES ('default');

-- ---------------------------------------------------------------------
-- Custody episode identity and stays (03 G.1). `episode_id` is the global
-- identifier created at first reception and carried across transfers; each
-- facility's `prisoners` row is that facility's live record of it. A stay is
-- the episode as held by this facility, owned by it forever.
-- ---------------------------------------------------------------------
ALTER TABLE prisoners ADD COLUMN episode_id TEXT;
UPDATE prisoners SET episode_id = lower(hex(randomblob(16))) WHERE episode_id IS NULL;
CREATE INDEX idx_prisoners_episode ON prisoners (episode_id);

CREATE TABLE stays (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    episode_id TEXT NOT NULL,
    entry_kind TEXT NOT NULL,
    entered_at INTEGER NOT NULL,
    exit_kind TEXT,
    exited_at INTEGER,
    exit_ref TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX one_open_stay_per_prisoner ON stays (prisoner_id) WHERE exited_at IS NULL;
CREATE INDEX idx_stays_episode ON stays (episode_id);

INSERT INTO stays (id, prisoner_id, episode_id, entry_kind, entered_at, exit_kind, exited_at)
SELECT lower(hex(randomblob(16))), p.id, p.episode_id, 'reception', p.admitted_at,
       CASE p.current_status WHEN 'released' THEN 'discharge' WHEN 'transferred_out' THEN 'transfer_out' END,
       CASE p.current_status
            WHEN 'released' THEN COALESCE((SELECT MAX(r.released_at) FROM releases r WHERE r.prisoner_id = p.id), p.admitted_at)
            WHEN 'transferred_out' THEN COALESCE((SELECT MAX(t.transferred_at) FROM transfers t WHERE t.prisoner_id = p.id), p.admitted_at)
       END
FROM prisoners p;

-- ---------------------------------------------------------------------
-- Instruments (F2.2): the legal authority chain. Received, authenticated,
-- verified, versioned. `status`: verified | pending | rectification_pending |
-- superseded. Documents attach through the vault (entity_type 'instrument').
-- ---------------------------------------------------------------------
CREATE TABLE instruments (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    kind TEXT NOT NULL,
    issuing_authority TEXT,
    reference TEXT,
    issued_on INTEGER,
    received_at INTEGER,
    authenticated INTEGER NOT NULL DEFAULT 0,
    verification_note TEXT,
    verified_by TEXT,
    status TEXT NOT NULL DEFAULT 'verified',
    superseded_by TEXT,
    supersede_reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_instruments_prisoner ON instruments (prisoner_id);

INSERT INTO instruments (id, prisoner_id, kind, issuing_authority, received_at, authenticated, status, verified_by)
SELECT lower(hex(randomblob(16))), p.id, p.admission_instrument_type, p.admission_authority, p.admitted_at, 1, 'verified', 'imported'
FROM prisoners p;

INSERT INTO instruments (id, prisoner_id, kind, status)
SELECT lower(hex(randomblob(16))), p.id, COALESCE(p.pending_document_type, 'other'), 'pending'
FROM prisoners p WHERE p.documents_pending = 1;

-- ---------------------------------------------------------------------
-- Sentence (F2.3). One active row per prisoner; a correction supersedes.
-- The term is kept as years, months and days as pronounced (a date is
-- computed by calendar arithmetic, not by a day count); `is_life` sentences
-- carry no term.
-- ---------------------------------------------------------------------
CREATE TABLE sentences (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    instrument_id TEXT,
    term_years INTEGER NOT NULL DEFAULT 0,
    term_months INTEGER NOT NULL DEFAULT 0,
    term_days INTEGER NOT NULL DEFAULT 0,
    is_life INTEGER NOT NULL DEFAULT 0,
    starts_on INTEGER NOT NULL,
    remission_forfeited_days INTEGER NOT NULL DEFAULT 0,
    superseded_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_sentences_prisoner ON sentences (prisoner_id);

-- ---------------------------------------------------------------------
-- Reception (W1): the procedure that causes the admission record. Refused
-- receptions have no prisoner row, so the decision lives here.
-- ---------------------------------------------------------------------
CREATE TABLE receptions (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT REFERENCES prisoners(id),
    person_name TEXT NOT NULL,
    decision TEXT NOT NULL,
    refusal_ground TEXT,
    decision_reason TEXT,
    instrument_kind TEXT,
    search_done INTEGER NOT NULL DEFAULT 0,
    injuries_note TEXT,
    complaints_note TEXT,
    health_screen_note TEXT,
    rules_information_given INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER NOT NULL,
    decided_by TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE TABLE prisoner_contacts (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT NOT NULL REFERENCES prisoners(id),
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT,
    address TEXT,
    is_emergency INTEGER NOT NULL DEFAULT 1,
    notify_on_imprisonment INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX idx_contacts_prisoner ON prisoner_contacts (prisoner_id);

-- ---------------------------------------------------------------------
-- Court diary (F2.4): a production is scheduled ahead, then its outcome is
-- applied. Existing rows were after-the-fact records: past ones are
-- 'produced', future ones 'scheduled'.
-- state: scheduled | produced | not_produced | cancelled
-- ---------------------------------------------------------------------
ALTER TABLE court_productions ADD COLUMN state TEXT NOT NULL DEFAULT 'produced';
ALTER TABLE court_productions ADD COLUMN outcome TEXT;
ALTER TABLE court_productions ADD COLUMN outcome_notes TEXT;
ALTER TABLE court_productions ADD COLUMN next_date INTEGER;
UPDATE court_productions SET state = 'scheduled'
WHERE production_date > cast(unixepoch('subsecond') * 1000 as integer);

-- ---------------------------------------------------------------------
-- Discharge with an OIC-authorised exception (decision D13). A gate that is
-- not met may be waived by an officer holding the exception authority, with
-- a recorded reason; the waived gates become obligations to regularise.
-- ---------------------------------------------------------------------
ALTER TABLE releases ADD COLUMN basis TEXT;
ALTER TABLE releases ADD COLUMN authorised_by TEXT;
ALTER TABLE releases ADD COLUMN exception_reason TEXT;
ALTER TABLE releases ADD COLUMN exception_gates TEXT;
ALTER TABLE releases ADD COLUMN after_noon INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- Obligations are derived from records (never stored as a second copy of a
-- fact). What is stored is the human response: an obligation acted on or
-- waived, keyed by its stable derivation key.
-- ---------------------------------------------------------------------
CREATE TABLE obligation_resolutions (
    key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    prisoner_id TEXT,
    outcome TEXT NOT NULL,
    action_taken TEXT NOT NULL,
    resolved_at INTEGER NOT NULL,
    resolved_by TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- Two-ended transfers (W5). One row is one facility's side of a movement:
-- direction 'out' (this facility sends) or 'in' (this facility receives).
-- state, out: preparing | in_transit | confirmed | cancelled
-- state, in:  arrived (dossier imported, awaiting confirmation) | confirmed
-- Legacy one-ended rows are complete records, so they become 'confirmed'.
-- ---------------------------------------------------------------------
CREATE TABLE transfers_v2 (
    id TEXT PRIMARY KEY,
    prisoner_id TEXT REFERENCES prisoners(id),
    direction TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'confirmed',
    episode_id TEXT,
    person_name TEXT,
    other_prison_name TEXT,
    transferred_at INTEGER NOT NULL,
    ordering_authority TEXT,
    order_reference TEXT,
    reason TEXT,
    planned_at INTEGER,
    dispatched_at INTEGER,
    escort TEXT,
    transport TEXT,
    arrived_at INTEGER,
    confirmed_at INTEGER,
    checklist_json TEXT,
    dossier_digest TEXT,
    dossier_json TEXT,
    receipt_json TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

INSERT INTO transfers_v2 (id, prisoner_id, direction, state, other_prison_name, transferred_at, ordering_authority, notes, created_at, confirmed_at)
SELECT id, prisoner_id, direction, 'confirmed', other_prison_name, transferred_at, ordering_authority, notes, created_at, transferred_at
FROM transfers;

DROP TABLE transfers;
ALTER TABLE transfers_v2 RENAME TO transfers;
CREATE INDEX idx_transfers_prisoner ON transfers (prisoner_id);
CREATE INDEX idx_transfers_state ON transfers (state);
