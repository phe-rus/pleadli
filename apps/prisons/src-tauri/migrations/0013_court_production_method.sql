-- Court production method (docs/prisons/PRODUCT.md, RESEARCH.md §11.2) --
-- virtual/video-link production is a real, operating alternative to
-- physical transport, confirmed at 19-21 prisons via the Commissioner
-- General's own 2024 account and Uganda Judiciary's 2019 Luzira launch.
ALTER TABLE court_productions ADD COLUMN production_method TEXT NOT NULL DEFAULT 'physical';
