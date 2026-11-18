# Police walkthrough from zero (2026-11-18)

Driven in the REAL desktop window (Tauri debug build) through WebDriver, not the browser build.
Method: `webkit2gtk-driver` (apt) + `tauri-driver` (cargo). The driver launches
`apps/police/src-tauri/target/debug/police`; the UI dev server (`bun run dev`, port 3001) must be running.
Start the driver with `PLEADLI_NO_SEED=1` to get the true empty first day (new debug-only switch in `db.rs`).
Data folder moved aside (not deleted): `~/.local/share/com.pleadli.police.bak-2026-11-18` and `.seeded-run`.

## Station, first officer (new installation)

| # | Screen | Action | Verdict |
|---|--------|--------|---------|
| 1 | Set up this installation | Choose "A police station" | Clear, one decision, plain words. 1 click. |
| 2 | Name the station | Type name (region, district, division optional), Continue | Only the name is needed. 5 actions if all filled. |
| 3 | Who runs it | Full name, rank, badge, password x2, Set up the station | 7 actions. Rank is free text (no list of UPF ranks). |
| 4 | Today (empty) | Land signed in as administrator | Fast. Total from zero to working: about 14 actions. |

## First real case: theft at a shop (Kikuubo)

| # | Action | Verdict |
|---|--------|---------|
| 5 | Today > New diary entry (panel) > category > text > Log entry | 5 actions. Confirmed with a toast. Gets register number SD 1/2026. |
| 6 | Open the entry | It is a real document: UPF letterhead, station name, SD number, Save as Word, Print or PDF. |
| 7 | Turn the report into a case | NOT FOUND from the diary entry (no "open a case" action seen). To check next: Incidents, Cases. |

## Findings (open)

- F1. "The trial has ended. Every record stays open." shows on day zero of a brand-new installation. Trace the Orchestra trial clock for a fresh install (`domain/orchestra`).
- F2. Empty Today says "Nothing needs attention" but never tells a new officer where to start (first diary entry, first person, first case).
- F3. Diary entry has no direct path to "open a case / incident from this".
- F4 (debug only). "Continue as development officer" fails silently with 404 when no administrator exists; the error is not shown.
- F5. Debug builds seed demo people, custody, case CC-2026-0001 on any empty database, so the true empty day cannot be seen without `PLEADLI_NO_SEED=1`.

## Still to do in this walkthrough

Incident > case (CC number) > statements > arrest and custody > exhibits > charge sheet > referral to DPP > hand over to Prisons;
then second officer sign-in, an HQ/command install, and the same from-zero path in DPP, Courts, Lawyers, Prisons.

## Update: incident and case (same day)

| # | Action | Verdict |
|---|--------|---------|
| 7 | Incidents > Report an incident (summary, description, location, time, person) | Prints as a proper UPF incident report. Add-person is inline (+). About 9 actions. |
| 8 | Cases > Open a case (summary, link incident, pick complainant, Open a case) | Gets "Kampala Central Police Station CRB 1/2026". About 8 actions. |

New findings:
- F6. The same facts are typed three times: diary entry, incident, case summary. The case should offer to start from the incident (summary, person, complainant pre-filled), and the incident from the diary entry.
- F7. After picking a person in the case panel the field shows the raw id (`04c7063d-495…`), not "Ssekandi, Moses".
- F8. The new case page is mostly empty ("None recorded" x3) with no suggested next step (take a statement, record an exhibit, arrest, refer).
- F9. The incident report does not carry the complainant, even though one was added.
- F10. The "Open a case" button exists twice on the page (list and panel); easy to press the wrong one.
- Window corners: reverted to the original (all four rounded, `.shell-window`). Owner found square-top ugly; the right look is still undecided.

Driving notes: plain script `.click()` works for buttons; comboboxes that search need real keys (WebDriver `element/<id>/value`), and Enter is ``.
Sign-in on return: badge, Enter, password, Enter (3 steps). Test officer: badge UPF-10482 (password kept out of this file).

## Update: arrest and window chrome

| # | Action | Verdict |
|---|--------|---------|
| 9 | Return sign-in | App remembers the officer: tap the name, type the password. 2 steps. |
| 10 | In custody > Book someone in (add suspect inline, time, cell, link to the case) | The 48-hour clock and deadline show live while typing; list shows "48 hours left". About 10 actions. Button stays disabled until a person is chosen. |

- F11. The case is linked to the custody record, but the case page's Custody section was not re-checked yet.
- Window chrome (owner decisions): corners all four rounded (original); window keys are coloured rounded squares with icons always shown (x, minus, square / two squares); the dim backdrop behind a panel now follows the window's rounded corners (`dialog.tsx`, `drawer.tsx`).
