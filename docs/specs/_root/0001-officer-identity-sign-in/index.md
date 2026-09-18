# 0001. Officer identity and sign in

**Date**: 2026-09-18
**Status**: In Progress

## Summary

This decision gives officers a real, verifiable identity across the Pleadli desktop apps, something none of them have today. Prisons and Police get a shared pattern: a badge number alone for quick, low stakes attribution (who touched this record), and a real badge plus password check (checked against a securely hashed password, never plain text) for anything more sensitive, like editing officers or a Head Office installation that now needs a real signed in session. DPP, which is a single prosecutor tool by design, only needs a name and rank captured once, no password at all. Nothing here is invented from scratch: Police already built and proved the password handling this reuses, just for a narrower purpose than the whole app. A cross check on the first draft of this spec found real gaps, a password check that could be bypassed entirely, a brand new install with no way to ever sign in, and a race condition that could leave a facility with zero admins, all fixed below before this goes to build.

## Requirements

**User stories**:
- As an officer at a shared Prisons terminal, I want to identify myself with just my badge number for routine record entries, so that attribution does not slow down my normal work.
- As an officer performing a sensitive action (editing another officer, or approving a new facility at Head Office), I want to supply my badge and password right then, so that only someone with real credentials can do it.
- As a Head Office officer, I want to sign in once and stay signed in across restarts, so that I am not repeatedly prompted on a machine only a small, trusted staff uses.
- As the very first person setting up a brand new installation, I want a way to create the first admin, so the app is not permanently locked before anyone exists.
- As an admin role officer, I want the system to stop me from locking the whole facility out by deactivating the last remaining admin.
- As the one prosecutor using a DPP installation, I want to set my name and rank, so that it shows up on real documents without needing a login I do not need.

**Acceptance criteria**:
- **AC-1**: Prisons has its own `officers` table (badge number, name, role, password hash, active flag) and Argon2 based password hashing, matching Police's already proven hashing approach; Prisons does not port Police's bearer token or `remote_sessions` mechanism, since Prisons has no remote server to serve.
- **AC-2**: An officer can be looked up by badge number alone, with no password, for lightweight attribution on routine actions; a deactivated officer is excluded from this lookup.
- **AC-3**: A `login` action verifies a badge number and password against the stored Argon2 hash and returns the matching officer on success, or one generic failure otherwise that never reveals whether the badge or the password was wrong. This is the one real credential check; nothing elsewhere assumes an ambient signed in caller it did not just verify.
- **AC-4**: Officer management (creating, updating, or listing officers) requires a fresh `login` check for an admin role officer as part of the same action, not a previously established session; this works identically on a peer installation and a Head Office installation, since neither can assume the other's session model.
- **AC-5**: A Prisons installation configured as Head Office requires a signed in officer before any part of the app is usable, and that session survives a full app restart until the officer explicitly signs out. Signing in and starting that session happen as one atomic action, an officer is never signed in without their password having just been verified.
- **AC-6**: A brand new installation with zero officers shows a create the first admin flow instead of an unreachable sign in screen; that one path is the only time `login` is not required before creating an officer.
- **AC-7**: Every check of a persisted Head Office session, including but not limited to app launch, clears it if the signed in officer is no longer active, not only on their next fresh login attempt.
- **AC-8**: The system refuses to deactivate or demote out of the admin role the last remaining active admin role officer; there is no delete operation for officers at all, only deactivation, so this is the only guard needed.
- **AC-9**: DPP has a prosecutor profile (name, rank) with no password and no login, editable at any time, and that name and rank actually appear on at least one real generated document (the printable Charge Sheet), not just stored and unused.
- **AC-10**: A password is never stored, logged, or included in any debug output in plain text anywhere in this feature.

## Decision

**Chosen option**: Option 1: Reuse and extend Police's existing Officer and Argon2 pattern

Prisons gets its own local `officers` table and Argon2 password hashing, following the shape of Police's proven implementation, plus a persisted session specifically for Head Office; DPP gets a lightweight, editable profile instead, since it has no roster to protect. Every sensitive action, officer management included, checks a fresh badge and password right then, rather than assuming a signed in caller a command has no way to verify.

## Rationale

Reasoning, options considered, and the full context: see `rationale.md`.

## Feature design

**Data model sketch**:

Prisons, new tables:
- `officers`: `id` (text, primary key), `badge_number` (text, unique, trimmed and case folded before comparison, not null), `name` (text, not null), `role` (text, not null, `CHECK (role IN ('officer', 'admin'))`), `password_hash` (text, not null), `active` (boolean, not null, default true), `created_at` (integer, not null). No `person_id` link, unlike Police's version, since Prisons has no separate Person entity to link to. No delete operation; a record is deactivated, never removed.
- `hq_config`: `id` (text, primary key, always `default`, one row), `is_head_office` (boolean, not null, default false). The real source for whether this installation is Head Office; feature 22 (Head Office and peer prison sync network) is what actually sets it, this spec only defines and reads it, so the sign in gate has something real to check from day one instead of nothing.
- `hq_session`: `id` (text, primary key, always `default`, one row), `officer_id` (text, foreign key to `officers.id`), `signed_in_at` (integer, not null, informational only, not read by any check in this spec). No row present means signed out. Mirrors the existing `id = 'default'` singleton upsert pattern already used for `cloudflare_config` in Police. Read through a `LEFT JOIN` to `officers` so a row pointing at a since removed officer degrades to "signed out" rather than erroring; in practice this cannot happen since officers are never deleted, only deactivated, but the join costs nothing and removes the failure mode outright.

DPP, new table:
- `prosecutor_profile`: `id` (text, primary key, always `default`, one row), `name` (text, not null), `rank` (text, nullable), `updated_at` (integer, not null, set to the current time on every save, both the first one and any later edit).

Police: no schema change. Its existing `officers` table and bearer token login already cover Police's own remote access use case; this spec does not touch it.

**State transitions**:

Officer: `active` ↔ `inactive` via the `active` flag, with one guard: an admin role officer cannot be moved to `inactive` or demoted out of `admin` while they are the only active admin, enforced by a single conditional update, not a separate read then write (see Key invariants).

Head Office session: `signed_out` → `signed_in` (one atomic action: `login` succeeds and its result is written to `hq_session` in the same step, never two separate calls) → `signed_out` (either an explicit sign out, or automatically the next time the session is checked if the officer's `active` flag has since become false).

Bootstrap: `officers` table empty → the sign in gate renders a create the first admin form instead of a sign in form → `create_officer` succeeds without requiring a preceding `login` check, but only while the table is empty → `officers` table now has one admin → every subsequent `create_officer` call requires a fresh admin `login` check, no exception.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `create_officer` (Tauri command, Prisons) | command | badgeNumber, name, password (min 8 chars), role, adminBadgeNumber + adminPassword (omitted only when the officers table is empty) | Officer | a fresh admin login check inline, except the one time bootstrap path | `BADGE_TAKEN`, `INVALID_ADMIN_CREDENTIALS` |
| `update_officer` (Tauri command, Prisons) | command | id, name, role, active, password (optional, min 8 chars when present), adminBadgeNumber + adminPassword | Officer | a fresh admin login check inline | `INVALID_ADMIN_CREDENTIALS`, `LAST_ADMIN_GUARD` (would remove the last active admin), `NOT_FOUND` |
| `list_officers` (Tauri command, Prisons) | command | adminBadgeNumber + adminPassword | Officer[] | a fresh admin login check inline | `INVALID_ADMIN_CREDENTIALS` |
| `get_officer_by_badge` (Tauri command, Prisons) | command | badgeNumber | Officer or none | none, lightweight lookup only, excludes inactive officers | none, absent or inactive badge returns none |
| `login` (Tauri command, Prisons) | command | badgeNumber, password | Officer on success | none, this is the credential check itself | `INVALID_CREDENTIALS`, one generic failure, never states which part was wrong |
| `hq_login` (Tauri command, Prisons) | command | badgeNumber, password | current session Officer | none, this is the credential check itself, and it writes the session atomically on success | `INVALID_CREDENTIALS` |
| `get_current_hq_session` (Tauri command, Prisons) | command | none | Officer or none | none | none; clears and returns none if the officer is now inactive, checked on this call every time |
| `hq_sign_out` (Tauri command, Prisons) | command | none | none | requires an existing session | `NOT_SIGNED_IN` |
| `get_prosecutor_profile` (Tauri command, DPP) | command | none | ProsecutorProfile or none | none | none |
| `save_prosecutor_profile` (Tauri command, DPP) | command | name, rank (optional) | ProsecutorProfile | none | none |

Every error is a `{ code, message }` shape, not a raw string, so the frontend can branch on `code` (e.g. `BADGE_TAKEN`) without parsing prose. `create_officer`, `update_officer`, and `list_officers` all take the acting admin's own badge and password as part of the call, verified with the same check `login` performs, before anything else happens; this is the one identity mechanism for these three, no separate assumed session.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `get_officer_by_badge` | the officer's name, shown for attribution | `officers` row matched on the `badgeNumber` input, `active = 1` |
| `login` / `hq_login` | whether the credentials are valid | Argon2 verification of the `password` input against the stored `officers.password_hash` |
| `create_officer` / `update_officer` / `list_officers` | whether the caller is authorized | the same Argon2 verification, run against `adminBadgeNumber` and `adminPassword`, then a check that the matched officer's `role = 'admin'` |
| Sign in gate (Head Office) | whether to show the gate at all | `hq_config.is_head_office`, set by feature 22, not by this spec |
| `get_current_hq_session` | whether the Head Office app should show its sign in gate | presence of a `hq_session` row, re-checked against the linked officer's current `active` flag on this call |
| `update_officer` (deactivate or demote path) | whether the change is blocked | a single conditional update: it only succeeds if at least one other officer with `role = 'admin'` and `active = 1` exists |
| `create_officer` (bootstrap path) | whether the admin check is skipped | `SELECT count(*) FROM officers`, skip the check only when this is 0 |
| `save_prosecutor_profile` | the name and rank shown on generated documents | the `name` and `rank` inputs, persisted as the single `prosecutor_profile` row, `updated_at` set to the current time on every save |

**Key invariants**:
- A password is Argon2 hashed before it is ever written to the database; the plain value never persists past the request that set it, and never appears in a `Debug` implementation, log line, or error message. `CreateOfficerInput` and `UpdateOfficerInput` get a hand written `Debug` implementation that redacts the password field, rather than deriving it, since a derived `Debug` on a struct holding a plain `password: String` prints it verbatim on any panic or error log, which Police's own current struct already does and this spec does not repeat.
- At least one officer with `role = 'admin'` and `active = true` always exists in Prisons once the first admin has been created. Enforced as a single conditional `UPDATE ... WHERE EXISTS (...)` that fails atomically if it would violate this, never a separate read then write, since two concurrent demotions racing a read then write could both succeed and leave zero admins.
- `hq_session` has at most one row; a new sign in replaces it rather than adding a second.
- No `officers` row is ever deleted, only deactivated; this removes an entire class of dangling reference problems (a `hq_session` or an attribution pointing at a row that no longer exists) without needing extra defensive code to handle it.

**Security model**:
- `create_officer`, `update_officer`, and `list_officers` each require the caller to supply a valid admin badge and password as part of that same call, verified the same way `login` verifies any credential pair. There is no ambient "currently signed in" identity a Tauri command can read for a peer installation (peers have no persistent session at all), so the credential is supplied fresh every time rather than assumed. This is the fix for a real bug found in the first draft, where a `hq_sign_in` step assumed the session model did the work admin gating actually needed and could be called without a password at all.
- The one exception is the bootstrap path: `create_officer` skips the admin check only while the `officers` table is genuinely empty, so a brand new install has a real way to create its first admin instead of being permanently locked.
- `get_officer_by_badge` has no gate; it is a name lookup only, excludes inactive officers, and returns no password related data.
- `login` and `hq_login` have no gate on who may attempt them (that is the point of a credential check), but only ever return success or one generic invalid credentials failure, never which part was wrong.
- This project has no compliance framework formally in force yet, but this data (who holds real access to a government custody records system) is itself security sensitive, so every rule above is treated as load bearing, not optional.

**Configuration required**: none. This reuses the `argon2` crate already a dependency in Police; Prisons needs it added to its own `Cargo.toml`, not a new credential or environment variable.

**Critical test scenarios**:
- Happy path: an admin creates an officer with a badge number and password by supplying their own admin credentials; that officer later runs `hq_login` at a Head Office installation, closes the app, reopens it, and is still signed in. Verifies **AC-3**, **AC-4**, **AC-5**.
- Failure case: an admin attempts to deactivate the only other active admin, or their own admin role while they are the last one; the conditional update affects zero rows and the caller sees `LAST_ADMIN_GUARD`. A second, concurrent attempt at the same moment also fails cleanly, not with a corrupted state. Verifies **AC-8**.
- Auth/permission: someone calls `create_officer` with a made up or wrong admin badge and password; it is rejected with `INVALID_ADMIN_CREDENTIALS` and no officer is created, exactly as if they had called `login` directly with those credentials. On a completely fresh install with zero officers, the same call succeeds without any admin credentials at all, and only that first call gets this exception. Verifies **AC-4**, **AC-6**.

## Build plan

1. Add the `argon2` dependency to `apps/prisons/src-tauri/Cargo.toml`, matching the version already pinned in Police, satisfies **AC-1**
2. Migration: Prisons `officers` table with the `role` check constraint, `hq_config` table, and `hq_session` table, satisfies **AC-1**, **AC-5**
3. Prisons `domain/officers.rs`: `create_officer`, `update_officer`, `list_officers`, `get_officer_by_badge` (active only), `login` (returns `Option<Officer>`, no token, no `remote_sessions`, unlike Police's version), and the Argon2 hash and verify helpers, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**
4. Hand written `Debug` implementations for `CreateOfficerInput` and `UpdateOfficerInput` that redact the password field, satisfies **AC-10**
5. Trim and case fold `badge_number` before every uniqueness check and lookup, satisfies **AC-1**
6. Wire `create_officer` / `update_officer` / `list_officers` to require and verify `adminBadgeNumber` + `adminPassword` inline via the same check `login` uses, with the bootstrap exception (skip the check only when `officers` is empty), satisfies **AC-4**, **AC-6**
7. Rewrite the last admin guard as one conditional `UPDATE ... WHERE EXISTS (...)`, checking `rows_affected` rather than a separate read then write, satisfies **AC-8**
8. A `{ code, message }` error shape for every failure path above (`BADGE_TAKEN`, `INVALID_ADMIN_CREDENTIALS`, `LAST_ADMIN_GUARD`, `NOT_FOUND`, `INVALID_CREDENTIALS`, `NOT_SIGNED_IN`), satisfies **AC-4**, **AC-6**, **AC-8**
9. Prisons `domain/session.rs`: `hq_login` (verifies credentials and writes `hq_session` in one atomic step, never a separate second call), `get_current_hq_session` (via a `LEFT JOIN` to `officers`, clearing the session if the officer is inactive, checked on every call), `hq_sign_out`, satisfies **AC-5**, **AC-7**
10. Prisons Tauri commands wiring all of the above, satisfies **AC-1** through **AC-8**
11. Frontend: an Officer management screen under Settings, following Police's existing officers feature UI and forms, adapted to prompt for the acting admin's own credentials on every create or edit rather than assuming a signed in session, satisfies **AC-1**, **AC-4**
12. Frontend: a reusable badge number only lookup component for lightweight attribution, matching the existing check in dialog's pattern, satisfies **AC-2**
13. Frontend: a sign in gate component that checks `hq_config.is_head_office` and `get_current_hq_session`, rendering a create the first admin form when `officers` is empty, a sign in form when it is not empty and no session exists, or its children when a valid session exists; left generic so feature 22 decides where and how `hq_config.is_head_office` gets set, satisfies **AC-5**, **AC-6**, **AC-7**
14. Migration: DPP `prosecutor_profile` table, satisfies **AC-9**
15. DPP `domain/prosecutor_profile.rs`: `get_prosecutor_profile`, `save_prosecutor_profile` (editable any time, not just once), plus Tauri commands and a settings screen, satisfies **AC-9**
16. Wire the prosecutor profile's name and rank onto the printable Charge Sheet route (`apps/dpp/src/features/decisions/charge-sheet-printable.tsx`), so AC-9's "actually used for attribution" is real, not just stored, satisfies **AC-9**
17. Apply every migration against a real local database and confirm the schema is live in both apps, not merely generated, satisfies **AC-1**, **AC-9**

## Consequences

**Positive**:
- Unblocks `docs/scope/prisons/scope.md` feature 19 (audit trail) and feature 22 (Head Office and peer sync network), both of which were waiting on this
- Establishes one real, proven identity pattern instead of three independently guessed ones, and one that actually works on a peer installation, not just Head Office
- Reuses Police's already correct Argon2 hashing while deliberately not repeating two real bugs found in Police's own code during this design (a `Debug` derive that would print a password, and an update path with no existence check)

**Negative / tradeoffs**:
- Every officer management action now asks for the acting admin's own credentials inline, which is a little more typing than an assumed session would need, in exchange for something that is actually implementable and actually secure on a peer installation
- Adds a new dependency (`argon2`) to Prisons' Rust build
- A fully offline system with no email or reset link means if every admin genuinely forgets their password, there is no recovery path beyond the last admin guard preventing the situation from getting worse; it does not solve a facility that is already locked out today

**Neutral**:
- Police's own main desktop app is unchanged; its existing bearer token and `remote_sessions` mechanism is specific to serving its remote and mobile surface and is not reused here, only its password hashing approach is
- DPP's shape is intentionally lighter than Police and Prisons, not an inconsistency, since it reflects a real, already decided product difference (single prosecutor, no roster)

## Follow-up

- [ ] Feature 22 (Head Office and peer prison sync network) is responsible for actually setting `hq_config.is_head_office` to true during its own setup flow; this spec only defines and reads that flag
- [ ] Resume `/architect head office and peer prison sync network` (feature 22), now that a real login, persistent session, and installation role flag exist to gate Head Office with
- [ ] Resume `/architect` on feature 19 (audit trail), now that the lightweight badge only lookup this spec builds is available for attribution
- [ ] Whether Police's own main desktop app should adopt the per action admin credential check for any of its own sensitive actions was not decided here and is out of scope for this pass
- [ ] Police's own `CreateOfficerInput`/`UpdateOfficerInput` still derive `Debug` without redacting the password field; not fixed here since it is Police's own code and out of this spec's scope, but worth its own small fix given the same bug is being deliberately avoided in Prisons' version
