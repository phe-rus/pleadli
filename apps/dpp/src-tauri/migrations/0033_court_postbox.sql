-- Where a court registry answers on the relay (docs/platform/RELAY-DESIGN.md): learned from the relay's own
-- word for who posted the invitation, kept once, and checked on every package that claims to come from that
-- registry. The postbox tables themselves came with 0032.
ALTER TABLE court_links ADD COLUMN address TEXT;
