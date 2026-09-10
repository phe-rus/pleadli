# Remote access

Off by default. Lets an officer reach **search and custody alerts only** from
outside the desktop app, either on the station's own local network or, once
Cloudflare is configured, from anywhere. No case, person, or statement detail
ever crosses this boundary. Every remote request is logged against the
officer who made it (Settings → Network → Recent remote activity).

## What exists

- **Officers** (Station Admin → Officers): the first accounts/auth concept in
  this app. Badge number, name, Argon2-hashed password, one role. Separate
  from Establishment, which is a roster, not credentials.
- **The restricted server** (`src-tauri/src/remote_server.rs`): a real,
  always-available Axum server — not the dev-only one in `server.rs` — bound
  to every network interface (`0.0.0.0`), not just loopback, whenever a
  station has remote access turned on. Serves a small, self-contained HTML
  page (`remote_ui.html`) with a login form, a search box, and a custody
  alerts list. Nothing else.
- **Local network**: Settings → Network shows the station's own LAN address
  and a QR code (encoding that address) to pair a phone with, so nobody types
  an IP. This works with zero Cloudflare configuration — flipping "Remote
  access" on alone makes the station reachable to any device on the same
  network.
- **Cloudflare Tunnel**: once an API token, account ID, domain, and station
  name are saved, the same toggle also provisions (or reuses) a Cloudflare
  Tunnel and starts `cloudflared` as a bundled sidecar process, making the
  station reachable from anywhere at `<station-name>.<domain>`.

## What you need to do once, yourself

The app cannot create a Cloudflare account, an API token, or a DNS zone for
itself — that's real setup, done once:

1. In your Cloudflare dashboard, create an API token scoped to **both**:
   - `Cloudflare Tunnel: Edit` (also listed as "Cloudflare One Connectors
     Write" or "Cloudflare One Connector: cloudflared Write" — any one
     works)
   - `Zone → DNS → Edit`, scoped to the zone for your domain
2. Find your Cloudflare **Account ID** (shown on the dashboard's right-hand
   sidebar for any domain).
3. Paste the token, account ID, your domain, and a station name into
   Settings → Network → Cloudflare Tunnel, and save.
4. Turn "Remote access" on.

That's it from the app's side — the tunnel, the DNS record, and the ingress
rule are all created via Cloudflare's API automatically the first time you do
this. Re-enabling later reuses the same tunnel rather than creating a new one.

## What still needs attention before shipping to real stations

- **The `cloudflared` sidecar binary** is fetched per-platform, not built
  from source, and is `.gitignore`d (large, platform-specific). This repo's
  Linux dev binary was fetched once for local testing
  (`src-tauri/binaries/cloudflared-x86_64-unknown-linux-gnu`, from
  `github.com/cloudflare/cloudflared/releases/latest`). **Windows and macOS
  binaries have not been fetched or tested** — before building for those
  targets, download the matching release asset and place it at
  `src-tauri/binaries/cloudflared-<target-triple>[.exe]` (run
  `rustc --print host-tuple` on that machine to get the exact triple).
- Whether Cloudflare's official `cloudflared` release binaries are
  code-signed for macOS Gatekeeper / Windows SmartScreen out of the box has
  not been confirmed — check before shipping a build that bundles one.
- The exact Cloudflare API sub-path for setting ingress rules
  (`.../cfd_tunnel/{tunnel_id}/configurations`) was confirmed from Cloudflare's
  developer-facing tooling but not independently re-verified against a live
  API call in this session — the first real provisioning attempt is the real
  test.
- Cloudflare's free-tier tunnel limits (unlimited tunnels/traffic, per
  research at the time this was built) are the kind of terms that drift —
  worth a quick reconfirmation before relying on them for a real deployment.
- **Compliance is genuinely unresolved, not solved by this feature.** Uganda's
  Data Protection and Privacy Act, 2019 requires "appropriate technical and
  organisational measures" but doesn't specify a rule for remote access. Its
  2021 Regulations require consent/protection for personal data processed
  outside Uganda — and every relay in this design (Cloudflare's edge
  included) is infrastructure outside Uganda that at minimum relays encrypted
  traffic. Whether that counts as "processing... outside Uganda" was not
  found settled anywhere. The access log and the "search and alerts only"
  boundary are the responsible defaults chosen while this is unresolved, not
  a claim that it's been resolved. Get real legal review before deploying
  this to an actual police station.
