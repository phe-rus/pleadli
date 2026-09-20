-- Facility identity and conventions chosen at first setup (docs/prisons/
-- product/10-facility-first-workspace-model.md section 6). The facility owns
-- all of these. `facility_number` (already present) is the facility code Head
-- Office recognises. Timezone is not stored: it comes from the jurisdiction.
ALTER TABLE facility_profile ADD COLUMN country TEXT;
ALTER TABLE facility_profile ADD COLUMN jurisdiction TEXT NOT NULL DEFAULT 'ug';
ALTER TABLE facility_profile ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE facility_profile ADD COLUMN badge_prefix TEXT;
ALTER TABLE facility_profile ADD COLUMN document_prefix TEXT;
