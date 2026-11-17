# Scope: Pleadli DPP (apps/dpp)

The Tauri desktop app for Uganda's Directorate of Public Prosecutions: prosecution files, intake from police, police material (statements/evidence/charges), review, and charge decisions. Same offline first Rust/sqlx + no SQL over IPC architecture as Police and Prisons. Canonical product model in `docs/dpp/PRODUCT.md`.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

Drift note: the shipped `comments` domain (a generic `entity_type`/`entity_id` comment table reused across charges, statements, decisions, etc.) is broader than `docs/dpp/PRODUCT.md`'s "Review & Legal Observations" section describes, which frames observations as file level review notes only. Not a build gap, just a documentation drift worth reconciling next time `docs/dpp/PRODUCT.md` is touched (`/sync` or `/audit`, not a `/scope` row).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Prosecution Files | Existing | existing |
| 2 | Intake / Referrals | Existing | existing |
| 3 | Police Material: Statements | Existing | existing |
| 4 | Police Material: Evidence Items | Existing | existing |
| 5 | Police Material: Charges | Existing | existing |
| 6 | Review & Legal Observations | Existing | existing |
| 7 | Comments (per record) | Existing | existing |
| 8 | Decisions & printable Charge Sheet | Existing | existing |
| 9 | Attachments | Existing | existing |
| 10 | People | Existing | existing |
| 11 | Search | Existing | existing |
| 12 | Overview / work queues | Existing | existing |
| 13 | Desktop notifications (intake) | Existing | existing |
| 14 | Files feature (composition layer) | Existing | existing |
| 15 | Court Matters | Next slice | planned |
| 16 | Documents (generation/template domain) | Next slice | planned |
| 17 | Reports & Analytics | Next slice | planned |

## Existing

### 1. Prosecution Files · existing
The core entity; court fields live as plain columns, not their own domain yet (see feature 15). code in `apps/dpp/src-tauri/src/domain/prosecution_files.rs`, `apps/dpp/src/features/prosecution-files/`

### 2. Intake / Referrals · existing
Intake queue, resubmission form, desktop notification alerts on new intake. code in `apps/dpp/src/routes/_public/intake/`, `apps/dpp/src-tauri/src/domain/referrals.rs`

### 3. Police Material: Statements · existing
Wired into the file workspace with add/list, rich text preview, and a comment thread. code in `apps/dpp/src-tauri/src/domain/statements.rs`, `apps/dpp/src/features/statements/`

### 4. Police Material: Evidence Items · existing
Category enum mirrors real ODPP evidence types; wired into the file workspace. code in `apps/dpp/src-tauri/src/domain/evidence.rs`, `apps/dpp/src/features/evidence/`

### 5. Police Material: Charges · existing
Proposed charge rows linked to the accused person, with its own comment thread. code in `apps/dpp/src-tauri/src/domain/charges.rs`, `apps/dpp/src/features/charges/`

### 6. Review & Legal Observations · existing
Append style review notes, optionally pointing at a specific statement or evidence item. code in `apps/dpp/src-tauri/src/domain/review_notes.rs`, `apps/dpp/src/features/review-notes/`

### 7. Comments (per record) · existing
Generic `entity_type`/`entity_id` comment table with a rich text body, reused across charges, statements, and decisions (see drift note above). code in `apps/dpp/src-tauri/src/domain/comments.rs`, `apps/dpp/src/features/comments/`

### 8. Decisions & printable Charge Sheet · existing
Append only decision log plus a printable Charge Sheet route. code in `apps/dpp/src-tauri/src/domain/decisions.rs`, `apps/dpp/src/features/decisions/`, `apps/dpp/src/routes/print/charge-sheets/`

### 9. Attachments · existing
Vault style attachment field/domain, keyed generically across entities. code in `apps/dpp/src-tauri/src/domain/attachments.rs`, `apps/dpp/src/features/attachments/`

### 10. People · existing
CRUD, linked to prosecution files via roles. code in `apps/dpp/src-tauri/src/domain/people.rs`, `apps/dpp/src/routes/_public/people/`

### 11. Search · existing
System wide search across the domains above. code in `apps/dpp/src-tauri/src/domain/search.rs`, `apps/dpp/src/routes/_public/search/`

### 12. Overview / work queues · existing
Composes the intake queue, stat tiles, a trend sparkline, and the intake alerts toggle. code in `apps/dpp/src/routes/_public/index.tsx`

### 13. Desktop notifications (intake) · existing
Native OS alerts for new intake via `tauri-plugin-notification`. code in `apps/dpp/src/hooks/use-intake-alerts.ts`

### 14. Files feature (composition layer) · existing
Ties prosecution files together with their statements/evidence/charges/decisions/attachments/comments in one workspace view. code in `apps/dpp/src/routes/_public/files/`

## Next slice

### 15. Court Matters · needs a decision
`docs/dpp/PRODUCT.md` names Court Matters as a real domain, but today it's only plain columns on `prosecution_files` (for example court case number), with no dedicated migration, domain, commands, feature directory, or route. `apps/dpp/src/data/navigationItems.ts` already carries a comment flagging this as deliberately not yet given nav entries.
**Done when:** Court Matters is a real domain (its own table, linked to a prosecution file) with a route, and prosecution files that have court proceedings show them for real instead of as flat columns.
- [ ] Design it (spec): `/architect court matters`

### 16. Documents (generation/template domain) · needs a decision
Charge sheet generation currently lives inside the Decisions domain; there is no dedicated document generation/template domain and no Document Reader mode beyond the existing `RichTextPreview` reuse.
**Done when:** documents (charge sheets and whatever else needs generating) are produced from a real template mechanism, not logic embedded in Decisions, and there's a dedicated reading mode for a generated document.
- [ ] Design it (spec): `/architect documents domain`

### 17. Reports & Analytics · needs a decision
No route or feature exists yet; `navigationItems.ts` confirms it's acknowledged but unbuilt.
**Done when:** a prosecutor can see real aggregate figures (intake volume, decision turnaround, case outcomes) sourced from the domains above, not mock data.
- [ ] Design it (spec): `/architect reports & analytics`

## Shape gaps

From the app shape audit of 2026-11-17 (`docs/platform/APP-SHAPE-AUDIT.md`, spec 0003). Score 63% against 36 rules checked. In priority order. A rule can be broken on purpose only by writing a line `**Deviation:** <rule id>, <reason>` here.

1. [ ] NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. [ ] SH8 (Missing): An optional right panel slot works the same way in every app. Fixed by feature 26 (shared shell).
3. [ ] SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
4. [ ] PG8 (Missing): An error says what happened in plain words, what to do, and offers a retry. Fixed by feature 26 (shared shell).
5. [ ] PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
6. [ ] TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
7. [ ] MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
8. [ ] NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
9. [ ] CS1 (Missing): The Rust API is split by domain and no `api/mod.rs` is over 600 lines.
10. [ ] PG1 (Partial): Lists use the shared table and no hand built tables.
11. [ ] PG2 (Partial): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
12. [ ] PG4 (Partial): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
13. [ ] PG5 (Partial): A Connections section always exists and says "Not connected" where there is no connection yet. Fixed by feature 27 (settings, brand, onboarding).
14. [ ] PG6 (Partial): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
15. [ ] CF3 (Partial): Content text takes its size and weight from the global type, not inline sizes.
16. [ ] CF5 (Partial): Icon only buttons carry a label for screen readers and a hover title.
17. [ ] NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
18. [ ] NT3 (Partial): Chrome is not selectable, content is.
19. [ ] NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

## Legend
See `docs/scope/index.md` for the shared legend.
