# Peer registration and pairing

## Summary

This is how a facility installation actually joins the network. A Head Office officer generates a short lived pairing code for a specific new facility and hands it over (in person, by phone, however they already communicate). The facility officer enters it, fills in a short form about their facility, and submits. Registration hands the facility its long lived sync credential right away, but that credential is inert: Head Office refuses to accept any actual data through it until a Head Office officer has checked an emailed verification code and approved the facility. This design was revised after a cross check found the original two credential version (a short lived "registration token" first, a separate "sync token" issued later behind a status check) had a real hole: nothing could produce the sync token's plaintext at the moment it was supposedly handed over, since only its hash was ever stored. Issuing one credential upfront, inert until verified, closes that gap and removes an entire endpoint.

## Requirements

**User stories**:
- As a Head Office officer, I want to generate a one time code for a facility I am onboarding, so that only the facility I intend can register, not anyone who happens to find a public URL.
- As a facility officer, I want to register my facility without typing a hostname, port, or certificate, so that pairing does not become an IT project.
- As a Head Office officer, I want to personally verify a new facility by email before it goes live, so that a mistaken or fake registration never starts contributing to the national picture.

**Acceptance criteria**:
- **AC-1**: A signed in Head Office officer can generate a pairing code from the Facility roster screen, entering the email address of the officer who should receive that facility's verification code; the pairing code is single use and expires (24 hours).
- **AC-2**: A facility officer enters the pairing code and a short registration form (facility name, facility ID or number, location, region chosen from Uganda Prisons Service's real 19 region list, and the head officer's name); submitting calls Head Office directly, with the pairing code carrying Head Office's own hostname, so no hostname is ever typed by hand.
- **AC-3**: On successful registration, the facility is stored as `pending_verification`, the peer receives its long lived sync token immediately (stored locally, never displayed again), and an 8 digit numeric verification code, valid for 24 hours, is emailed to the Head Office officer named when the pairing code was generated, not to the facility itself.
- **AC-4**: A `pending_verification` facility's sync token cannot push any data; a sync attempt with it returns a distinct "pending" response (not a failure) and ingests nothing. Once a Head Office officer enters the matching verification code, that same sync token starts working on the facility's very next sync attempt, no new credential is issued.
- **AC-5**: A used or expired pairing code, and a wrong or expired verification code, are each rejected without revealing anything more specific than "invalid or expired." An expired, still unverified verification code can be regenerated and resent by a Head Office officer without the facility re registering.
- **AC-6**: A Head Office officer can revoke an active facility at any time from the Facility roster; a revoked facility's sync token stops working immediately and indistinguishably from a wrong token (see the umbrella's uniform failure contract).

## Decision

**Chosen option**: pairing code embeds Head Office's own hostname (reusing the shape of Police's existing pairing QR, which already proved this pattern in this codebase, even though its actual registration protocol is new here) plus a random secret; registration is a plain HTTPS call over Head Office's Cloudflare Tunnel that returns the sync token immediately; approval is a human entering an emailed code, not a link, since Head Office's own app has no separate web server to receive a clicked link. The token being handed over before verification is safe because it is inert: `/sync/prisoners` (child 3) checks facility status on every call and refuses to ingest anything from a `pending_verification` facility, so possessing the token before approval grants nothing.

**Implementation skills**: `cloudflare` (`anthropic/skills`, `.claude/skills/cloudflare/`) for Head Office's own Tunnel setup, reusing `apps/police/src-tauri/src/domain/cloudflare_tunnel.rs`'s provisioning logic · `cloudflare-email-service` (`anthropic/skills`, `.claude/skills/cloudflare-email-service/`) for the verification email, recommended because this project already runs on Cloudflare end to end (Workers and D1 for `www`, Tunnel for Police and now Prisons); a dedicated transactional email API such as Postmark is the reasonable runner up if a plain server to server REST call from a native Rust app does not fit the Cloudflare product cleanly.

## Feature design

**Data model sketch** (new migration on `apps/prisons/src-tauri/migrations/`, present on every installation, empty on a plain facility):
- `facilities`: `id TEXT PRIMARY KEY`, `name TEXT NOT NULL`, `facility_number TEXT NOT NULL`, `location TEXT NOT NULL`, `region TEXT NOT NULL CHECK (region IN (<the 19 UPS regions, see rationale.md>))`, `head_officer_name TEXT NOT NULL`, `status TEXT NOT NULL CHECK (status IN ('pending_verification','active','revoked')) DEFAULT 'pending_verification'`, `verification_code_hash TEXT NOT NULL`, `verification_expires_at INTEGER NOT NULL`, `verifying_officer_email TEXT NOT NULL`, `sync_token_hash TEXT NOT NULL` (present from registration onward, unlike the earlier draft; whether it can actually be *used* is decided by `status`, not by whether the column is set), `last_synced_at INTEGER`, `created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))`. No `registration_token_hash` column (removed, see Summary).
- `hq_pairing_codes`: `id TEXT PRIMARY KEY`, `secret_hash TEXT NOT NULL`, `officer_email TEXT NOT NULL` (the verifying officer's email, entered when the code is generated; copied into `facilities.verifying_officer_email` at registration, closing the earlier gap where nothing carried this value), `expires_at INTEGER NOT NULL`, `used_at INTEGER NULL`, `created_at INTEGER NOT NULL DEFAULT (...)`. All credentials (`verification_code_hash`, `sync_token_hash`, `secret_hash`) are stored as SHA-256 hashes of a high entropy random value, not passwords, so a fast hash is the right, standard choice, unlike `officers.password_hash`'s Argon2; add `sha2` to `apps/prisons/src-tauri/Cargo.toml` for this (child 1's activation code needs no hashing and does not need this dependency).
- `peer_sync_config` (new, singleton row, same `id = 'default'` pattern as `hq_config`; exists on every installation, meaningful only on a paired facility): `id TEXT PRIMARY KEY DEFAULT 'default'`, `hq_hostname TEXT`, `facility_id TEXT`, `sync_token TEXT` (the plaintext credential a peer must hold to call `/sync/prisoners`; this is the peer's own bearer credential, analogous to how a browser holds its own session cookie in plaintext, not analogous to a password), `last_synced_at INTEGER`, `last_sync_status TEXT`, `last_error TEXT`. This closes the earlier gap where nothing named where a peer stores what it needs to sync.

**State transitions** (facility status): none → `pending_verification` (on successful registration, sync token issued but inert) → `active` (on correct verification code, same sync token now accepted) or `revoked` (explicit Head Office action, reachable from either `pending_verification` or `active`).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/peers/register` (new `hq_server.rs`) | POST | `pairingSecret`, `name`, `facilityNumber`, `location`, `region`, `headOfficerName` | `facilityId`, `syncToken` (plaintext, returned exactly once, here) | pairing secret, checked server side | 401 generic (bad/used/expired pairing code, or region not in the 19 valid values) |
| `generate_pairing_code` (Tauri command) | n/a | `officerEmail: string` | the pairing payload to display/hand over (hostname plus secret) | active HQ session | |
| `list_pending_facilities` / `list_facilities` (Tauri command) | n/a | none | facility rows, `sync_token_hash` never returned | active HQ session | |
| `verify_facility` (Tauri command) | n/a | `facilityId`, `verificationCode` | facility now `active` | active HQ session | wrong/expired code |
| `resend_verification_code` (Tauri command) | n/a | `facilityId` | a fresh code minted and re-emailed, `verification_expires_at` reset to 24 hours out | active HQ session | facility not `pending_verification` |
| `revoke_facility` (Tauri command) | n/a | `facilityId` | facility now `revoked` | active HQ session | |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `/peers/register` | the stored `facility_id` a peer references from then on | server generated UUID, never client supplied |
| `/peers/register` | the plaintext `syncToken` handed back once | server generated 32 random bytes, base64url encoded; only its SHA-256 hash is kept, in `facilities.sync_token_hash` |
| Facility roster screen | "last synced" per facility | `facilities.last_synced_at`, written by child 3's sync endpoint |
| Verification email | which Head Office officer receives it | `hq_pairing_codes.officer_email`, entered by whichever HQ officer generates the pairing code, copied into `facilities.verifying_officer_email` at registration |
| Peer's local sync setup | where a peer stores its own `hq_hostname`, `facility_id`, `sync_token` | `peer_sync_config`, the new singleton row this child adds |

**Key invariants**:
- A pairing code is consumed (its `used_at` set) the instant a `/peers/register` call successfully creates a facility row, atomically, so two simultaneous uses of the same code cannot both succeed. SQLite's own single writer transaction model already serializes this; no extra application level lock is needed.
- `/sync/prisoners` (child 3) and every write here always resolve the acting facility from its own credential's hash lookup; a `facility_id` present in a request body is only ever an integrity double check against that resolved id, never trusted on its own. This endpoint takes no facility identifier in its path or query string at all, exactly so there is nothing for a client to supply.
- A revoked facility's `sync_token_hash` is not deleted, only its `status`, so a revoke action itself keeps an audit trail without needing a separate log table.
- The verification code is 8 digits, numeric, generated with a cryptographically random source (not sequential), expiring 24 hours after it is (re)minted; `resend_verification_code` overwrites the previous code and expiry rather than allowing two codes to be valid at once.

**Security model**: two credentials with deliberately different lifetimes and scopes: the pairing secret (single use, 24 hour expiry, proves "someone with an out of band handoff from Head Office wants to register a facility") and the sync token (long lived, revocable, proves "this is facility X's own installation," but only usable once Head Office also confirms `status = 'active'`). Neither can be used for the other's purpose, and possessing a sync token before verification confers nothing. This child's `/peers/register` and child 3's `/sync/prisoners`, the only two network facing endpoints in this whole feature, both return the same generic 401 shape (`{"error": "invalid"}`) on any failure, per the umbrella's uniform failure contract.

**Configuration required**:
- Head Office's own Cloudflare account ID, API token, domain, and station name, entered once in its Settings, reusing the exact `cloudflare_config` shape Police already has (`apps/police/src-tauri/src/domain/cloudflare_tunnel.rs`), ported into Prisons.
- An email provider credential for the verification send: `CLOUDFLARE_EMAIL_API_TOKEN` if the `cloudflare-email-service` skill's product fits a plain REST call from Rust, or the equivalent provider's key if the runner up is used instead. Resolve which at implementation time by reading that skill.

**Critical test scenarios**:
- Happy path: generate a pairing code, register a facility with it (receiving a sync token immediately), attempt a sync while still pending (gets the distinct pending response, nothing ingested), verify it by email code, then the same sync token's next attempt succeeds, verifies **AC-1** through **AC-4**.
- Failure case: reusing an already used pairing code, or a pairing code past its 24 hour expiry, is rejected the same generic way; an expired verification code is resent via `resend_verification_code` and the new code works, verifies **AC-5**.
- Auth/permission: a revoked facility's `/sync/prisoners` call fails the same generic way as a facility that never existed, verifies **AC-6** and the umbrella's **AC-4**.
