# Pleadli Prisons — Head Office Capability Model

> **Superseded 2026-09-18 by [`../product/01-product-and-operating-models.md`](../product/01-product-and-operating-models.md) section C and [`../product/02-capabilities-domains-workflows.md`](../product/02-capabilities-domains-workflows.md).** The real UPS head-office evidence in section 1 is retained. Section 2 (H1 to H9) is replaced by capabilities HA to HJ, with disclosure tiers replacing full-row read copies.

Two lenses, kept deliberately separate:

1. **What UPS's real Head Office / region / district structure actually does** (act-grounded) — the model a Pleadli HQ installation must mirror, not invent.
2. **What a Pleadli Prisons Head Office installation may do** — governed by `docs/specs/prisons/0001-head-office-peer-sync-network/`: an **aggregator only**, with **no prisoners of its own**, pairing to peer facilities by short code + email-verified approval. Every capability below is checked against that constraint.

Evidence labels as in `capabilities-facility.md`. **Position / capability / act-grounded reality / 0001-allowed role.**

## 1. Real UPS head-office chain (evidence, not design)

### National governance bodies

| Body | Composition & mandate | Act-grounded reality | 0001-allowed role |
|---|---|---|---|
| **Prisons Authority** (ss.9-12) | Minister of Internal Affairs chairs; AG, CGP, DCGP, PS Public Service, senior personnel OIC, 2 presidential appointees (2-yr terms); quorum 5, meets ≥ every 4 months; appeals from Prisons Council | Advises government/President on policy and on CGP/DCGP appointment; **appoints/promotes officers of and above Assistant Superintendent of Prisons** (below DCGP); strategic direction; terms & conditions. **[Primary]** | Out of an installation's reach — a real external decision body. The HQ installation's data must *support* its decisions (records of conduct/promotion inputs) without pretending to be the body. |
| **Prisons Council** (ss.13-15) | CGP chairs, DCGP vice; Directors + HQ heads of prisoners' administration, training, finance, personnel, legal affairs, research & planning, welfare & rehabilitation; all Regional Prisons Commanders; appointed reps at ASP/PO/NCO levels; quorum 10; meets ≥ every 3 months | **Appoints/promotes officers up to Principal Officer I**; disciplinary control at/below PO; advises Authority on rank structure, recruitment/training standards. **[Primary]** | **Decision only.** Promotions from Principal Officer I down are Council-visible. An HQ installation that aggregates facility conduct/performance records can produce the exact inputs the **Station Promotion Board → Regional Promotion Board → HQ General Promotion Board → Council** chain consumes (UPS news). |
| **Commissioner General** (ss.8, 17-38, 61, 73, 77, 87-89, 101, 119-120, 123, 124) | Head of Service | Owns: transfer orders with keep-in-area preference (s.73); release-on-licence for habitual criminals incl. revocation (s.87); parole grants/recalls (s.89); prohibited-articles list posted at every prison (s.101); escape reward offers (s.119); officer rewards/gratuities on judge/magistrate recommendation (s.120); standing orders/administrative instructions and revision (s.7(2), s.77(2)); delegation (s.123); consultation on regulations (s.124). **[Primary]** | **Decision + rule publisher.** The HQ installation is the natural home for the institutional rule layer (standing orders, prohibited-articles list) that pushes down to peer facilities — but per 0001 it must not *operate* any facility's records to do it. |
| **Deputy Commissioner General** (s.8, 123) | Deputy head | Delegated powers (excl. rule-making) (s.123(1)(a)). **[Primary]** | Same as CGP row. |

### HQ structure & functions

| HQ element | Act-grounded reality | Evidence |
|---|---|---|
| **6 Directorates / 23 Departments; ~49,470 approved establishment (2016, Cabinet), ~29% filled; technology/statistics units** | The HQ running apparatus: prisoners' administration, training, finance, personnel, legal affairs, research & planning, welfare & rehabilitation (the seven named s.13(1)(c) function areas), plus a Director of Health Services appointed with the Health Service Commission (s.26(1)), a Prisons Industries and a Farms arm, and a Statistics/ICT division (the Aug-2024 review, and the PMIS/Stats divisions). | **[Primary]** §1, §11.5, §12 |
| **Statistics & monthly abstracts** | UPS publishes granular monthly statistical abstracts (population by convict/remand/debtor, occupancy, productions, releases, escapes, deaths, staff strength by rank, region-by-region) on its own site, mid-2022 → at least June 2026; the PMIS-hosted stream (pmis.ugandaprisons.go.ug) is the "official" report portal. | **[Primary]** §8 |
| **PMIS** | Real, UPS-owned prisoner management information system; module list incl. **admission of prisoners, court attendance and scheduling, biometric authentication, discharge and exit, sentence administration, classification, station management, property management**; confirmed still "pilot phase in two of the biggest prison facilities" (2024); judiciary-system integration "formative and conceptual." | **[Secondary]** §11.8 |
| **Prisons Farms Department** | 3,618 staff (custodial + civilian technical: agronomists, agricultural engineers, vets, forestry, mechanics), 1:6 ratio; real produce/machinery recordkeeping. | **[Primary]** §11.9-11.10 |
| **Prisons Training & the pass-out pipeline** | Cadet ASP / Cadet PO / Recruit Warder&Wardress training cadres (President presides over pass-outs); standing-order guidance for Prison Ministers (s.113(2)). | **[Primary]** site; **[Secondary]** news |
| **Prisons Contracts Committee; Prisons Welfare Fund** (ss.114-115) | Procurement committee under the PPDA Act; Welfare Fund fed by disciplinary-committee fines and donations, disbursed incl. to families of deceased officers. | **[Primary]** §13 |

### Region & district levels

| Body | Act-grounded reality | Evidence |
|---|---|---|
| **Regional Prisons Commander (ss.32-33) + Regional Prisons Committee (s.16)** | Head of each region (19 regions, 270/267 units), supervises all prisons in the region, implements departmental policy; committee advises the Council on appointments/promotions; RPC chairs it, all OICs in region are members, staff officer is secretary. | **[Primary]** §1, §13 |
| **District Prisons Commander (s.34) + District Prisons Committee (s.17)** | District counterpart (~43 districts); committee advises on personnel matters. | **[Primary]** §1 |
| **Regional Promotion Board; HQ General Promotion Board** | RPC-chaired board of all OICs shortlists from Station Promotion Board recommendations; HQ General Board (ACGP-chaired) consolidates; the Council approves (4,996 promotions, Apr 2026, the largest ever). | **[Secondary]** UPS news; rank cutoffs **[Primary]** ss.10/14 |

### Oversight (external, but interacts with HQ/facilities)

| Body | Reality | 0001 relevance |
|---|---|---|
| **Visiting Justices (ss.109-110)** | Minister-appointed (with ex-officio categories incl. UHRC members, judges, ministers, IGG); may inspect part of any facility, test food, inquire into complaints, inspect records; remarks in the Visiting Justices' Book; facility extracts + comments → CGP. | HQ receives the facility-submitted extracts and "reacts". |
| **Ministerial / judicial visits (s.111)** | Cabinet Ministers and Judges may enter any prison and observe; OIC reports entries to the CGP. | As above. |
| **s.112 inspections (IGG, African Commission, NGOs with CGP permission)** | Additional inspection channels. | Read-only context. |

## 2. Pleadli HQ installation — what aggregating a network of facilities can legitimately support

Governing design (0001): HQ has **no prisoners of its own**, no operational case entry; it is a pairing hub + aggregator + institutional-decision workspace. Each capability below is labelled: **AGGREGATE** (derive from synced facility records) · **DIRECTIVE** (push institutional rules down) · **COORDINATE** (facilitate between facilities) · **HOST** (run feature logic only HQ can).

| Capability | Kind | What it does | Grounding (UPS reality it mirrors) |
|---|---|---|---|
| H1 **Peer registry & pairing** | HOST | Verify (short code + email approval) and maintain the list of peer facility installations; the only network join/leave authority. | The 19-region/270-unit structure is real; an installation knows which facility it belongs to. |
| H2 **Aggregated statistics** | AGGREGATE | Roll up facility synced data into the monthly-abstract-style reporting UPS already publishes (population by convict/remand/debtor per region, occupancy, productions, releases, escapes, deaths, staff strength). | UPS's own monthly statistical discipline (§8) — the HQ install reproduces it from data it actually holds (copies of facility records), instead of demanding that facilities re-send numbers. |
| H3 **Institutional rule layer** | DIRECTIVE | Publish/update institutional references facilities consume: standing orders references, the CG's prohibited-articles list (s.101(3)), document-format guidance. | CGP's standing-order and rule-making powers (s.7(2), s.77(2), s.124). |
| H4 **Transfer coordination** | COORDINATE | A facility-initiated transfer (to another peer prison) is CG-ordered under s.73; the HQ installation is the only entity able to see both ends (sending + receiving facility) and confirm the receiving facility's acceptance. | s.73 transfer authority rests with the CGP; keep-in-area preference (s.73(4)). Peer-to-peer transfer is the one operational workflow that *cannot* be completed inside a single installation. |
| H5 **Promotion input consolidation** | AGGREGATE | Assemble facility-side conduct/performance records into the Station → Regional → HQ General Board chain's evidentiary view; promotion decisions remain Council/Authority actions. | The Apr-2026 promotion exercise (4,996) and the Board chain. |
| H6 **Visiting Justice / oversight record receipt** | AGGREGATE | Receive submitted extracts of the Visiting Justices' Book and minister/judge visitor-book observations with OC comments (s.110(3), s.111(2)); a review/triaging view for the regional commander or CGP office. | Facility→CGP reporting duties (facility C1/C2). |
| H7 **Periodic sentence review routing (s.88)** | AGGREGATE | Facilities produce the three-part bundle (OC statement + medical + social worker) every 4 years for life/>7-yr sentences; HQ routes/records its upward progress to the Minister. | s.88 statutory review of sentences. |
| H8 **Regional & district commander workspace** | AGGREGATE | A Regional or District Prisons Commander views the facilities under their command as read-only across every aggregated record — oversight without operational access. | RPC administration/supervision mandate (s.32-33); District Commander (s.34). |
| H9 **Search across the network** | AGGREGATE | Find a prisoner by traversing facility-local records (each facility owns its data; HQ holds copies for read). | UPS runs 270 units; prisoners move between them (s.73); knowing *where a named individual currently is* is a real national need JLOS's integration strategy anticipates. |

**What the HQ installation must NOT be** (0001 constraints, restated):
- No prisoners of its own, no operational case entry at HQ (no admission/custody/release screens operating a facility's day-to-day).
- Not a second authoritative copy — facilities remain authoritative; HQ copies are for read/aggregation (see `responsibility-matrix.md`).
- Not the official PMIS replacement — PMIS is UPS's, still piloting; an independent vendor's working answer to the same gap.
- Not a decision engine for promotions, licence release, or parole — those are Council/Authority/CGP acts; HQ merely consolidates inputs and records outcomes.

## 3. Capability mapping to 0001 spec documents

| 0001 doc | Capabilities it owns |
|---|---|
| `0001-onboarding-and-activation-code.md` | H1 (join/pair), H2 seed |
| `0002-peer-registration-and-pairing.md` | H1 (verification), H9 discovery basis |
| `0003-sync-protocol-and-head-office-management.md` | H2, H3, H4, H5, H6, H7, H8 |
| `rationale.md` | the aggregator-only justification, now anchored by facility C1-C3, H4, H6, H7 above |
| `verify.md` | acceptance criteria for H1-H9 where buildable |