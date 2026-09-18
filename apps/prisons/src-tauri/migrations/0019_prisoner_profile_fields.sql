-- 0019. Prisoner profile fields and document completeness
-- (spec docs/specs/prisons/0002-admission-property-release-integrity-and-statistics).
--
-- * date_of_birth, sex, education_level, nationality, offence: the dimensions
--   UPS publishes its population statistics by (docs/prisons/RESEARCH.md §8).
--   All nullable because they apply only to admissions captured after this
--   migration; historical rows are backfilled in the field.
-- * documents_pending + pending_document_type: "convicted but the committed
--   warrant has not arrived yet". The prisoner's status stays 'convicted'
--   (the pending state is a property of the admission, not a third statutory
--   status), so status-grouped statistics keep counting these prisoners as
--   Convicted. The release gate (spec AC-2) blocks while documents_pending = 1.
ALTER TABLE prisoners ADD COLUMN date_of_birth INTEGER;
ALTER TABLE prisoners ADD COLUMN sex TEXT;
ALTER TABLE prisoners ADD COLUMN education_level TEXT;
ALTER TABLE prisoners ADD COLUMN nationality TEXT;
ALTER TABLE prisoners ADD COLUMN offence TEXT;
ALTER TABLE prisoners ADD COLUMN documents_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE prisoners ADD COLUMN pending_document_type TEXT;