# Resume here (2026-11-18, night). Read after RESUME-2026-11-18.md

Owner presents on 2026-11-19. Rules unchanged: bun and Rust only (never Python), no em-dashes, each app owns its words, one app server at a time, heavy checks in CI, standing permission to commit and push to main. Nothing is running (app window, tauri-driver stopped). `package.json` at the root has an unrelated uncommitted change: leave it out of commits.

## 1. State of everything (honest)

| Area | State |
|---|---|
| Police | Most proven. Tested in the real window with 20 live cases. CI green (run 44363125326). |
| DPP, Courts, Lawyers, Prisons | Built, not re-tested by me this session. Notes say Police, DPP, Courts, Lawyers Rust tests green; Prisons was the exception earlier. Prisons sign-in and Lawyers unlock fix not seen in a window. |
| Paperwork | Print, PDF, Word export, `/verify`, `/track` work (site and JSON). Police lacks sealed document vault and numbered issued documents; Courts wording is a working template. |
| Postbox relay | Server deployed to pleadli.com but idle; computer-side code written and tested on a laptop; no app uses it; no connections. Say "designed, first version built, not live". |
| Not built | Civilian reporting, appointments, office directory, traffic and on-duty tools, AI in Police and Prisons. |

## 2. Police work done this session (all pushed)

Optimistic lists, person picker names, officer defaults, first-run tour, bond rules, DOB and juvenile notice, richer status bar, **rules pack** (versioned, citations, admin import, Settings > Legal rules, built-in version 3), remanded status, more referral destinations, custody limit from the pack, **medical records (PF3, post-mortem)**, **restricted cases** with a named access list (hidden from lists, case page, people, search, files, exports, vault route, person page and export), forms show why they will not save, open a case from an incident, make an incident from a diary entry, Next steps card, Where to start card, one "Open a case" button, DOB column in import and in person export, user guide, RULES.md, CASES-50.md, WALKTHROUGH, LEGAL-REVIEW.md.

Bug fixed: editing a case before its people loaded erased its people.

## 3. Unverified (compiled or typechecked only)

- Dev sign-in error message (debug only), DOB import column (no file run), Where to start card, DOB in person export (file not opened).
- Restricted-case edge: officers who cannot see a hidden person may create a duplicate of them.
- Whole-station exports are refused to non-admins whenever any restricted case they cannot open exists (not filtered).
- CRB 17's people were erased by the old bug in test data; only the victim was re-linked.

## 4. Owner's list before and at the presentation

1. Legal officer reviews `docs/police/LEGAL-REVIEW.md` (5 rules; 3 are "working rules").
2. Add a Cloudflare rate-limit rule on `/api/public/*`.
3. Create the first real account on pleadli.com; delete old `pleadli` D1 only after export and when happy.
4. Native readers for French and Swahili (my own writing).
5. Decide the public name ("Orchestra" vs "Pleadli Account"); site still says Orchestra on marketing pages.
6. Prisons passcode: allow 4 to 8 digits or force six.
7. Decide whether the relay may run on Cloudflare (storage outside Uganda) for public-body pilots.
8. Real demo script: see `PRESENTATION-CHECKLIST-2026-11-19.md` (honest answers to likely questions).

## 5. What to build next, in order of value

1. Re-test DPP, Courts, Lawyers, Prisons in the real window the way Police was (one app at a time; PLEADLI_NO_SEED, tauri-driver; see `reference_desktop_window_webdriver` memory and `docs/police/WALKTHROUGH-2026-11-18.md`).
2. Prisons: sign-in auto-login seen in a window; DPP and Lawyers `PinField` look; Lawyers setup PIN vs six-digit unlock mismatch.
3. Rules pack: per-language labels field, then move referral destinations and case statuses in, together with Kenya and DRC packs.
4. Police: named access list refinements (hidden-person duplicate problem), filter instead of refuse for whole-station exports, sealed document vault, numbered issued documents, remaining walkthrough items.
5. Postbox: connections (step 2), certificates and signatures (step 3), a computer-side switch in one app, then a real two-computer test. Public/field API per `PUBLIC-AND-FIELD-API.md`, gated by decisions D4, D8, D9.
6. Kenya and DRC variants of the rules and papers; other apps' equivalents of restricted cases and medical/rules where relevant.

## 6. Practical notes

- Window driving: kill `police` and `tauri-driver` by PID (`pgrep -x`), never `pkill -f`. Run `PLEADLI_NO_SEED=1 tauri-driver`, POST /session with `apps/police/src-tauri/target/debug/police`. Multi-line scripts break the WebDriver JSON: use one line.
- API from the window: `window.__TAURI_INTERNALS__.invoke('api_request',{req:{method,path:'/api/...',body:<object>}})` returns `{status, body}`.
- `cargo check` does not build tests: run `cargo test --no-run` or let CI run `cargo test` and the clippy ratchet (`manual_contains` etc. fail new lint types).
- Paraglide lags a few seconds after message edits, so tsc errors can be transient. Nested keys cannot also be leaf labels (use `kind_label`).
- Test accounts (test data only): admin Sarah Namukasa, second officer Constable John Okello (badge UPF-20001); passwords are in the earlier session's scratch notes, not in the repo.
- Build: `CARGO_BUILD_JOBS=2 cargo build` in `apps/police/src-tauri`; Vite on 3001; check free RAM first.
