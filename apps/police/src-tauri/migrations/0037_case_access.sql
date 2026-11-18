-- The officers, besides administrators and whoever restricted it, who may open a restricted case.
CREATE TABLE case_access (
    case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    officer_id TEXT NOT NULL,
    PRIMARY KEY (case_id, officer_id)
);
