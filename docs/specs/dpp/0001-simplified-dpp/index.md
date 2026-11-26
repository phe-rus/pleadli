# 0001. Simplified Pleadli DPP: files, papers, registry, legal guide

**Date**: 2026-11-25
**Status**: Draft (design reviewed on the canvas, no code written, awaiting owner approval)
**Design**: https://claude.ai/artifact/KJAx2ikBmsyv3csszqfn1F (16 boards, private)
**Research**: `docs/dpp/SIMPLIFICATION-REVIEW-2026-11-25.md`, `docs/dpp/REVIEW-2-FILES-PAPER-AI-WORDING-2026-11-25.md`

## Summary

The client said the DPP app is complete but too complicated. This spec reshapes the existing app (35 migrations, about 20 places in the sidebar, a seven-stage pipeline, many registers) into the office's real working shape: receive a police file, peruse it, decide, send the answer back, follow it into court. It changes how the app is organised and worded. It removes no capability the DPP actually uses, and it adds the paper-office parts the app lacked (registers, linked files, hearing minute).

Nothing is "hidden to look simpler". Every old place either becomes one of six places, becomes a step inside a file, or is deleted because it duplicated another.

## Requirements

**User stories**
- As a state attorney I open the Inbox, pick a police file, read its papers, decide, and send the answer, without leaving that one file.
- As a state attorney I can have several files open as tabs, and Today shows "Continue where you left off" so I resume exactly where I stopped.
- As a registry clerk I receive, stamp and number every file the day it arrives and print the registers the standards require.
- As an allocating officer I give files out within the time limit and see counts of who holds what.
- As the office I edit the offences, what must be proved, the papers usually needed and the wording myself, in plain words, with a record of who changed what.
- As a prosecutor I can turn Assist off completely and still do every task by hand, offline.
- As Police I see the DPP's receipt, decision, return due date and hearing minute on the same file, and I tell the DPP which witnesses were served.

**Acceptance criteria**
- **AC-1 (Six places)**: The sidebar lists exactly Today, Inbox, Files, Diary, Registry, Settings. Search and Assist are always present but are not places. Every old route still resolves (redirect or deep link) so nothing is lost.
- **AC-2 (Files are the one list)**: Today, Inbox, Diary and Registry only list files. Each row opens the same file view. Files has Mine / Whole office and tabs by kind (Perusal, In court, Applications, Appeals, Revisions, Complaints, Closed). A bail application or appeal is its own file linked to the trial.
- **AC-3 (One file, three steps)**: A police file moves Peruse, Decide, Send in one screen sequence. The existing seven stored stages are kept in the database and mapped to the steps and tabs. No migration rewrites a past decision.
- **AC-4 (Papers by hand)**: A file's Papers can be added by scanning, by importing a folder or memory stick, or by typing. The scan is stored exactly as scanned. The clerk marks where each paper starts and its kind. This works with Assist off and no network.
- **AC-5 (Registry)**: Incoming, outgoing and movement registers are generated from file events, are printable, and record who received, stamped and gave out each file. Stamps are recorded, not drawn.
- **AC-6 (Linked files)**: One matter can have several files (police, ODPP, court reference, bail, appeal, revision), each with its own number and cover colour, shown together in the file view.
- **AC-7 (Legal guide)**: An office user, with no technical skill, can add or edit an offence, the charge wording, "what has to be proved", "papers usually needed", "what is often missing" and "words this offence uses". Each change is stored with who and when. One action restores the starter text. Changes can be marked "waiting for the Director".
- **AC-8 (Guide feeds everything)**: The Decide checklist, the charge wording, the advice to Police and Assist's context all read from the legal guide. Assist is never given law text that is not in the guide or the law library.
- **AC-9 (Assist is optional and bounded)**: Assist modes are Off (default), On this computer, Online service. Online has "Hide names before sending". Assist suggestions are grey and marked until a named person confirms. Assist cannot decide, sign, send or change a decision. Use is logged in the file's history. If the connection fails the panels are simply absent.
- **AC-10 (Hand-in-hand with Police)**: The referral carries arrest time and where held. A return carries a due date. The DPP can send a hearing minute to the station. Police can report witnesses served or not served and exhibits secured. All travel in the existing signed interchange package over postbox, mail or memory stick.
- **AC-11 (Time limits)**: Custody (same day, 48 hours), allocation (3 days), the 14-day threshold review, notice of appeal (14 days), memorandum (2 weeks from record), complaint reply (1 week) and the review after three prosecution adjournments show as clocks in Today and Files. Limits are editable in the legal guide.
- **AC-12 (Same words as Police)**: DPP and Police share one vocabulary (Today, Inbox, Files, Diary, Papers). New strings go through Paraglide as today.

## Decision

Chosen on the canvas with the owner's feedback:
- **"Files", not "Cases".** ODPP documents say "file" throughout. Papers are the scans and typed documents inside a file.
- **Registry replaces Office.** It is the real name of the part that receives, stamps and registers.
- **Seven stages stay in the data, three steps show.** Avoids a risky migration; the UI maps stage to step.
- **Legal guide is data, not code.** Starter text ships from real charge-sheet samples; the office owns edits.
- **Assist is a side panel.** No place in the sidebar, off by default.
- **Free providers first.** Gemini or OpenRouter through the existing provider layer. The owner supplies keys. Nothing is locked in.

## Feature design

### Navigation map (old to new)

| Old place | New home |
|---|---|
| Today, Recent, Tasks | Today (Continue strip replaces Recent; Tasks become lines in Today) |
| Calendar | Diary |
| Inbox, Intake, Incoming, Postbox | Inbox (postbox is how a file arrives, not a place) |
| Files folders by stage, Cases, Board | Files with tabs |
| Documents, Directions | Papers inside a file, and Send |
| Police material, Decisions, Court matters, Charging review | Inside a file (Peruse, Decide, court) |
| People, Police stations, Courts | Registry (stations and courts), search (people) |
| Capacity, Workload, Statistics | Registry "who has what" counts only. Analytics screens go to Settings > Reports, off the main path |
| Settings | Settings, plus Legal guide and Assist |

### Data model (new migrations, numbered after 0035)

- `file_links(id, file_id, linked_file_id, relation)` relation in bail, appeal, revision, trial, related. Plus `prosecution_files.cover` (pink, yellow, green, blue) and `kind`.
- `register_entries(id, register, file_id, number, occurred_at, from_to, stamps_json, given_to, actor)` register in incoming, outgoing, movement. Numbering per register per year.
- `file_references(id, file_id, kind, value)` for several police refs and court numbers per matter. Existing three columns stay and are backfilled into it.
- `paper_starts` (or extend `file_items`): scan page index where a paper starts, kind, page range. File items already hold kinds and page ranges; this spec reuses them and adds the by-hand start markers.
- `guide_offences(id, jurisdiction, title, section_refs, charge_wording, particulars_template, proving_json, papers_json, gaps_json, words_json, source, updated_by, updated_at, state)` and `guide_versions` for history and restore. Extends `laws.rs`, which keeps statute text.
- `hearing_minutes(id, file_id, hearing_id, next_date, witnesses_json, exhibits_json, adjournment_cause, sent_at)`; `witness_service(id, hearing_id, witness, served, reason, reported_at)`.
- `hearings` gains adjournment cause and count.

### Interchange (`packages/interchange`)

Additive fields on the referral (arrested_at and held_place (the place, as text)), decision notice (return_due_at) and new message kinds hearing_minute and service_report. Receivers that do not know the fields ignore them. Versioned and signed as today. Police must ship the matching reader before the DPP sender is enabled.

### Screens (from the canvas)

Today with Continue and tabs; Inbox with tabs and preview; Files list; Papers (scan, mark starts, type a paper); Peruse; Decide (three outcomes: Sanction, Return for further inquiries, Close; Director-only decisions shown but gated); Send (real Police Form 53 layout, minute to the officer in charge); file in court with witnesses, adjournment count and "same matter, other files"; Diary; Registry; Legal guide; Assist settings and side panel.

### Roles

Registry clerk, allocating officer, state attorney, Director, each seeing what the canvas map lists. Inferred from the ODPP standards, not confirmed. Build the permission table as data so it can change.

## Build plan

Each step ends with something working in the Tauri window, run locally first.

1. **Shell and words**: six places, redirects, Paraglide strings, old routes reachable. No data change.
2. **Files and linked files**: kind, cover, `file_links`, `file_references`, tabs, Mine / Whole office.
3. **Papers by hand**: start markers, folder import, typed paper. Works with Assist off.
4. **Peruse, Decide, Send**: three-step flow over existing stages; Form 53 and minute templates.
5. **Legal guide**: tables, editor, history, restore; Decide checklist and templates read from it.
6. **Registry**: three registers, print, give out files, counts.
7. **Today and Diary**: Continue strip, clocks, hearing minute, witnesses.
8. **Assist**: modes, hide names, suggestion marking, guide as context, log.
9. **Interchange additions** with Police reader (Police Spec 0001 to follow).
10. **Real-case run**: paper and digital routes through Police, DPP and Courts, as in the case runs plan.

## Open items (verify before or during build)

- Real DPP advice minute, ODPP file cover and register page (none found publicly). Registers are built from the 2014 standards and the office edits columns.
- ODPP registration number format (kept free text).
- Section numbers in the starter guide come from real charge sheets and need checking against the Act. Form numbers 16(a), 86, 57 and the medical form numbers are unverified.
- Whether Police send scans or only digital packages (design supports both).
- Roles at the station and the DPP office (inferred).
- Handwriting recognition: do not promise it. Test on real scans before any claim.
- PROCAMIS coexistence, if the office uses it.

## Not in scope

Police redesign (a separate spec after this ships), Prisons, new analytics, changes to the Courts link beyond the new message fields.
