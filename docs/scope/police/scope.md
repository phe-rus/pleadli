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
| 24 | Redact password from officer input Debug output | Station operations | existing |
| 25 | Sign in transition: loading indicator + real stall fix | Station operations | existing |

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

### 24. Redact password from officer input Debug output · existing
Found 2026-09-18 during a cross check on `_root`'s officer identity spec: `CreateOfficerInput` and `UpdateOfficerInput` in `apps/police/src-tauri/src/domain/officers.rs` derived `Debug` on a struct holding a plain `password: String` field, so any panic or error log involving one of these printed the password verbatim. Prisons' own version of this pattern deliberately avoids the bug (spec [0001](../../specs/_root/0001-officer-identity-sign-in/index.md)); this row was Police fixing the same class of bug in its own existing code. Closed 2026-09-21 per `docs/police/AUDIT.md`'s own log ("one officer record" entry): neither struct derives `Debug` anymore, confirmed directly in code. This row was still marked `planned` here; corrected during a 2026-09-22 review, not a new build.
Code in `apps/police/src-tauri/src/domain/officers.rs`.

### 25. Sign in transition: real bug, no visible indicator and a minutes-long stall · existing
2026-09-22, user-reported: after a successful badge sign in, the screen gave no loading feedback at all (`SessionGate` returned `null` while waiting) and the actual wait was reliably around a minute. Direct timing of the real `/auth/sign-in` endpoint proved the backend answers in single-digit milliseconds; Argon2 was never involved for this installation's badge-only auth mode regardless. The real cause: `SessionGate`'s post-sign-in `changed()` called `queryClient.clear()` then `refetchQueries()` in the same tick, a race, since `clear()` had already removed the query objects `refetchQueries` was trying to match, so nothing was actually refetched; the eventual sign-in was the `me` query's unrelated once-a-minute background `refetchInterval` finally firing. Fixed by having `changed()` call `queryClient.fetchQuery()` directly and await it, with no dependency on observer timing, plus real loading UI (`SetupProgress`, reused from onboarding) for every wait in the gate, not a blank screen. User-confirmed fixed 2026-09-22.
Code in `apps/police/src/features/session/session-gate.tsx`, `apps/police/src/features/session/sign-in-screen.tsx`, `apps/police/src/features/session/setup-progress.tsx`. Also tuned Argon2 to a lighter, still OWASP-listed cost profile (`officers.rs`) during the investigation before the real cause was found; kept since it's harmless and not a regression, but it was not the fix.

## Not yet built
- **Attachment vault sealing and a hash-chained audit trail**: the SQLCipher database migration (uncommitted as of 2026-09-22, `db.rs` + new `domain/keys.rs`, same `packages/node-core` pattern as DPP/Courts/Lawyers/Prisons) encrypts the database itself, but the Police Vault (`apps/police/src-tauri/src/domain/attachments.rs`) stays plain files on disk, not sealed under that key, and there is no `domain/audit.rs` chain at all. `docs/police/AUDIT.md` names this directly: "The vault is still plain files in Documents. Sealing it belongs to the security stage... which is a decision to take then." Every other Pleadli desktop app already has both. Needs its own `/architect` pass, not assumed here.

## Deferred
- **Per action admin credential check for Police's own sensitive actions**: `_root`'s officer identity spec introduces this pattern for Prisons; whether Police's main desktop app should adopt it for any of its own sensitive actions (beyond the remote server's existing bearer token login, which is unrelated) was not decided and is not currently planned · needs a decision

## Legend
See `docs/scope/index.md` for the shared legend.
