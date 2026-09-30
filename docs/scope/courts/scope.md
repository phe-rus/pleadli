# Scope: Pleadli Courts (apps/courts)

The Tauri desktop app for the bench and courtroom: register, sittings, the signed record, exhibits, orders, rulings and judgments, audio recording, and returns. Same offline first Rust/sqlx architecture as the other Pleadli desktop apps. Proposal and staged progress notes in `docs/courts/PROPOSAL.md`; there is no `PRODUCT.md` yet, and no `docs/specs/courts/` spec exists for anything built so far (built directly from the proposal's own staging, not through this workflow).

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

Drift note: `docs/courts/PROPOSAL.md`'s own "Stages 3, 4 and 7... written and NOT run" section (2026-09-21) is stale. All three stages (recording, the transcription seam, returns) are built and pass their tests (40/40 as of a 2026-09-22 run, including chunked-recording, transcription-seam, and returns-specific tests) — someone completed and verified this after that note was written, but the note was never updated. Not corrected in `PROPOSAL.md` itself here; flagged for `/sync` or `/audit`, and the real state is captured below instead.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Register (Cases) | Bench | existing |
| 2 | Cause list | Bench | existing |
| 3 | Sittings, appearances, structured adjournments | Bench | existing |
| 4 | Signed sitting record (database-enforced immutability) | Bench | existing |
| 5 | Exhibits | Bench | existing |
| 6 | Orders | Bench | existing |
| 7 | Rulings and judgments | Bench | existing |
| 8 | Chunked, hashed, crash-safe audio recording | Bench | existing |
| 9 | Transcription seam (no engine, honestly refuses to invent text) | Bench | existing |
| 10 | Returns and backlog reporting | Bench | existing |
| 11 | Offline library (you fill yourself, empty by design) | Reference | existing |
| 12 | Audit trail | Office | existing |
| 13 | Profile (who sits here) | Office | existing |
| 14 | Settings: sectioned shell | Office | existing |

## Bench

### 1. Register (Cases) · existing
code in `apps/courts/src-tauri/src/domain/cases.rs`, `apps/courts/src/routes/_public/cases/`

### 2. Cause list · existing
The sittings of a day, earliest first, cancelled ones excluded. code in `apps/courts/src/routes/_public/cause-list/`

### 3. Sittings, appearances, structured adjournments · existing
The sitting is the core object everything else hangs off. An adjournment needs a reason and a responsible party as real fields, not free text. code in `apps/courts/src-tauri/src/domain/sittings.rs`, `apps/courts/src/routes/_public/sittings/`

### 4. Signed sitting record · existing
A record is signed only after the sitting is closed and by a named officer; the database itself (a trigger, not just application logic) refuses to change a signed record. code in `apps/courts/src-tauri/src/domain/sitting_record.rs`, `apps/courts/src/features/sitting-record/`

### 5. Exhibits · existing
Labelled by side (P, D, C) from the highest number used; a mark can be taken back only until the court has ruled on it. code in `apps/courts/src-tauri/src/domain/exhibits.rs`, `apps/courts/src/features/exhibits/`

### 6. Orders · existing
Complete before issue, frozen after; refused for a sitting in another case. code in `apps/courts/src-tauri/src/domain/orders.rs`, `apps/courts/src/routes/_public/orders/`

### 7. Rulings and judgments · existing
code in `apps/courts/src-tauri/src/domain/rulings.rs`, `apps/courts/src/routes/_public/rulings/`

### 8. Chunked, hashed, crash-safe audio recording · existing
A chunk every 5 seconds, sealed into the vault, hash-chained to the previous one; a recording still running at start-up is closed as `interrupted`, keeping what was saved. Sending queues and retries with back-off, separate from capturing, so a slow save never stops or reorders the recording. **Known risk, not yet checked**: `MediaRecorder`/microphone support varies per OS webview (Linux WebKitGTK especially); the UI says plainly when it cannot record. Playback goes through the in-process API as base64, bounded by the 64 MB request limit; a streaming endpoint would replace this for a long recording. code in `apps/courts/src-tauri/src/domain/recordings.rs`, `apps/courts/src/features/recordings/`

### 9. Transcription seam · existing
Three visible states (`draft`, `edited`, `adopted`); no engine ships, `POST /recordings/{id}/transcribe` answers 503 `TRANSCRIPTION_UNAVAILABLE` honestly, nothing is invented. A machine draft can never be adopted until a person has read and corrected it; nothing can be adopted into a signed record. code in `apps/courts/src-tauri/src/domain/transcripts.rs`

### 10. Returns and backlog reporting · existing
Sittings by outcome, adjournments with/without a next date and why, the most adjourned cases, open cases by age, signed vs closed, decisions delivered, reserved drafts and their age, accused not produced. No benchmark or target is asserted since what the Judiciary expects of a court has not been read. code in `apps/courts/src-tauri/src/domain/reports.rs`, `apps/courts/src/routes/_public/reports/`

## Reference

### 11. Offline library · existing
Keeps texts someone added and searches them without wildcards; empty by design, nothing bundled without a real source to check it against. code in `apps/courts/src-tauri/src/domain/library.rs`, `apps/courts/src/routes/_public/library/`

## Office

### 12. Audit trail · existing
code in `apps/courts/src-tauri/src/domain/audit.rs`, `apps/courts/src/features/audit/`

### 13. Profile · existing
code in `apps/courts/src-tauri/src/domain/profile.rs`, `apps/courts/src/features/profile/`

### 14. Settings: sectioned shell · existing
Was one flat page (every card stacked, no categories), same gap independently found and fixed in Lawyers the same day. Rebuilt as the left-nav-of-sections-plus-one-pane shape DPP and Prisons already use (`/settings/$section`). Three sections: Bench (profile), Security (the audit record), Roadmap (what's not built). No spec: a direct port of an already established, repeated pattern. code in `apps/courts/src/features/settings/`, `apps/courts/src/routes/_public/settings/`

## Not yet built

- **A transcription engine.** The seam (feature 9) exists and is honest about its own absence. Needs an English engine measured against real courtroom audio first, then Luganda (`docs/courts/PROPOSAL.md` §6) — field work, not a code task.
- **The Laws.Africa statute texts, bundled and checked against source.** The library (feature 11) is deliberately empty until real texts can be sourced and verified, not filled with anything unverified.
- **Backups and restore.**
- **App lock.** Same named gap as Lawyers had (now closed, `docs/specs/lawyers/0001-app-lock/`) and Police (open, feature 25 note in `docs/scope/police/scope.md`). Courts has more than one potential signed-in role (judicial officer, clerk) once roles exist, which the Lawyers single-advocate design doesn't; needs its own `/architect` pass, not a copy of the Lawyers spec.
- **Interchange with DPP**: receiving committal packages and court notices, sending back production/hearing results. `packages/interchange` is the Police↔DPP contract today; Courts' own design (Stage 5, `docs/courts/PROPOSAL.md`) does not exist yet on either side.
- **Interchange with Prisons**: receiving production results, sending warrants and orders. Same status as the DPP interchange: Courts' own design does not exist yet.
- **Stage 6: the live sitting feed on the courtroom LAN, and bail/sentencing worksheets.** The worksheets specifically wait on reading the real Bail Guidelines 2022 and Sentencing Guidelines 2013 (legal research, not a build task) before any wording is written, per this platform's standing rule against inventing Ugandan procedure.
- **Roles within the app**: no judicial-officer vs. clerk distinction yet; a "clerk workstation" is named in the proposal but not designed.

## Deferred

- **D10, field validation with a real magistrate and a real court clerk**: the single highest-leverage open decision named in `docs/courts/PROPOSAL.md` since the proposal was approved (2026-09-21). Everything built so far (the shape of a sitting, appearance states, note kinds, exhibit labels, order wording) is desk-research only and explicitly unvalidated against a real courtroom. Not a code task; needs the engineer to arrange the conversation.

## Legend
See `docs/scope/index.md` for the shared legend.
