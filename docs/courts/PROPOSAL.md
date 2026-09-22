# Pleadli Courts: product and approach proposal

Written 2026-09-21. **D1 to D9 approved 2026-09-21; D10 (field validation with a magistrate and clerk) is still open.** Stage 0 (shared node core) is under way, see the end of this file. No Courts app, routes or schemas exist yet. It sits beside `docs/courts/RESEARCH.md` (institutional research, 2026-09-11) and adds the bench, courtroom and live-transcription pass.

Evidence tags: **[P]** primary text read this session, **[S]** secondary or search summary only, **[I]** my inference, **[U]** not yet researched (backlog in section 11). Per the standing rule, [U] means "not yet researched", never "not in the product".

## 1. What the earlier research already settles

From `RESEARCH.md`, unchanged:

- Court hierarchy, Magistrate grades, jurisdiction and sentencing ceilings [P]. Registrars and magistrates are statutory "judicial officers" [P].
- "Case" is the Judiciary's word; a "cause list" is a scheduling artefact, not a synonym [P]. High Court case number `HCT-{station}-CR-SC-{seq}-{year}`, plus the CRB number carried on the cause list [P]. Magistrate-level format unknown [U].
- ECCMIS is the Judiciary's own case system, live since 2022-03-01. Advocates can e-file and track; whether Police or ODPP have any login into it is unknown [P/U].
- Court owns the authoritative court record, DPP keeps a reference copy. The plea agreement (Schedules 1 and 3 of the Plea Bargain Rules) is a Courts-of-record document, and the court may take part in negotiations [P].

## 2. What this pass found

| Finding | Source | Tag |
|---|---|---|
| Most Ugandan courts still rely on the judicial officer's **handwritten notes**, typed later by few transcribers on old equipment; power cuts, lost tapes; a missing or late record stalls appeals for years | AHRLJ, "The court record and the right to a fair trial: Botswana and Uganda" | [S] |
| Magistrates take evidence **down in writing in the language of the court, ordinarily as a narrative, not question and answer** (MCA s.138). High Court evidence is taken down "in accordance with rules" the Chief Justice may make (TIA s.143). Judgments "may be recorded in shorthand or by any mechanical means" but the **transcription must be signed by the judge** (MCA s.136(2), TIA s.86(2)) | MCA and TIA consolidated text, read | [P] |
| So the law does not make an audio recording or machine transcript the record of evidence. It makes **the judicial officer's own signed record** the record. A transcript can only ever be an aid | derived from the two rows above | [I] |
| Evidence must be in English; if a recording is in another language its transcript is translated before it is received | search summary | [S] |
| **Digital Transcription Assistant**: a Soroti University team (funded by IBF International, overseen by the Governance and Security Programme) building speech-to-text tuned to Ugandan accents, names and places, piloted at Soroti High Court, working online and offline, transcribers edit rather than type. Status was "development" on 2022-10-24. Current status unknown | judiciary.go.ug news 1206 | [P] for what it says, [U] for now |
| **Judicature (Visual-Audio Link) Rules 2016** (SI 26 of 2016): remote testimony for vulnerable witnesses, safety, witnesses abroad; launched 2016-08 at Kampala, Gulu, Fort Portal | judiciary.go.ug, UNICEF | [S] |
| **Judicature (Electronic Filing, Service and Virtual Proceedings) Rules 2025** (SI 21 of 2025): the Judiciary records all virtual proceedings and uploads the transcript to the system within 14 days; virtual sittings on the court's motion or a party's application. Primary text was behind a bot challenge, so read it before relying on it | search summary of ULII | [S] |
| 2011 Auditor-General audit of the High Court Kampala: **about 10 adjournments per case in 11 months** (20-file check), reasons seldom written on the file. Causes named: absent witnesses, unprepared or absent counsel, **prisoners not produced or produced late**, slow Police and DPP review, lost files, absent judicial officer | OAG value-for-money audit, read | [P] (old, small sample) |
| Same audit: judgment due within 60 days of close of submissions (civil framing); only **55%** in the sample met it. Delays tied to missing reference materials and libraries; "judgment on notice" with no date | OAG audit, read | [P] (old) |
| ECCMIS review, 2022: **judges resisted creating court sittings and signing hearing notices** as tedious, and asked that clerks and registrars do it. Registrars hold registration, allocation and signing; records officers confirm payment | Judiciary ECCMIS Implementation Review, March 2022, read | [P] |
| Sunbird's open Whisper model for 51 African languages (Apache-2.0, 2B parameters) reports WER: English 4.1%, Swahili 8.7%, **Luganda 10.9%**, Acholi 19.7%, Lugbara 21.6%, Runyankole 26.2%, Ateso 27.5%. These are benchmark figures, almost certainly clean speech. An arXiv benchmark still concludes "substantial performance gaps remain" for African languages | Hugging Face model card, arXiv 2512.10968 | [P] for the numbers, [I] that courtrooms will be worse |
| Laws.Africa consolidations of the Acts are **CC-BY**, so a bundled offline statute library is licence-clean | footer of the MCA and TIA text | [P] |

Confirmed unknowns: how many courts actually run ECCMIS today; whether any court uses digital audio recording routinely; how a court clerk's job is defined in an establishment document; the Bail Guidelines 2022 and Sentencing Guidelines 2013 content (not read yet); assessors in High Court trials.

## 3. Who Pleadli Courts serves

Not one user. Four roles, one app, role-shaped workspaces (as Prisons does with facility and HQ):

| Role | Statutory footing | Works on |
|---|---|---|
| **Judicial officer** (judge, chief magistrate, magistrate) | Judicial officer, Admin of the Judiciary Act s.1 [P] | Own list, hearing preparation, the sitting, rulings, judgments, sentencing, bail |
| **Court clerk** | Practice-level role, not a statutory title [S] | Runs the sitting, records appearances and exhibits, operates recording, prepares hearing notices for signature |
| **Registrar / registry** | Judicial officer, delegated business [P] | Registration, allocation, cause list, warrants, copies of record |
| **Court administrator** (Resident Judge, Registrar in charge, Chief Registrar) | AJA ss.13 to 17 [P] | Cause list balance, backlog, adjournment patterns, returns, the annual report duty (s.39) |

**Who is user zero:** one judicial officer with a clerk, working criminal matters. This follows the product model (individual first, then team, then institution) and the audit finding that judges want the administrative burden moved to clerks and registrars.

## 4. Positioning against ECCMIS (the load-bearing decision)

ECCMIS is the Judiciary's statutory, institution-owned case system and Pleadli will not out-build or replace it. What the evidence says it does **not** do well for the person on the bench:

- Prepare a hearing: what happened last time, what is outstanding, who is in custody, remand clock, exhibits.
- Hold the sitting itself: appearances, the evidence as taken, objections and rulings, adjournment with a structured reason.
- Support judgment and sentence: a drafting surface with the statute, guidelines and authorities offline.
- Take live notes and a time-anchored recording.

Recommendation: **Pleadli Courts is the bench and courtroom workspace, useful with zero ECCMIS connection**, in the same way Police and DPP are useful with no other app connected. The authoritative artefacts it produces (sitting record, ruling, judgment, warrant, plea agreement) are exportable and printable for the Judiciary's own record. Integration with ECCMIS is [U] and is never assumed. Registry functions arrive later, thin, and only where a station has no ECCMIS.

## 5. The sitting is the core object

Prisons is organised around custody, DPP around the file. Courts is organised around the **sitting** (one appearance of a case before a court on a date). Everything a judicial officer does hangs from it.

```
Case (matter before a court)          Sitting (one appearance)
  parties, counts, court, number  -->   list position, appearances, custody status
  reference numbers (CRB, ODPP,         Recording  (raw audio, immutable, hashed)
   court, plea agreement no.)           Bench record (the signed record, see 6)
  bail / remand clock                   Machine transcript (draft, never authority)
  exhibits register                     Exhibits marked, rulings, orders
                                        Outcome: next date, adjournment reason + owner
```

**Adjournments are structured**, not free text: reason (witness absent, prisoner not produced, file incomplete, counsel absent or elsewhere, court not sitting, other) and the party responsible. This is the single field the 2011 audit found missing, and it is the one that closes the loop to Prisons (production), Police (witnesses, file) and DPP (review).

## 6. Live transcription: how it should actually work

Design rules, all following from the legal and technical findings.

1. **Recording is separate from transcription.** Audio is written in short fsynced chunks, hashed, and immutable. If speech recognition fails or is absent, the record of the sitting is not lost. Power cuts are a design condition, not an edge case [S].
2. **The bench record is the authority.** A judicial officer types or dictates their note as today. Notes are time-stamped against the audio. The machine transcript is a draft in a side panel. The officer *adopts* a passage into the record or a transcriber edits it, and the finished proceedings are signed, mirroring the signed-transcription pattern in MCA s.136(2) and TIA s.86(2). Three states are always visible: machine draft, edited, adopted and signed.
3. **Channel-based speakers.** Assign a microphone to each seat (bench, witness, interpreter, prosecution, defence) where hardware allows and label by channel. AI speaker diarisation is a fallback, not the plan.
4. **The English record is the interpreter's rendering.** When a witness speaks Luganda and an interpreter renders English, the two are different utterances. Model both, mark which one enters the record.
5. **Engine behind a seam.** Like the Prisons assistant seam, the transcription engine is an interface that can throw "unavailable". The UI then says so and never fakes text. Engines can be swapped: a small local English model first; Sunbird's Whisper for Luganda is 2B parameters and will not run in real time on a courtroom laptop without a GPU [I], so Luganda may need post-sitting batch runs. Nothing is promised in product copy until measured on real courtroom audio, per "verify against real source".
6. **Live view for authorised parties.** A sitting can publish a read-only feed (text, and later audio) on the courtroom LAN to connected prosecution and defence devices. In-camera and child-witness sittings publish nothing. This reuses the Prisons pinned-TLS LAN exchange; remote access via tunnel comes later. Data Protection and Privacy Act 2019 obligations are [U].
7. **No video conferencing built.** The Judiciary runs its own virtual platform under the 2025 Rules [S]. Pleadli records, annotates and links; it does not become a video product.

## 7. The Lawyers system (separate app, separate gate)

Per the product model, Pleadli Lawyers is its own application for a lawyer's own practice, and `docs/lawyers/RESEARCH.md` already exists. Boundary with Courts:

- **Courts owns**: the court record, sittings, orders, judgments, the filed plea agreement.
- **Lawyers owns**: the advocate's file, notes, drafting, client communication, billing, state-brief duties.
- **Between them** (signed, sealed packages over the existing interchange crate): filings and applications from Lawyers to Courts; hearing notices, orders, judgments and the certified record from Courts to Lawyers; and, for the parties to a case only, the live sitting feed.
- A lawyer never receives another case's record, and never Police or DPP internals: referenceable is not visible.

I recommend **not designing Lawyers in this round**. It needs its own brief and approval. This proposal only fixes the seam so Courts does not close doors on it.

## 8. Interchange with the other apps

| Direction | Package | Note |
|---|---|---|
| DPP to Courts | `committal` (indictment, summary of the case, charge sheet, bail state) | Extends `docs/interchange/police-dpp.md`; a person at the court accepts, nothing is created until then |
| Courts to DPP | `court_notice` (hearing date, adjournment with reason, plea, ruling, outcome, court number) | Replaces DPP retyping "Court Matters" |
| Courts to Prisons | remand, production and committal warrants; sentence and release orders | Prisons already models production events with outcome and next date (`court_productions.rs`); Courts becomes the authoritative source |
| Prisons to Courts | production result (produced or not, and why) | Feeds the adjournment reason honestly |
| Police to Courts | none directly | Police works through DPP |
| Lawyers to and from Courts | see section 7 | |

## 9. Architecture: reuse, and one thing to fix first

Reuse as is: Tauri v2, React 19, TanStack Router; one authenticated `/api/**` router and a single typed `api()`; SQLCipher database, sealed vault and OS-keystore key (Prisons D14); hash-chained audit; encrypted backups; the three-pillar workspace shell with Chrome-style tabs, where the **right pillar becomes the live transcript and record panel**; `packages/rich-text` for rulings and judgments; the DPP document pipeline (issued documents with a reference and SHA-256, print, PDF, DOCX); `packages/interchange` for pairing and packages; the Prisons node-and-workstation model, where a judicial officer's installation is the node, the clerk's device is a workstation on the courtroom LAN, and counsel are read-only guests.

**Duplication to fix before a third copy:** `vault.rs`, `audit.rs`, `backup.rs` and `keys.rs` each exist separately in `apps/prisons` and `apps/dpp`. Police has its own too. Courts would be a fourth. I recommend extracting a shared `packages/node-core` Rust crate first, as a bounded refactor with the existing tests as the safety net (decision D7).

New for Courts: audio capture and chunked storage, the transcription seam, the sitting model, cause list, a bundled offline law library (CC-BY consolidations), and worksheets for bail and sentencing once those guidelines are read.

## 10. Navigation sketch (bench view, for approval before any UI work)

Left sidebar: **Today** (my sittings, what needs a ruling, judgments approaching the 60-day mark) · **Cause list** · **Cases** · **Sitting** (opens as its own tab, live) · **Rulings and judgments** · **Warrants and orders** · **Library** (statutes, guidelines, authorities, offline) · **Settings**. Administrator view adds **Backlog and adjournments** and **Returns**. Right pillar: live record (recording state, machine draft, bench notes, exhibits) and the assistant seam. Exact layout waits for the UX gate.

## 11. Decisions (D1 to D9 approved 2026-09-21, D10 open)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Positioning | Bench and courtroom workspace beside ECCMIS, standalone-useful. Not a registry replacement |
| D2 | User zero | One judicial officer plus clerk, criminal matters |
| D3 | Court level first | Design for both, build the magistrates court criminal sitting first (most judicial officers), High Court sessions and committal reception second |
| D4 | Case scope | Criminal only for now (the justice chain), civil recorded as [U], not excluded |
| D5 | Transcript authority | Draft only; audio immutable; the signed bench record is authoritative |
| D6 | First transcription release | Recording plus time-anchored notes first; English engine behind the seam; local languages only after a field measurement |
| D7 | Shared core crate | Extract `packages/node-core` before Courts starts |
| D8 | Remote hearings | Record and annotate, never build video |
| D9 | Lawyers | Separate app, own brief later; Courts only fixes the seam now |
| D10 | Field validation | Before Stage 2, talk to one magistrate and one court clerk. Can you arrange that? Desk research cannot tell us how a sitting really runs |

**One reading to confirm:** you wrote "confress and lawyers side". I read "confress" as *conferencing* (remote or virtual hearings) and covered it in D8 and section 6. If you meant *counsel* or something else, tell me and I will adjust.

## 12. Research backlog (not yet researched)

- **[U desk]** Bail Guidelines 2022 (Legal Notice 8 of 2022) and Sentencing Guidelines 2013: structure, ranges, factors, so worksheets are grounded.
- **[U desk]** The 2025 Virtual Proceedings Rules primary text (recording, transcript, access, in-camera).
- **[U desk]** Criminal Procedure Code Act, MCA ss.75 to 79 bail and remand periods, Article 23(6).
- **[U desk]** Trial on Indictments Act assessors, sessions, Chief Justice's rules on how High Court evidence is taken down (TIA s.143).
- **[U desk]** Data Protection and Privacy Act 2019 for court recordings; in-camera and child-witness rules.
- **[U desk]** "Structure and Functions of the Judiciary (CR 2012)" and the Judiciary Staff Handbook (image scans, not yet rasterised) for the court clerk role.
- **[U desk]** Status of the Digital Transcription Assistant and any Judiciary digital-recording policy since 2022.
- **[U field]** How a magistrate actually runs a sitting, what a clerk does, what happens to the file between sittings, whether any recording is done, ECCMIS reality at a station.
- **[U field]** Courtroom audio: room acoustics, real Ugandan English and Luganda speech, code-switching, interpreter flow, power.

## 13. Proposed staging (only after approval)

- **Stage 0** Extract the shared node core. No behaviour change.
- **Stage 1** Shell, sittings and cases with honest empty states, cause list, structured adjournments, printable orders. No recording.
- **Stage 2** Sitting workspace, exhibits, bench notes, rulings, judgment drafting with the offline law library.
- **Stage 3** Recording (chunked, hashed, crash-safe) and time-anchored notes.
- **Stage 4** Transcription seam and English engine; measurement on real audio; review states.
- **Stage 5** DPP committal reception and court notices; Prisons warrants and production results.
- **Stage 6** Live sitting feed to authorised guests on the courtroom LAN; bail and sentencing worksheets after the guidelines are read.
- **Stage 7** Administrator view: backlog, adjournment causes, returns.

## Sources

Read in full or in the relevant part this session: MCA (Cap 19, Laws.Africa/ULII, CC-BY) ss.136, 138; Trial on Indictments Act ss.86, 143; Judiciary ECCMIS Implementation Review Report (March 2022); Auditor-General value-for-money audit "Disposing of Cases in the Judiciary" (March 2011); judiciary.go.ug news 1206 (Digital Transcription Assistant); AHRLJ "The court record and the right to a fair trial: Botswana and Uganda"; Hugging Face `Sunbird/asr-whisper-51-african-languages`; arXiv 2512.10968.

Search summaries only, primary not read: ULII SI 21 of 2025 (blocked by a bot challenge); SI 26 of 2016 and UNICEF and judiciary.go.ug pages on the audio-visual link.

## Stage 0 progress (2026-09-21)

**Step 1 done: `packages/node-core`** (crate `pleadli-node-core`) now holds the encryption keys (`keys`) and the sealed document vault (`vault`). They were byte-for-byte the same in Prisons and DPP apart from product names, so this is a pure move: each app keeps a two-line `domain/keys.rs` and `domain/vault.rs` that re-export the crate (`keys::open` still takes no service name, the app supplies `com.pleadli.<app>`), so no call site changed. A `test-keys` feature gives tests the fixed key they used to get from `cfg(test)`; only an app's `[dev-dependencies]` turn it on, and `cargo tree` confirms shipped builds have it off. Verified: crate 10 tests, DPP 39 (was 49, the 10 moved), Prisons 141 (was 151, the 10 moved). Not run: the Tauri windows, a keystore round trip on this machine (`cargo test -- --ignored keystore`).

**Step 2 done: the database start** (`node_core::db`). Encrypt-in-place with its row-by-row check and crash recovery, the key step, integrity check, snapshot before migrating, connect options, `begin_write` and document adoption moved out of both `db.rs` files. Each app's `startup` keeps its own order and what is its own (Prisons' restore and sealed credentials, DPP's restore, seeds and app lock) and calls `open_keys`, `open_pool`, `snapshot_if_migrating` and `adopt_documents` between them, so the order that keeps data safe is still visible in one short function per app. The crate now declares SQLCipher itself instead of relying on each app. One test moved (interrupted encryption) and two were added. Verified: crate 13 tests, DPP 39, Prisons 140; after the last two edits (a test-only re-export and dropping each app's redundant `libsqlite3-sys` line) only `cargo check` was run, and `cargo tree` confirms the SQLCipher feature is still on. Two small visible changes: Prisons' recovery messages now start with a capital, as DPP's did.

**Deliberately not moved, and why:**
- `audit.rs`: the two chains differ (DPP genesis is 64 zeros with no actor; Prisons uses `"genesis"`, an actor and JSON details). Unifying would change the hash of every existing row and break verification of real data. Needs a versioned chain, so it is a decision, not a refactor.
- `backup.rs`: 528 lines against 1,099, with different container contents (`.dppbk` against the node and HQ archive). Only the crypto primitives could be shared.
- `error.rs`: the two error types have diverged on purpose.

Police has none of this yet; its planned security stage (audit P4) and Courts adopt `node-core` from the start.

## Stage 1 progress (2026-09-21)

**Audit decision (taken with the go-ahead for Stage 1).** `node_core::audit` is a new, versioned chain (format version 1): every row stores its `version`, the version is mixed into the hash, the preimage is length-prefixed, the genesis is a fixed hash of `pleadli-audit/v1/genesis`, and the actor is passed in by the application. Courts is its first user. DPP and Prisons keep their own older chains untouched (their rows are real data whose hashes must not change); they move to this one only with a migration of their own, which the `version` column makes possible. The schema is `audit::TABLE_SQL`, and a Courts test keeps its migration `0002` containing that text verbatim. Crate: 20 tests pass, 1 ignored (the keystore round trip on a real machine).

**Built: `apps/courts`** (Tauri v2, port 3007, dev API 47923, `com.pleadli.courts`), on the same foundation as DPP: SQLCipher database and OS-keystore key through `node_core::db`, one `/api/**` router with an in-process `api_request` command, the three-pillar shell with tabs, and a recovery screen when the data cannot be opened.
- **Register:** cases (court number, title, level, offence), people in a case with custody (remanded, on bail, not in custody, with place and remand end date), conclude and reopen. A concluded case takes no new sitting or person.
- **Sittings:** scheduled, then closed in exactly one of three ways: held (what was done is required), adjourned, or cancelled. **Structured adjournments:** reason (witness absent, prisoner not produced, file incomplete, counsel absent, court not sitting, other with words) and the responsible party (prosecution, defence, court, prisons, police, witness, other) are required fields; a next date, if the court fixed one, schedules the next sitting in the same step; no next date leaves the case on Today as "No next date".
- **Cause list:** the sittings of a local day in the order called, with custody and prior adjournment count, prints as a plain table.
- **Today:** the Police overview shape (banners, stat tiles, listed today, needs attention, 8-week adjournment trend, reasons for adjournment), all derived from records; nothing invented. Attention items: sitting not closed, no next date, remand ending or ended, remand with no end date.
- **Orders:** adjournment, remand, release and general, as drafts. Issuing needs the judicial officer's name and court (Settings), renders the wording once, gives it a reference `ORD/<year>/<nnnn>` and a SHA-256, and freezes it (database triggers refuse to edit or delete an issued order). An adjournment order starts from what was recorded when the sitting was adjourned. **The wording is a working template, not the Judiciary's prescribed form** (research backlog, section 12); the screens say so.
- **Audit:** every state change writes to the chain in the same transaction; Settings shows the recent activity and a verify button.

**Verified:** 20 Courts tests (API as a client, real migrations, in-memory) and the encryption/recovery start tests; `tsc` clean; the real frontend driven in headless Chromium against the real API with no console errors: Settings, cause list, adjourn with structured reason and next date, close as held, draft an adjournment order from the adjourned sitting, issue it, printable sheet, Today updated. Screenshots looked right.

**Not done, and not checked:**
- Not run in a real Tauri window (this machine cannot screenshot one). Not run on two machines.
- `bun run build` (the production bundle) did not finish here under memory pressure; only the typecheck and the dev server were verified. Print output was not looked at in a print preview.
- No app lock, no backups or restore (a database that cannot be opened shows a recovery screen with no restore), no document vault (Stage 1 stores no file), no interchange with DPP or Prisons, no roles, no clerk workstation. These are later stages or need their own decision.
- Prisons was not rebuilt after `node-core` gained `audit` and sqlx's `derive` feature (additive); DPP was type-checked against it.
- The order wording, the remand and release forms, and the reasons list are desk-derived. **D10 (a magistrate and a court clerk) is still open and should happen before Stage 2.**

## Stage 2 progress (2026-09-21)

Built on desk research only: **D10 (a magistrate and a court clerk) was still open when Stage 2 was started at the user's request**, so the shape of a sitting, the appearance states, the note kinds and the exhibit labels below are all unvalidated against a real courtroom.

**Sitting workspace** (`/sittings/$sittingId`, its own tab): before the sitting, what happened at earlier ones (with the structured adjournment reason) and who is in custody; during it, **appearances** (everyone in the case listed as *not recorded*, so presence is never assumed; an accused person can be recorded as *not produced from custody*, which pre-fills the adjournment reason as "prisoner not produced, Prisons"), **time-stamped bench notes** (note, evidence, submission, objection, ruling, direction, with an optional speaker; the moment of writing is kept so a recording can be lined up later), and **exhibits** marked and ruled on; after it, close it and **sign the record**.

**Signed record.** Signing needs a closed sitting (held or adjourned), a named officer (Settings) and something to sign. It stores a SHA-256 over the canonical text of the sitting's facts, appearances and notes, and database triggers then refuse any insert, update or delete on that sitting's notes and appearances, and any change to the signature. This mirrors the signed-record rule (MCA s.136(2), s.138; TIA s.86(2), s.143). Individual notes are not written to the audit trail (a busy sitting would drown it); taking appearances and signing are.

**Exhibits** are case-level, labelled by side (P1, D1, C1) from the highest number used, ruled on as marked, admitted or rejected (audited); a mark can be taken back only until the court has ruled on it. That P, D and C is the labelling a Ugandan court uses is unchecked.

**Rulings and judgments** (`/rulings`): drafted in the shared rich-text editor (which gained an `editorClassName` prop for a taller area), saved as you write (a direct save, not a mutation, so it does not refresh every screen on each keystroke; whatever is unsaved is saved when the page is left), with a **library search beside the editor**. A draft can carry the day it was **reserved**, and stays on Today with the days since; no time limit is asserted, because what the law requires for delivering a reserved decision has not been read (section 12). **Delivering** needs the officer and court set, a non-empty text, a day that is not in the future and not before the reservation; it renders once, gives `RUL/<year>/<n>` or `JDG/<year>/<n>`, stores a SHA-256, and freezes it (triggers).

**Offline library** (`/library`): **nothing is bundled.** The bench adds a statute, guideline, authority, practice direction or note with where it came from and its licence; it is searched without a connection (plain-text, case-insensitive, no wildcards; titles first; snippet around the match; matches marked when read). Bundling the Laws.Africa CC-BY consolidations is deliberately left until the texts can be read against their source, per "verify against real source": a statute typed from memory into a legal tool is worse than an empty shelf.

**Today** gained two open items: a closed sitting whose record has notes or appearances but is **unsigned**, and a **reserved decision** still in draft. Case pages gained exhibits and decisions.

**Verified:** 32 Courts tests (Stage 2 added 12, including a direct test that the database itself refuses to change a signed record, and one that a removed exhibit label is never reused); `tsc` clean; the real frontend driven in headless Chromium with no console errors: list the case's people, record "not produced", add notes, mark an exhibit, adjourn with the reason pre-filled from that, sign the record, draft a decision from the sitting, write it, search the library beside it, deliver it, and read the printed sheet.

**Not done, not checked:** as after Stage 1 (real Tauri window, production build, print preview, app lock, backups, vault, interchange, roles). Also: no audio yet (Stage 3), so the note timestamps are not yet anchored to anything; the library file import (paste only for now); the rich-text editor's toolbar is limited to what `packages/rich-text` offers; the ruling and judgment wording (heading, "Delivered at ... on ...") is a working template, not the Judiciary's form.

## Stages 3, 4 and 7 (2026-09-21), written and NOT run

The user asked for all remaining coding, including the Lawyers side, to be done in one pass, with tests and everything else run once at the end. So **none of this has been compiled, tested or seen**. Expect ordinary first-build errors.

**Stage 3, recording** (`domain/recordings.rs`, migration `0010`, `features/recordings`). The webview records the microphone with `MediaRecorder` and sends a chunk every 5 seconds through `POST /api/recordings/{id}/chunks`. Each chunk is sealed into the vault (`node_core::vault`) under an id made from the recording and its number, hashed, and chained to the previous one (`chain = sha256(previous chain, chunk hash)`); chunk rows are immutable (triggers). A retry of a saved chunk is accepted once, a *different* chunk under a used number is refused, and a gap is refused, so order and content cannot drift. Sending is separate from capturing: chunks queue and retry with back-off, `pending` is shown, so a slow save never stops or reorders the recording and a failure is never silent. A recording still running at start-up (`mark_interrupted`, called from `db::startup`) is closed as `interrupted`, keeping everything saved, and audited. `verify` recomputes every chunk from the vault and names the first that does not hold; playback (`/audio`) joins the chunks after checking each hash, and refuses damaged audio rather than handing it out as whole. **Risks not yet checked:** whether this webview supports `MediaRecorder` and microphone permission on each OS (Linux WebKitGTK especially; the UI says plainly when it cannot record and offers the hand-written notes instead), and playback of a long recording goes through the in-process API as base64 (bounded by the 64 MB `api_request` limit), which a streaming endpoint would replace.

**Stage 4, transcription seam** (`domain/transcripts.rs`, migration `0011`). A transcript is segments in three visible states: `draft` (an engine wrote it), `edited` (a person wrote or corrected it) and `adopted` (taken into the bench record as a time-stamped note, at the recording's start plus the passage's offset). **No engine ships**: `transcripts::status()` says so, `POST /recordings/{id}/transcribe` answers 503 `TRANSCRIPTION_UNAVAILABLE`, and the UI disables the button and shows the reason; nothing is ever invented. A person types passages against the recording (`From 12:31`), corrects them, and adopts them; a machine draft cannot be adopted until a person has read and corrected it, an adopted passage is frozen with its note, and nothing can be adopted into a signed record. Measuring an English engine on real courtroom audio, then Luganda, remains the field work the proposal (section 6) already requires before any product claim.

**Stage 7, returns** (`domain/reports.rs`, `/reports`). For a period: sittings by outcome, adjournments with and without a next date, why (reason) and whose doing (responsible), the most adjourned cases, open cases by age (from the date registered, or the day entered), records signed against closed, decisions delivered, reserved drafts and the age of the oldest, accused not produced, sittings recorded. It reports what was recorded and no more; **no benchmark or target is asserted** because what the Judiciary expects of a court has not been read.

**Not done:** Stage 5 (interchange with DPP and Prisons: `packages/interchange` is the Police to DPP contract today, and Courts messages, pairing and the receiving side in DPP and Prisons are their own design), Stage 6 (the live feed on the courtroom LAN, and bail and sentencing worksheets, which wait on reading the Bail Guidelines 2022 and Sentencing Guidelines 2013), and the clerk workstation and roles.
