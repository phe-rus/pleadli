-- Transcript of a recording, as segments. A transcript is only ever an aid: the
-- law makes the judicial officer's signed record the record of proceedings
-- (MCA s.136(2), s.138; TIA s.86(2), s.143), and a machine draft is not
-- evidence of what was said. Three states are always visible:
--   draft    written by a transcription engine, unreviewed;
--   edited   written or corrected by a person;
--   adopted  taken into the bench record as a note (`adopted_note_id`), which
--            is where it becomes the officer's own.
-- No engine ships with this version, so every segment today is typed by a person
-- (`source` = manual); the seam for an engine exists and says "unavailable".
CREATE TABLE transcript_segments (
    id TEXT PRIMARY KEY,
    recording_id TEXT NOT NULL REFERENCES recordings(id),
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    speaker TEXT,
    channel TEXT,
    text TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'edited' CHECK (state IN ('draft', 'edited', 'adopted')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('machine', 'manual')),
    engine TEXT,
    adopted_note_id TEXT REFERENCES bench_notes(id),
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
    updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX transcript_segments_recording ON transcript_segments (recording_id, start_ms);

CREATE TRIGGER transcript_segments_adopted_no_update BEFORE UPDATE ON transcript_segments WHEN OLD.state = 'adopted'
BEGIN SELECT RAISE(ABORT, 'An adopted passage is part of the bench record.'); END;
CREATE TRIGGER transcript_segments_adopted_no_delete BEFORE DELETE ON transcript_segments WHEN OLD.state = 'adopted'
BEGIN SELECT RAISE(ABORT, 'An adopted passage is part of the bench record.'); END;
