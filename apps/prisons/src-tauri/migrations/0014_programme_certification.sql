-- Programme completion/certification (docs/prisons/PRODUCT.md,
-- RESEARCH.md §11.9-11.10) — a real, discrete, dated external assessment
-- event (UVTAB trade-testing) resulting in an actual certificate, distinct
-- from daily attendance (which stays unmodeled, since no source describes
-- it for rehabilitation/work programmes).
ALTER TABLE programme_participations ADD COLUMN completed_at INTEGER;
ALTER TABLE programme_participations ADD COLUMN certificate_reference TEXT;
