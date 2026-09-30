-- Bills of costs (docs/lawyers/REVIEW-2026-09-30.md, L4; D9), for taxation
-- after judgment. The scale is the Sixth Schedule to the Advocates
-- (Remuneration and Taxation of Costs) Regulations (SI 123 of 1982), as
-- substituted by SI 7 of 2018 [P: ULII consolidation 2018-03-02]; the app
-- computes it (`domain/costs_scale.rs`). Regulation 13A: before taxation the
-- advocates jointly identify the items they agree, the taxing officer records
-- them and taxes the rest. So every item carries what is claimed, what was
-- agreed at the pre-taxation meeting, and what was taxed (allowed).
CREATE TABLE bills_of_costs (
    id TEXT PRIMARY KEY,
    matter_id TEXT NOT NULL REFERENCES matters(id),
    -- Whose costs: the client's costs against the other side (party and
    -- party), or the advocate's against the client.
    against TEXT NOT NULL DEFAULT 'other_side' CHECK (against IN ('other_side', 'client')),
    -- The claim or value of the subject matter, for item 1(1).
    subject_value INTEGER,
    -- Which part of item 1 applies: 1(1) full, 1(2) no defence, 1(3) leave
    -- refused, 1(4) settled before the first hearing date was confirmed.
    instruction_basis TEXT NOT NULL DEFAULT '1_1' CHECK (instruction_basis IN ('1_1', '1_2', '1_3', '1_4')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'lodged', 'taxed')),
    lodged_on INTEGER,
    pre_taxation_on INTEGER,
    taxed_on INTEGER,
    taxing_officer TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX bills_matter ON bills_of_costs (matter_id);

CREATE TABLE bill_items (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL REFERENCES bills_of_costs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    on_day INTEGER,
    -- The Schedule item it is claimed under ("1(1)", "10(1)", "12(1)"), or
    -- empty for a disbursement.
    item_ref TEXT,
    particulars TEXT NOT NULL,
    disbursement INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL CHECK (claimed >= 0),
    -- Agreed at the pre-taxation meeting (reg. 13A), if it was.
    agreed INTEGER CHECK (agreed >= 0),
    -- Allowed on taxation.
    taxed INTEGER CHECK (taxed >= 0)
);
CREATE INDEX bill_items_bill ON bill_items (bill_id, position);
