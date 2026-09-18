# 01. Product definition, facility operating model, Head Office operating model

Evidence tags: `[P]` primary, `[S]` secondary, `[I]` international baseline verified against the Nelson Mandela Rules text, `[H]` hypothesis needing field validation, `[U]` unknown. See README.

---

## A. Product definition

### A.1 What Pleadli Prisons is

> **Pleadli Prisons is software through which a prison facility can actually operate its institutional responsibilities, not merely record prisoners, with controlled connectivity to a wider Prison Service network.**

> **Pleadli Prisons Head Office is software through which the Prison Service can oversee, coordinate, consolidate and manage its facilities without turning every facility into one shared database.**

It is one product with two operating environments, not one dashboard with two permission levels. A facility runs custody, legal, welfare, movement, security and administrative work. Head Office runs estate oversight, coordination, consolidation and institutional decisions. They share a codebase, a document model, an audit model and an exchange protocol. They do not share screens, workflows or a database.

### A.2 What it is not

A prisoner CRUD app, a digital register, a prisoner database, a dashboard, a national database, a generic case manager, a collection of forms, a clinical records system, a replacement for PMIS or a claim to be UPS's official system.

### A.3 The unit of design is the obligation, not the record

A prison is a place of continuous obligations. Every one has an owner, a due time, and a proof of completion:

| Obligation | Anchor | Owed to |
|---|---|---|
| Hold each person only under a valid instrument | s.58, s.63(2) [P] | Courts, the person |
| Discharge on entitlement, before noon | s.83 [P] | The person |
| Produce a person to court when ordered | s.67 [P] | Court |
| File the list of prisoners awaiting trial before a High Court session | s.118 [P] | High Court |
| Return property at release, keep an inventory, answer for loss | s.62, s.30(2)(a) [P] | The person |
| Keep unconvicted apart from convicted, men from women, never admit a juvenile to an adult prison | s.29, s.58(7), s.64 [P] | Law |
| Keep hospitalised prisoners under custody until the doctor notifies end of care | ss.75-76 [P] | Custody chain |
| Extract Visiting Justices' remarks, add comments, send to the Commissioner General | s.110(3) [P] | HQ |
| Report Minister and Judge observations to the Commissioner General | s.111(2) [P] | HQ |
| Produce the four-yearly review bundle for life or over 7 years | s.88 [P] | Minister via HQ |
| Notify next of kin of death, serious illness or transfer; report custodial death or serious injury to an independent authority | Mandela r68, r69, r71 [I]; Inquests Act ss.4, 9, 10(4) [P] | Family, coroner |
| Know at any moment who is held and where | UPS "Unlock" figure [P], "Counting prisoners" regulation title [S] | Institution |
| Keep an attributable, unaltered record | Prisons Act Sch.2 (omitting entries and destroying records are disciplinary offences) [P]; Mandela r6 secure audit trail [I]; DPPA ss.20-23 [P] | Institution, regulators |

The system's job is to surface each obligation before it is missed, guide the officer through the procedure that discharges it, and keep the proof. **The record is the by-product of the work, not the work.**

### A.4 The officer's verbs and the mechanism that serves each

| Verb | What an officer needs | Mechanism |
|---|---|---|
| Know | Who is here, where, in what legal state, what is due | Today board, prisoner file header ("what do I need to know right now") |
| Find | Any person, instrument, event or document quickly | Search-first, registers, filed views |
| Decide | Whether a legal precondition is met | Guided procedure with statutory gates and named authoriser |
| Record | What happened, attributably | Events and documents written by the procedure itself |
| Coordinate | Who else must act (officer, court, HQ, hospital) | Obligations assigned to roles, dispatches, exchange packages |
| Complete | That every step of a procedure is done | Checklists that block on hard gates, warn on soft ones |
| Follow up | What is still owed | Obligation engine, overdue and next-7-days views |
| Hand over | Open matters to the next shift, the next facility, the next officer | Handover snapshot, transfer dossier, open-items list |

### A.5 The two questions every screen must answer

For a person: **what do I need to know about this person right now**, and **what has happened to this person during their custody at this institution**. For a facility: **what is happening in this prison, what requires attention, what work needs doing**. A screen that answers neither is a register or report and belongs in Registers or Returns, not in the working surface.

### A.6 Institutional model: eight responsibilities

| Responsibility | Content | Evidence |
|---|---|---|
| Custody | Lawful reception, holding, movement, discharge | Act ss.5, 58 to 83 [P] |
| Legal compliance | Instruments, sentences, remand clocks, court obligations, reviews | Constitution Art. 23(6), Act ss.66, 67, 84, 88, 89, 118 [P] |
| Order and security | Count, gate, searches, incidents, discipline, confinement | s.62, s.79, s.81, s.85, s.101 to 102, Sch.2 [P]; Mandela r36 to 46 [I] |
| Care and welfare | Health coordination, infants with mothers, women prisoners, vulnerabilities | ss.26, 57, 59, 60, 74 to 76 [P] |
| Contact and access | Visits, legal access, letters, requests and complaints | ss.64, 78, 109 to 113 [P]; Mukutano [P/S] |
| Rehabilitation and work | Education, vocational training, farms, industries, certification | s.5 [P]; Farms report, UVTAB [P/S] |
| Administration | Facility profile, capacity, staff, stores, accounts, registers | ss.30, 35 [P] |
| Accountability | Audit, returns, oversight submissions, inspection response | ss.110, 111 [P]; Mandela r83 to 85 [I] |

---

## B. Facility operating model

### B.1 The rhythm of a facility

Only some of a facility's rhythm is evidenced. Marked honestly, because the model must not build a day that does not exist.

| Rhythm | Evidence |
|---|---|
| Continuous 24-hour custody; the facility is never "closed" | s.5 [P] |
| A population figure "as of" a time, called **Unlock** by UPS | CG paper, Feb 2024 [P] |
| A counting regulation exists; its content is unread | Title only [S] |
| Daily court flow (about 1,726 productions a day nationally), ~10,000 new admissions and ~6,500 court releases a month nationally | UPS abstracts [P] |
| Discharge before noon on the entitlement day | s.83 [P] |
| Monthly statistical return culture (monthly abstracts by region) | UPS abstracts [P] |
| Visiting Monday to Friday 8am to 5pm; gate identification, search, reception registration, supervised visit | Justice Centres Uganda [S] |
| One hour in the open air daily | HRW 2011 citing Ugandan law [S, dated] |
| Human Rights Committee (Mukutano) files monthly reports to a staff committee | UHRC 2023 [P], FCDO [S] |
| Unlock and lock-up times, parade, shift patterns, handover | **[U] field validation required (R-03)** |

### B.2 Functions at a facility (by function, not title)

Titles and delegation are provisional (R-07). The model is built on functions and the authority the Act attaches to them.

| Function | Statutory anchor | Notes |
|---|---|---|
| Officer in Charge (OIC) | s.30 [P] | Answers for admission verification, property, records, discharge, cell confinement, escape response. Statutory authority attaches here; delegation practice [U]. |
| Records and reception work | Registers named by UHRC [P] | The people who verify warrants, maintain registers, prepare returns [H] |
| Custody and duty officers | Rank ladder, Sch.2 duties [P] | Count, supervision, movement, incident response [H] |
| Gate | Gate register [P]; "duties of gatekeeper" [S] | Persons, vehicles, items in and out |
| Medical officer or health liaison | s.26, s.2 definition [P] | May be a Ministry of Health district officer, not a UPS employee |
| Welfare and social work | s.88(c) [P], Welfare Officer [S] | Reintegration assessment, welfare channel |
| Prison Minister | s.113 [P] | Access not to be refused unless the prisoner objects |
| Female officers | s.60 [P] | Female prisoners at all times under female officers |
| Inmate Human Rights Committee | UHRC [P] | Elected committee, complaints channel |
| External: Visiting Justices, Ministers, Judges, IGG, UHRC, NGOs | ss.109 to 112 [P] | No accounts; their remarks are recorded by the facility |

### B.3 What each function needs to know, decide, record, hand over

| Function | Needs to know | Decides | Records | Hands over |
|---|---|---|---|---|
| OIC | Count and discrepancies; who is due for discharge, court, transfer; remand thresholds passed; incidents open; complaints unanswered; returns due; oversight submissions pending; capacity | Accept or refuse admission; authorise discharge; confine a prisoner; declare an escape; attest returns | Authorisations, comments on VJ extracts, attestations | Open matters at posting change |
| Reception | Instrument type and validity; identity; category; documents pending | Whether the instrument is sufficient; what is pending | Admission, instrument, property inventory, injuries reported | Prisoner file to custody officers |
| Custody or duty officer | Who is where; who is due to move; who is hospitalised; open occurrences | Count reconciliation; when to escalate | Count, occurrences, movements | Shift handover |
| Gate | Who is expected (visitors, court trips, transfers); what is prohibited | Whether entry is authorised | Gate events | Gate log |
| Health liaison | Who needs referral; who is away at hospital | Whether to refer (s.75); emergency removal by OIC (s.75) | Health movement, notification of return | Return notifications |
| Welfare | Long-sentence review dates; infants; vulnerable prisoners | Whether to raise a welfare flag | Assessments, s.88 component | Review bundle |

### B.4 The facility's answers to the required questions

For each major record class: who authorises, who else must act, what stays local, what goes to HQ, what the facility must produce locally, what happens offline. Tiers T0 to T4 are defined in 03.

| Record class | Authorised by | Needs another officer or institution | Local only (T0) | Goes to HQ | Produced locally | Offline |
|---|---|---|---|---|---|---|
| Admission and instrument | OIC or delegate verifies warrant (s.58) [P] | Court issued the instrument | Full file, injuries, family and next of kin | T1 locator and event | Admission slip, register line | Full |
| Sentence and remand state | Derived from instruments | Court orders, Minister for s.88 outcomes | Full computation | T1 status, T2 in returns | Release and review dates | Full |
| Court diary and productions | OIC | Court orders (s.67), court outcomes | Escort and production detail | T1 event on outcomes that change custody | s.118 list, production sheet | Full; virtual production depends on the site's equipment |
| Discharge | OIC responsible (s.83) [P] | Court order, HQ decision for licence and parole | Property handback, medical release note | T1 event | Discharge certificate, release order | Full |
| Transfer out and in | CG order (s.73) [P] | Receiving facility, HQ | Dossier contents | T1 event and locator move | Transfer letter (s.78(2)), dossier | Order and dossier delivery need exchange or file carrier |
| Health movements | Medical officer advice or OIC emergency (s.75) [P] | Hospital notifies OIC when care ends (s.76) [P] | Clinical detail (never stored) | T1 event (hospitalised, returned) | Referral note | Full |
| Visits | Officer; researcher visits need CG (S) | Supervising officer | Visitor personal data | None (T2 counts only) | Visit slip | Full |
| Property | OIC accountable (s.30) | Witnessing officer [H] | Inventory | None | Inventory, receipt | Full |
| Requests and complaints | OIC | Staff committee, Visiting Justices | Full text and identity | T2 counts by category; escalations by workflow | Response note | Full |
| Incidents | OIC | Police, coroner, next of kin, HQ | Full report | T1 event (escape, death), T3 notification package | Incident report | Full; notifications queue |
| Discipline and confinement | OIC | Magistrate for s.95 referral | Full | T2 counts | Charge and outcome record | Full |
| Count and duty log | Counting officer, OIC | None | Full | T2 population as of count | Count sheet, handover | Full |
| Monthly return | OIC attests | HQ receives | Underlying rows | T2 return | The return itself | Prepared offline, submitted on contact |
| Accounts and access | Facility admin, OIC | None | Everything | Status only (T1) | Access report | Full |

### B.5 The facility as a first-class entity

The facility has its own state, computed from its own records, and that state is the facility home.

| Facet | Contents |
|---|---|
| Identity | Name, number or code, region (one of the 19 UPS regions), district, location. Identity changes are real events: Moroto Women was split from Moroto Main in the Jan 2025 abstract, raising units from 266 to 267 [P]. The model must support split, merge, rename, closure. |
| Capacity | Approved capacity (a real UPS datum [P]), optional facility-defined accommodation units |
| Population | Held now by category and sex, occupancy, last count |
| Obligations | Open by kind and severity, overdue |
| Staffing | Approved vs posted establishment by rank ladder (21 ranks [P]) as context; rosters [U] |
| Registers | Which statutory registers it keeps and their state |
| Oversight | Region and district commanders, last Visiting Justice entry, pending extract |
| Node | Node id, keys, version, backup age, workstations, connectivity, exchange lag |

### B.6 The facility home ("Today")

Answers: **what is happening in this prison, what requires attention, what work needs doing.** Not an analytics page.

1. **Count strip.** Last count (as-of time, by whom); population now, derived from custody state, by category and sex; occupancy against approved capacity; discrepancy flag if the last declared count differs from the derived expectation.
2. **Due queue.** Obligations grouped overdue, due today, next 7 days. Sources: discharges due today and the before-noon rule; court productions today; hospital returns awaited; transfers expected, in transit, unconfirmed; s.118 lists due before sessions; remand thresholds passed (60 and 180 days, Art. 23(6)) [P]; long-sentence reviews (s.88) and parole windows (s.89) [P]; property outstanding for scheduled discharges; admissions with documents pending; complaints awaiting response; notifications owed after an incident; VJ extracts and observations to submit; monthly return due; directives unacknowledged; backup overdue; exchange behind.
3. **Watch and handover.** Open occurrences; handover snapshot to sign.
4. **Exceptions.** Integrity problems: count discrepancy, separation conflicts in accommodation, capacity exceeded, instruments missing beyond a configurable period.
5. **Node and connectivity strip.** State, last exchange, backup age, version.

Statistics tiles, trend charts and breakdowns leave the working surface and live under Returns and Reports (08).

### B.7 Provisional operations: the policy and the minimal shapes

**Why these exist.** The earlier docs classified count, handover, incidents, discipline and duty as "never build" after five failed desk searches. This phase rejects that: a prison that cannot say who it holds and where, and cannot record an escape or a confinement, is not operating. What is unknown is the **procedure**, not the responsibility.

**Provisional module rules.**
1. The record shape is the minimum implied by statute, the Mandela baseline [I], or structural necessity. It is labelled Provisional in product, UI and docs.
2. Vocabularies (sanction types, incident kinds, count kinds, unit kinds) are configuration, seeded only with evidenced values.
3. It is never presented as UPS-standard procedure, and never feeds HQ statistics or becomes a required workflow until the linked research item is closed by field validation.
4. It may be piloted at a willing facility to learn the real procedure; the pilot is the research method.
5. Hard rules that **are** evidenced are enforced from day one (for example the 14-day limit on cell confinement).

| Module | Real responsibility | Minimal shape | Evidenced hard rules | Not assumed | Research |
|---|---|---|---|---|---|
| **Count** | Know who is held and where | `count_event`: as-of time, kind (configurable: unlock, lock-up, ad hoc), counted by, verified by, counted total, optional breakdown, expected total (derived), discrepancy, resolution | UPS reports an Unlock figure [P] | Frequency, parade steps, who verifies, escalation ladder | R-03 |
| **Duty log and handover** | Continuity between shifts | `occurrence`: time, recorded by, text, linked entities; handover = signed snapshot of open occurrences, count state, pending obligations | Sch.2 officer offences: neglect, absence, sleeping on duty [P] | Shift patterns, post names, rosters | R-03, R-07 |
| **Incidents** | React to and report events | `incident`: kind (seed: escape, recapture, death, serious injury, contraband seized, use of force, disturbance, other), time, place, people, description, actions, notification obligations, status | Escape: OIC orders search and notifies police [S]; re-arrest warrant s.79, reward s.119 [P]; death: Inquests Act s.4(2)(a), s.9, s.10(4) [P], next of kin r69, independent report r71, remains destination r8 [I]; seizure of prohibited articles s.101 to 102 [P] | Severity scale, internal investigation procedure | R-09 |
| **Discipline and confinement** | Maintain order lawfully | `disciplinary_matter`: prisoner, report, alleged conduct, hearing, finding, sanctions (configurable), remission effect s.85, referral s.95; `confinement`: kind, authoriser, start, reason, review, end | s.81: OIC, up to 14 days, only for violence, escape risk or recapture, medical isolation recommendation, or discipline; abuses prohibited [P]. Mandela: no indefinite or prolonged (>15 consecutive days) solitary, no reduced diet, no blanket family-contact ban, restraints never a sanction, last resort with independent review r43 to 45; healthcare staff play no part in imposing sanctions but monitor daily and report harm r46 [I] | Offence taxonomy, sanction ladder, hearing officer rank | R-08 |
| **Accommodation** | Place people lawfully and count occupancy | Facility-defined `unit` (label, kind, designation, capacity) and `placement` history | Sex separation s.29, s.60; unconvicted apart from convicted s.64; civil prisoners apart (r11); no juveniles in adult prisons s.58(7) [P/I] | A national block, wing, cell hierarchy | R-10 |
| **Gate** | Control who and what crosses the boundary | `gate_event`: time, direction, subject (person, vehicle, item), purpose, authoriser, searched, linked visit or trip | Gate and exhibits registers exist [P names] | Register formats | R-04 |

**A caution recorded from this phase.** The earlier "punishment diet with medical fitness certificate" text recovered from search snippets is the style of colonial-era Commonwealth regulations that the Mandela Rules superseded: r43(1)(d) prohibits reduction of diet and r46 removes healthcare staff from any role in imposing sanctions. Do not model discipline from that text.

**Deferred, not provisional:** food and rations (statutory hook is Visiting Justices testing food, s.110(1)(b) [P]; ration statement would derive from the count, R-11); general stores and vehicles (s.30(2)(a) covers prisoners' property, not general stores, R-12).

---

## C. Head Office operating model

### C.1 What Head Office is

The institutional level of the Prison Service: the Commissioner General's office and the Directorates (Prisoners' Administration, Legal Affairs, Welfare and Rehabilitation, Personnel, Planning, Statistics and ICT) [P], with Regional and District Commanders as scoped oversight [P]. It coordinates 266 to 270 custodial units across 19 regions [P]. Its decisions are institutional: transfers, parole, licence, review outcomes, directives. Its data is institutional: the registry of facilities, consolidated returns, oversight submissions, decisions, directives.

It does not operate a facility's records, does not hold prisoners of its own, and is not the decision body for Council or Authority acts (promotions). It records those outcomes.

### C.2 HQ users (by function)

| Function | Responsibility | Evidence |
|---|---|---|
| Network administration | Facility trust lifecycle, versions, keys | Statistics and ICT division [P] |
| Prisoners' administration | Transfers, capacity, population, records policy | s.13(1)(c) function areas [P] |
| Legal affairs | Oversight submissions, parole, licence, s.88 bundles | s.13(1)(c), ss.87 to 89 [P] |
| Statistics and planning | Consolidation, monthly abstract | UPS abstracts [P] |
| Health services | Mortality, referral reporting | s.26 Director of Health Services [P] |
| Welfare and rehabilitation | Programme and welfare oversight | s.13(1)(c) [P] |
| Commissioner General's office | Decisions recorded: transfer orders, parole, licence, rewards | ss.73, 87, 89, 119 [P] |
| Regional and District Commanders | Scoped read oversight of their facilities | ss.32 to 34 [P] |

Role vocabulary is provisional (R-07, R-23).

### C.3 Head Office capabilities with the eight required answers

| Capability | Who uses it | Receives | Creates | Can change | Stays facility-owned | Communicated back to facilities | If the facility is offline |
|---|---|---|---|---|---|---|---|
| **HA Network administration** | Network admin | Registration requests, health, versions | Registry entries, trust decisions (verify, suspend, revoke, decommission) | Registry and trust state | Everything operational | Trust state, minimum version, endpoints via inbox | Trust change takes effect at HQ ingress immediately; facility learns on next contact |
| **HB Estate awareness** | All HQ | Locator events, returns, health | Nothing (read model) | Nothing | All facility data | Nothing | Shows last-known values with "as of" and staleness; never shows zero for unknown |
| **HC Coordination** (transfers, capacity) | Prisoners' administration, CG office | Transfer requests, arrivals, occupancy | Transfer orders, capacity plans, temporary-prison designations (s.28) | Its orders; order status | The prisoner's record | Order to sending and expected-arrival notice to receiving | Order waits in inbox; unconfirmed dispatches escalate |
| **HD Oversight** | Legal affairs, RPCs | VJ extracts and OIC comments (s.110(3)), observations (s.111(2)), incident notifications, s.88 bundles, complaint escalations, returns | Triage, responses, requests for information, follow-up actions | Oversight case state | Source records | Responses and requests via inbox | Items show as expected-but-not-received when overdue |
| **HE Decisions register** | CG office, legal | Requests for decisions | Decision records with document (parole s.89, licence s.87, s.88 outcome, reward s.119) | Decision records | Execution at the facility | Decision as an instruction the facility executes and references | Delivered at next contact |
| **HF Directives** | CG office, planning | Acknowledgments | Standing orders, prohibited-articles list (s.101), form templates, circulars | Its publications | Facility configuration | Versioned directive with acknowledgment tracking | Acknowledgment pending; HQ sees who has not received |
| **HG Consolidation and statistics** | Statistics, planning | Attested returns, event streams | National and regional consolidations, monthly abstract, remand-overstay analysis | Its consolidations | The underlying rows | Optional feedback on return validation | Missing returns are shown as missing, not zero |
| **HH Locate** | HQ officers, RPCs | Locator entries | Access requests | Nothing in facilities | The file | Access request to the holding facility | Answers "last known: facility X as of date" and marks uncertainty |
| **HI HQ administration** | HQ admin | n/a | HQ accounts, roles, regional scopes, HQ audit, HQ backups | HQ-owned | n/a | n/a | n/a |

Personnel and promotion input consolidation (Station, Regional, General Promotion Boards) is a real HQ flow [S/P] that stays `DEFERRED`: the decision apparatus is Council and Authority, and it depends on staff records the facility model does not yet hold.

### C.4 What Head Office independently records

The facility registry and trust decisions; directives; decisions (transfer orders, parole, licence, review outcomes, rewards); oversight cases and responses; capacity plans; consolidated statistics; HQ accounts and audit; HQ documents. None of these is a copy of a facility record.

### C.5 Head Office when facilities are offline

Head Office is always an **as-of** view. Each facility carries: last contact, events behind, returns overdue, trust state. Numbers derived from stale data are labelled with their oldest contributing date. A facility that has not made contact within a configurable period raises an oversight item. Head Office cannot compel or read past the boundary; it can request, and a request waits in the inbox.
