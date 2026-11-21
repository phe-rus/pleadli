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


## Relay security acceptance, 2026-11-22 (Police to DPP; still two isolated installations on ONE computer)

**Correction to the section above.** Its "replayed, corrupted and junk packages refused" line overstated the corrupt case. The corrupt test flipped a byte of a package whose id DPP already held, so DPP's replay check (`incoming_packages WHERE id`, which runs before `envelope::open`) answered "already received" and the signature and hash checks were never reached. It proved replay detection only. Replay detection was not weakened. The new tests below use packages generated at test time with fresh ids.

**How the tests were built.** `packages/interchange/examples/forge.rs` (test tool, never ships) damages a genuine package: `body`, `signature`, `truncate`, `append`, `meta-sha`, `meta-to`, `resign`, `resign-body` (a consistent header re-signed by a stranger's key). The runner is `~/.pleadli-relay/s11.ts`. Each package is a new Police referral sealed through the real export (`POST /exchange/referrals/{id}/export`, route `file`), so it carries a new id and two real files. Each negative case checks the refusal wording (not "already received"), that incoming rows and vault files did not change, and then that the genuine package with the same id is still accepted, which shows the id was not burnt and the damage caused the refusal.

**Live results against the rebuilt DPP binary (22 of 22, run twice, the second time on the final binary):**

| # | Case | Result |
|---|---|---|
| 1 | valid unseen package | accepted, +1 row, +2 vault files |
| 2 | identical replay | refused "already been received", nothing added; through the relay it is marked imported, no failure, no new row (the duplicate handling, now run in a binary) |
| 3 | body bit flipped, body truncated, bytes appended | refused "altered, or is damaged", reached the hash and AEAD check, nothing kept |
| 4 | signature bit flipped | refused "signature does not match the station this office trusts" |
| 5 | header hash field or addressee changed; consistent header (with or without a damaged body) re-signed by a stranger | refused as a bad signature |
| 6 | station DPP never paired with (real identity, validly signed, sealed to DPP) | 403 "not connected", nothing kept |
| 7 | DPP-addressed package fed to Police | refused, but for "unknown sender", NOT for the recipient check. Do not count this as proof of the recipient check; that is the DPP unit test below |
| R | tampered body posted through the relay | relay accepts it (opaque, hash of the damaged bytes matches), DPP collects it and shows it as "Turned away: referral" with the safe reason; a body that does not match the stated `x-pleadli-sha256` is refused 400 at the relay |
| 10 | diagnostics | 24 refusals audited (reason plus the sender name and fingerprint the header claims); no case text, reference, national id or key material anywhere |

**Cases that need the sender's private key, covered in Rust (cannot be made from outside):** `envelope.rs` `a_correctly_signed_package_that_does_not_add_up_is_refused` (validly signed header that misstates the body hash; validly signed damaged body with a matching hash; a file whose stated hash is not its bytes' hash). DPP `domain/interchange.rs` tests (6, new): replay adds no row and no file; a package addressed to another office is refused ("different DPP office") and keeps nothing; a file with the wrong hash keeps nothing; a good file followed by a bad, empty, path-like or repeated file id keeps nothing; a database failure after the files were written removes them; a refusal keeps the reason and claimed sender but no case content. Suites: interchange 7, DPP 56 (was 50), all pass.

**Defects found and fixed in `import_package` (DPP):** (a) file ids were checked inside the write loop, so a package with a good first file and a bad second id left the first sealed file in the vault with no row (partial import); (b) a failed database insert after the vault writes also left the files. Now all ids are checked before anything is written, a failed write or insert removes the package's files (never when a row already owns that id, so a simultaneous second copy cannot delete the first copy's files), and the package id itself must be a plain identifier because it becomes a vault path component. The new partial-import test is written against the new behaviour; I did not run it against the old code, so "it used to fail" is from reading the old loop, not from a red run.

**Real interface.**
- *Account approval:* signed in to the local Account page as the seed owner account, a request from the Masindi demo office to the DPP office (made with the relay API, as an app does) appeared under "Asking to connect with you", was approved with the Approve button, moved to Connected, and the relay then accepted a post from Masindi (it returned 403 before). `decided_by` is the owner's email. Screenshot `shots/account-postbox-approved.jpg`.
- *Not done:* ending the old Police to DPP link through the page. The click on "End connection" was refused by the permission classifier as destructive, so the old link is still the one approved earlier by SQL (`relaytest-admin`). Revoke and "re-approve after revoke" were not exercised. Ask the owner before doing it.
- *DPP native window* (debug binary built from current source, driven with tauri-driver): Postbox shows "Connected to Pleadli as ug.dpp.demo-hoima.office.", Check now, and the damaged package as "Turned away" with its reason; Police stations shows the two open invitations and the office fingerprint. Shots `shots/dpp-window-postbox.png`, `shots/dpp-window-stations.png`.
- *Police:* the native window asks for the administrator's password, set in an earlier session and not known now, so I did not sign in there (I did not guess or reset it). Police's Exchange and Postbox screens were captured in the Chrome dev view on :3001 after the dev sign-in (`shots/police-exchange-2.jpg`, `shots/police-postbox-connected.jpg`): "Connected to Pleadli as ug.police.demo-albertine.hoima-central", both offices Trusted. This is the dev view, not the window. Still not captured: Police's own window.
- *Stale text fixed:* Account Postbox note and the www "How Pleadli works" and Postbox status copy (en, fr, sw) no longer say nothing sends through the relay; they say Police and DPP do, tested on one computer, not two machines, and that Courts, Lawyers and Prisons do not. Police and DPP Postbox status now reads "Checking the connection to Pleadli…" while loading, the relay's own reason when not ready, and "Connected to Pleadli as ..." when ready; the old "Not switched on yet" wording is gone from both apps. It remains, correctly, in Courts, Lawyers and Prisons, which are not on the relay. tsc clean for www, Police and DPP.

**Logs and build freshness.** Police and DPP app logs, the dev-server and driver logs and the www dev log were searched for bearer tokens, the session token, test mailbox tokens, `x-pleadli` headers, passwords, passphrases, key words, 64-hex strings and case content: none (the only "secret" hits are wrangler's "Using secrets defined in .env.local", no values). The relay stores only metadata plus sealed bytes. Binary freshness: `scripts/native-binary.sh` was run for Police (current), DPP (was stale, rebuilt) and Prisons (current: built 2026-11-21 23:45, no `.rs`, `.sql` or `Cargo.toml` under `apps/prisons/src-tauri` or `packages` is newer, so the earlier stale-binary finding is resolved). The script does not look at the frontend message files, which Vite serves rather than compiles in.

**Still outstanding / limits (unchanged unless stated):**
- **The two-machine test is NOT done.** Everything above ran as two isolated data folders on one physical computer, with the relay and Account on localhost.
- Police's own native window was not captured. Revoke / re-approve through the Account page was not run.
- A validly signed but dishonest sender (valid key, wrong file hash) is proven in Rust only, not through a window.
- Residual: the refusal audit line stores the sender name and fingerprint the (unauthenticated) header claims, up to the 16 KB header limit; it is not case content, but it is attacker-chosen text. Truncate it if audit lines are ever shown unescaped.
- Test leftovers in the isolated stores: about 20 incoming referrals CRB 001/2026 in DPP and the matching Police referrals, two "Rogue test" invitations at DPP, an approved Masindi link and one junk message at the local relay. Nothing touches real data folders (the Police app log goes to the default log folder, which holds no secrets).
- The relay is not extended to Courts, Lawyers or Prisons; that waits on this gate and on the two-machine run.
- Nothing committed, pushed, released, deployed or sent to CI.

## Courts, Lawyers and Prisons on the shared Postbox (2026-11-22, later)

**Status in one line:** written and unit-tested in Rust and TypeScript for all supported paths; NOT yet run in native windows, NOT run between two machines. Treat everything below as "built and unit-tested", not "accepted".

**One postbox, not three.** `packages/node-core/src/hub.rs` (feature `hub`) is the single driver Courts, Lawyers, Prisons and DPP-to-Courts use. It reuses `postbox.rs` (outbox, inbox, retry, backoff, ack) and the interchange envelope (seal, sign, pair). Police to DPP keeps its own tested code path unchanged. An app supplies only an `Adapter` (open a package, import it, report what happened).

**Supported paths (the whole table; `packages/interchange/src/authorization.rs`, mirrored in `www/src/lib/relay-paths.ts`):**

| From | To | Kinds |
|---|---|---|
| Police | DPP | referral |
| DPP | Police | receipt, decision notice |
| DPP | Courts | case filing, case withdrawal |
| Courts | DPP | filing receipt |
| Courts | Lawyers | court notice, firm filing receipt |
| Lawyers | Courts | court notice receipt, firm filing |
| Courts | Prisons | custody order |
| Prisons | Courts | custody receipt, custody report |

Receiving a kind does not grant the right to send another. Each direction lists only what that side's domain model already issues (Courts to DPP: receipts only; Prisons to Courts: receipts and reports; Lawyers to Courts: filings and notice receipts).

**Police and Prisons: unsupported workflow, not a broken integration.** There is no message type, no permission and no route between them, in the library, the relay or any app. This is deliberate: the procedures, authorized senders and recipients, and required documents for any Police-to-Prisons transfer have not been established with the institutions, and none is invented here. Adding a Police and Prisons path needs legal and institutional validation first, then one line in each table with the authority for it, and the tests then require both tables to agree.

**Where authorization is enforced (defence in depth; no single layer is trusted):**
1. *Sender side:* `hub::dispatch_to` refuses to queue a kind the sender's institution may not send to that recipient's institution.
2. *Relay (www `post()`, `askToConnect`):* from the two addresses' licensed institution types it refuses a cross-institution post whose `x-pleadli-kind` has no path (403 `not_permitted`), and refuses connection requests between kinds with no path. The relay never opens a package, knows no legal workflow beyond this table and cannot see inside the signature. `www/tests/relay-paths.test.ts` fails if the TypeScript table and the Rust table differ and checks Police/Prisons are closed both ways.
3. *Receiving application:* `import_package` in Courts, DPP, Lawyers, Prisons and Police independently checks the sender's institution kind (taken from the authenticated, signature-verified package, not from the relay) against the table, then the trusted link, signature, recipient and content. Both carriers (the relay and the file route) and direct calls to the app's own API go through that one function, so a client that bypasses the relay or the sender's check is still refused. Tests: a trusted, validly signed sender sending a forbidden kind is refused through the adapter and through a direct import (Courts, DPP, Lawyers, Prisons; the Prisons test uses a police station sender).
4. *Link and key:* per-peer trusted link with pinned keys; the relay `from` address must equal the address that peer answered from.

**Concurrency and cleanup (DPP):** referral import takes a process-wide lock so check-new, write-files, store-row and failure cleanup cannot interleave; two regression tests were shown to fail without it (a rejected package cannot remove another import's files).

**Test counts, Rust unit tests only:** interchange 12, node-core hub 4, Police 32, Courts 62, DPP 59, Lawyers 69, Prisons 157, all passing; www 11 (3 new) and `tsc` clean in www and all five apps.

**UI:** a shared `RelayPostbox` in `@pleadli/shell` shows queued/sent/delivered/needs-attention, turned-away packages with the reason and Try again, and connection invitations (answer/decline) where an app receives them (Courts, DPP). Courts, Lawyers and Prisons now use it (Lawyers and Prisons translated en/fr/sw; Courts in English, as the rest of Courts is). Not yet seen in a window.

**Blocked or not done:**
- Native Tauri-window runs of the new paths (Courts, Lawyers, Prisons, DPP to Courts): not done.
- Police native Exchange window: the administrator password is unknown; it was not guessed or reset.
- Connection revocation: not run; the owner must approve ending a link first.
- Police backup and recovery in a window: not done.
- Two-machine run: not done. Nothing here was sent to production, committed, pushed or run in CI.

## Critical defect found and fixed: the Postbox showed the wrong address (2026-11-22, later)

**What happened.** In the native DPP window the Postbox said "Connected to Pleadli as ug.dpp.demo-hoima". Mail for that computer is really collected at `ug.dpp.demo-hoima.office`. Courts used the displayed address, the relay accepted the invitation into a mailbox no computer collects, and nothing told either side.

**Trace (authoritative source).** The relay identifies a computer by its token. `www/src/lib/computer-auth.server.ts` gives it the address of its **office** (unit) when the server-side computer record has one, otherwise its institution's. The app, however, built its displayed address from the signed licence (`licence.address`, the institution) or a locally chosen `office` setting, which is only used for papers. The relay already had a `whoami` call that nobody used.

**Three addresses, kept apart.** Institution address (on the licence), office address (a unit of the institution), and the delivery address (what the relay holds for this computer, either of the first two). Only the delivery address may be shown as "send to this" or used to send.

**Fix.**
- *Apps (node-core `Orchestra::relay_access`):* the address is asked of the relay (`whoami`, kept ten minutes, remembered for when offline). The licence address is used only until the relay has ever answered. Nothing is built by appending a suffix or guessing from the institution id. `RelayAccess` and every app's relay status now also carry the office and institution name as separate descriptive text.
- *Postbox screen (shared `ReceivingAddress` in `@pleadli/shell`, all five apps, en/fr/sw):* "Your receiving address" shown first and large with a Copy button; the office and institution named separately underneath; "Other offices must send to exactly this address." Settings, Pleadli licence now shows "Institution address" and "Receiving address (Postbox)" as separate rows in every app.
- *Relay (www):* a post to, or a connection request for, an address no licensed computer collects at is refused at once with `422 no_mailbox` and an actionable message, instead of being stored until it expires. The check runs after the connection check, so a stranger cannot use it to discover mailboxes.
- *Same-institution exception removed from authorization:* previously a message to one of the sender's own institution's addresses skipped the message-type check entirely. Now only the "approved connection" requirement is skipped for an institution's own offices. The kind still needs a defined path between the two institution types, so one DPP office cannot post a referral to another, and a connection request between two offices of one institution is refused.

**Tests.** `www/tests/relay-mailbox.test.ts` runs the real relay handler against real tables with addresses that intentionally differ (institution `ug.dpp.hoima`, offices `.office` and `.annex`, an empty office `.nobody`, a court with no office): whoami returns the office address; posting to the institution address or the empty office is refused with `no_mailbox` and stores nothing; a message to `.office` arrives at `.office` only, `.annex` sees none of it and cannot fetch it; the reply arrives at the court from the office address; a same-institution referral and an unpermitted kind between linked institutions are refused. www 13 tests pass, `tsc` clean in www and all five apps. There is no unit test for the app-side `whoami` caching (it needs a live relay); it is covered by the real windows below.

**Verified in real windows (isolated data, one machine):** DPP window now shows "Your receiving address ug.dpp.demo-hoima.office", office and institution named under it, Connected line agrees. From the real Courts app, inviting the old displayed address returns "No computer collects mail at that address. Ask the office for the receiving address shown on its Postbox." at once and sends nothing.

**Not yet checked:** Police, Lawyers and Prisons windows with the new screen (they share the same component and code, all typecheck); Settings rows seen in a window; whether the Account page lets an administrator assign a computer to an office (how a computer ends up at a unit is decided server-side by the computer record, not by the app).

## Native acceptance, new paths (2026-11-22, later)

Real Tauri windows driven with tauri-driver, each app on its own isolated data folder and Downloads folder (set on the driver command), debug binaries rebuilt from current source with `scripts/native-binary.sh`, local www on :3000 with local test licences for fictional institutions (Courts, Prisons, Lawyers, DPP, Police). One physical machine; **not** a two-machine run. The real data folders under `~/.local/share/com.pleadli.*` were not touched (checked by modification time).

**How the test setup differs from production.** Account approval of each connection was done by editing the local D1 database, not by an administrator on the Account page (the Postbox page approval was tested earlier, Police and DPP). The Prisons window was entered with the officer's session token set in the window's session storage after signing in through the API, because the window asks for a PIN and the officer was created with a password. Setup, licence activation and some actions were driven through each app's own API from the same process, then the result was checked in the window.

| Path | Result |
|---|---|
| Courts to DPP (invitation), DPP answers by clicking in its window, Courts trusts with the fingerprint; wrong fingerprint refused | passed |
| DPP to Courts filing (relay), Courts registers it, receipt to DPP, court case number lands on the DPP file; second accept refused | passed |
| Lawyers to Courts invitation, Courts answers by clicking, Lawyers trusts | passed |
| Courts to Lawyers hearing notice; wrong-matter filing refused by the app; filed against the right matter; receipt reaches Courts, which records outcome "filed"; second filing refused | passed |
| Prisons to Courts invitation, answered by clicking in the Courts window, Prisons trusts | passed |
| Courts to Prisons remand order; Prisons collects it; Prisons returns it with a reason; receipt reaches Courts; second answer refused | passed |
| Prisons recording the order against an admitted prisoner (the full custody path) | **not run** (needs a prisoner admitted through reception) |
| Prisons custody report back to the court | **not run** |
| Courts to Lawyers order copy, Lawyers firm filing and its receipt | **not run** |
| Police window, Police native Exchange, revocation, Police backup and recovery | **not run** (Police admin password unknown, not guessed; revoking a link needs the owner's go-ahead) |
| Two machines | **not run** |

**Findings fixed during the run:** the Postbox address defect above; "waiting for a person" shown for packages already dealt with (now "Received and taken in."). **Residual:** when an invitation is refused at once for a dead address the link record stays in the app as "invited" (nothing was sent); the user sees the reason.

**Tests after the address fix:** www 13 and `tsc` clean; node-core hub 4; Courts 62; DPP 59; `tsc` clean in all five apps. **Not rerun after the address change:** Police (32), Lawyers (69) and Prisons (157) Rust suites, although their binaries compiled and the Lawyers and Prisons windows ran.

**Screens seen in windows:** Courts Postbox (empty, with a filing, with a firm invitation), DPP Postbox (invitation, new receiving address), Lawyers Postbox (receiving address, notice), Prisons Postbox (receiving address, order). Settings rows for the new "Receiving address (Postbox)" and "Institution address" were not looked at in a window.
