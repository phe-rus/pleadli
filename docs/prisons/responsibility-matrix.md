# Pleadli Prisons — Facility ↔ Head Office Responsibility & Data-Ownership Matrix

> **Extended 2026-09-18 by [`product-map/03-ownership-information-flow-sync-offline.md`](product-map/03-ownership-information-flow-sync-offline.md).** The rule and statutory anchors here stand. New: custody episode and per-facility stays, ownership change only through confirmed transfer, disclosure tiers T0 to T4, and HQ-owned records (transfer orders, decisions, directives). The "HQ holds a read copy" column is replaced by locator entries and attested returns.

The answer to: **who is authoritative for each class of record, who may read it, who decides on it, and who coordinates it.**

## The rule

> **Facility is authoritative for its own operational records.** Head Office (and Region/District command) **reads and decides institutionally** — it never edits a facility's operational record, and it never operates prisoners of its own. Head Office's copy is a **read/reference copy** for aggregation and institutional action.

Grounded in three named statutory examples (RESEARCH.md §13 / PRODUCT.md §3): the Visiting Justices' Book extract duty (s.110(3)), the visitor's-book observation report to the CGP (s.111(2)), and the s.88 periodic sentence review bundle — all follow the same shape: **facility records/ produces → HQ reviews/routes/decides institutionally.**

## Legend

- **F = Facility** (authoritative editor)
- **R/DC = Region / District Commander** (read-only institutional oversight)
- **HQ = Head Office installation** (0001: aggregator only, read-only copies)
- **CGP/Council/Authority = external decision bodies** (s.10, s.14 — app records outcomes, never takes the decision itself)
- **○ = may edit (the role who owns the record)**
- **● = read / reference**
- **◎ = decides institutionally** (decision taken outside the app; the app records the outcome)
- **↔ = coordinated** (both ends necessary)

## Person-level records

| Record class | F | R/DC | HQ | CGP/Council/Authority | Court / external | Statutory anchor |
|---|---|---|---|---|---|---|
| Admission particulars (instrument, warrants, date) | **○** | ● | ● | — | produces the warrant (s.58) | s.58, s.61 |
| Custody status (convicted / unconvicted / civil) | **○** | ● | ● | — | — | s.64 |
| Court production & remand (physical/virtual) | **○** | ● | ● | — | ↔ on outcome | s.67, s.118 |
| Releases — normal discharge | **○** | ● | ● | — | — (remission rules are statute) | s.83-85 |
| Releases — court-driven ("due to various reasons") | **○** | ● | ● | — | **↔** court order | s.63(2); Jan-2025 abstract reasons |
| Transfer (out) | **○** + **↔** receiving facility | **◎** (RPC coordination) | **◎** coordination hub | **◎** orders it (s.73) | — | s.73, s.78(2) |
| Medical movements (referral/return; mental-hospital removal) | **○** | ● | ● | — | magistrate confirms s.74 removal | s.74-76 |
| Visits (authorization + attendance, 6-7 types) | **○** | ● | ● | — | — | s.63-65, s.109-113 |
| Property & effects (admission → release) | **○** (OC personally accountable) | ● | ● | — | — | s.62, s.30(2)(a) |
| Health & welfare events | **○** | ● | ● | — | — | s.26, s.57, s.59-60 |
| Rehabilitation & work participation + certification | **○** | ● | ● | UVTAB issues certificate (external) | — | §11.9-11.10 |
| Communication & requests (Mukutano / application book) | **○** | ● | ● | — | — | UHRC report, s.110(1)(c) |
| Prisoner discipline | **○** outcome recorded; decision is OC/administer per rules | ● | ● | — | magistrate if charged (s.95) | s.85, s.95 |
| Documents & registers (incl. VJ Book, visitor's book) | **○** | ● | ● | — | — | s.30(2)(d), s.110, s.111, UHRC list |

## Institutional / staff records

| Record class | F | R/DC | HQ | Decision body | External | Anchor |
|---|---|---|---|---|---|---|
| Staff establishment & profile (rank ladder) | **●** (read context) | **●** | **○** (national establishment, fed by UPS) | — | — | s.5; Mar-2025 rank table |
| Staff conduct/performance records (the Station Promotion Board's raw material) | **○** (facility documents what happens here) | **●** (Regional Board) | **●** (General Board) | Council ≤ PO I; Authority ≥ ASP (s.14, s.10) | — | Act Second Schedule; Apr-2026 exercise |
| Staff discipline (junior ranks) | **○** (OC delegated) | **●** | ● | Council disciplinary control ≤ PO | — | s.14(1)(d) |
| Staff duty roster / shift handover | **UNKNOWN** — not buildable | | | | | §11.5 |
| Prohibited-articles list | **●** (posted at the gate, s.101(3)) | **●** | **◎** publisher (CG list) | **◎** CG signs it | — | s.101 |

## Facility→HQ reporting duties (mandatory upward flow)

| Duty | F | R/DC | HQ | Destination | Anchor |
|---|---|---|---|---|---|
| Visiting Justices' Book extract + OC comments | **○** produces | — | **◎** receives/reacts | CGP | s.110(3) |
| Minister/Judge visitor-book observations | **○** reports | — | **◎** receives | CGP | s.111(2) |
| s.88 review bundle (life / >7 yr, every 4 yrs) — OIC statement + medical + social worker | **○** produces | **●** | **◎** routes/records | Minister (via CGP) | s.88 |
| s.95 prisoner charged before magistrate for discipline | **○** refers | — | — | Court | s.95 |
| Escape: search + police notification / reward | **○** acts | **●** | **●** | police (notification), CGP (reward s.119) | s.79, s.119 |
| Wrongful-release / parole / licence outcomes | **○** executes | — | **●** | **◎** CG decides (s.87, s.89) | s.87, s.89 |

## What this means for the 0001 sync protocol

1. **Sync direction is always F → HQ** (one-way; facility keeps authority). HQ never writes operational records down to a facility.
2. **The HQ copy is a read model.** Aggregation, statistics (H2), promotion consolidation (H5), oversight-record receipt (H6/H7), and the regional commander view (H8) all read it; nothing but pairing/onboarding writes to it.
3. **The one genuinely two-ended operational workflow is transfer (H4)**: sending facility closes a custody episode `transferring-out`; the receiving facility opens `transferring-in`; only HQ can see/completeness-check both ends and attest the event. Pairing identity (which peer is "the" receiving facility for a named prisoner area) is HQ data.
4. **Decisions are recorded, not taken**: a release-on-licence (s.87) or parole (s.89) is the CG's act; the app records the outcome a facility executes. Where the decision input must be visible to both levels (facility proposed date, HQ confirmed), the read-model covers it.
5. **The rule layer is HQ → F (H3, DIREC behavioural only)**: the CG's standing orders / prohibited-articles list / document formats are the one downstream push; it changes references, never data.

## Guardrails

- A facility row must never be silently amended by an upstream event; conflicts resolve on the facility (authoritative) side, and HQ detects divergence rather than overwrites.
- Regional/District commander read access is *scoped* (their region/district only) — real structure is 19 regions / 43 districts / ~270 units (RESEARCH.md §1, §13), not one flat blob.
- No HQ prisoner-of-its-own (0001 constraint) — the matrix's "HQ ●" column is read-only *because* HQ holds copies, never originals.