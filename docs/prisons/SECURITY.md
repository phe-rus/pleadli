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
| X4 | Legacy snapshot sync pushes the full `prisoners` row (free-text `notes`, `national_id`, `date_of_birth`) to HQ every five minutes over `/api/network/v1/legacy/snapshot` | Contradicts P3/P4; a breach of HQ or transport exposes every prisoner row. Retire with tiered exchange. |
| X9 | `sync_token`, `cloudflare_config.api_token`, `remote_device_token` are stored **plaintext** as columns | Disk theft or local read exposes network credentials. Encrypt secrets at rest before pilot. |

**Carried from the 2026-09-18 ledger:** X1/X2 (unauthenticated dev API) fixed; X3 (two clients) fixed; X10 database/vault plaintext — designed under D14 (SQLCipher / encrypted vault vs verified OS-level encryption); Cloudflare Tunnel never provisioned (`cloudflare_tunnel::provision` has no caller) — a production path only exists against loopback today. Full ledger in `product/status.md` §5.

## What is deliberately not in scope of this file

Clinical record security (clinical care is out of product scope), the www/Police surfaces (they have their own vaults), and encryption key management under D14 until decided.