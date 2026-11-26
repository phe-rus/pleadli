-- Who may do what with files, kept apart from who administers the application.
-- One row per role and capability. The defaults below are a starting point only:
-- the office's real allocation policy is not confirmed (docs/dpp/ATTENTION-RULES),
-- so an administrator can change any row in Settings. The Director's own
-- authority (Constitution Art. 120(3)(d)) comes from the Director flag on the
-- person, not from this table, and cannot be edited here.
CREATE TABLE role_capabilities (
    role TEXT NOT NULL CHECK (role IN ('administrator', 'prosecutor', 'clerk')),
    capability TEXT NOT NULL CHECK (capability IN ('register_files', 'allocate_files', 'reassign_files', 'self_assign', 'review_files')),
    granted INTEGER NOT NULL DEFAULT 0 CHECK (granted IN (0, 1)),
    updated_by TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (role, capability)
);

INSERT INTO role_capabilities (role, capability, granted) VALUES
    ('administrator', 'register_files', 0), ('administrator', 'allocate_files', 0), ('administrator', 'reassign_files', 0), ('administrator', 'self_assign', 0), ('administrator', 'review_files', 0),
    ('prosecutor',    'register_files', 0), ('prosecutor',    'allocate_files', 0), ('prosecutor',    'reassign_files', 0), ('prosecutor',    'self_assign', 1), ('prosecutor',    'review_files', 1),
    ('clerk',         'register_files', 1), ('clerk',         'allocate_files', 1), ('clerk',         'reassign_files', 0), ('clerk',         'self_assign', 0), ('clerk',         'review_files', 0);

-- How many days before a hearing the prosecutor is told to prepare. A working
-- choice, not a rule from a standard; the office sets it in Settings.
INSERT INTO time_limits (key, days, updated_at) VALUES ('hearing_notice', 2, 0);
