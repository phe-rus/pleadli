# Verify: officer identity & sign in · spec 0001 · updated 2026-09-18
_Steps derived from spec 0001's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
_2026-09-18: no window ever rendered in this sandbox (a real X server and webkit2gtk exist and the actual app process runs, but no window manager/compositor maps a window — confirmed by launching the real app and inspecting the X window tree, not assumed). Steps below were instead exercised directly against the real running app's debug HTTP surface (`curl` against `127.0.0.1:47922`/`47921`, the same dev-only server the browser fallback uses), which is real execution of the real code against a real database, not a substitute test harness. Ticked where exercised this way; UI rendering itself stays unconfirmed._
- [x] Prisons: look up an active officer by badge number (no password) → the officer's name resolves → AC-2
- [x] Prisons: deactivate that officer, look up the same badge number again → resolves to nothing → AC-2
- [ ] Prisons: attempt `login` with an unknown badge number, then with a known badge but wrong password → both return the same `INVALID_CREDENTIALS` code and message, never distinguishing which was wrong → AC-3 — **FAIL, real bug found**: the direct `/login` dev endpoint 422s ("missing field `badge_number`") because `Credentials`/`AdminCredentials` in `dev_server.rs` lack `#[serde(rename_all = "camelCase")]`, unlike every other struct in that file. The underlying `officers::login`/`verify_admin` logic is proven correct indirectly (see AC-4 below, which calls it internally and behaves exactly as specced), but this specific endpoint is unreachable as built.
- [x] Prisons Settings: enter wrong admin credentials, try to add an officer → rejected with `INVALID_ADMIN_CREDENTIALS`, no officer created → AC-4
- [x] Prisons Settings: enter correct admin credentials, add an officer → succeeds → AC-4
- [x] Fresh Prisons install (empty `officers` table) → `is_bootstrap` real HTTP call returns `true` → AC-6
- [x] Complete that first admin creation with no admin credentials supplied → succeeds (the one exception), `is_bootstrap` then returns `false` and a follow up create without credentials is rejected → AC-6
- [ ] Sign in at a Head Office install with the new admin's badge and password → session persists → close and reopen the app → still signed in, no re-prompt → AC-5 — **BLOCKED**: `/hq/login` has the identical `Credentials` deserialization bug as `/login` above, so this could not be exercised at all, on top of the no-window limitation.
- [ ] While signed in at Head Office, deactivate that same officer (from a second admin session or directly in the database) → reload the app → signed out, sign in form shown again, not merely on next fresh login attempt → AC-7 — **BLOCKED**, same reason as AC-5 (no session could ever be established through the broken endpoint).
- [x] With exactly one active admin, attempt to deactivate them → rejected with `LAST_ADMIN_GUARD` → AC-8
- [x] Create a second admin, then deactivate the first → succeeds → AC-8
- [ ] DPP Settings: set a prosecutor name and rank → open Record decision on a file → "Decided by" is pre filled with that name, still editable → AC-9 — **BLOCKED (no window)**. The backend half is confirmed instead: saved a real profile (`Grace Nakato, Senior State Attorney`) via the real running app's HTTP surface, read it back correctly, edited the rank, and the edit persisted.
- [ ] DPP: print a Charge Sheet for a decision recorded with no `decidedBy` typed in → the sanctioning signature line shows the profile's name and rank, not "Signature of Prosecutor" → AC-9 — **BLOCKED (no window)**, rendering itself unconfirmed.
- [x] Trigger a failed login (wrong password) and inspect the app's log output / dev console → the plain password never appears anywhere → AC-10 — checked the real running app's actual stdout/stderr log after multiple wrong-password attempts; clean.

## Commands
- [x] `cargo check` (apps/prisons/src-tauri) → clean → AC-1
- [x] `cargo check` (apps/dpp/src-tauri) → clean → AC-1, AC-9
- [x] `bunx turbo run check --filter=prisons` → clean → AC-1 through AC-8
- [x] `bunx turbo run check --filter=dpp` → clean → AC-9
- [x] Schema introspection (`pragma_table_info` via a real migration run against a live SQLite DB, during `/develop`) → confirms `role TEXT ... CHECK (role IN ('officer','admin'))`, `badge_number ... COLLATE NOCASE`, `hq_config`, and `hq_session` are all live, not just in the migration file → AC-1

## Acceptance-criteria coverage
- AC-1 (Officer table + Argon2, no Police remote/token mechanism ported) · covered by the cargo check + schema introspection steps
- AC-2 (badge only lookup, active only) · covered by the lookup + deactivate steps
- AC-3 (login, one generic failure) · covered by the unknown badge / wrong password step
- AC-4 (fresh admin credentials on every officer management call) · covered by the wrong/correct admin credentials steps
- AC-5 (Head Office session persists across restart) · covered by the sign in + reopen step
- AC-6 (bootstrap flow for a fresh install) · covered by the empty officers table steps
- AC-7 (deactivated officer's session cleared on next check) · covered by the deactivate while signed in step
- AC-8 (last admin guard, atomic) · covered by the single admin / second admin steps
- AC-9 (DPP profile real, editable, used for attribution) · covered by the decision form prefill + printed Charge Sheet steps
- AC-10 (no plaintext password anywhere) · covered by the log inspection step
