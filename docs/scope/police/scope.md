# Scope: Pleadli Police (apps/police)

The offline first Tauri desktop app for individual Ugandan police officers, organized around capabilities (Find, Understand, Record, Investigate, Act, Account, Coordinate, Handover, Report) rather than a case pipeline. See `docs/police/PRODUCT.md` for the canonical model and the explicit "don't invent Ugandan procedure" boundary that still applies to anything not already confirmed there.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

This workspace is fully caught up with its own product doc: every domain in `docs/police/PRODUCT.md`'s sequencing is built. A few real, working pieces (data import and export, shift check ins and handover as their own tables, the Activity feed as a first class domain, and the Cloudflare Tunnel remote access and backup alert infrastructure) are built but not yet explicitly named in `docs/police/PRODUCT.md`'s own domain list. Not a build gap, just documentation drift worth reconciling next time that doc is touched (`/sync` or `/audit`, not a `/scope` row). `docs/police/PRODUCT.md` also still carries one open, unresolved boundary question, how Station Admin scope relates to Duty and Roster: a decision, not missing code.

**2026-09-18**: a cross check run while designing `_root`'s officer identity and sign in decision (spec [0001](../../specs/_root/0001-officer-identity-sign-in/index.md)) found a real, small security bug in this app's own existing `officers.rs`, now feature 24 below.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | People | Find & Search | existing |
| 2 | Search (cross cutting) | Find & Search | existing |
| 3 | Station Diary | Record | existing |
| 4 | Incidents | Record | existing |
| 5 | Files | Record | existing |
| 6 | Attachments & Documents | Record | existing |
| 7 | Data import/export | Record | existing |
| 8 | Case Intake / Cases | Investigate | existing |
| 9 | Investigations workspace | Investigate | existing |
| 10 | Statements | Investigate | existing |
| 11 | Evidence & Exhibits | Investigate | existing |
| 12 | Referrals & Dispatches | Investigate | existing |
| 13 | Custody / 48h | Act | existing |
| 14 | Bonds & Sureties | Act | existing |
| 15 | Charge Sheets & Forms | Act | existing |
| 16 | Reports & Analytics | Account & Report | existing |
| 17 | Activity feed & Overview | Account & Report | existing |
| 18 | Duty / Roster (plus check in and handover) | Coordinate & Handover | existing |
| 19 | Vehicles | Coordinate & Handover | existing |
| 20 | Stores, Armory & Impounded | Station operations | existing |
| 21 | Station Admin (profile/establishment/officers nav) | Station operations | existing |
| 22 | Officers management | Station operations | existing |
| 23 | Settings incl. remote access & Cloudflare Tunnel | Station operations | existing |
| 24 | Redact password from officer input Debug output | Next slice | planned |

## Find & Search

### 1. People · existing
First class person records, not embedded name strings. code in `apps/police/src-tauri/src/domain/people.rs`, `apps/police/src/routes/_public/search/people/`

### 2. Search (cross cutting) · existing
Thin lens composing People/Custody/Bonds/Files results into one search surface. code in `apps/police/src/routes/_public/search/index.tsx`

## Record

### 3. Station Diary · existing
Purely informational operational log; no invented escalation rule into Incidents. code in `apps/police/src-tauri/src/domain/station_diary.rs`, `apps/police/src/routes/_public/sd-log/`

### 4. Incidents · existing
code in `apps/police/src/routes/_public/incidents/`

### 5. Files · existing
Composes attachments/documents rather than owning storage itself. code in `apps/police/src/features/files/`, `apps/police/src/routes/_public/search/files/`

### 6. Attachments & Documents · existing
code in `apps/police/src-tauri/src/domain/attachments.rs`, `apps/police/src-tauri/src/domain/documents.rs`

### 7. Data import/export · existing
Bulk file intake and an import wizard; a real operational utility not yet named as a domain in `docs/police/PRODUCT.md`. code in `apps/police/src/features/data-io/`, `apps/police/src-tauri/src/domain/import.rs`

## Investigate

### 8. Case Intake / Cases · existing
code in `apps/police/src-tauri/src/domain/cases.rs`, `apps/police/src/routes/_public/intake/`

### 9. Investigations workspace · existing
Correctly modeled as a composed workspace over Cases, not its own table, matching `docs/police/PRODUCT.md`'s resolved Case/Investigation relationship. code in `apps/police/src/routes/_public/investigations/`

### 10. Statements · existing
code in `apps/police/src-tauri/src/domain/statements.rs`, `apps/police/src/routes/_public/statements/`

### 11. Evidence & Exhibits · existing
code in `apps/police/src-tauri/src/domain/evidence.rs` (via exhibits/exhibit movements), `apps/police/src/routes/_public/evidence/`

### 12. Referrals & Dispatches · existing
Unified into a single workflow, per `docs/police/PRODUCT.md`'s resolution of what had been flagged as an open question. code in `apps/police/src/routes/_public/referrals/`

## Act

### 13. Custody / 48h · existing
Compliance derived from timestamps, per the real constitutional 48 hour obligation. No invented custody states beyond what's confirmed. code in `apps/police/src-tauri/src/domain/custody.rs`, `apps/police/src/routes/_public/search/custody/`

### 14. Bonds & Sureties · existing
code in `apps/police/src-tauri/src/domain/bonds.rs`, `apps/police/src/routes/_public/search/bonds/`

### 15. Charge Sheets & Forms · existing
code in `apps/police/src/routes/_public/legal-forms/`

## Account & Report

### 16. Reports & Analytics · existing
Pure aggregation over the domains above, a derived view rather than its own source of truth. code in `apps/police/src-tauri/src/domain/reports.rs`, `apps/police/src/routes/_public/reports/`

### 17. Activity feed & Overview · existing
Cross domain "what needs my attention" feed surfaced on the home route; built as its own first class domain, not yet named as such in `docs/police/PRODUCT.md`. code in `apps/police/src/routes/_public/index.tsx`

## Coordinate & Handover

### 18. Duty / Roster (plus check in and handover) · existing
Duty assignments plus officer check ins and shift handovers as their own real tables (`docs/police/PRODUCT.md` only names "Handover" as a capability, not this specific data shape). code in `apps/police/src-tauri/src/domain/` (duty + check ins/handover), `apps/police/src/routes/_public/roster/`

### 19. Vehicles · existing
code in `apps/police/src/routes/_public/vehicles/`

## Station operations

### 20. Stores, Armory & Impounded · existing
Deliberately kept as a separate domain from Evidence & Exhibits despite both being physical items, per the product model. code in `apps/police/src-tauri/src/domain/` (station assets), `apps/police/src/routes/_public/stores/`

### 21. Station Admin (profile/establishment/officers nav) · existing
The still open PRODUCT.md question is how this scope should relate to Duty/Roster; not a build gap. code in `apps/police/src/routes/_public/station/`

### 22. Officers management · existing
code in `apps/police/src-tauri/src/domain/officers.rs`

### 23. Settings incl. remote access & Cloudflare Tunnel · existing
Cloudflare Tunnel pairing, backup alerts, and dispatch live status; substantial infrastructure not yet detailed in `docs/police/PRODUCT.md`'s ecosystem section beyond a general gesture at "connected deployment." code in `apps/police/src/routes/_public/settings/`, `apps/police/src/routes/_public/logs/`

## Next slice

### 24. Redact password from officer input Debug output
Found 2026-09-18 during a cross check on `_root`'s officer identity spec: `CreateOfficerInput` and `UpdateOfficerInput` in `apps/police/src-tauri/src/domain/officers.rs` derive `Debug` on a struct holding a plain `password: String` field, so any panic or error log involving one of these prints the password verbatim. Prisons' own version of this pattern deliberately avoids the bug (spec [0001](../../specs/_root/0001-officer-identity-sign-in/index.md)); this row is Police fixing the same class of bug in its own existing code.
**Done when:** neither struct's `Debug` output ever includes the plain password value.
- [ ] Build it: `/develop redact password from officer input debug output`

## Deferred
- **Per action admin credential check for Police's own sensitive actions**: `_root`'s officer identity spec introduces this pattern for Prisons; whether Police's main desktop app should adopt it for any of its own sensitive actions (beyond the remote server's existing bearer token login, which is unrelated) was not decided and is not currently planned · needs a decision

## Legend
See `docs/scope/index.md` for the shared legend.
