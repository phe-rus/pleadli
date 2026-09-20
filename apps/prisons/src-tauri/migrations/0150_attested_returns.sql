-- Attested returns (docs/prisons/product-map/02 W14). A monthly return is
-- generated (0080, immutable), then checked, then attested by the OIC, then
-- submitted to Head Office as a T2 aggregate. Generated reports never change,
-- so what happens to one afterwards is recorded here.

-- The OIC's attestation. One per report, immutable: a wrong return is
-- replaced by generating and attesting a new one, never edited. The hash is
-- the one the officer attested, so it can be checked against the document.
CREATE TABLE return_attestations (
    report_id TEXT PRIMARY KEY REFERENCES generated_reports(id),
    content_hash TEXT NOT NULL,
    statement TEXT NOT NULL,
    attested_by_id TEXT,
    attested_by_name TEXT NOT NULL,
    attested_by_badge TEXT,
    attested_at INTEGER NOT NULL
);

CREATE TRIGGER return_attestations_no_update BEFORE UPDATE ON return_attestations
BEGIN
    SELECT RAISE(ABORT, 'attestations are immutable');
END;

CREATE TRIGGER return_attestations_no_delete BEFORE DELETE ON return_attestations
BEGIN
    SELECT RAISE(ABORT, 'attestations are never deleted');
END;

-- The queue to Head Office. A submission is made offline and sent when Head
-- Office can be reached; it stays here, with why it has not gone, until Head
-- Office acknowledges it.
CREATE TABLE return_submissions (
    report_id TEXT PRIMARY KEY REFERENCES return_attestations(report_id),
    queued_at INTEGER NOT NULL,
    queued_by_name TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER,
    last_error TEXT,
    acknowledged_at INTEGER
);

INSERT INTO sync_classes (class, direction) VALUES ('returns', 'up');

-- Head Office's received copy. Facility authors, Head Office owns what it
-- received (03 section C): the document exactly as attested, with its hash,
-- kept unchanged. A facility sending the same reference again is a duplicate.
CREATE TABLE received_returns (
    id TEXT PRIMARY KEY,
    facility_id TEXT NOT NULL REFERENCES facilities(id),
    reference TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    period_from INTEGER NOT NULL,
    period_to INTEGER NOT NULL,
    template_version INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    statement TEXT NOT NULL,
    attested_by_name TEXT NOT NULL,
    attested_by_badge TEXT,
    attested_at INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    UNIQUE (facility_id, reference)
);

CREATE INDEX idx_received_returns_period ON received_returns (facility_id, period_from, period_to);

CREATE TRIGGER received_returns_no_update BEFORE UPDATE ON received_returns
BEGIN
    SELECT RAISE(ABORT, 'received returns are immutable');
END;

CREATE TRIGGER received_returns_no_delete BEFORE DELETE ON received_returns
BEGIN
    SELECT RAISE(ABORT, 'received returns are never deleted');
END;
