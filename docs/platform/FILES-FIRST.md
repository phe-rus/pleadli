# Files first: Pleadli as a tool, not a system

Status: proposal, 2026-10-04. Applies to all five applications (Police, DPP, Courts, Lawyers, Prisons).

## 1. What the client said

Relayed by the developer on 2026-10-04:

- The apps ask for a lot of entry and give little output. A DPP office could not adopt them as they are: too complicated, too little way to get a document out.
- That locks the person in. The tools are there to be used, not to be lived in. The end goal is files: make the work simpler, then print it, save it as PDF or any other format, and send it to whoever needs it, without needing Pleadli on the other side, or even Pleadli itself to keep the work.
- Think of how Word, Excel and PowerPoint are used.
- Today you cannot preview the documents, there are no attachments to speak of, nothing shows what things actually are. It is forms and structures, not the real papers.
- The client also sent a CTMS "Cases module" brief and HTML prototype (High Court criminal registry: live status counts, filters, table/cards, case panel with remand tracker and trial history, register-a-case form, cause list export) as an example of something good.

This is the second time (see the 2026-09-11 document-centric correction). It is a platform rule now, not a DPP fix.

## 2. Where the apps stand (audited 2026-10-04)

| App | Takes in | Previews in app | Gets out |
|---|---|---|---|
| Police | images, spreadsheets for import | nothing | Word, Excel/CSV, export of every record |
| DPP | PDF and images only | PDF | organised case PDF, Word |
| Courts | a logo only | nothing | browser print only |
| Lawyers | PDF and images | papers (PDF/images) | PDF filing packs, Word, CSV, export of every record |
| Prisons | photos | nothing | almost nothing |

Not available in any app: Word/Excel/PowerPoint/email/audio as case papers, opening a paper in Word and taking the saved version back, handing over a whole case as a plain folder anyone can open.

## 3. The rule

> This is paperwork, modernised, not replaced. The law works on paper; the digital side is there to make the work simple. Every piece of paperwork is shown as the paper itself, can come out as paper (print, PDF, Word), and the paper can be verified on its own, without Pleadli.

Keep it simple (developer, 2026-10-04: "paper works being modernized but don't need over complications"):

- **The paper is the view.** A statement looks like a statement, an exhibit entry like an exhibit entry, a minute like a minute, the file cover like a file cover. Opening any item shows its A4 paper.
- **Preview | Edit.** One switch on every paper. Preview is the page as it prints. Edit is where the existing form (or typing on the page, as documents already do) changes it.
- **Out.** Print, Save as PDF and Save as Word on every paper. Tables: Save as Excel/CSV.
- **Verifiable paper.** Every paper that leaves (print or save) carries its reference, a 12-character verification code and a QR. The app's Verify screen (and later a public check) says whether the code is genuine and whether the record has changed since that paper was printed. Issued documents already work this way; this extends it to all paperwork.
- **Attachments are papers too.** Scans, PDFs and photos preview inside the app beside the record (DPP already has the viewer, it is just hidden); any other file type is accepted and opens in its own program.
- **Less entry.** Fields nothing uses are removed (D4); the details live on the paper.

Not doing (too much for now): Word take-back with file watching, per-format preview libraries, a separate per-record template engine, zipped case folders.

## 4. Build plan

- **P0 shared `@pleadli/paper`:** the A4 sheet (letterhead slot, footer with reference, code and QR), the Preview | Edit switch, Print / PDF / Word actions, print styles that print only the sheet.
- **P0 backend (node-core):** `paper_prints` (entity, content hash, verify code, printed by, at) + verify lookup that reports genuine / changed since printed / not found. Reuses the documents verify-code scheme.
- **P1 DPP:** statements, exhibits, charges, observations, decisions, file cover and file index rendered as papers; attachments previewed beside them; any file type accepted; remove unused fields.
- **P2 Lawyers, P3 Courts (with the CTMS register), P4 Prisons, P5 Police.**

## 5. The CTMS Cases module

It is a court's criminal registry, so its natural home is **Pleadli Courts** (`apps/courts` already has cases, parties with custody and remand-until, sittings, adjournments, cause list). Gaps against the brief: status counts that filter, table/cards toggle, remand days tracker, adjournment count with warning, case side panel with trial history and status-dependent actions, register-a-case modal with an auto number, cause list export PDF.

Legal check needed before building the remand tracker: the brief uses one "180-day constitutional limit" for every remand. Article 23(6) of the Constitution of Uganda sets mandatory bail at 60 days (offences triable by subordinate courts and the High Court) and 180 days (offences triable only by the High Court), counted before committal. The tracker should follow the article (and stop at committal), not a flat 180 for all.

The same register shape can serve Lawyers' criminal defence matters and DPP's court matters afterwards.

## 6. Decisions (answered 2026-10-04)

- D1. Order: shared F0 first, then DPP, Lawyers, Courts, Prisons, Police. **Accepted.**
- D2. CTMS module: **Courts first, then the same shape in Lawyers** for criminal matters.
- D3. CTMS look: **Pleadli's design system with the brief's layout and behaviour** (not its exact hex/Arial/px).
- D4. Field trim: **remove fields with no consumer**; those details live in the papers.

Client check, 2026-10-04: searching all of DPP, the only document preview they could find was the sanctioning file. Every other paper shows as a row.
