# Head Office remote access (Cloudflare Tunnel)

How a Head Office becomes reachable from facilities elsewhere. Status: wired 2026-09-20, **never run against Cloudflare**.

## The pieces

1. **Settings > Network** (Head Office, `hq.network.manage`): save the API token, account ID, domain and station name.
2. **Set up tunnel** button, `POST /api/hq/network/cloudflare/provision` (`api/hq.rs`, `domain/cloudflare_tunnel.rs`): creates or reuses the tunnel, points `<station>.<domain>` at the network listener (`127.0.0.1:47923`) and stores the tunnel's run token in `cloudflare_tunnel_state`. Safe to repeat. The response carries the hostname and the connector state, never the token.
3. **The connector** (`domain/tunnel_connector.rs`): runs the bundled `cloudflared` with the token in `TUNNEL_TOKEN` (not on the command line, where `ps` would show it). A supervisor starts it at launch for a Head Office with a tunnel, restarts it if it exits (backing off up to 5 minutes), and stops it when the app exits or the installation stops being Head Office.

Only `/api/network/v1/**` is ever behind the tunnel; the rest of the API is on the in-process channel.

## The binary

`cloudflared` ships as a Tauri `externalBin` (`tauri.conf.json`, `binaries/cloudflared`). The bundler places it beside the executable; `tunnel_connector::locate()` looks there first and on `PATH` second.

- Put it at `apps/prisons/src-tauri/binaries/cloudflared-<target-triple>[.exe]`. The folder is git-ignored (about 40 MB per platform); fetch the release for each target from `github.com/cloudflare/cloudflared/releases/latest`.
- **Every build needs it**, including `cargo build` and CI: `tauri-build` refuses to compile without the file for the target triple. Linux x86_64 is present on the development machine, copied from Police.
- Windows and macOS binaries have not been fetched.

## Not done

- The run token and API token are sealed at rest under the node's `secrets.key` (status X9). That protects a copy of the database, not the whole data folder, so keep the folder private until D14 moves the key into the OS keystore.
- Nothing yet shows the connector's own log in the app; it goes to the node log at debug level (errors at warn).
- Whether Cloudflare's release binaries may be redistributed inside a government product is unchecked (same open question as Police).
