# 0002. Admission, property, release integrity, and UPS-shaped statistics

**Date**: 2026-09-18
**Status**: In Progress (implemented; awaiting /check verify)

## Summary

Four small enhancements to the existing Pleadli Prisons installation, each closing a data-completeness gap the current fields cannot express. A convicted prisoner who arrives before their committed warrant does — today the app has nowhere to record that. A prisoner with unreturned property can be released without a handback. The statistics the app does publish (Overview counts, Reports trends) cannot produce the dimnensioned breakdowns UPS itself publishes, because the prisoner record lacks date of birth, sex, education, nationality, and offence. This spec adds the missing prisoner fields, a "documents pending" admission state that blocks release, a property-handback gate on the release flow, and turns the Reports surface into the national-statistics page with hand-rolled charts and a UPS-shaped export.

Scope 19 (audit trail), D2 (`prison_minister` visit type), D3 (escape event home), and D5 (Visiting Justice Book receipt surface) are still open and are deliberately **not** decided here; see Follow-up.

## Structure

This is a single top-level spec. The four decisions are independent enough to build one at a time, but they share one migration, so they are kept in one file with one build plan rather than split into children: every step after the first leaves a working, demonstrable slice.

## Requirements

**User stories**:
- As a facilities officer recording an admission, I want to mark that the prisoner's committed warrant has not yet arrived, so that I do not have to lie on the form and so the prisoner cannot be released while the warrant is outstanding.
- As a release officer, I want to be blocked from releasing a prisoner whose property has not been handed back, so that the s.62 handback obligation is actually enforced, not left to memory.
- As a facilities officer, I want the app's statistics to match how UPS actually reports its population (by age group, sex, education, nationality, capital versus other offences, sentence category, over time), so that the numbers this installation produces are comparable with the national picture.
- As a facilities officer, I want those breakdowns exportable in UPS-shaped form, so that I can forward returns to the area prison instead of retyping them.

**Acceptance criteria**:
- **AC-1 (Property gate)**: No release can be created for a prisoner who has any belonging in `property_records` with a null `returned_at`. The release UI shows the outstanding items and blocks submission until every item is marked returned; the backend `create_release` applies the same check, so the block holds even if the UI is bypassed.
- **AC-2 (Documents pending)**: An admitted prisoner whose `documents_pending` flag is set is shown as documents-pending (with what is pending: charge sheet / committed warrant / both / other) on the prisoner record, counts as Convicted in statistics, and cannot be released until the flag is cleared.
- **AC-3 (Breakdowns)**: The Reports page shows prisoner population counts broken down by age group (≤17 / 18–36 / 37–54 / 55+), sex, education level (preset list), nationality (Uganda / foreign), capital-offence type (murder / rape / aggravated robbery / treason / terrorism / other, derived at chart time), and sentence category (sentenced / remand / civil), each over year, month, and week granularity where the underlying timestamp exists.
- **AC-4 (Export)**: Those same breakdowns export as a normalized CSV in the UPS statistics shape, and a Print/PDF action produces the same tables for the chosen breakdown.

## Decision

**Chosen options** (each was offered with alternatives; the engineer picked these):
- Property↔release: **block until confirmed**, scoped to the prisoner's Property Summary (all `property_records` for them), with the gate inside the Release flow (the property officer records the return, then the release becomes eligible). No override bypass.
- Documents pending: **enum + flag** — the prisoner's `status` stays `convicted`; a `documents_pending` boolean plus a `pending_document_type` enum (charge sheet / committed warrant / both / other) carries the state. Pending-docs admissions **count as Convicted** in statistics.
- Statistics home (D1): a **dedicated Reports page** hosts the UPS-shaped breakdowns; Overview stays the operational dashboard. Reports already exists as an analytics surface (`apps/prisons/src-tauri/src/domain/reports.rs`), so this extends it rather than building a new page.
- Breakdown fields: **date of birth is a new stored column**, not derived; **year/month/week is derived** from `admitted_at` (no new field); **facility is deferred** to the Head Office aggregation (scope 22), because a v1 installation is a single facility.
- Export (scope 21): **both** CSV (UPS shape) and Print/PDF.
- Charts: **hand-rolled SVG/CSS**, no new dependency.

**Implementation skills**: none new — this reuses the existing Tauri/Drizzle/SQLite stack, `@pleadli/ui` components, and the Reports queries already present. No install or provisioning is involved.

## Feature design

### Data model

One new migration (`0019_prisoner_profile_fields.sql`) adding columns to `prisoners` (which today is the minimal record in `0001_prisoners.sql`):

| Column | Type | Nullable | Meaning |
|---|---|---|---|
| `date_of_birth` | INTEGER | yes | Epoch-millis midnight of birth date (stored as the app stores all timestamps) |
| `sex` | TEXT | yes | `'male'` or `'female'` |
| `education_level` | TEXT | yes | Preset list: primary / secondary / tertiary / none / other |
| `nationality` | TEXT | yes | `'ugandan'` or `'foreign'` |
| `offence` | TEXT | yes | Free text charge/offence description (no offence model exists, matching the app's other free-text conventions) |
| `documents_pending` | INTEGER | no, default 0 | 1 while any instrument is outstanding |
| `pending_document_type` | TEXT | yes | `'charge_sheet'` / `'committed_warrant'` / `'both'` / `'other'` when `documents_pending = 1`; null otherwise |

Notes:
- `offence` stays free text; the capital-offence-type breakdown (murder / rape / aggravated robbery / treason / terrorism / other) is grouped at display time by a keyword classifier over `offence`, exactly like the existing `reports.rs` labelled counts group by stored string values. No offence taxonomy is locked into the schema. `high_court_only_offence` continues to drive the mandatory-bail eligibility view; it is not the breakdown source.
- Age group is computed from `date_of_birth` at query time, never stored. The ≤17 boundary matters legally: 18 is the Act's age of majority for custody purposes.
- Sentence category derives from the existing `status` (`convicted` → Sentenced, `unconvicted` → Remand, `civil` → Civil) and needs no new column. A `documents_pending` prisoner still counts in the Sentenced bucket per the decision above.
- No change to `property_records` (the returned marker already exists as `returned_at`) and no change to `releases`; the gate is a query, not a stored flag.

### Release gate (AC-1, AC-2)

Evaluated in `create_release` (`apps/prisons/src-tauri/src/domain/releases.rs`) before insert, and shown in the release dialog (`apps/prisons/src/features/releases`):

1. **Property**: `SELECT COUNT(*) FROM property_records WHERE prisoner_id = ? AND returned_at IS NULL`. Non-zero → reject with the outstanding items listed.
2. **Documents**: `SELECT documents_pending FROM prisoners WHERE id = ?`. `1` → reject, naming `pending_document_type`.

Rejection is a hard error (same shape as the existing `sqlx::Error::RowNotFound` handling), not a silent skip. The UI disables submit and renders the blocking items; the backend check is authoritative.

### Statistics page (AC-3, AC-4)

The Reports surface (`apps/prisons/src/features/reports`, `apps/prisons/src-tauri/src/domain/reports.rs`) gains a population-breakdowns section beside the existing written-report-document surface. New queries in `reports.rs` produce, per breakdown dimension, a `LabeledCount` list:

- age group, from `date_of_birth`
- sex, from `sex`
- education level, from `education_level`
- nationality, from `nationality`
- capital-offence type, from the display-time classifier over `offence`
- sentence category, from `status`

Each also over time granules derived from `admitted_at` (year / month / week) using SQLite `strftime`, mirroring the existing `admission_timestamps` pattern. The facility dimension is omitted entirely in v1 (single-installation facility).

Charts are hand-rolled SVG/CSS components (bar charts per dimension) using the existing `@pleadli/ui` tokens — no charting library.

Export:
- **CSV (UPS shaped)**: normalized rows of (dimension value × count), one file per chosen breakdown, header matching UPS's own labels (e.g. "Sentenced"/"Remand", age bands, "Ugandan"/"Foreign"). Written client-side from the same data the page renders.
- **Print/PDF**: a print stylesheet over the chosen breakdown table.

### Value sourcing

| AC value needed | Source |
|---|---|
| Outstanding items for a prisoner | `property_records` where `prisoner_id = ?` and `returned_at IS NULL` |
| Whether documents are pending and which | `prisoners.documents_pending`, `prisoners.pending_document_type` |
| Age band | computed from `prisoners.date_of_birth` at query time |
| Sex group | `prisoners.sex` |
| Education group | `prisoners.education_level` |
| Nationality group | `prisoners.nationality` |
| Capital vs other offence | display-time keyword classifier over `prisoners.offence` |
| Sentence category | `prisoners.status` |
| Year / month / week | `strftime` over `prisoners.admitted_at` |
| Facility dimension | not produced in v1 (single facility); depends on scope 22 Head Office aggregation |

## Build plan

Ordered per the project's Tracer Bullet approach: each numbered step leaves a genuinely working slice.

1. **Migration `0019_prisoner_profile_fields.sql` + domain structs**: add the seven columns; extend `Prisoner`, `CreatePrisonerInput`, `UpdatePrisonerInput`, and `create_prisoner`/`update_prisoner` in `apps/prisons/src-tauri/src/domain/prisoners.rs`; extend the admission form (`apps/prisons/src/features/prisoners`) with the new inputs (DOB, sex, education level, nationality, offence, documents-pending flag + type). Satisfies the data foundations of **AC-2** and **AC-3**.
2. **Documents-pending state (AC-2)**: admit/update a prisoner with the flag; badge "Documents pending — [type]" on the prisoner record and in list views; the flag counts as Convicted (no change to the status-based queries). Release remains possible until step 3 adds the gate.
3. **Release gate (AC-1 + the documents half of AC-2)**: backend block in `create_release` (property outstanding or documents pending → error), release dialog lists outstanding items and disables submit until cleared. Satisfies **AC-1** and completes **AC-2**.
4. **Statistics page (AC-3)**: population-breakdowns section in `reports.rs` + the Reports feature; hand-rolled SVG/CSS charts for each dimension and the time granules. Satisfies **AC-3**.
5. **Export (AC-4)**: CSV (UPS-shaped) download and Print/PDF stylesheet over the chosen breakdown. Satisfies **AC-4**.

## Consequences

**Positive**:
- Release becomes integrity-checked for both property handback (s.62) and outstanding instruments, without new tables — two queries over existing/added columns.
- The reports surface closes the gap between what the app can say about its population and what UPS actually reports, making facility returns comparable with the national statistics.
- No new dependency, no new installation shape: every change rides existing schema and feature structure.

**Negative / tradeoffs**:
- The property and documents gates cannot be overridden. A court-ordered expedited release while a warrant is outstanding will force the release officer to record the warrant first (or the property officer to finish the handback first). That matches the "block until confirmed" decision, but it is a hard constraint — flagged here so the field knows it is intentional.
- New prisoner fields are captured going forward only; historical records have nulls in `date_of_birth`, `sex`, `education_level`, `nationality`, and `offence` until backfilled, so early breakdowns will undercount until a facility's roster is refreshed with real values.
- The capital-offence classifier is heuristic (keyword match over free text), the same honesty limit as any of the app's display-time groups; misclassified offences will appear until an officer fixes the free text.
- `sex` as Male/Female-only does not match any UPS-published non-binary categories; no such category was found in the research (UHRC/State Dept/UPS sources) so two options are stored, and the field can widen later if a real national category appears.

**Neutral**:
- `facilities` (from the 0001 chain) is untouched; the facility dimension appears only when the 0001 sync network reaches scope 22's aggregation.

## Follow-up

- [ ] **Scope 19 audit trail** was not decided here (identity model crosses apps — Police/DPP/Prisons each have their own officer identity). Needs its own `/architect` pass before implementation.
- [ ] D2 `prison_minister` visit type (Prisons Act s.113, Prison Ministers), D3 escape-event home, and D5 Visiting Justice Book (s.110(3)) receipt surface remain open from `docs/prisons/ux/navigation.md`; none is decided by this spec.
- [ ] Backfill strategy for the new fields on existing prisoner rows (batch edit screen vs. leaving to natural re-entry).
- [ ] Whether the capital-offence type labels should one day become a stored value rather than a display-time classifier, once the app grows an offence model.

## Rationale

Reasoning, alternatives considered, and the evidence each decision rests on: see [rationale.md](rationale.md).