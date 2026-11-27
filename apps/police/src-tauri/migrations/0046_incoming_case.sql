ALTER TABLE exchange_incoming ADD COLUMN case_id TEXT REFERENCES cases(id);
