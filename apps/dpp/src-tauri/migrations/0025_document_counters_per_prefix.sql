-- Document numbers run per reference style: ODPP-2026-0001 and
-- PARQUET-2026-0001 are separate series, so an office that switches country
-- (or a test machine) does not start its new series part-way. Each series is
-- seeded from the highest number already issued with that prefix and year.

DROP TABLE document_counters;

CREATE TABLE document_counters (
    prefix TEXT NOT NULL,
    year INTEGER NOT NULL,
    next INTEGER NOT NULL,
    PRIMARY KEY (prefix, year)
);

INSERT INTO document_counters (prefix, year, next)
SELECT substr(reference, 1, length(reference) - 10),
       CAST(substr(reference, -9, 4) AS INTEGER),
       MAX(CAST(substr(reference, -4) AS INTEGER)) + 1
FROM documents
WHERE reference IS NOT NULL AND reference GLOB '*-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
GROUP BY 1, 2;
