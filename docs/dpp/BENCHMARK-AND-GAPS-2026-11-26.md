# DPP benchmark and gaps before Police (2026-11-26)

Purpose: compare the DPP app with how a Ugandan DPP office is documented to work, say what is missing, and set the order of work so Police can start on a DPP that is finished.

**Honesty note.** The benchmark is the published ODPP material (Decision to Charge Guidelines 2023, Prosecution Performance Standards 2014, Street Law guide), as summarised in `SIMPLIFICATION-REVIEW-2026-11-25.md`. It is not observation of a working office, and no real ODPP sample (advice minute, sanctioned charge sheet, register page) has been obtained. Where a row says "unknown", the app has a provisional version and the office must correct it.

## 1. Benchmark: the office's real day against the app

| Real step (source) | App today | Verdict |
|---|---|---|
| Police file arrives with a forwarding minute, gets a received stamp | Inbox, "Receive and open", RECEIVED stamp on the incoming line, next ODPP number suggested from the office's own series. Real window run, test added today | Done |
| Registered in the master register the same day | Incoming register is generated from file events, numbered per year. Print not tried in the Tauri window | Done, print unverified |
| Allocated to an action officer within 3 days | Give-out writes a movement line and sets the holder; allocation clock shows on Files and Today. Give-out never clicked in a window | Built, not run |
| Cover colours: pink perusal, yellow applications, green appeals, blue revisions | Kind chips and tabs; bail and appeal are linked files | Done on screen. No printed cover |
| Suspect in cells: same day, never past 48 h | Custody panel and clock exist | Built. Depends on Police sending arrest time (see gap 1) |
| Peruse: read the papers, decide on facts, law, charge, elements | Three-column reader, guide elements, Assist brief that cannot pass a disputed element | Done. Gaps: no highlighted lines inside a paper, PDF viewer shows the whole scan, not the paper's pages |
| Legal opinion: facts, law, charge, ingredients, reasoned recommendation | Decide board with reasons prefilled from papers. No named "advice minute" document | Gap 4 |
| Sanction: signature, date, stamp on the charge sheet, copy kept | Charge sheet from the guide's wording, issued with number and verification code. Real window run | Done |
| Return for more investigation, with directions and a draft amended charge sheet when a charge changes | Directions letter with due dates, shown in Diary and Today. No draft amended charge sheet attached to a return | Partly. Gap 5 |
| Capital offence reduced: written opinion to the DPP, then signed withdrawal | No Director role, so nothing blocks use of a Director-only decision beyond a marker | Gap 6 |
| Committal: summary of the case plus indictment, signed by a state attorney | Both templates exist for Uganda only | Done for UG. Close and committal paths not run |
| Court work: fix hearings, witnesses, exhibits, minute the police file after each adjournment | Hearing minute and witness service, adjournment count and 3-adjournment clock | Built. Minute does not yet travel to Police (gap 1) |
| Notice of appeal in 14 days, memorandum within 2 weeks of the record | Not in the clock set (allocation, complaint reply, adjournments only) | Gap 7 |
| Juvenile cases first | No flag, no sort | Gap 8 |
| Hand the file onward (to Police, to court) | Save, print, email of the whole file as one PDF, recorded as a handover | Rule decided and built today. Not clicked in a window |

## 2. Decisions taken today

- **Handover material.** The bundle includes indexed papers, typed statements and issued documents of kinds written to leave the office (charge sheet, directions, further investigation, indictment, summary of the case). **Decline reasons and closure decisions are excluded**: ODPP guidelines make written reasons privileged. It is an allowlist (`LEAVES_THE_OFFICE`), so a new kind stays inside until added on purpose. Drafts never go out. A side review caught the first version, which bundled every issued document. Reason: a file the office built by typing, or one whose only output is the sanctioned charge sheet, was impossible to hand over, which is the main DPP output. Code: `handoverMaterial` in `features/pipeline/case-tab.tsx`. The empty-state hint was rewritten in en, fr and sw. Typecheck passes.
- **Receive and next number** now has a backend test (`receiving_a_file_numbers_it_from_the_offices_own_series_and_stamps_it_once`). It covers: no invented number, the suggestion following the office's series, duplicate refused, receiving twice changes nothing, one RECEIVED stamp, unknown file refused. Passes.

## 3. Gaps, ranked by what blocks Police

1. **Interchange fields (spec AC-10, step 9) are not built.** The referral carries no arrest time or place held, the decision notice carries no return due date, and there is no hearing-minute or service-report message. Police cannot yet receive what the DPP now produces, and the DPP's custody clock has nothing to run on. **This is the gate for Police.** Police must ship the reader before the DPP sender is switched on (additive, versioned fields in `packages/interchange`).
2. **Close path and the Handover click never run in a window.** Everything else on Sanction and Return has been seen in the real window.
3. **Assist modes (spec AC-9).** Today there is one key and a model choice. Missing: Off / On this computer / Online as an explicit setting, "Hide names before sending", a use log in the file history. The harness design (`ASSIST-HARNESS-DESIGN-2026-11-26.md`) is approved only as a proposal.
4. **Advice minute.** No real sample. Build a provisional one from the 2014 standards' five parts (facts, law, charge, ingredients, recommendation) and mark it provisional until a sample arrives.
5. **Return with a draft amended charge sheet.** Amend decision exists; the return letter does not attach the draft.
6. **Director role.** Roles are administrator, prosecutor, clerk. Director-only decisions are labelled, not enforced.
7. **Appeal clocks** (14 days notice, 2 weeks memorandum) and **juvenile priority**.
8. **Usability debts the owner already named:** tables scroll sideways with no visible scrollbar (7 `overflow-x-auto` places), Inbox is still a list of blocks, not a work surface.
9. **Law content.** Only 8 offences carry real elements. Defilement, robbery, murder and other everyday charges are empty. The office must also say which numbering it charges under (Cap. 120 or the 2024 revised edition).
10. **Lower:** Papers workbench lacks rotate, remove blank page, real thumbnails; rw and generic templates ignore due dates; Kenya and DRC guide starters absent.

## 4. Recommended order

1. **Run the Close path and click Save, Print, Email** in the isolated desktop harness with the Okello case. Small, finishes the three-path run (Sanction, Return, Close).
2. **Fix the visible scrollbar and the Inbox work surface** in one UX pass, checked in the desktop window, not Chrome.
3. **Interchange fields with a Police reader.** DPP cannot be called finished without this, and it is Police's first need. Start the Police spec 0001 at the same time so the two share one vocabulary.
4. **Assist modes and hide-names**, then the harness skills in the order the owner picks (open question 3 in the harness doc).
5. **Everyday law content** (defilement, robbery, murder, assault) with section numbers checked against the Act.
6. **Real samples from the client** (advice minute, sanctioned charge sheet, register page, committal summary) and a second real case, ideally an appeal or a bail application, since the first run was a perusal.

## 5. Real cases to run next

The Okello theft file covered the plain perusal. These exercise different parts of the app:

- **Return and resubmission:** Police answer the directions, resubmit, DPP sanctions. Tests the due-date clock and the link to the earlier return.
- **Close (decline):** an evidential failure with the guide elements unresolved. Tests the decline reasons document and the closing register line.
- **Bail application (yellow):** a linked file opposing bail, with the 48-hour custody clock. Needs gap 1.
- **Appeal (green):** notice in 14 days, memorandum in 2 weeks. Needs gap 7.
- **Committal with an indictment:** a defilement or robbery file for the High Court. Needs gap 9.

Each must be run on both routes, scanned paper and typed or digital, per the owner's earlier rule.

## 6. Resume here

State at the end of 2026-11-26. Everything is uncommitted by the owner's rule (no commits, no push, no CI, no deploy).

**Last changes:** handover bundle (allowlist `LEAVES_THE_OFFICE` in `apps/dpp/src/features/pipeline/case-tab.tsx`), hint text en/fr/sw, test `receiving_a_file_numbers_it_from_the_offices_own_series_and_stamps_it_once` (73 backend tests pass), `bun run check` clean. Not seen in a window.

**Open decisions for the owner:**
1. Should any other issued kind leave the office (release letter, release order, detention requests)? Today they stay inside.
2. Which numbering does the office charge under (Cap. 120 or the 2024 revised edition)?
3. Which Assist skill should be polished first (harness doc, question 3)?

**Next, in order** (section 4 above): (1) run Close and the handover click in the isolated harness (`~/.pleadli-accept/`, copy of DPP data, vite :3003, tauri-driver :4444, `WD_PORT=4444 bun ~/.pleadli-accept/wd.ts`; set the data-dir env on the driver command itself); check a declined file's bundle does NOT contain the decline reasons; (2) scrollbar + Inbox pass; (3) interchange fields + Police reader + Police spec; (4) Assist modes; (5) everyday offences; (6) real samples and a bail or appeal case.

**Rules to keep:** judge look in the Tauri window, not Chrome; one dev server at a time; no em-dashes; real cases not plumbing; Paraglide strings display-only.

## 7. Close path run, 2026-11-26 (later)

Run in the isolated window: motor vehicle theft file through Decide, the two-stage review and "Decline to charge". Reasons are required, status became Declined, the file moved to Send, and the written reasons were prepared and issued as ODPP-2026-0002.

**Fixed:** the decline document printed the reasons as raw editor JSON (`{"type":"doc",...}`). Fixed in `apps/dpp/src/features/templates/context.ts`, so every country template benefits. Seen working in the window.

**Rule changed:** the decline template says the reasons are "for the record and for Police", so the earlier ban on them in the handover was wrong. Send now has a ticked checkbox "Include the written reasons for declining, for {station}" with a note that they are privileged (`decline_reasons` is added to the bundle only when ticked, `handoverMaterial(..., withPrivileged)`). Strings in en, fr, sw; typecheck passes; **checkbox not yet seen in a window**.

**Fixed, not yet seen in a window:** on Decide, the "Close the file" card showed nothing, because the test panel sat below the charge and proving list, and the sign button opened a form with the decision type disabled (no open review). The test panel now sits directly under the choice cards, and the sign button is hidden until a review is open (the existing hint explains why).

**Still open:**
1. Test the handover through Print and read the PDF under `/tmp/pleadli-dpp/` (Save opens a native dialog the driver cannot operate; `pdftotext` is not installed, so a PDF text tool is needed). Check the bundle with the box ticked and unticked.
2. Then the earlier order: scrollbar + Inbox pass, interchange fields with the Police reader, Assist modes, everyday offences, the client's real samples.

## 8. Seen in the window (2026-11-26, later)

Isolated copy `~/.pleadli-accept/dpp9-xdg`, file "State vs. Okello: theft of motor vehicle". New debug-only hook: `PLEADLI_DEV_RESET_LOGINS=1` on the driver command sets every PIN to `000000` and every password to `password123` (`domain::staff::dev_reset_logins`, wired in `lib.rs`; absent from release builds). Test convention: all test logins are 000000 / password123.

- **Decide fix seen:** picking "Close the file" opens "The tests" directly under the cards.
- **Close path seen again:** two-stage review, evidential Failed, decline recorded with reasons, status Declined, file moved to Send; the written reasons document renders as text, issued as ODPP-2026-0001.
- **Handover checkbox seen:** "Include the written reasons for declining, for Kira Road Police Station", ticked by default, privileged note shown.
- **Print, ticked:** PDF (read with `gs -sDEVICE=txtwrite`) holds cover, index and the issued written reasons, 3 pages.
- **Print, unticked:** nothing else on this file leaves the office, so the bundle is empty and Print is disabled with the "Nothing on this file yet" note. Correct, but a file that also had papers would be the stronger check.
- Still open: Save (native dialog), Email, a bundle with papers and the box unticked, then section 6 order (scrollbar + Inbox, interchange fields, Assist modes).

## 9. Resume here (end of 2026-11-26)

All servers and windows stopped. Nothing committed (owner rule). To resume the window harness: `bun run dev` in `apps/dpp` (:3003), then `XDG_DATA_HOME=~/.pleadli-accept/dpp9-xdg PLEADLI_DOWNLOADS_DIR=~/.pleadli-accept/dpp9-downloads PLEADLI_NO_SEED=1 PLEADLI_DEV_RESET_LOGINS=1 tauri-driver`, then `WD_PORT=4444 bun ~/.pleadli-accept/wd.ts start apps/dpp/src-tauri/target/debug/dpp`; sign in with PIN 000000. Helpers: `call.ts` (API through the window), `step.sh`. The Okello file there is already Declined, with ODPP-2026-0001 issued.

Next, in order: (1) handover with papers on a file and the reasons box unticked, plus Save and Email by hand; (2) scrollbar and Inbox pass; (3) interchange fields with the Police reader; (4) Assist modes; (5) everyday offences; (6) the client's real samples. Open owner decisions are in section 6.

## 10. Session of 2026-11-26 (night): items 1 to 4 done, 5 blocked, 6 waiting

All uncommitted. Servers and windows stopped.

**1. Handover (seen in the window).** Save writes the PDF; with the reasons box unticked the PDF has no decline reasons, ticked it has them (read with `gs -sDEVICE=txtwrite`). A handover line is written on the file. Found: with only the privileged document issued and the box unticked there is nothing to send, so the cards stay disabled (correct). Email not run (needs a mail program). New debug-only shortcut: when `PLEADLI_DOWNLOADS_DIR` is set, `pick_save_path` skips the system Save window and writes there, so a driver can run Save (compiled out of release builds).

**2. Scrollbar and Inbox (seen).** The DPP-wide "no scrollbar anywhere" rule is replaced by a thin visible scrollbar in the base layer; `no-scrollbar` still opts out where used (step line, sidebar). Inbox is now grouped rows ("Needs you today", "Waiting") that fit beside the preview, no sideways scrolling. Not done: "1 statements" plural in the row.

**3. Interchange fields (tested, not seen in a window).** `packages/interchange`: `arrested_at` (time) and `held_place` (TEXT, the place; renamed from `held_at` on review so it cannot be read as a time) on the referral, `return_due_at` on the decision notice, new kinds `hearing_minute` (office to station) and `service_report` (station to office) with authorization paths. DPP: accepting a referral records the station's arrest as a custody event (once), the decision notice carries the latest direction due date, `POST /api/hearings/{id}/minute/send` prepares the minute (only witnesses still to serve), importing a service report updates exactly the named witnesses of that hearing (file must come from that station; unknown file or hearing refused), relay receives it. Police: referral carries the arrest from custody records, reader accepts the minute, `export_service_report` + `/api/exchange/minutes/{id}/service-report` + relay send. Tests: DPP `arrest_minute_and_service_report_travel_between_station_and_office`, Police `a_referral_goes_to_the_dpp_and_its_receipt_comes_back` extended, all pass. NOT built: any Police screen for the minute or the service report (API only); a DPP screen button for "Send minute" (API only). Police needed `rm -rf` of the stale whisper-rs-sys build dir to compile here.

**4. Assist (tested, setting seen).** New `hide_names` setting (migration 0043, default on), shown only when the model is not on this computer. Names, national IDs and phone numbers on the file become stand-ins (Accused A, Witness 1, ID 1, PHONE 1) in the brief, review/decide and chat text, and come back in the answer (`domain/assist_names.rs`, 4 tests). A test caught that "localhost.evil.example" counted as this computer; the host is now compared whole. Limits, also on the settings screen: scans go as images, so names inside a scan are not hidden; a person described but not named is not caught. Not done: Off / This computer / Online as one three-way control (today it is the switch plus provider), the log's view of whether names were hidden, the skills harness.

**5. Everyday offences: 13 added (2026-11-26, later).** Ten from the WIPO Cap. 120 text, then rape, defilement and aggravated defilement checked against the ULII revised edition (Chapter 128). Owner chose **Cap. 120 numbering**: rape 123/124/125 verified; defilement 129(1), aggravated 129(3),(4) taken by offset from the revised s. 116 and flagged for a prosecutor to confirm. Rape is unchanged between editions; only defilement was amended. See the research note.

**6. Real samples and a bail or appeal case: waiting on the owner.** Nothing to build from until the client's samples (Form 53, minutes, a bail file) arrive.

**Open owner questions:** the "small tree of files" (see conversation: one level, parent with bail/appeal/revision children; not built); Cap. 120 vs 2024 numbering.
