-- Unified Referrals & Dispatches (docs/police/PRODUCT.md, resolved 2026-09
-- after verifying "dispatch" doesn't name a genuinely distinct records
-- workflow — see that section for the check). One table with a
-- `destination_type` discriminator instead of two near-duplicate tables,
-- since "case handed elsewhere, tracked here" is the same shape regardless
-- of destination. Grounded in docs/police/research (audit §G.4): for the
-- DPP path, no named transmittal form or inward register was found, so
-- `destination_name` stays free text and `status` stays exactly the three
-- real outcomes the research verified (pending / accepted / rejected).
CREATE TABLE referrals (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    destination_type TEXT NOT NULL,
    destination_name TEXT,
    referred_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    officer_name TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
