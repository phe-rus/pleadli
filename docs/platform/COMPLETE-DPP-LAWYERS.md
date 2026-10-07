# Completing DPP and Lawyers (plan, 2026-10-07)

Builds on [FILES-FIRST.md](FILES-FIRST.md), [REVIEW-2026-09-28.md](REVIEW-2026-09-28.md) and [../lawyers/REVIEW-2026-09-30.md](../lawyers/REVIEW-2026-09-30.md).

## What "complete" means

Both apps are ready for the client when every paper shows as its A4 page, every paper gets out (print, PDF, Word) and can be verified by its code, forms ask only for what something uses, the look is the same across screens, every language is complete, one full test pass is done, and a Windows build is released.

## Decisions (answered 2026-10-07)

- Government sync API, network search, plugins: **after Police is done**, not part of this plan.
- State brief fee claims: **in, right away**.
- Law library in Lawyers: **in, now**.

## Lawyers

- **L-A State brief fee claims (first).** Research the claim form and the fee scale the Judiciary pays for state briefs from primary sources, then build: a claim per criminal matter on a state brief, the work done drawn from hearings and time already recorded, the claim as an A4 paper with code and QR, a register of claims (submitted, paid, outstanding) with CSV.
- **L-B Law library.** Port DPP's library (Laws.Africa sync, offline copy, search) and link it from matters, documents (citations found on a paper open the section) and Assist.
- **L-C Finish the UI refresh.** Remove "(optional)" from plea, hearing, profile, task and document forms; make Settings look like the rest of the app.
- **L-D Translation sweep.** Hearing forms, diary, plea, time entries, and generated task titles (translated client-side by `rule_key`), in en/sw/fr/de.
- **L-E Walk-in services.** Walk land purchase and debt recovery end to end and fix what is wrong.
- **L-F Split one scanned bundle into several papers**, ported from DPP's import.

## DPP

- **D-A Remaining papers.** Decisions (including the sanctioning paper), review notes and observations, directions, the file cover, a printable file index. Each as its A4 paper with Preview | Edit where editable.
- **D-B Any file in.** Accept any file type; preview PDF, images and text beside the record; anything else opens in its own program.
- **D-C Remove fields nothing uses.** Per form, check every field for a consumer (clock, filter, document, statistic) before removing it.
- **D-D Lists and forms.** The Lawyers treatment: files list leads with reference and title, ID column hidden by default, roomier forms.
- **D-E Languages.** New paper, indictment and summary wording complete in fr/sw/de.

## Order

One app at a time (user, 2026-10-07): **DPP first, then Lawyers.**

1. DPP: D-A, D-B, D-C, D-D, D-E.
2. Lawyers: L-A (state brief fee claims), L-B, L-C, L-D, L-E, L-F.

While building: typecheck and `cargo check` only.

## Test pass and release (both apps together)

Real print window and Word file content; Open in Word on Windows; signature pad by touch; Lawyers firm network on two machines; every DPP paper end to end; state brief claim end to end; law library offline. Then Windows release builds of both through the release pipeline.

## Later (not in this plan)

Government sync API and network search (after Police); telemetry to Pleadli Cloud admin (`www`): crash reports and user-sent issue reports from every app, opt-in per installation, no case data in reports, shown in the admin side for triage; South Sudan head of prosecution and KE/TZ/RW ranks to confirm; Police, then Prisons and Courts on the same paper package.

## Apple pass (DPP first, then every app)

Asked by the user on 2026-10-07: organisation, placement of words, categories and UX decisions the way Apple would make them, in the desktop window and in a browser.

Done: window (real rounded corners, window buttons top left, sidebar button beside them), sidebar (one library, stage folders with counts, office group, footer), Files page (folder title, count, List | Board), file header (one quiet line, Info, Edit, segmented Case | The file | Activity), binder (Papers + at the list, paper first, details folded).

Done 2026-10-07 (DPP, seen in Chrome): shared Group/GroupRow/Segmented/Stat in `@pleadli/ui`; Today; tabs (Safari-like); file Case tab (steps, stage work in place, Move on), Activity by day; Search (Spotlight); Documents (thumbnail library, Verify in a sheet, Preview | Edit | Write with pen/finger ink sealed on issue, Sign… on the paper, Issue and Discard in sheets); Calendar (Apple Calendar month); Settings (System Settings list, plain icons); Police stations (one Add flow, identity made quietly, code check in a panel); Workload (now) and Statistics (over time, built from the existing counts); Recent as one place; boot screen and setup (Apple welcome rows, centred steps, dots, whole-line tick boxes); one page width (72rem) everywhere; pages open at the top.

Also done 2026-10-07: row icons plain everywhere (no tinted squares); Settings fields as label-left rows; Inbox (named as in the sidebar, outbox only when non-empty), People (fully translated, ID hidden), Tasks (named as in the sidebar); Write on every paper (received statements, exhibits, charges, typed entries, office papers) via node-core `paper_ink` (DPP migration 0028, `/api/prints/ink`), printed with the paper but not part of its verified wording; Sign… offers your saved signature, signatures you used on documents you issued, or a new one (optionally kept as yours).

Still open: writing over a scanned PDF/photo itself (scans show in the PDF viewer, not on a paper sheet).

## Next (2026-10-07)

Lawyers, with the same Apple pass as DPP, done quicker by reusing the shared pieces (`@pleadli/ui` grouped/segmented/stat, `@pleadli/paper` Write and ink, `@pleadli/setup`) and copying DPP's shell files. Then Police. Remaining DPP items (D-B any file in, D-C field trim, D-D, D-E, writing on scans) and the full test pass come after all apps are done.

## Lawyers Apple pass (2026-10-07, in progress)

Done (typecheck + cargo check clean; Today, Matters, matter page and Papers seen in Chrome): window (DesktopFrame, Mac lights, sidebar button, transparent rounded window), ribbon and status bar removed; sidebar = Today, Recent, Calendar, Tasks, Documents / Matters folders (Open, Needs a date, Criminal register, Closed, All) / Office (Clients, Walk-in services, Registers, Money, Time, Statistics), footer with you, language, Settings, sign out; "+" menu beside search; Assist docked from the title bar (works on the matter in view, else asks which); Today (grouped lists, figures only when non-zero); Matters (folder title, List | Board); matter page (one quiet line, Info sheet, one blue action, "···" menu, segments The matter | Papers | Notes | Money and time | Activity); Recent page; Calendar = Day (the diary, now translated) | Month; Documents as a thumbnail library with Verify in a sheet; Settings as the System Settings list with label-left rows; ink on papers (migration 0019_paper_ink, `/api/prints/ink`); i18n strings in `i18n-src/l14_apple.py`.

One page width (72rem, as DPP) since 2026-10-07: `page-narrow` is a no-op, no per-section caps. Not yet seen in Chrome: Calendar Day/Month, Documents, Settings (backend restart signed the browser out). Still to pass: Clients, Money, Time, Statistics, Registers, Services, Criminal register, Tasks, document page, command menu (Spotlight), hard-coded English sweep (grep for literals).

## East Africa only (2026-10-07)

Languages are English, Kiswahili and French (French for DR Congo) in every app and on the site. German and Chinese, the Germany and France country packs, and the "Europe" area in setup are removed. Lawyers' words are its own (`i18n-src/l00_shared.py` holds the ones first written for DPP; no app reads another app's catalogue). Still owed: French for Police and Courts; Lawyers wording in the terms East African advocates use.
