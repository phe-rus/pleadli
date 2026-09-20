-- Head Office used to keep whole prisoner rows pushed by its facilities
-- (SECURITY.md X4). It now receives only the columns its statistics read, so
-- rows already held are reduced to the same shape. A synced copy is the row
-- with a `facility_id`; the facility's own record is authoritative and is not
-- touched. Birth dates are held to 1 July of the birth year, as on ingest.
UPDATE prisoners
SET first_name = '',
    last_name = '',
    other_names = NULL,
    national_id = NULL,
    reference = NULL,
    admission_authority = NULL,
    current_location = NULL,
    pending_document_type = NULL,
    documents_pending = 0,
    notes = NULL,
    date_of_birth = CASE WHEN date_of_birth IS NULL THEN NULL
        ELSE CAST(strftime('%s', strftime('%Y', date_of_birth / 1000, 'unixepoch') || '-07-01') AS INTEGER) * 1000 END
WHERE facility_id IS NOT NULL;
