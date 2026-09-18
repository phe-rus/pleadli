-- Visits upgraded from a log to a real authorization + attendance workflow
-- (docs/prisons/PRODUCT.md, RESEARCH.md §9-10). `visit_type` distinguishes
-- three real, grounded categories: ordinary (gate/reception clearance),
-- legal_advisor (Prisons Act s.64(3) — a standing entitlement, supervised
-- "within sight but not within hearing", stricter than ordinary), and
-- special_authorization (weekend or researcher visits, requiring the
-- Commissioner General specifically). `status` separates authorization
-- from attendance — a real, evidence-backed distinction, not an invented
-- generic appointment system.
ALTER TABLE visits ADD COLUMN visit_type TEXT NOT NULL DEFAULT 'ordinary';
ALTER TABLE visits ADD COLUMN status TEXT NOT NULL DEFAULT 'attended';
ALTER TABLE visits ADD COLUMN authorized_by TEXT;
