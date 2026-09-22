# Security — threat model and boundaries

Canonical security stance for Pleadli Prisons. Deep detail: `product/03` (ownership and disclosure), `product/04` (deployment and networking), `product/05` (security and accountability). This note is the authoritative boundary statement.

## Stance

- **Authorization is enforced at the node, never only in the UI** (P12). Every `/api/**` request is checked by the node.
- **Accountability is structural** (P10): every change attributable, every legal-instrument edit reasoned, nothing deleted, only superseded. Implemented as `domain/audit.rs` hash-chained before/after audit; `verify_chain()` proves tamper.
- **Connection is not visibility** (P3): a paired facility discloses only what a rule discloses. Tiered disclosure (T0–T4) replaces full-row snapshot pushes.
- **Offline-first, encrypted at the edges**: the node is fully local; backups are encrypted; transport is authenticated.

## Environments

`local` (dev machine), `development`, `test`, `staging`, `pilot`, `production`. The first real-world deployment is a **pilot**, not production. A thing that is only exercised in `local`/`test` is never claimed safe in `pilot`.

## Data at rest (D14, decided and built 2026-09-21)

Decision: SQLCipher for the database and a sealed vault for documents, with the key in the operating system's keystore where there is one. Verified full-disk encryption was the alternative; it is a shared-machine prison workstation, so the application protects its own data.

| Layer | What protects it | Where the key is |
|---|---|---|
| Database (`prisons.db`, its WAL, pre-migration snapshots, databases a restore moved aside) | SQLCipher, raw 256-bit key | derived from the installation master key |
| Documents (`vault/attachments/<id>.enc`) | ChaCha20-Poly1305 STREAM, the attachment id bound into every chunk | derived from the same master key, by a different label |
| Network credentials inside the database | additionally sealed under `secrets.key` | key file beside the database |
| Backups (`.pbk`) | ChaCha20-Poly1305 under a key from the recovery passphrase (Argon2) | the passphrase the OIC keeps offline |

The master key is 32 random bytes. It is held in **the OS keystore** (Windows Credential Manager, macOS Keychain, Linux Secret Service) under a name that carries this installation's id, so copying the whole data folder to another machine copies nothing that opens it. Where there is no keystore (a headless server, a Linux session without a Secret Service, or `PLEADLI_KEY_FILE_ONLY=1`) it is an owner-only key file, `node.key`, in the data folder. Settings says which one is in force.

What this defends against, and what it does not:

- A copy of the database, of a snapshot or of the vault on its own: defended in both modes.
- A copy of the **whole data folder**: defended only when the key is in the keystore. With the key-file fallback the folder contains the key, so it is not defended. That is the honest weaker mode, not a bug.
- Someone signed in to the operating system as the same user on the same machine: not defended. The keystore releases the key to that user's processes.
- A key that is lost (keystore wiped, profile replaced, disk cloned) makes the database unreadable. The node then starts in recovery mode and never invents a new key; recovery is restoring a backup with its passphrase.
- Plaintext removal is best effort: files are overwritten and removed, which on flash storage or a journalling file system does not guarantee the old blocks are gone.
- While an officer views a document it exists as a plain file in a private folder, removed when the app next starts or exits.
- Memory, the OS swap file and crash dumps are not covered. SQLite temporary files were not separately verified.
- Not verified on Windows or macOS (only the Linux Secret Service was exercised).

## Blockers and carried findings

| # | Finding | State |
|---|---|---|
| X4 | Legacy snapshot sync pushed prisoner rows to Head Office. | **Retired 2026-09-21.** Head Office holds counts, the roster and returns only, and migration 0190 deleted the copies it held. |
| X9 | Network credentials were plaintext. | Fixed 2026-09-20 (sealed under `secrets.key`); strengthened by D14, since they now sit inside an encrypted database. |
| X10 | Database and vault plaintext. | **Fixed 2026-09-21 (D14)** with the limits above. |

Still open before any real facility use: the packaged app has never been built or run here; the LAN exchange has not been run between two physical machines; the Cloudflare Tunnel has never been run against Cloudflare; the webview has no Content-Security-Policy (`csp: null`) because one cannot be validated without a packaged run. X1/X2/X3 were fixed earlier. Full ledger in `product/status.md` §5.

## Transport trust between a facility and Head Office

Head Office serves `/api/network/v1/**` only, never the domain, on two listeners: the loopback one (plain HTTP, the tunnel's origin, forwarded-address headers believed) and the LAN one (TLS with the node's own certificate, forwarded-address headers ignored so a peer on the network cannot spoof another address). A facility on a local network reaches Head Office over HTTPS and **pins** the certificate a person confirmed by fingerprint; it will not send to a local address it has not pinned, and will not send to a different certificate later. Discovery only suggests. Trust in a facility is Head Office's to give: a request waits for a Head Office officer, and Head Office records every exchange as metadata.

## What is deliberately not in scope of this file

Clinical record security (clinical care is out of product scope), the www/Police surfaces (they have their own vaults), and encryption key management under D14 until decided.