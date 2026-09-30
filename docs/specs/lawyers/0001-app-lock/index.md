# 0001. App lock for Pleadli Lawyers

**Date**: 2026-09-22
**Status**: In Progress

## Summary

Pleadli Lawyers currently has no way to protect an advocate's privileged data if someone else picks up the laptop while the app is open; this decision adds a PIN based lock screen that guards the whole app. The advocate can turn it on from Settings, set a short PIN, and the app then locks itself on every launch, after five minutes of no activity, and when the desktop session appears to have been left. The lock is checked by the Rust backend itself, not just hidden in the screen, so it holds even against a call made straight to the app's own API. Building this does not add a login for more than one person and does not add per matter permissions; those stay out of scope until Lawyers genuinely supports more than one advocate sharing an install.

## Requirements

**User stories**:
- As an advocate, I want to protect my client and matter data with a PIN, so that someone who picks up my laptop while I am away from it cannot read privileged material.
- As an advocate who just set a PIN, I want a way to recover if I forget it, so that a memory lapse does not permanently lock me out of my own practice.
- As an advocate who decides the friction is not worth it, I want to turn the lock back off, so that the choice stays mine.
- As an advocate, I want the app to relock itself if I walk away, not only when I remember to lock it myself.

**Acceptance criteria**:
- **AC-1**: An advocate can turn app lock on from Settings by setting a PIN (six to sixty four characters, any characters). Setting it up for the first time is optional and skippable; the app remains fully usable, unlocked, if they skip it.
- **AC-2**: Once a PIN is set, every app launch and every relock requires the correct PIN before any client, matter, document, note, task, hearing, plea, time, or audit data is reachable.
- **AC-3**: The app relocks itself after five minutes with no user activity (no mouse movement, key press, or click).
- **AC-4**: The app also relocks when its window loses operating system focus for ten seconds or longer, as a practical approximation of relocking when the desktop session is left, not a guaranteed native suspend hook (see Consequences). A focus loss shorter than ten seconds, such as a notification stealing focus or a quick switch to check something else, does not relock.
- **AC-5**: The Rust backend itself refuses every gated route while locked, returning a distinct, machine readable locked response; this holds even for a request made directly to the app's own local API, not only for someone using the visible screen. `/system/status` and the lock management routes themselves stay reachable regardless of lock state.
- **AC-6**: A wrong PIN increases a persisted, escalating delay before the next attempt is accepted (no delay for the first two attempts, then doubling from one second up to a cap of sixty seconds); this delay survives closing and reopening the app, and a cooldown in effect refuses the attempt without even checking the submitted PIN. The same cooldown also covers recovery code attempts, sharing one counter, so recovery cannot be used to route around a PIN cooldown.
- **AC-7**: The advocate can disable app lock at any time by supplying the current, correct PIN; disabling clears the stored PIN and recovery code and returns the app to always unlocked.
- **AC-8**: When a PIN is first set, and again every time it is reset through recovery, a one time recovery code is shown exactly once in the response; entering that code together with a new PIN resets the PIN without needing the old one, and immediately issues a fresh recovery code (the old code stops working). The recovery code is twenty characters, drawn from an alphabet that excludes ambiguous glyphs (no `0`, `O`, `1`, `l`, or `I`), shown in groups of four for readability.
- **AC-9**: Settings honestly shows whether app lock is currently on or off; if the advocate skipped setup, nothing nags them anywhere else in the app.
- **AC-10**: The PIN and the recovery code are Argon2 hashed before they are ever written to the database; the plain values never persist past the request that set them, and never appear in a Debug implementation, log line, or error message.

## Options considered and Decision rationale

See `rationale.md` for the full context, the options considered (an operating system native mechanism, a frontend only gate, and a full multi advocate roster were all considered and set aside), and why an app level PIN with backend enforcement was chosen.

## Decision

**Chosen option**: Option 1: App level PIN, single advocate, backend enforced

Pleadli Lawyers gets one new table, `app_lock`, holding a single row; a shared middleware layer in the app's existing router refuses every domain route while locked; and a small frontend lock screen, activity tracker, and Settings section drive it. No roster, no per advocate identity, and no per matter access model are introduced; the app stays, and is protected as, a single advocate's own install.

## Feature design

**Data model sketch**:

New table, `app_lock` (singleton, `id` always `'default'`, no relationship to any other table):

| Field | Type | Notes |
|---|---|---|
| `id` | text, primary key | always `'default'` |
| `enabled` | boolean, not null, default `false` | whether a PIN is currently set |
| `pin_hash` | text, nullable | Argon2 hash; null when `enabled = false` |
| `recovery_code_hash` | text, nullable | Argon2 hash of the current recovery code; replaced every time the PIN is set or reset |
| `failed_attempts` | integer, not null, default `0` | shared by both PIN and recovery code attempts; resets to zero on any successful unlock, disable, or recovery |
| `locked_until` | integer, nullable | epoch milliseconds; an attempt before this time is refused without checking the submitted value |
| `updated_at` | integer, not null | set on every write |

**State transitions**:

Lock configuration: `disabled` (no row values set, `enabled = false`) to `enabled` (a PIN and a recovery code are set) through `setup`; `enabled` back to `disabled` through `disable`, which requires the current PIN.

Runtime lock state (in memory only, never persisted as its own value; re derived from `enabled` at every process start): `locked` at launch whenever `enabled = true`; `unlocked` after a correct PIN or a correct recovery code plus new PIN; back to `locked` on the idle timer, the focus loss grace period, or the advocate's own "Lock now" action. A fresh process always starts `locked` when `enabled = true`; there is no way to persist an unlocked state across a restart.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/lock/status` | GET | none | enabled, locked, cooldown remaining if any | none, always reachable | none |
| `/lock/setup` | POST | pin (6 to 64 characters) | recoveryCode, shown once | none, refused only when already enabled | ALREADY_ENABLED, PIN_INVALID_LENGTH |
| `/lock/unlock` | POST | pin | success | none, this is the credential check itself | INVALID_PIN, COOLDOWN (with seconds remaining) |
| `/lock/lock` | POST | none | success | none, always reachable | none |
| `/lock/disable` | POST | pin | success | a fresh PIN check, inline, same as unlock | INVALID_PIN, NOT_ENABLED |
| `/lock/recover` | POST | recoveryCode, newPin | recoveryCode, a new one, shown once | a fresh recovery code check, inline | INVALID_RECOVERY_CODE, PIN_INVALID_LENGTH, COOLDOWN |

Every other existing route (clients, matters, hearings, tasks, notes, time, documents, plea, audit, overview, profile, diary) is unchanged in shape; a shared middleware layered over that whole group in `router()` returns HTTP 423 with a `{ code: "LOCKED", message }` body whenever the runtime lock state is `locked`, before the request reaches its handler. `/system/status` stays open, matching its existing behaviour.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| `/lock/status` | enabled | `app_lock.enabled` |
| `/lock/status` | locked | the in memory runtime flag, set from `app_lock.enabled` at process start |
| `/lock/status` | cooldown remaining | `app_lock.locked_until` minus the current time, only when that is in the future |
| `/lock/setup` | recoveryCode (plaintext, once) | freshly generated at call time; hashed before the row is written, the plaintext exists only in this one response |
| `/lock/unlock` | success or failure | Argon2 verification of the submitted pin against `app_lock.pin_hash` |
| `/lock/unlock` | cooldown refusal | `app_lock.locked_until` compared to now, checked before the pin is verified at all |
| `/lock/disable` | authorization | the same Argon2 verification `/lock/unlock` performs |
| `/lock/recover` | authorization | Argon2 verification of the submitted recoveryCode against `app_lock.recovery_code_hash` |
| `/lock/recover` | new recoveryCode (plaintext, once) | freshly generated at call time; replaces the stored hash |
| the lock middleware | whether to allow a gated request | the in memory runtime lock flag |

**Key invariants**:
- `app_lock` has exactly one row, `id = 'default'`; `/lock/setup` fails with ALREADY_ENABLED rather than silently overwriting an existing PIN. Changing a known PIN is `/lock/disable` followed by `/lock/setup`, not a dedicated endpoint; this keeps the surface small rather than duplicating the same two checks under a third name.
- A PIN or recovery code is Argon2 hashed before it is ever written; the plain value is never logged and never appears in a derived Debug implementation. `SetupLockInput`, `UnlockInput`, and `RecoverInput` get hand written Debug implementations that redact the secret fields, the same fix the officer identity spec already applied for Prisons and flagged as still outstanding on Police's own structs.
- `failed_attempts` and `locked_until` are shared by PIN and recovery code attempts, and move together in one update: a failed attempt at either increments the count and recomputes the cooldown in a single statement; a success at either resets both to zero and null in a single statement. A cooldown in effect refuses the attempt without touching Argon2 or the failed attempt count at all, so hammering during a cooldown cannot itself extend the cooldown further.
- The escalating delay is computed only from the persisted `failed_attempts` value on the server; nothing about the delay is trusted from the caller.
- The runtime lock flag lives in process memory only (an atomic boolean set at startup from `app_lock.enabled` and mutated by unlock, lock, and disable); nothing about "currently locked" is itself persisted, which is what makes AC 2's "every launch requires the PIN" true by construction rather than by a check someone could forget to add.
- The five minute idle timer (AC 3) is a stored last activity timestamp, not a plain `setTimeout`. A `setTimeout` pauses while the operating system sleeps, so a laptop that sleeps and resumes could sit unlocked for far longer than five real minutes of inactivity. The frontend records the real time of the last recorded activity, compares it against the real current time on an interval and again whenever the window regains focus or visibility, and locks immediately on that check if five real minutes have already passed, rather than restarting a fresh five minute window on wake.
- Every relock, whichever of the three ways it was triggered, also clears any client, matter, document, note, task, or hearing data already held in the frontend's own memory (its query cache and any component state holding fetched records), not only the network layer's 423 refusal. Otherwise data fetched before the lock triggered would still sit readable in the running window through developer tools, even though no new request could reach it.

**Security model**:
- No roles and no named identities; the only distinction is "knows the current PIN or the current recovery code" versus not. This is a deliberate, narrower model than Police or Prisons' officer rosters, matching the single advocate scope confirmed during design.
- Every domain route (clients, matters, hearings, tasks, notes, time, documents, plea, audit, overview, profile, diary) sits behind the lock middleware; only `/system/status` and `/lock/**` are exempt.
- App lock is independent of the SQLCipher database key managed by `packages/node-core`; disabling app lock does not weaken encryption at rest, and app lock provides no protection at all against someone with direct file system or operating system account access, only against someone using the already running, already decrypted app.
- No compliance framework is formally in force on this project yet; this data is nonetheless treated as load bearing given what Lawyers is meant to hold.

**Configuration required**: none. This adds the `argon2` crate, already a dependency of Police and Prisons, to `apps/lawyers/src-tauri/Cargo.toml`; no new environment variable or credential.

**Critical test scenarios**:
- Happy path: an advocate sets a PIN, restarts the app, is prompted to unlock, enters the correct PIN, and reaches their matters; verifies **AC-1**, **AC-2**.
- Failure case: three wrong PINs in a row trigger an escalating cooldown; restarting the app mid cooldown still refuses the next attempt until the cooldown has actually elapsed. Verifies **AC-6**.
- Auth and permission: while locked, a request made straight to a gated route (not through the visible lock screen) receives the 423 locked response with no data in the body. Verifies **AC-5**.
- Recovery: the recovery code shown at setup, together with a new PIN, resets the PIN and issues a fresh recovery code; the old recovery code no longer works afterward. Verifies **AC-8**.

## Build plan

1. **(Built)** Add the `argon2` dependency to `apps/lawyers/src-tauri/Cargo.toml`, matching the version already pinned in Police and Prisons, satisfies **AC-10**
2. **(Built)** Migration: the `app_lock` table as specified above, satisfies **AC-1**, **AC-2**, **AC-6**. Code in `apps/lawyers/src-tauri/migrations/0007_app_lock.sql`.
3. **(Built)** `domain/lock.rs`: Argon2 hash and verify helpers, a recovery code generator, and `status`, `setup`, `unlock`, `disable`, `recover` functions, each implementing the cooldown and shared failed attempt behaviour from the Key invariants, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**, **AC-8**. Code in `apps/lawyers/src-tauri/src/domain/lock.rs`.
4. **(Built)** Hand written Debug implementations for `SetupInput`, `UnlockInput`, `DisableInput`, and `RecoverInput` that redact their secret fields, satisfies **AC-10**. Code in `apps/lawyers/src-tauri/src/domain/lock.rs`.
5. **(Built)** The in memory runtime lock flag: initialized from `app_lock.enabled` during the app's existing startup sequence, exposed to both the middleware and the `/lock/lock` and unlock and recover paths, satisfies **AC-2**, **AC-3**, **AC-4**. Code in `apps/lawyers/src-tauri/src/domain/lock.rs` (`Runtime`), `apps/lawyers/src-tauri/src/lib.rs`.
6. **(Built)** The lock checking middleware in `api/mod.rs`, layered over every existing route except `/system/status` and `/lock/**`, returning the 423 locked response, satisfies **AC-5**. Code in `apps/lawyers/src-tauri/src/api/mod.rs` (`require_unlocked`).
7. **(Built)** Wire the six `/lock/**` routes into `router()`, left outside the middleware layer, satisfies **AC-1** through **AC-8**. Code in `apps/lawyers/src-tauri/src/api/mod.rs`.
8. **(Built)** `audit::record` calls for lock enabled, lock disabled, unlocked, and recovery used events, matching this app's existing audit trail convention; the event itself is recorded, never the PIN or recovery code. Code in `apps/lawyers/src-tauri/src/domain/lock.rs`.
9. **(Built)** Frontend: a lock screen (`LockGate`, wrapping the whole app shell in `__root.tsx`) that calls `/lock/status` on mount, blocks the app while locked with a PIN entry form, and a recovery form (code plus a new PIN) reachable from the same screen since Settings is itself behind the gate; a successful recovery shows the freshly issued code once before letting the advocate continue to unlock, satisfies **AC-1**, **AC-2**, **AC-8**. Code in `apps/lawyers/src/features/lock/lock-gate.tsx`, `apps/lawyers/src/routes/__root.tsx`.
10. **(Built)** Frontend: a shared API client interceptor that treats any 423 response as now locked and clears the query cache, satisfies **AC-5**. Code in `apps/lawyers/src/lib/api.ts`.
11. **(Built)** Frontend: activity tracking (mouse, keyboard, and click listeners updating a stored last activity timestamp, checked against the real current time on an interval and on regained focus or visibility, per Key invariants) and a ten second window focus loss timer, both calling `/lock/lock` when they fire; that call also clears the query cache and any component state holding fetched domain records, satisfies **AC-3**, **AC-4**. Code in `apps/lawyers/src/features/lock/use-idle-lock.ts`, `apps/lawyers/src/features/lock/queries.ts`.
12. **(Built)** Frontend: a Settings security section (`AppLockCard`) showing the current state honestly, a turn on flow with the one time recovery code reveal, a turn off flow requiring the current PIN, and a manual "Lock now" action, satisfies **AC-1**, **AC-7**, **AC-9**. Code in `apps/lawyers/src/features/lock/app-lock-card.tsx`, `apps/lawyers/src/features/lock/recovery-code-dialog.tsx`, `apps/lawyers/src/routes/_public/settings/index.tsx`.
13. **(Built)** Rust tests covering setup, unlock, disable, and recover happy paths; the cooldown persisting across a simulated restart; and the middleware's 423 behaviour on a gated route, satisfies **AC-1** through **AC-8**. Code in `apps/lawyers/src-tauri/src/domain/lock.rs` (unit tests), `apps/lawyers/src-tauri/src/api/tests.rs`. 32/32 tests pass.
14. **(Built)** Apply the migration against a real local database and confirm the schema is live, not merely generated, satisfies **AC-2**. Verified against a real, on disk, SQLCipher encrypted `lawyers.db` via the headless dev server: `/lock/status`, `/lock/setup`, `/lock/lock` (423 on a gated route), `/lock/unlock` (200 again) all exercised for real, not just in tests.

## Consequences

**Positive**:
- Closes the single most named gap across every audit of this application; an advocate's clients and matters are no longer reachable by anyone who can simply open the laptop.
- Reuses a hashing approach already proven correct elsewhere in this codebase rather than introducing new cryptography.
- The middleware sits in one place because this app already funnels every domain route through one router; the backend enforced option cost barely more code than a UI only shortcut would have.

**Negative and tradeoffs**:
- The focus loss relock (AC 4) is a practical approximation, not a guaranteed native "the operating system just suspended" signal; a machine that suspends without the window ever losing focus first (uncommon, but possible depending on configuration) would not relock until the five minute idle timer catches it instead. A real per operating system implementation is named in Follow up, not built here.
- There is no PIN recovery beyond the one time recovery code shown at setup. An advocate who loses both the PIN and the recovery code is locked out of their own data with no way for anyone else to reset it, the same honest tradeoff the officer identity spec already accepted for Prisons.
- Per matter access control, named in the original topic, is not built here at all; a single advocate install has nothing to scope access between.

**Neutral**:
- No change to `packages/node-core`'s encryption key handling; app lock and database encryption remain two independent layers.
- Police, DPP, Courts, and Prisons are untouched by this spec.

## Follow-up

- [ ] If Lawyers ever needs to support more than one advocate sharing an install, this spec's single row model needs revisiting alongside a real roster and login, following the pattern `docs/specs/_root/0001-officer-identity-sign-in` already proved for Police and Prisons; that is the point at which per matter access control becomes meaningful and worth its own spec.
- [ ] The focus loss relock in AC 4 is a heuristic, not a native suspend hook. If it proves insufficient in real use, a follow up spec should evaluate real per operating system session lock detection (Windows session notifications, macOS NSWorkspace, Linux logind over D Bus).
- [ ] `www/src/data/products.ts`'s Lawyers security capability note and not yet built list should be updated once this ships; app lock is one of the two things named there, per matter access control remains genuinely not built.
- [ ] `docs/lawyers/PROPOSAL.md`'s not yet built list should drop "app lock" once this ships.
