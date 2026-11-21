# Handover plan for 2026-11-22

Written 2026-11-21 night. Goal: hand over tomorrow something that is honestly "done" for what it claims, with the rest stated plainly as not done.

## Ground rules (owner rules, still in force)

- No commits, no push, no CI, no release, no deploy unless the owner says so in that moment.
- Judge everything in the real desktop window, not Chrome :3001, not tests.
- One app server at a time. Kill only PIDs this session started.
- No Python. No em-dashes in copy. Content uses global typography.
- Each stage ends with something seen, not something typed.

## What "done" means tomorrow

Handover scope is **Police, complete for one station, plus the Police to DPP hand-off**. The other four apps are handed over as "built, browser-verified, not run in the real window", with that sentence written in the handover note. Claiming all five are done would be false.

## Stages

Each stage has a time box. If a stage runs over, cut to the "Cut line" and move on.

### Stage 0: Freeze and baseline (30 min)

- List the 69 uncommitted files by app and package. Confirm Police, `packages/setup`, `packages/paper`, `packages/node-core` changes are intended.
- Run `tsc` for Police and `cargo test --lib` for Police and node-core once, locally. Record counts.
- Start Police in the real window with a fresh data folder. Confirm it boots.
- Exit: written baseline (pass counts, window opens).

### Stage 1: Police gaps that block a real case (2 to 3 h)

In this order, each seen in the window:

1. UTC in `export_*` commands (case/person export first). Use local time.
2. PDF two-column rows stack and duplicated heading in shared `packages/paper/src/files.ts`.
3. Ranks and PF 53 number follow the station country, not Uganda only.
4. Statement and exhibit list reaches the DPP as structured data, not only notes text.
5. Real voice test on the speak-the-statement panel (owner speaks, or owner supplies a recording).
6. Real face-photo in a person record, then in PDF.

Cut line: items 1, 2, 4 are required. Items 3, 5, 6 may be handed over as "known open" if time runs out.

### Stage 2: Police to DPP hand-off in the real window (2 h)

- Take the referral from Stage 1 and open it in the DPP app (real window, fresh DPP data folder).
- Confirm the DPP intake shows the case, statements, exhibits, and charge sheet.
- Record every break. Fix only the ones that stop the hand-off.
- Exit: one case seen travelling Police to DPP. If transport between machines is not built for this path, say so and use the file hand-off that exists.

Cut line: if the DPP side needs more than 2 h of fixes, hand over with the break list.

### Stage 3: Other four apps, shared pieces only (1.5 h)

Apply only what is shared and small, to DPP, Courts, Lawyers, Prisons:

- Downloads saving (already in `src/lib/downloads.ts` pattern) in place of the Save window.
- Brand words on the shared brand panel.
- Window sizing to screen (`fit_window_to_screen`).

Open each app once in the real window to see it boots. No new features.

Cut line: Downloads saving first. Brand words and sizing next. Skip the rest.

### Stage 4: Reviewable-by-others items (30 min)

- Mark Kenya and DRC rule packs, force names and French text as "draft from recall, needs review by that service" in the handover note and in the app where a pack is chosen.
- List what needs a human reviewer: legal rules, ranks, PF 53 layout, Word output opened in a real Word.

### Stage 5: Handover pack (1.5 h)

Write, in this order:

1. `docs/platform/HANDOVER-2026-11-22.md`: what runs, what was seen, what was not, how to start the app, where data lives, how to reset.
2. Known-open list copied from the stages above, with owner next to each.
3. Update `docs/police/AUDIT.md` with the final section for the day.
4. Update the memory index with the result.

### Stage 6: Owner decision on release (owner, not me)

Only after Stages 0 to 5 are seen working, owner chooses:

- Hand over by running from the working tree on the owner's machine, or
- Approve one CI run and release (check the self-signed MSI signing step first, then redeploy www).

I will not start CI, release or deploy myself.

## Timeline for tomorrow

| Time | Stage |
| --- | --- |
| Start | 0 |
| +0:30 | 1 |
| +3:30 | 2 |
| +5:30 | 3 |
| +7:00 | 4 and 5 |
| End | 6, owner |

Total about 8 h of work, so there is little slack. If the owner has less time, drop Stage 3 first, then Stage 1 items 3, 5, 6.

## Risks

- Real voice and Word output depend on things only the owner can supply (a voice, a real Word).
- The release signing step has never succeeded in CI. Do not promise an installer.
- Kenya and DRC content can look finished while being unreviewed. Label it.
- A stage that "works in tests" but was not seen in the window does not count as done.

## Definition of finished for the handover

- Police: one full case, incident to DPP referral, seen in the real window, with PDF and Word saved to Downloads.
- Handover note states exactly what was and was not seen.
- No unlabeled draft content.

---

# Execution record, 2026-11-21 (platform-wide session)

This section is the living record. Statuses: COMPLETE (implemented and verified at the level stated), PARTIAL (implemented, not fully verified), BLOCKED, NOT STARTED, FAILED. "Verified" below means the test named was run in this session. **Nothing in this section was seen in a real desktop window yet** unless it says so.

## Completion matrix

| Subsystem | Police | DPP | Courts | Lawyers | Prisons | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Institution timezone (IANA, UTC instants, offset shown, history, audit, selector, clock warning) | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | node-core 16 timezone tests; per-app test that a Congo institution must choose, the choice is kept, a wrong-country zone is refused, the change is audited (not Police: its history table is append-only and records actor/time/reason, no hash chain exists there), the history cannot be edited or deleted. `tsc` clean in all five. Not seen in a window. |
| Same event, any OS timezone | COMPLETE (tests) | | | | | Police suite run under `TZ=UTC`, `America/Los_Angeles`, `Pacific/Kiritimati`: 29/29. node-core test sets `TZ` to five zones. `packages/ui` test run under six host zones. |
| Hardcoded Uganda time removed | n/a | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Courts `orders.rs`/`rulings.rs`, Lawyers `documents.rs`/`registers.rs`/`tasks.rs` used a fixed +3h; Lawyers screens, calendar and diary used `Africa/Kampala`; Prisons discharge hour read a zone from a translated string; Prisons reports/visits used the computer's day. All now use the institution zone. Lawyers 68, Courts 59, Prisons 156, DPP 50 Rust tests pass. |
| Exports (PDF, Word, Markdown vault) show institution zone | PARTIAL | n/a | n/a | n/a | n/a | Police `documents.rs`/`markdown.rs` use `time::display_ms`. Not re-saved and viewed after the change. |
| PDF/Word: duplicate heading and stacked two-column rows | PARTIAL | | | | | Duplicate force/title fixed at source (`ChargeSheetPrintable bare`). Side-by-side rows now detected in `packages/paper/src/files.ts` and written as borderless columns. `tsc` clean. **Not rendered yet.** |
| Downloads saving without a Save window | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | One shared `node-core::downloads` (name cleaned, `create_new`, "(2)" suffix, folder never chosen by the window); 3 tests. Wired into all four other apps. Not clicked in a window. Courts `save_package` and Lawyers `save_pdf`/`save_court_package` still use the Save window. |
| Evidence integrity, vault, SQLCipher | PARTIAL (existing) | | | | | Not re-audited this session. Known weakness found: Police `save_paper_file` and DPP `save_paper_file` still accept an arbitrary path from the window (DPP restricts extensions). New Downloads commands do not. |
| Police to DPP transfer | NOT STARTED this session | | | | | Relay and `exchange.rs` exist, never run between two machines. |
| Installers, signing, update | NOT STARTED this session | | | | | |
| Real-window acceptance, all five apps | NOT STARTED this session | | | | | Only Police was run in a window earlier today (see earlier sections). |

## Decisions made without the owner (flag for review)

- **Time zone choices are an allow-list**: Africa/Kampala, Nairobi, Kinshasa, Lubumbashi. Uganda and Kenya default; DR Congo has no default and prints UTC with the offset shown until an administrator chooses. Source for the zones: the IANA tz database via the `chrono-tz` crate (new dependency in `node-core`, no network at run time). **Which DR Congo provinces use which zone is for the institution to say, not the software.**
- **A zone change applies from the moment it is made.** It never re-times earlier events. Past events show in the zone in force when they happened.
- **Reference-number years and register years follow the institution zone** (Lawyers `registers.rs`, Courts/Lawyers order numbers). Before, they followed Kampala. Needs a lawyer's eye if a register year boundary matters.
- **Clock warnings** (offline): before 2026-01-01 (moved forward each release), behind the newest saved record by more than 5 minutes, more than 400 days ahead of it. These catch a plainly wrong clock only; a plausible wrong clock passes. Real protection against a deliberately set-back clock needs a trusted time source and is not built.

## Known open (this session)

1. Everything above in the PARTIAL rows needs a real-window look. Nothing was started in a window after the timezone work.
2. `institution_timezone` has no UI to show its history (the API returns it).
3. JavaScript screens in DPP/Lawyers use `Intl` with the zone; Police and Prisons use a "wall clock" Date for date-fns. In a computer whose own zone skips an hour (daylight saving) at exactly the displayed wall time, date-fns may print one hour off. East African computers have no daylight saving.
4. Police, Courts: other `toLocale...` calls on date-only values were not all audited.
5. Courts and Lawyers still have a few Save-window commands for package files.
6. Kenya and DR Congo wording is still draft from recall (see Stage 4).

## Legal-review inventory (needs qualified local people, not code)

- DR Congo: which zone each court, parquet, prison and station uses.
- Every Kenya and DR Congo rule pack, force name, rank list, PF 53 layout (all labelled draft in the app).
- Register and reference-number year boundaries (now the institution zone).
- Whether a printed time with an offset (`2026-11-21 14:30 (UTC+03:00)`) is acceptable on each country's legal forms.
- Prisons s.83 discharge-before-noon rule is a Uganda rule; it now reads the facility zone but is still Uganda law in every country's build.

---

# Acceptance run, 2026-11-21 evening (real Tauri windows)

Method: each app was started as the real debug binary under `tauri-driver` with its own empty data folder (Police `PLEADLI_DATA_DIR`, the others `XDG_DATA_HOME`) and its own Downloads folder (`PLEADLI_DOWNLOADS_DIR`), never the owner's data. Windows were driven with WebDriver and screenshots; setup and fictional records were created through each app's own API from inside the window. Scripts and evidence are in `~/.pleadli-accept` (`wd.ts`, `call.ts`, `xfer.ts`, `shots/`, `before/`, the exported PDF and Word files, `dpp.dppbk`, `referral*.pxpkg`). This was one machine: "two installations" below are two isolated instances, not two computers.

## Verified in a real window

| Check | Police | DPP | Courts | Lawyers | Prisons |
| --- | --- | --- | --- | --- | --- |
| Timezone card seen, Kampala, "now" with UTC+03:00, clock check | yes | yes (after fix) | yes (after fix) | yes (after fix) | **not seen** (UI needs a 6-digit PIN my API-made admin lacks); API checked instead |
| Zone outside the country refused | yes | n/a | n/a | n/a | yes (API) |
| Save to Downloads, no Save window | yes | yes | yes | yes | yes |
| Same name saved twice gives "name (2)", first untouched | yes (identical hashes) | yes | yes | yes | yes |
| Folder in the file name cannot escape Downloads | n/a (names fixed) | yes | yes | n/a | yes |
| Arbitrary path write refused | yes | yes (3 commands) | n/a (no path) | yes (2 commands) | n/a |
| Restart keeps data | yes | yes | not done | not done | not done |

Police charge sheet exported through the real buttons to PDF and Word and inspected (`downloads/Charge-sheet.pdf|docx`): the force and station name appear once, no duplicate heading, the Word file has real tables and a clean text flow, the paper has its verification code. Fixed in this run: header facts were staggered left and right with uneven gaps (now two aligned rows), "Preferred by:Ada Admin" and "Before me:Magistrate" had no space, and the signature lines were lost (now a dotted leader). Still true: the PDF text layer drops the space after a comma in one list line (visually fine), and the paper shows a date only, not a time or the UTC offset.

## Defects found by the windows and fixed

1. **DPP, Courts and Lawyers: the timezone card never appeared and the zone was never installed on screen.** Their desktop `api()` refuses a path not starting `/api/`, the card used `/timezone`. Tests and `tsc` could not see it. Fixed (`/api/timezone`), card seen in all three.
2. **Police sent no files in a referral.** `file_ids` was hard-coded empty. Statement and exhibit attachments now travel in the package (40 MB cap), SHA-256 checked by DPP. Case-level attachments (attached to the case itself) still do not travel: the package has no slot for them.
3. **Police never applied a DPP receipt to the referral.** Status stayed "pending". A receipt now sets it to accepted or rejected in the same transaction (regression assertion added). A receipt stored before this fix is not re-applied.
4. **Native-write commands accepted any path from the web layer.** Police `export_*` (7), DPP `save_case_pdf`, `save_paper_file`, `save_document_export`, `save_interchange_file`, `create_backup`, Lawyers `save_pdf`, `save_export`. All now need a one-shot grant: `node-core::save_grants`, approved by an app-owned native Save window (`pick_save_path`) or by the Downloads name command. Direct calls with `/home/.../evil.pdf` were refused in all three windows. Not driven: the native Save window itself (cannot be clicked by WebDriver), so the picker path is typechecked and the guard is tested, not seen.
5. **Timezone cache.** A clock set backwards could date a new zone change before an earlier one and re-time past events: now never earlier than the last change (test added). A poisoned lock made `install` silently skip and `show` fall back to UTC: now recovered. Overlapping reloads could install an older history: a later load now wins. Reads are one `RwLock` snapshot per call, so no torn reads.
6. **Prisons s.83 before-noon rule** is now a property of the jurisdiction pack (`discharge_before_noon`, true only for Uganda). The "after noon" note, its hour (facility zone, not a fixed +3) and the obligation text depend on it. The engine already refused any jurisdiction other than `ug`; this makes the dependency explicit.

## Police to DPP, two isolated instances, file transport

Done in the real apps: DPP identity and invitation, Police answer, DPP trusts by typing Police's fingerprint, confirmation back, referral with people, statement, exhibit, charge, summary and two attached files; DPP held it, showed the files with hashes, the prosecutor accepted (2 files attached, 0 failed, hashes equal to the originals), receipt returned and imported, referral status followed. Refused with a plain reason: replay (both directions), flipped body byte, flipped middle byte, flipped header, truncation, a Police-bound package given to DPP. A refused tampered package does not burn the package id: the untouched one was accepted afterwards. After restarting both apps the connection, the three incoming packages, the accepted file and its four attachments were intact. Reject with a reason also produced a receipt that set the referral to rejected.

**NOT DONE: the relay.** `node-core::postbox` was not wired into Police or DPP, and nothing ran through pleadli.com or a local `www`. It needs a licensed computer token, a local `www` with D1 and R2, and UI. Nothing in this run uses the relay. The transport proved here is the `.pxpkg` file, which the relay would carry unchanged.

## Recovery

DPP: backup (560,614 bytes), then a change after it, then restore. Wrong passphrase and a damaged file refused. After restart the post-backup package was gone, the earlier state back, all four attachments identical by hash, and the app kept a `pre-restore` copy. Police: **not verified**. Its backup is Orchestra (licence activation against pleadli.com and a storage target), which was not activated because nothing goes to production before local verification. The shared crypto/snapshot tests pass but are not a Police run. Courts, Lawyers, Prisons backup/restore: not run.

## Findings not fixed

- **Police has no tamper-evident audit.** There is no audit table and no hash chain. Only `paper_prints` and `institution_timezone` are append-only by trigger, which stops edits through the application, not by someone holding the database key. The code comment that called the timezone history "the audit record" was corrected. Courts, Lawyers, DPP and Prisons have hash-chained audit logs.
- A fresh Police install showed "The trial has ended" on day one. DPP showed "26 days left". Cause not investigated.
- Courts `setup/complete` returned 500 "database is locked" once, when run in the first seconds after launch while Orchestra tried to reach pleadli.com; the retry worked. No busy timeout was confirmed.
- Lawyers reports `hasMatters: true` on an empty install (demo data seeded).
- The Prisons card, Courts/Lawyers restart, and the relay are open. Rust tests run: node-core timezone/save_grants/downloads/backup (all pass), Police `exchange` (pass), Prisons full suite 156/156. The Police, DPP, Courts, Lawyers full suites were not re-run after the guard change.

## Not production ready

Open critical items: relay not connected, Police backup restore unverified, Police audit not tamper-evident, DRC zone choice and every Kenya/DRC rule pack still draft, nothing was signed, built as an installer or released. No commits, pushes, CI, release or deploy were made.

**Update (later 2026-11-21):** full Rust suites re-run after the save-grant guard change, all pass: Police 29, DPP 50, Courts 59, Lawyers 68 (Prisons 156 earlier). Local only, no CI.

**Police audit chain (later 2026-11-21):** Police now has the shared hash-chained trail (`node-core::audit`, migration 0043, verbatim table and append-only triggers). One middleware inside the sign-in guard (`api::record_audit`) records every successful write, every 403 on a write or export, and every export, with the signed-in officer (name and badge) and, under `/cases/<id>`, the case as scope. Query strings and bodies are never stored. The seven native export commands record through `commands/documents.rs::trail`. Admin-only `GET /api/audit?case=&limit=` and `GET /api/audit/verify`. Police tests: 32 pass (3 new, one of them end to end: write recorded, read not, rejected write not, chain verifies, an entry edited behind the triggers is caught at its sequence number). Not done: no screen shows the trail yet; native Save-window picks and `create_backup`/Orchestra are not on it; sign-in/out events carry no officer (public routes); not seen in a real window.

**Police audit screen (later 2026-11-21):** Settings has a new section "Record of activity" (`audit`, administrators only, in the station group for a Station and a Command alike), `apps/police/src/features/audit/` (schema, data, queries, `IntegrityCard`): Intact/Broken chip, entry count, "Check now", the newest 25 entries with "Show more", each as a plain sentence (`describeAction` turns `POST /cases/:id/people` into words; an unknown action is shown as stored) with time in the station zone (`formatInstant`) and the officer. Words in `audit.*` of en, fr and sw. A broken chain names the entry and tells the officer to leave the computer as it is. Import preview/match POSTs are no longer events (only `import/bulk` is). `tsc` passes; the Rust audit tests pass. **Not seen in a window or the browser** (no Police backend was running; the section is only listed for an administrator).

**Police audit screen seen in the real window (later 2026-11-21):** run on an isolated empty data folder (`~/.pleadli-accept/audit-run`, screenshots `shots/audit-02-screen.png`). Setup through the app's own API, signed in as the administrator, one diary write: Settings > "Record of activity" showed Intact, "2 entries, each one linked to the last", "Station diary entry added" with `2026-11-21 21:59 (UTC+03:00)` and "Ada Admin (A1)", and "Installation set up" as "not signed in". Fixed after seeing it: the title appeared twice (pane heading and card). Not driven: Broken state in the window (covered by the Rust test), the "Show more" button, a non-administrator (the section is not listed for them), the 401/403 paths, French and Swahili on screen.

**Fresh-trial switch for isolated runs (later 2026-11-21):** `node-core::orchestra::local_trial_start` keeps the trial's first-launch date in the database and in the OS keystore (the earlier wins, so a reinstall cannot restart it). On this laptop the Police keystore date is old, so even an empty isolated data folder showed "The trial has ended". Cause inferred from the code and dates, the keystore entry itself was not read. A **debug build** with `PLEADLI_TRIAL_FRESH=1` now skips the keystore (`cfg!(debug_assertions)` and the variable), so an isolated run shows a true day one; seen in the real Police window ("trial: 30 days left"). A release build never reads the variable. Customers' computers are unchanged: an empty keystore gives 30 days. Use it with `PLEADLI_DATA_DIR`, `PLEADLI_DOWNLOADS_DIR`, `PLEADLI_NO_SEED=1` for acceptance runs. It applies to all five apps (shared crate) but only Police was run.

**Courts "database is locked" (later 2026-11-21):** cause found by reasoning and reproduced in a test, not by catching it live. The shared options already give a 10 s busy timeout, but a plain `pool.begin()` is a deferred transaction: it reads, another connection (Orchestra reaching pleadli.com writes its own state) commits, and the transaction's first write is refused at once, the busy timeout never applying. Setup (`installation.rs`) was one of 12 Courts transactions still on `pool.begin()` (also `staff`, `exchange`, `custody_exchange`, `firm_exchange`); all now use `node-core::db::begin_write` (`BEGIN IMMEDIATE`) like the rest of Courts, and so does the shared timezone change (`node-core/src/timezone.rs`). New test `a_transaction_that_reads_then_writes_...` in `node-core/src/db.rs` shows both the refusal and the fix. Courts 59 tests pass. **Same pattern still present, not changed:** Police 8, DPP 23, Lawyers 6, Prisons 30 plain `begin()` calls. The Courts failure itself was not reproduced in a window.

**Deferred transactions converted in all apps (later 2026-11-21):** every production transaction that reads and then writes now takes the write lock first (`node-core::db::begin_write`, `BEGIN IMMEDIATE`). Counts: Courts 12 (earlier), Police 8, DPP 23, Lawyers 6, plus `node-core::timezone` 1 = **50 converted**. **Deliberately retained: 30** plain `begin()` calls in Prisons, all inside `mod tests` (Prisons production code already used `begin_write`). Each of the 37 Police/DPP/Lawyers calls was screened for writes (all write), network use (none) and slow work. Lock held over slow work, fixed: DPP `interchange::import` opened its transaction before writing received files to the vault, now opens it after; setup in Courts, DPP and Lawyers, and `staff::create`, hashed PINs/passwords (Argon2) while holding the lock, now hashed first (`staff::prepare_secret`, `insert_hashed`; the old unused `insert` was removed). **Found in the sweep, not in the brief:** `audit::log` (node-core, and the DPP, Lawyers and Courts copies) read the last hash and appended with no transaction, so concurrent events collided on `audit_log.seq` (UNIQUE failure), which would have made concurrent Police requests return 500 now that every write is audited; and `paper::stamp` checked then inserted, so identical concurrent prints could get two codes. Both now run under one write lock. **Regression tests (each shown to fail on the old behaviour):** `node-core db` deterministic refusal of a deferred upgrade (code 517) and start-up work plus a background writer on an encrypted SQLCipher pool (fails 3 of 3 with a plain begin); `node-core audit` 40 concurrent entries (fails with UNIQUE on seq); `node-core paper` 12 concurrent identical prints (fails with 517); Courts `setup_completes_while_something_else_is_writing_to_the_database` (fails 4 of 4 on a plain begin). Suites: node-core 51, Police 32, DPP 50, Courts 60, Lawyers 68, Prisons 156, all pass (`CARGO_BUILD_JOBS=2`). Not changed: Police onboarding does not use a transaction of this kind; Prisons and the other apps' remaining single-statement writes are not transactions. **Real window:** the original Courts scenario (`POST /api/setup/complete` in the first seconds after launch, Orchestra starting) was repeated in 5 fresh isolated launches (own `XDG_DATA_HOME`): 5 of 5 answered 200. The original 500 was not reproduced before the fix in a window, so this shows the scenario now works, not that the old failure was caught.

**MISTAKE during that run, needs the owner's decision:** the first attempt started `tauri-driver` before setting `XDG_DATA_HOME`, so one Courts launch used the owner's real default folder `~/.local/share/com.pleadli.courts` and completed a setup there (office "Kampala Chief Magistrates Court", administrator "Registrar Test", PIN 482916). The folder looked never set up (setup returned 200; `courts.db` main file 4096 bytes from 2026-11-17). Today's changes sit in `courts.db-wal` (1.4 MB) and `-shm`. A full copy was taken before anything else, at `~/.pleadli-accept/real-courts-copy-2026-11-21`. Nothing was deleted or rolled back. Options: keep, or remove only the `-wal`/`-shm` files (which returns the database file to its 2026-11-17 state) with the owner's go-ahead.

**Native acceptance, second pass (later 2026-11-21, real windows, isolated data, driver started with the isolated environment each time):**
- **Courts restart:** setup (no sign-in), one case, audit chain intact at 11 entries; app closed and reopened on the same folder: still installed, the case present, chain intact at 11. Verified.
- **Lawyers restart:** setup, one client and one matter, chain intact at 14; reopened: installed, matter and client present, chain intact at 14. Verified. The earlier finding "`hasMatters: true` on an empty install" is debug demo data: `seed_if_empty` is `#[cfg(debug_assertions)]`, so a release install starts empty. Not a customer defect. A debug build has no `PLEADLI_NO_SEED` switch like Police's, so it cannot show a true empty first day.
- **Prisons sign-in and timezone card:** the earlier "PIN gate" blocker was wrong: an administrator made with a password signs in through the screen (badge number, then password). The Time zone card (Settings > Facility, below the fold) was seen: Africa/Kampala, now shown with UTC+03:00, clock check clean. Wording says "this office" in a prison app (each app should use its own words).
- **Prisons local backup and restore:** passphrase set, backup written (795,257 bytes), an account added after it. Verify: wrong passphrase refused, right passphrase read (7 audit entries, schema 260), a copy with four bytes damaged refused with the same plain message. Restore staged (202), app closed and reopened: the account added after the backup is gone, only the original administrator remains, the previous database was moved to `pre-restore/`, `restore-log.jsonl` written, the audit chain verifies (12 entries, includes `system.restored`), the timezone still answers. Verified.
- **Not possible locally:** Courts and Lawyers have no local backup, only Orchestra backup (needs a licence from pleadli.com), same as Police. Not run.
- **Still open:** relay (`postbox`) not wired; Police and Courts/Lawyers Orchestra backup; native Save window not driven; Prisons' dev binary is stale (reports app 0.1.2 and still showed "trial has ended" with `PLEADLI_TRIAL_FRESH`, because it was last built before that switch; rebuild it before the next Prisons window run); the real Courts folder note above is unchanged (left as is by the owner's choice).


## Relay run, 2026-11-21 night (isolated same-machine integration test)

Police and DPP debug windows, two isolated data folders (`~/.pleadli-relay`), local Pleadli Cloud on :3000 with local D1 and R2 only, fictional case CRB 001/2026. Scripts s1 to s10 and screenshots are in `~/.pleadli-relay`.

Built: `node-core::postbox` (inbox status, refusal kept with reason, reopen, retry now, one round at a time, connection calls), `Orchestra::relay_access`, relay `GET /whoami`, Police and DPP `domain/relay.rs` + `/api/relay` + migrations 0044 (Police) and 0032 (DPP), Postbox page progress and Check now, Exchange / Stations screens (en, fr, sw), `scripts/native-binary.sh`.

Verified: pairing through the relay (invite, answer, typed fingerprint, confirmation); referral with a statement and an exhibit file sent while DPP was closed (Sent only), DPP restarted and collected it, Opened came back as a signed receipt, a person accepted it and Accepted showed at Police with the DPP reference; attachment hashes equal at both ends; relay stopped mid-send (queued, error visible, survived a Police restart) and recovered with Check now; invalid address 404; unconnected sender 403; other office GET or ack 404; no or bad token 401; same id again = duplicate; id of another sender 409; wrong sha 400; replayed, corrupted and junk packages refused at DPP without a second case; no tokens or keys in the app log. Rust suites: node-core postbox 6, DPP 50, Police 32; tsc for www, Police and DPP clean.

Not done or not proven: two machines; the Account approval was done in the local database, not the Account page; Police's own window screen was not captured (it rejected an injected session); the DPP duplicate-handling change was compiled and type checked but the debug binary was not rerun after it; "Delivered" is shown by the relay once the recipient stored the package, and a quick Check now can jump from Sent to Opened; Prisons, Courts and Lawyers do not use the postbox; no directory or office-side approval screen in the apps; 25 MB per message.
