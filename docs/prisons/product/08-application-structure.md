# 08. Application structure

The structure below is derived from the operating model (01, 02), not from the existing sidebar. It is a proposal for approval (decision D6). **No visual redesign is proposed**: the interface becomes different because the work is different, and the design tokens, `@pleadli/ui` and `@pleadli/forms-tables` are reused as they are.

Facility and Head Office are **not symmetrical** because their work is not. Facility navigation is organised by what officers do to and for people in custody. Head Office navigation is organised by institutional responsibilities over a network.

## 1. Facility

### 1.1 Primary navigation

Nine areas in four sections, plus two always-present controls. Provisional areas carry a "Provisional" marker and can be hidden by facility configuration until piloted.

| Section | Area | Contains | Pattern | Entry style |
|---|---|---|---|---|
| **Work** | **Today** | Count strip; due queue; watch and handover; exceptions; node and connectivity strip | Operations board | Action-first |
| | **Movements** | Reception, discharge, transfers out and in, in-transit, court and hospital trips today | Board of in-flight movements plus guided procedures | Action-first |
| | **Legal** | Court diary, remand and mandatory-bail thresholds, sentence and review dates, instruments pending, s.118 list, parole and s.88 pipeline | Diary and queues | Action-first |
| **People** | **Population** | Roster (search-first), accommodation by unit, counts, the **prisoner file** | Register plus record | Search-first, record-first |
| | **Care and contact** | Health movements, visits, requests and grievances, programmes, welfare conditions | Case queues and timeline | Queue-first |
| **Order** | **Security and order** (provisional) | Incidents, discipline and confinement, gate, duty log and handover | Report workspace, chronological log | Action-first |
| **Institution** | **Records** | Registers, document library, dispatches and receipts, directives received | Register viewer, document reader | Search-first, record-first |
| | **Returns** | Monthly return builder, oversight submissions (VJ extract, observations, s.88 bundle), reports and statistics | Review-and-attest | Task-first |
| | **Facility** | Profile and capacity, staff, accounts and devices, node (backup, update, health), connectivity, audit | Configuration panels | Record-first |

**Always present.** **Search** (top bar and command palette; covers every domain the officer's permissions reach). **Start** (a launcher for procedures: Reception, Discharge, Transfer out or in, Court trip, Hospital referral, Visit, Request, Incident, Count, Occurrence, Property entry). The existing framer-motion add-record panel evolves into this launcher, with cards for **procedures** rather than record types, and step 1 to 3 (choose, choose the person, act) preserved.

**What moved.** Every current sidebar item is placed in 09. In short: Overview becomes Today; Prisoners becomes Population and the prisoner file; Visits, Requests become part of Care and contact; Court Production and Remand becomes Legal; Reports becomes Returns; Officers and Settings become Facility; Facilities leaves the facility entirely (Head Office only).

**Secondary navigation** is in-area: a segmented control or tab strip inside each area (for example inside Legal: Diary, Thresholds, Reviews, Instruments pending). Secondary destinations are never promoted to the sidebar.

### 1.2 What is search-first, action-first, record-first

- **Search-first**: finding a person (Population roster), a document, a register entry. Search is also global.
- **Action-first**: Today, Movements, Legal, Security. The officer arrives to do something; the screen shows what is owed.
- **Record-first**: the prisoner file, documents, facility profile. The officer arrives to see or edit a specific thing.

### 1.3 The facility home ("Today")

```
+--------------------------------------------------------------------------------+
| COUNT   Held now 812 (Conv 421 / Rem 383 / Civ 8)   Capacity 240   Occ 338%     |
|         Last count 06:10 by [name]   Expected 812  Counted 812   [Start count]  |
+--------------------------------------------------------------------------------+
| DUE NOW                                             | WATCH                     |
|  Overdue (3)                                        |  Open occurrences (2)     |
|   - Discharge due 05 Sep: [name]  documents pending |  Handover to sign  [Open] |
|   - 180-day threshold passed: [name]                |                           |
|  Today (9)                                          | EXCEPTIONS                |
|   - Court: [name] 09:00 [court]  [Prepare]          |  - Ward 3: mixed category |
|   - Hospital return awaited: [name]                 |  - Return due in 2 days   |
|   - s.118 list due before High Court session [Open] |                           |
|  Next 7 days (14)                                   | NODE                      |
|   - s.88 bundle due ...                             |  Connected. Last exchange |
|                                                     |  14 min. Backup 1 d ago   |
+--------------------------------------------------------------------------------+
```

Every row opens the **procedure** that discharges it. Statistics, trends and breakdowns are not on this screen. **This supersedes the earlier convention that every Overview carries stat tiles and charts** for the Prisons application: the working home answers "what needs doing", and analytics live under Returns. The existing rule that every `DataTable` starts with a UUID badge column and comprehensive fields remains for genuinely tabular lists (roster, registers, dispatches, audit), and is not applied to queues, boards or procedures.

### 1.4 The prisoner file

The header answers "what do I need to know about this person right now"; the body answers "what has happened".

```
+--------------------------------------------------------------------------------+
| [Name]   Ref  CONVICTED   In custody   Ward 3, cell 2                           |
| Admitted 12 Mar 26 | Next court 20 Sep | Entitlement 04 Nov 26 | Held 189 days  |
| FLAGS: documents pending (warrant) | remand threshold n/a | infant with mother  |
+---------------------------------------------------+----------------------------+
| TIMELINE (all domains, newest first)              | OPEN FOR THIS PERSON       |
|  18 Sep  Visit attended (relative)                |  - Chase committal warrant |
|  16 Sep  Complaint logged (food)                  |  - Property outstanding    |
|  12 Sep  Health: referred to hospital             |  - Next court 20 Sep       |
|  ...                                              | START  [Discharge]         |
|  tabs: Custody | Legal | Property | Care | ...    |        [Transfer] [Refer]  |
+---------------------------------------------------+----------------------------+
```

The timeline merges custody, court, movement, care and contact events; domain tabs exist for depth. Actions are procedures, not "Add" buttons. Sensitive tabs (health, discipline) show only to permitted roles and log each read (05 M.5). After transfer-out, the sending facility's file for that stay becomes read-only and archived.

### 1.5 Interaction patterns by work

| Work | Pattern | Notes |
|---|---|---|
| Reception, discharge | **Guided procedure**: checklist on the left, current step on the right, document capture pane, hard and soft gates, an explicit decision step (accept, accept pending, refuse) with reason | Replaces the single admit and release forms |
| Transfers | **Board** by state (Expected, Preparing, In transit, Arrived awaiting confirmation) plus the procedure | One card per person; escalates stale cards |
| Court diary | **Diary** by date and court; **threshold table**; s.118 list builder | Outcomes are applied, not just recorded |
| Health movements, complaints | **Case queue** with response and closure | Complaints show escalation state |
| Visits | **Workflow** (request, eligibility, authorise, attend, outcome) plus the facility-wide visit log for findability | The existing `/visits` log survives as the log view |
| Incidents | **Report workspace** with obligation list beside it | Notifications become checklist items |
| Count, occurrences | **Count sheet** (tally, expected against counted) and a **chronological log** with quick add | Provisional |
| Registers | **Register viewer** in book layout with page and line numbers, print-first | Views over records |
| Documents | **Document reader**: preview, metadata, linked workflow, dispatch state, version history | Not a file manager |
| Returns | **Review-and-attest**: sections with validation status, discrepancy list, attest, submit, receipt | |
| Facility, accounts, node | **Configuration panels** | The one place a settings pattern is right |

## 2. Head Office

### 2.1 Primary navigation

Nine areas in three sections. A user's navigation is trimmed by permission; a Regional Commander sees the same structure scoped to their facilities, largely read-only, with oversight responses.

| Section | Area | Contains | Pattern |
|---|---|---|---|
| **The network** | **Estate** | National picture by region and unit: contact health, data currency, occupancy and congestion, facilities needing attention | Table and map with attention semantics, not tiles |
| | **Locate** | Cross-network search over locator entries; access requests and their state | Search with result rows showing "last known: facility, as of date" |
| **Institutional work** | **Oversight** | Incoming VJ extracts and OIC comments, observations, incident notifications, s.88 bundles, complaint escalations, late or missing submissions | **Queue** with triage, assign, respond |
| | **Coordination** | Transfer pipeline (requested, ordered, in transit, confirmed); capacity planner (occupancy against approved capacity by unit; s.28 temporary prisons) | **Board** and planner |
| | **Decisions** | Register of Commissioner General and Minister acts: parole, licence, review outcomes, rewards, transfer orders, with delivery and execution tracking | Register with document reader |
| | **Returns and statistics** | Received-returns tracker (facility by month: on time, late, missing, discrepancy); consolidation; monthly abstract builder; remand-overstay analysis | Status matrix and reports |
| | **Directives** | Standing orders, prohibited-articles list, form templates; publish; acknowledgment matrix | Library and matrix |
| **Administration** | **Network** | Facility registry and trust lifecycle (invite, verify, suspend, revoke, decommission, split, merge), transports, versions, keys | Registry with lifecycle actions |
| | **HQ administration** | HQ accounts, roles, regional scopes, audit, backup | Configuration panels |

There is deliberately no "facility navigation plus a Facilities page". Head Office has no Prisoners, Visits or Court Production areas because it does not operate those records; when it needs to see a person it uses **Locate**, which reports what is known and how old that knowledge is, and requests access rather than reading a copy.

### 2.2 The Head Office home ("Estate")

```
+--------------------------------------------------------------------------------+
| NEEDS ATTENTION                                                                 |
|  - 4 facilities: no contact > 7 days      - 2 returns late    - 1 transfer      |
|  - 3 incident notifications unread        - 5 VJ extracts awaiting triage       |
+--------------------------------------------------------------------------------+
| REGION        FACILITIES  CONTACT  OCCUPANCY   RETURNS   OPEN OVERSIGHT         |
| Kigezi          12         11/12     598%       on time      2                  |
| Central          9          9/9      220%       1 late       0                  |
| ...   (rows open the region, then the facility)                                 |
+--------------------------------------------------------------------------------+
| Figures are "as of each facility's last contact". Missing is shown as missing. |
+--------------------------------------------------------------------------------+
```

Every figure states its as-of time. Unknown is never rendered as zero.

## 3. Pattern catalogue

| Pattern | Used for | Not for |
|---|---|---|
| Operations board | Today | Analytics |
| Queue | Due obligations, oversight inbox, complaints | Reference data |
| Guided procedure | Reception, discharge, transfer, incident | Simple settings |
| Board | Movements, transfer pipeline | Static lists |
| Record and timeline | Prisoner file | Bulk data |
| Register (dense table) | Roster, registers, dispatches, audit | Anything that is really a queue |
| Document reader | Instruments, generated documents | File browsing |
| Review-and-attest | Returns | Ad hoc reports |
| Configuration panel | Facility, accounts, node, network | Operational work |
| Search | Everywhere | Substituting for navigation |

## 4. What this avoids

Repeated stat cards as a home; a "table plus Add button" on every page; a sidebar of nouns; charts, gradients or animation added to cover product ambiguity; the same layout for work that differs. The visual system does not change in this phase.

## 5. Decisions this reopens

- **D6 (flat navigation "settled 2026-09-18")** is reopened, because the model changed and you directed that the sidebar is not the product definition.
- **The "every Overview carries stat tiles" convention** is superseded for Prisons (1.3).
- **`scope.md` feature 23** (Visits page, motion add-record, nav alignment) remains valid as work already in progress; its Visits log becomes a view inside Care and contact, and the add-record panel becomes the Start launcher.
