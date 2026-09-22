-- Discontinuance and nolle prosequi belong to the Director of Public
-- Prosecutions personally (Constitution Art. 120(3)(d); Trial on Indictments
-- Act s.135) and cannot be delegated, so the installation has to say whether
-- its prosecutor is the DPP. The server refuses those two decisions unless it
-- does. Not a staff system: one flag on the one prosecutor.
ALTER TABLE prosecutor_profile ADD COLUMN is_dpp INTEGER NOT NULL DEFAULT 0;
