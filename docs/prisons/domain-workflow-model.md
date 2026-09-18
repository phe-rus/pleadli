# Pleadli Prisons — Domain & Workflow Model

> **Superseded 2026-09-18 by [`product-map/02-capabilities-domains-workflows.md`](product-map/02-capabilities-domains-workflows.md).** The REMOVE verdicts for daily routine, duty roster, discipline, incidents and facility hierarchy are reversed: unknown procedure is not an unknown responsibility. Evidence in this file is retained.

Where every current (or candidate) domain sits, with a **KEEP / IMPROVE / MERGE / SPLIT / MOVE / REMOVE** verdict and the concrete change each implies. Grounded in `RESEARCH.md` (evidence), `PRODUCT.md` (product decisions), and the audited build state recorded in `docs/scope/prisons/scope.md` (2026-09-18).

**Verdict vocabulary.**
- **KEEP** — correct domain, correct shape; no structural change.
- **IMPROVE** — correct domain; a specific, grounded capability is missing or disconnected.
- **MERGE** — two domains are one workflow and must act like it.
- **SPLIT** — one domain contains two genuinely separate concepts.
- **MOVE** — belongs at a different architectural tier (facility ↔ HQ ↔ cross-cutting).
- **REMOVE** — or rather, never build: genuinely unevidenced.

## Person-level domains (facility-authoritative)

| Domain | Verdict | Current state (audit) | Change |
|---|---|---|---|
| **Prisoners** (admission/custody/status; episode-not-person) | **KEEP** + IMPROVE | Built (scope 1); `admission_instrument_type` forces a false choice among 4 complete types | Represent "convicted, document pending" honestly (real CG-reported state, RESEARCH.md §11.3; scope 18). |
| **Releases** | **KEEP** + IMPROVE | Built (scope 2); normal discharge + court-driven release both flow | (a) MERGE with Property at release (below); (b) align court-release vocabulary with UPS's own 13 named reasons (Jan-2025 abstract); (c) print the release order (scope 20). |
| **Transfers** | **KEEP** + IMPROVE | Built (scope 3) as a closure at the sending facility | Future (0001/H4): an executed transfer is two-ended — receiving facility opens the episode; HQ coordinates/attests. v1 sync scope covers core Prisoner only; transfer completeness-correlation is a follow-up, not a v2 rework. |
| **Court Production & Remand** | **KEEP** | Built incl. physical/virtual method (scope 4) and the s.118 list (scope 5) | KEEP; print the s.118 list (scope 20). No structural change. |
| **Health & Welfare** | **KEEP** | Built referral/return event-pair (scope 6) | KEEP. Explicitly do NOT add a "medical instructs custody" directive (PRODUCT.md §2 — custody-officer-led is real practice). |
| **Visits** | **KEEP** + SPLIT-READY | Built 6 categories (scope 7) | One decision: split a 7th `prison_minister` category (s.113 — ministers/priests appointed to conduct services; not a relative/volunteer/doctor). |
| **Property & Effects** | **MERGE** (into the admission→release workflow) | Built admission-time record + returned marker (scope 8), but Release never touches it | **MERGE with Release**: release must mark-or-prompt property return (s.62's single duty, split across two features — scope 17; `/architect` owns the exact behavior). |
| **Rehabilitation & Work** | **KEEP** | Built participation-as-status with completion + certificate reference (scope 9) | KEEP. Do not add scheduling/attendance (two primary sources rule it out). |
| **Communication & Requests** | **KEEP** | Built plain complaint log with anonymous-capable subject (scope 10) — the [Secondary]-shape UHRC/Mukutano evidenced | KEEP. Do not grow into case-management. |
| **Documents / Attachments** | **KEEP** + IMPROVE | Generic vault/attachment (scope 11) | IMPROVE-record: extend the *document kind* vocabulary with the real register names (admission, release, property, transfer-of-detainees, gate, exhibits, medical, **Visiting Justices' Book, visitor's book**) — names/purposes only, no field-level schemas (capabilities A12). |

## Facility-level operational domains

| Domain | Verdict | Reality | Change |
|---|---|---|---|
| **Daily routine / headcount / shift handover** | **REMOVE** (never build) | UNKNOWN after five independent attempts; only the "Counting prisoners" regulation title exists | Nothing. Stated closure, RESEARCH.md §13. |
| **Staff duty roster** | **REMOVE** | No rostering system evidenced; only standing-conduct rule titles | Nothing. |
| **Prisoner discipline (procedure)** | **REMOVE** (for now) | Real in outline (s.85 hook); procedure detail contamination-risk-flagged | Keep the s.85 remission-forfeiture hook; no hearing/sanction model without the Regulations 2012 text. |
| **General Incidents** | **REMOVE** | Only the thin escape-response workflow is grounded | Represent escape as a movement/release-adjacent event (decision), not a general incident system. |
| **Facility hierarchy** (block/ward/wing/cell) | **REMOVE** | Flat real terms only | Keep free-text location. |
| **Food quality & quantity accountability** | **RECORD-ONLY** | Visiting Justices test food (s.110(1)(b)) | A note/document capability on the facility record, not a feature. |
| **Escape response** | **DECISION** | OC orders immediate search + police notification (escapes CAF) | Pick its home (release- or movement-adjacent event) in an `/architect` pass; includes reward reference (s.119). |

## Facility→HQ reporting / oversight domains (new tier)

| Domain | Verdict | Reality | Change |
|---|---|---|---|
| **Visiting Justice / official-visitor record receipt** | **MOVE** (HQ tier) | Facility produces VJ-Book extracts + OC comments (s.110(3)); reports minister/judge visitor-book observations (s.111(2)) | Facility records; HQ receives and reviews (capabilities H6; responsibility matrix). Build only when the 0001 network exists. |
| **Periodic sentence review bundles** (s.88) | **MOVE** (HQ-routed) | Four-yearly bundle for life/>7-yr sentences: OIC statement + medical + social worker | Facility produces; HQ routes (H7). Date-driven obligation surfaced in the facility's Overview/forward view. |

## Cross-cutting

| Domain | Verdict | Reality | Change |
|---|---|---|---|
| **Audit trail** | **IMPROVE** (cross-cutting) | Nothing records who changed what/when | Build as a horizontal capability (scope 19); grounded both on Act Second Schedule (record-omission/destruction are offences) and DPPA ss.20-23; identity model is a shared cross-app decision (`_root/scope.md`). |
| **Search** | **IMPROVE** | Prisoners only (scope 13) | Full coverage across all 8 other domains (scope 16, in progress). |
| **Reports** | **IMPROVE** | Base exists (scope 12) but none of the 4 grounded breakdowns | Population breakdowns by age group / capital-offence type / nationality / sentence category (scope 15); UPS-shaped monthly-statistics export (scope 21). |
| **Print & export** | **IMPROVE** | None | Admission slip, release order, s.118 list per the sibling apps' print pattern (scope 20). |
| **Head Office / peer sync** | **NEW** (HQ tier) | Foundation in progress (scope 22) | Exact capabilities in `capabilities-head-office.md` (H1-H9) and the 0001 spec; v1 syncs core Prisoner record only; no HQ prisoners of its own. |

## Workflow seams (the ones that are currently broken or missing)

1. **Admission → Release property lifecycle** (features 8 + 2, scope 17): the single s.62 duty (take at admission, return at release) is implemented as two disconnected features. **MERGE.**
2. **Transfer execution across facilities** (feature 3 + H4): a sending facility closes; a receiving facility opens; only HQ sees both. This is the one workflow the single-installation model cannot complete alone — it decides the order in which cross-facility sync features ship.
3. **Court outcome → facility record** (feature 4 + A3): ~6,528 prisoners/month come back to facilities "released from courts due to various reasons"; the reason vocabulary must match UPS's 13 named entries so the facility's release record is a faithful echo of the court's order.
4. **Reporting duty outward** (C1/C2/C3): three named statute-backed upward flows exist now and get built only against the synced read-model at HQ (capabilities-facility.md Group C × capabilities-head-office.md H6/H7).

## Rules that keep the model honest

- **Never build a domain whose evidence label is UNKNOWN.** The five unbuildable rows above are all UNKNOWN after five attempts; their absence from the sidebar is a finding, not an omission.
- **Never grow a [Secondary]-shaped feature past its ground:** Communication & Requests stays a plain log; Visits stays 6-7 categories; discipline stays out.
- **Facility domain changes never silently write to HQ, and HQ never writes down.** (responsibility-matrix.md guardrails.)