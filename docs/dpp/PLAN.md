# Pleadli DPP: staged implementation plan

Written 2026-09-21, from the DPP audit. Product truth stays in `PRODUCT.md` and `RESEARCH.md`; this file is only the order of work and what each stage is allowed to touch. Each stage ships on its own.

Design language: the current Prisons workspace (three-part shell, Chrome-style tabs, sidebar sections, semantic tags, operational rows, settings cards, print presentation). Borrowed: design and interaction model. Not borrowed: prison terminology or functionality.

## Rules for every stage

- Real data, an honest empty state, or a labelled planned capability. Never invented prosecutors, dates, deadlines or statistics.
- Deadlines shown only where research confirms them (the Threshold Test 14-day review). Everything else shows age, not "overdue".
- Every HTTP route is `/api/**`. The frontend has one typed `api()`; there is no per-domain Tauri command.
- Decisions stay append-only. Status is derived from the record, never edited.
- No em-dashes in any copy.

## Stage 0: correctness and cleanup

No refactor. Defects only.

| Defect | Fix |
|---|---|
| A returned-for-investigation file shows as awaiting a charging decision | The intake queue is `under_review` and `resubmitted` only; returned files have their own view |
| Recording a resubmission does not change the file's state | Resubmission recomputes status in the same transaction (`resubmitted`) |
| Decision status follows insertion order | Status is recomputed from the latest status-affecting decision by `decided_at` |
| Decision insert and status update are not atomic | One transaction, one `recompute_status` |
| No server-side validation | `DomainError::Invalid` (422) for empty titles, unknown decision types, unknown roles, missing file, absurd dates |
| DPP-only decisions are only a UI notice | Discontinue and nolle prosequi are refused (403) unless the installation's prosecutor is marked as the DPP |
| Seed problems | No em-dash title, `KIRA ROAD CRB 221/2026` reference format, accused and complainant found by name, not by insert order |
| Routes not under `/api/**` | One router nested under `/api`; one `api_request` command; per-domain commands deleted |
| Packaging config | Real product name, description, author, bundle metadata, no `createUpdaterArtifacts` without an updater key |

## Stage 1: foundation and UI (built 2026-09-21)

Prisons-style workspace shell (left ribbon and sidebar, tab strip, status bar, no right pillar yet), semantic status tags, then every destination in the proposed navigation, each as real data, empty state or planned capability.

## Stage 2: file workspace, chronology, operational Overview

The file becomes a workspace: identity, current state and next action, then tabs (Chronology, Police material, Review, Decisions, Court, Documents, Attachments). Chronology is the union of persisted events, nothing else. Overview is answered from real queues.

## Stage 3: charging review and decisions (built 2026-09-21)

A review record with assessment, findings, decision, reasons and resulting action. Decisions per accused and per count, corrections as new linked rows.

## Stage 4: directions and the Police return loop (built 2026-09-21)

Structured directions on a return for investigation; resubmission matched to the return it answers.

## Stage 5: documents (built 2026-09-21)

One `documents` table with a type, reference, status, provenance and content. Reader, print route, PDF through the print path, DOCX generated separately from screen rendering, Markdown as an export only.

## Stage 6: capacity and operational queues (built 2026-09-21)

Workload trends, age bands and concentration, on top of the Stage 1 workload endpoint.

## Stage 7: security (built 2026-09-21)

Encrypted database and vault, optional app lock, encrypted backups, following Prisons D14. Safe vault paths, no absolute paths in the UI, identifier changes migrate attachments.

## Stage 8: Police to DPP interchange (DPP side built 2026-09-21)

Signed, sealed, transport-independent Referral Package; Incoming area with preview and explicit acceptance; Decision Notice Package back. Trusted sender list and replay protection.

## Stage 9: court matters

DPP-owned court reference, trial dates and adjournments where the spec supports them. No Courts integration.

## Stage 10: reports, advanced search, polish

## Out of scope for the whole effort so far

Live Police networking, Courts integration, HQ, Cloudflare, AI, localisation, migration import, a general document engine, a staff or account system.

## Where we are (2026-09-21)

- Stage 0: done.
- Stage 1: done, seen in headless Chromium against a real database. Not yet seen in the Tauri window.
- Stage 2: first form exists (file workspace, chronology, operational Overview).
- Stage 3: done. A charging review per file (Two-Stage or Threshold), named criteria with a finding each, a conclusion per test, and decisions that the server allows only when the review supports them. Decisions can be about the whole file or chosen counts (file status rolls up from its counts). A concluded decision is reopened by a review of its own, and the decision it produces corrects the old one, which stays. 12 Rust tests.
- Not in Stage 3: assessment per count (a review is per file; assess counts differently by concluding and starting another), structured directions (Stage 4), the document library (Stage 5).
- Stage 4: done. A return must carry at least one structured direction (missing material, investigation, statement, evidence, clarification, procedural, other). Each resubmission records the return it answers, and once the file is back each direction is recorded as met or not met. Directions print as a letter to the investigating officer. 14 Rust tests.
- Stage 5: done. One `documents` table with a structured content snapshot; a draft can be refreshed from the record, issuing freezes it with a reference (DPP-year-sequence) and a SHA-256. Kinds: charge sheet, directions to Police, written reasons for declining (the ones the documentation names). Reader with prepared-from provenance and previous/next, print with a running footer, Save as PDF through the print dialog, DOCX generated as a real document (docx-rs), Markdown export. 17 Rust tests.
- Not in Stage 5: legal opinion, indictment, case summary, decision notice (no template is fixed by the research), a true PDF generator, superseding an issued document with a new version, attachments on documents.
- Stage 6: done. `/api/capacity?months=3|6|12` counts, per calendar month: files received, files decided, returns, resubmissions, documents issued, and the backlog at each month end (waiting on a decision, with Police), replayed from each file's referrals, decisions and resubmissions. Also referral-to-first-decision, time with Police and document-to-issue (middle, average, longest, spread), directions met and not met, decision mix, concentration by station and offence, and the longest waiting. 18 Rust tests. It measures work, never the prosecutor.
- Not in Stage 6: per-count backlog (the replay is at file level), court-side timings, any target or comparison.
- Stage 7: done. See `SECURITY.md`. SQLCipher database (existing plain data encrypted in place, verified before the swap), sealed vault with id-only file names, key in the OS keystore, optional application lock with idle timeout and attempt slowing, encrypted `.dppbk` backups and staged restore, recovery mode, hash-chained audit trail. 43 Rust tests, including a backup made on one data folder restoring on another.
- Not in Stage 7: verified on Windows or macOS, the packaged app, a Content-Security-Policy, signed Police packages (Stage 8).
- Stage 8: DPP side and the shared contract done; Police side not built. Contract in `docs/interchange/police-dpp.md`, code in `packages/interchange` (identities, invite/answer/confirm pairing, signed and sealed `.pxpkg` packages, messages) with a Police stand-in (`examples/police_sim`). A station sends only to the office that invited it and whose fingerprint a person there typed in; packages are checked against the pinned key, addressee, replay and tamper, held apart from the records in Incoming, and only a person's acceptance creates a file (or adds to the returned file for a resubmission). Receipts, decision notices and connection confirmations are exported by the prosecutor. 49 Rust tests + 6 in the crate.
- Not in Stage 8: any Police-side interface, LAN or tunnel carriers, key rotation, delivery confirmation.
