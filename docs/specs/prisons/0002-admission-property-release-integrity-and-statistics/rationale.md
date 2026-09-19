# 0002. Rationale

## Decision A — Property↔release gate (block until confirmed)

**Evidence**: Prisons Act 2006 s.62 (property effects delivered to the prisoner's nominated person at release), s.30(2)(a) (officer in charge keeps a prescribed register and inventory). `property_records` already models the returned marker (`returned_at`); the gap is that nothing enforces it on the release path.

**Alternatives considered**:
- *Reminder only* — warn at release, allow completion. Rejected: it is exactly the loss loop (prisoner walks out, property never handed back) the s.62 obligation exists to close; a warning that can be dismissed is not an obligation.
- *Don't link* — property and release independent. Rejected: the two are one event in law (delivery happens at release); leaving them independent keeps the current gap.

**Tradeoff accepted**: the gate is hard (no override). A court-ordered release where handback is genuinely not yet done forces the release officer to complete the handback first. Chosen deliberately over an "override with note" bypass, which would quietly reintroduce the loss loop; flagged in the spec's Consequences so it is a conscious field decision, and reversible if field practice proves it needs an escape hatch.

**Scope**: Property Summary only (every `property_records` row for the prisoner), not a subset. The Summary is the auditable inventory a release officer works from; gating on a subset would let an item silently escape.

**Placement**: in the Release flow, not a separate screen. The property officer records the return from the property side; the release step checks `returned_at` before allowing submission. One screen, one flow, same actor sees the outstanding items at the moment of release.

## Decision B — Documents-pending admission state

**Evidence**: Admissions require one of four named legal instruments (s.58); in practice a court may commit a prisoner before the written warrant reaches the facility (common with weekend/evening court). The current record cannot express this without lying about the instrument or writing it in free text.

**Alternatives considered**:
- *Single status value* (`PendingDocuments`) — rejected: `status` is the statutory convicted/unconvicted/civil category, and every status-grouped query (reports, bail-eligibility, release) reads it. Adding a non-statutory value fragments the funnel for the sake of one display label; the pending state is a property of the admission, not a third statutory status.
- *Notes field only* — rejected: free text cannot drive the release block or a badge reliably, and it hides the state from any query.

**Chosen**: keep `status = 'convicted'`; add `documents_pending` (flag) + `pending_document_type` (what's missing: charge sheet / committed warrant / both / other). The flag is the gate, the enum is the display/action hint, and status-based statistics keep counting these prisoners as Convicted — truthful, since it is a convicted admission, and undistorted, since excluding them would understate the funnel.

## Decision C — Statistics home and breakdown dimensions

**Home (D1)**: the Reports surface, not Overview. Overview is the operational "what needs attention now" dashboard (its own domain doc and code docstring say so); the UPS-shaped breakdowns are a reporting/analytics consumer, which is exactly what `reports.rs` exists for. Keeping Overview operational and Reports analytical preserves the one-job-per-surface separation the app already drew.

**Dimensions**: chosen to mirror what UPS actually publishes (docs/prisons/research/findings.md §8 — age bands, sex profile, education, Ugandan/foreign, sentence category, time series), so a facility's own returns are comparable with the national picture. Year/month/week is free (derived from `admitted_at`). Facility is deferred to scope 22 because an installation is a single facility until the Head Office sync network exists; a single-valued facility picker would be dead UI.

**New fields, discovered during pre-flight**: my initial option text said age could be computed from "the existing birth date field" — it does not exist (the `prisoners` table has no DOB, sex, education, nationality, or offence; only `high_court_only_offence` as a boolean for bail eligibility). So all five are new columns. `offence` stays free text grouped at display time (the app's convention for anything without a verified vocabulary), with the capital-offence classifier (murder / rape / aggravated robbery / treason / terrorism / other) mapping the UPS capital-offender category onto that text. No offence taxonomy is locked into the schema.

## Decision D — Export (both) and charts (hand-rolled)

**CSV + Print/PDF**: scope 21 asks for a normalized CSV in the UPS format; a print/PDF path costs a print stylesheet over the same tables and matches scope 20's print intent. Both chosen, CSV as the interchange shape, print as the human deliverable.

**Hand-rolled SVG/CSS**: the charts are small bar groupings over one `LabeledCount` list each. A charting dependency is a whole new rendering surface in a Tauri desktop app for six small charts; hand-rolled SVG over the existing `@pleadli/ui` tokens keeps one design language and one dependency tree.