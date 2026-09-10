-- Cloudflare Tunnel configuration for the remote-access feature —
-- singleton rows, same `id = 'default'` pattern as station_profile.
-- api_token is a real secret; it never leaves this table (no command
-- returns it back to the frontend once saved).
CREATE TABLE cloudflare_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    api_token TEXT NOT NULL,
    account_id TEXT NOT NULL,
    domain TEXT NOT NULL,
    station_name TEXT NOT NULL
);

-- What Cloudflare gave back after provisioning — kept so re-enabling
-- remote access reuses the same tunnel instead of creating a new one
-- (and a new hostname) every time.
CREATE TABLE cloudflare_tunnel_state (
    id TEXT PRIMARY KEY DEFAULT 'default',
    tunnel_id TEXT NOT NULL,
    hostname TEXT NOT NULL,
    run_token TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
