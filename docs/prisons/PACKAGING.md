# Packaging Pleadli Prisons

Status on 2026-09-21: **prepared, not built, not run.** No package has been built or launched from this repository. What follows is what a build needs and what was checked, so the first real build is a checklist and not an investigation.

## Build

```
cd apps/prisons
bun install
bun run tauri build        # runs `bun run build` first: paraglide compile, tsc, vite build
```

`bun run check` type-checks the frontend. `cargo test --lib` in `src-tauri` runs the 150-odd Rust tests. The database is encrypted with SQLCipher, built from source with its own OpenSSL, so the target machine needs nothing installed for it.

### What the build machine needs

| Need | Why |
|---|---|
| Rust stable, Bun, the Tauri prerequisites for the OS | the app |
| A C compiler, `make` and **Perl** | OpenSSL is built from source (`openssl-src`) for SQLCipher |
| Windows only: a Perl that OpenSSL's build accepts (Strawberry Perl) and NASM | the same OpenSSL build; **not tried here** |
| `src-tauri/binaries/cloudflared-<target-triple>[.exe]` for every target you bundle | `bundle.externalBin` fails the bundle if the sidecar for the target is missing. Only `cloudflared-x86_64-unknown-linux-gnu` is in the repository |
| Linux: `libdbus-1-dev` (with the other Tauri packages) | the Secret Service keystore |

### Configuration checked

| Item | State |
|---|---|
| Version | `tauri.conf.json` and `Cargo.toml` both 0.1.0 (they had disagreed) |
| Updater artifacts | `createUpdaterArtifacts` is **false**. No updater plugin or signing key exists, and true would fail the build for want of a private key. Turn it on with the updater design |
| Capabilities | the webview keeps core, dialog, clipboard, notification, os, log and window permissions. `opener:default` and `opener:allow-open-path` were removed: the webview no longer opens files itself; the `open_document` command does it |
| Content-Security-Policy | `csp: null`. A restrictive policy cannot be validated without a packaged run, and a wrong one is a blank window, so it is deferred and listed in [[SECURITY]] |
| Window | 1290x840, minimum 960x640, custom decorations, tray icon, single instance, window state |
| Icons | present for every platform format |
| External network resources | none in `index.html` or the styles |

## Where things live on the target machine

| What | Where |
|---|---|
| Database `prisons.db`, WAL | the app data directory (`com.pleadli.prisons`) |
| Sealed documents | `<app data>/vault/attachments/<id>.enc` (relative paths, opaque names) |
| Key | the OS keystore, else `<app data>/node.key` (owner only) |
| Node certificate | `<app data>/tls/` |
| Backups | `<app data>/backups` unless the OIC chooses another folder |
| Documents opened to be viewed | `<app data>/opened/`, emptied at start and exit |
| `Documents/Pleadli Prisons` | the folder older builds kept plaintext documents in. It is read once to move documents into the sealed vault and is otherwise where an officer's own exports and backups may go. The database is authoritative; nothing plaintext is mirrored there |

Migrations are forward-only and run at start after a snapshot of the previous database (encrypted under the same key). A database the node cannot open, cannot check, or cannot find the key for starts recovery mode instead of normal work.

## Ports

| Port | Protocol | What | Who listens |
|---|---|---|---|
| 47921 | TCP, TLS | workstations of a facility node | a facility node, when serving workstations |
| 47923 | TCP, plain HTTP, loopback only | the exchange API for a tunnel | Head Office (and every debug build) |
| 47924 | TCP, TLS | the exchange API for facilities on the same network | Head Office, unless switched off in Settings |
| 47924 | UDP | discovery answers | Head Office, with the above |

A Head Office machine's firewall must allow inbound 47924 (TCP and UDP) from the facility network. A facility only makes outbound connections to it.

## Verified, and not

- Verified: the Rust suite, including the encryption upgrade of a copy of a real development database, restore onto a machine with no vault, the pinned TLS exchange through a real network interface, the OS keystore on Linux, and a release-profile compile check.
- **Not verified:** any built package on any OS; Windows and macOS (keystore, OpenSSL build, cloudflared sidecar); two physical machines on one LAN; the updater; the webview with a Content-Security-Policy.
