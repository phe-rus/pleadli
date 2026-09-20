# Security — threat model and boundaries

Canonical security stance for Pleadli Prisons. Deep detail: `product/03` (ownership and disclosure), `product/04` (deployment and networking), `product/05` (security and accountability). This note is the authoritative boundary statement.

## Stance

- **Authorization is enforced at the node, never only in the UI** (P12). Every `/api/**` request is checked by the node.
- **Accountability is structural** (P10): every change attributable, every legal-instrument edit reasoned, nothing deleted, only superseded. Implemented as `domain/audit.rs` hash-chained before/after audit; `verify_chain()` proves tamper.
- **Connection is not visibility** (P3): a paired facility discloses only what a rule discloses. Tiered disclosure (T0–T4) replaces full-row snapshot pushes.
- **Offline-first, encrypted at the edges**: the node is fully local; backups are encrypted; transport is authenticated.

## Environments

`local` (dev machine), `development`, `test`, `staging`, `pilot`, `production`. The first real-world deployment is a **pilot**, not production. A thing that is only exercised in `local`/`test` is never claimed safe in `pilot`.

## Two open blockers (gate any real facility use)

| # | Finding | Consequence |
|---|---|---|
| X4 | Legacy snapshot sync used to push the full `prisoners` row (free-text `notes`, `national_id`, `date_of_birth`) to HQ over `/api/network/v1/legacy/snapshot`. **Narrowed 2026-09-20**: it now sends `SnapshotRow` only (status, sex, year of birth, nationality, education, offence, custody status, dates), HQ stores nothing else and scrubs rows already held (migration 0140). | Remaining exposure: `offence` is free text and is still sent, and a facility's people are still individually listed at HQ. Retire with tiered exchange. |
| X9 | `sync_token`, `cloudflare_config.api_token`, tunnel `run_token`, `remote_device_token` were stored plaintext. **Fixed at rest 2026-09-20**: ChaCha20-Poly1305 under a 32-byte key in `secrets.key` beside the database (owner-only on Unix), each value bound to its column. | The key sits next to the data, so taking the whole data folder still exposes the credentials, and `pre-migration/` snapshots from earlier builds still hold plaintext. Key in the OS keystore or under a passphrase is D14. |

**Carried from the 2026-09-18 ledger:** X1/X2 (unauthenticated dev API) fixed; X3 (two clients) fixed; X10 database/vault plaintext — designed under D14 (SQLCipher / encrypted vault vs verified OS-level encryption); Cloudflare Tunnel never provisioned (`cloudflare_tunnel::provision` has no caller) — a production path only exists against loopback today. Full ledger in `product/status.md` §5.

## What is deliberately not in scope of this file

Clinical record security (clinical care is out of product scope), the www/Police surfaces (they have their own vaults), and encryption key management under D14 until decided.