# Pleadli Prisons — IA, Navigation & Screen Proposal

> **Superseded 2026-09-18 by [`product-map/08-application-structure.md`](product-map/08-application-structure.md).** The flat-nav decision (D6) is reopened because the operating model changed. Kept for history and for the screen notes on Visits and the add-record panel, which carry over.

A proposal for confirmation — not a locked structure. Aligned with the built nav (`apps/prisons/src/data/navigationItems.ts`), the 2026-09-18 IA fixes recorded in `docs/scope/prisons/scope.md` (feature 22), and the two-tier facility/HQ reality captured in `capabilities-head-office.md` and `responsibility-matrix.md`.

## 1. Entry: two install roles, one app

First-launch flow (scope 22, settled): **welcome → role choice → Prison Facility | Prisons Head Quarters**. A dev-only role switcher flips the real `hq_config.is_head_office` flag. Everything below assumes a role has been chosen.

- **Facility path** — the existing lightweight tier: no login gate for routine work; officer login exists for privileged actions (scope 22, confirmed).
- **HQ path** — gated: activation code (offline-verifiable, signed) → HQ login → Settings confirms the responsible officer → network permissions → Save → Overview.

## 2. Facility IA

Current nav (built) is correct in shape; the proposal keeps it and resolves the open items.

```
Facility
├── Overview                  — the "what needs attention now" surface + live stats
│                               (remand-threshold flags, court sessions due, parole
│                               windows, hospitalised-awaiting-return — derived stats only)
├── Search                    — cross-domain (add Visits, Requests, Court Productions,
│                               Releases, Transfers, Health Events, Property, Programmes)
├── Officers                  — officers of this facility (all roles; was stapled onto Settings)
├── Prisoners                 — the core record + workspace:
│     ├── admission (incl. honest "document pending" state)
│     ├── custody / status / remand eligibility
│     ├── property & effects (↔ release workflow)
│     ├── health & welfare events
│     ├── visits (authorization + attendance; prison_minister if decided)
│     ├── releases (court & normal, with UPS's 13 reason vocabulary)
│     ├── transfers
│     ├── rehabilitation & work (+ certification)
│     ├── requests & complaints (per-prisoner view)
│     └── documents (registers incl. VJ Book / visitor's book notes)
├── Visits                    — standalone top-level (findable without opening a prisoner);
│                               §4.5 — the visit log across every prisoner of this facility,
│                               not just the visits of whichever prisoner one happens to be in
├── Court Production & Remand — productions (physical/virtual) + the s.118 list
├── Requests                  — the facility complaint log (Mukutano)
├── Reports                   — a written report, a document (current behavior)
└── Settings                  — real configuration only (appearance; network/sync status)
```

**Deliberately NOT top-level, and why:**
- **Admission** — a receiving workflow inside the Prisoner workspace, not a browsable surface.
- **Release / Transfer / Health / Property / Programme** — per-person workflow tabs, not flat lists.
- **Headcount / daily routine / duty roster / incident / prisoner discipline** — UNKNOWN, not built; a placeholder entry would misrepresent the product (facility-capabilities Group B).
- **Documents as a standalone register browser** — register names are [Primary], field schemas UNKNOWN; a flat document list inside the Prisoner workspace is the honest scope.

## 3. Head Office IA

HQ has no prisoners; every row below reads the synced read-model only.

```
Head Quarters
├── Overview                  — aggregate population & occupancy across every paired
│                               facility; "unverified/revoked/syncing" attention list
├── Search                    — cross-facility prisoner search (which facility holds whom)
├── Facilities                — the roster: facility info, last-synced status, pairing
│                               verification, token revocation (HQ-only)
├── Officers                  — HQ's own officers
├── Reports                   — aggregation to UPS-shaped statistics + written reports
└── Settings                  — tunnel/config, network permissions, verification identity
```

**Facility-only destinations disappear for HQ** (Prisoners, Visits, Court Production & Remand, Requests) — already enforced by `facilityOnly` filtering in `sidebar-provider.tsx`, matching 0001's "no prisoners of its own."

## 4. Screen proposals (key surfaces)

### 4.1 Overview (facility)
- **Count banner**: population "Unlock" framing (the UPS-native word), split Convicts / Remands / Debtors, versus approved capacity (occupancy).
- **Attention cards** (derived, real only): remand threshold passed (60/180 days), court sessions due (s.118 list), parole windows (3+ yr sentences, within 6 months of release date — s.89), hospitalised prisoners awaiting return, unreturned property at release.
- **Links**: to Search, Court Production & Remand, Requests.

### 4.2 Prisoner workspace
- Header: statutory category (convicted / unconvicted / civil), current status, location (free-text ward/cell), key dates (admission, next court, release entitlement).
- Tabbed: Custody · Property · Health · Visits · Movements · Releases · Programme · Requests · Documents.
- Documents tab surface: register-kind list + attachments, with the note that VJ-Book/visitor-book notes (C1/C2) are record-level, not case files.

### 4.3 Facilities roster (HQ)
- Columns: facility name, ID/number, location, region (the real 19-region vocabulary), head officer, pairing status (pending_verification → active), last-synced-at, actions (verify, revoke token). Read-only detail opens a facility's aggregate view.

### 4.4 Search
- Single box, result groups by domain (person / visit / request / production / release / transfer / health / property / programme). HQ: a "facility holds" dimension — result rows show which paired facility the record came from.

### 4.5 Visits (standalone destination)
- The visit log of this facility as a whole — authorization and attendance as two concepts (RESEARCH.md §9-11), every visit type, per-column search (prisoner, visitor, type, status, date, supervising officer), prisoner ID linking through to the person's workspace.
- Purpose is findability, not duplication: the same records surface inside the Prisoner workspace as that person's own Visits tab; this page is the facility-wide view of the same ledger, exactly as Requests already is.

### 4.6 Add-record motion panel (the facility-wide entry point)
- **Settled this session (2026-09-18):** the single "Add record" button in the header opens a **framer-motion panel**, not the `@pleadli/ui` Drawer — a right-side sheet with a spring slide (same animation language as the onboarding gates), a backdrop click and Escape to close, and the existing dirty-confirm guard.
- Content is a **grid of record types**, one card per addable record, each mapping to a real built form: Admit prisoner, Visit, Court production, Transfer, Health & welfare event, Release, Property & effects, Programme participation, Request/complaint, Officer.
- Selecting a card is step-1→2: person-scoped records (Visit, Court production, Transfer, Health, Release, Property, Programme) ask which prisoner next (a search, not a list — `prisonerFullName`/national ID, as the embryonic `PrisonerPicker` already did); non-person records (Admit, Officer, and Request — whose own form can stay anonymous) go straight to the form. Three real steps, never a nested tree: **grid → prisoner (when needed) → form.**
- The grid is deliberately the evidence-mapped set of records (domain-workflow-model.md verdicts): nothing UNKNOWN gets a card. Officer is included because a facility's own roster is a first-class record here; it is not shown on a Head Office install (Headers already hides the whole panel there).

## 5. Decisions this proposal asks for

| # | Decision | Options | Who |
|---|---|---|---|
| D1 | Homes for population statistics | (a) Overview only (current) — breakdowns by age/capital-offence-type/nationality/sentence category live there and export; (b) a separate Statistics destination | `/architect` — scope 15/21 |
| D2 | 7th visit type `prison_minister` (s.113) | Add / defer | product — flagged in PRODUCT.md §2 |
| D3 | Escape event home | Release-adjacent / movement-adjacent / friends-of-both | `/architect` — PRODUCT.md §3 |
| D4 | Admission-time "document pending" representation | enum extension / separate flag / free-text | `/architect` — scope 18 |
| D5 | Where VJ-Book/visitor-book receipts surface | Prisoner workspace Documents / facility-level Register view / HQ receipt tray (H6) | product + `/architect` after 0001 |
| D6 | Facility dock vs flat nav | Flat (current); reconsider only if the facility tree grows groups | — |

**Settled this session (2026-09-18), do not re-ask:** the Add-record surface is a framer-motion panel (§4.6) with a grid of record types, not the Drawer component; Visits is a standalone facility page (§4.5); the flat nav (`navigationItems.ts`) is the approved shape and stays — the work is aligning its entries, ordering and comments to the `navigation.md` trees, not regrouping it (D6).

## 6. Read-only grounding

Every destination above corresponds to a facility capability (Group A-C) or HQ capability (H1-H9). Any nav entry that would require a capability labelled UNKNOWN or NOT-BUILDABLE is deliberately absent. This is the same discipline as the rest of the design: the navigation is a map of what is evidenced, not a menu of what we wish were real.