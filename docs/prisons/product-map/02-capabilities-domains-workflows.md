# 02. Capability map, domain map, workflow map

Build classes: `CORE`, `PROVISIONAL`, `DEFERRED`, `EXCLUDED`, `OUT OF SCOPE` (README). Evidence tags as before.

---

## D. Capability map

### D.1 Facility capabilities

Grouped by the work they support, not by record type.

| ID | Capability (the work) | Class | Evidence |
|---|---|---|---|
| **1. Awareness** | | | |
| F1.1 | Population and occupancy, derived from custody state and reconciled by counts | CORE (derivation), PROVISIONAL (the count itself) | "Unlock" [P], approved capacity [P] |
| F1.2 | Obligation queue: everything owed, by whom, by when, with what proof | CORE | Structural (A.3) |
| F1.3 | Watch log and shift handover | PROVISIONAL | [H], R-03 |
| F1.4 | Exceptions: separation conflicts, missing instruments, count discrepancy, capacity | CORE | ss.29, 58, 60, 64 [P] |
| **2. Custody and legal** | | | |
| F2.1 | Reception: verify instrument, establish identity, search, inventory, screen, inform, accommodate | CORE | s.58, 61, 62 [P]; r7, r30 [I] |
| F2.2 | Legal authority chain: instruments received, verified, versioned, linked to custody | CORE | s.58, s.63(2) [P] |
| F2.3 | Sentence and remand administration: clocks, entitlement dates, remission, mandatory-bail thresholds | CORE (statutory computations), edge cases NEEDS RESEARCH | Art. 23(6), ss.66, 84, 85, 88, 89 [P]; PMIS names "sentence administration" [S] |
| F2.4 | Court diary: production orders, physical or virtual, s.118 list, outcomes applied | CORE | ss.67, 118 [P]; virtual in 19+ prisons [P] |
| F2.5 | Discharge: authorisation, gates, documents, handback, before-noon execution | CORE | ss.83 to 85 [P] |
| F2.6 | Transfers, two-ended: order, dispatch, in-transit, dossier, arrival, ownership handover | CORE | s.73, s.78(2), s.28 [P] |
| F2.7 | Correction and re-arrest: amend an erroneous record; erroneous release under s.79 | CORE | s.79 [P]; Sch.2 record offences [P] |
| F2.8 | Periodic review, parole and licence execution | CORE | ss.87, 88, 89 [P] |
| **3. Population** | | | |
| F3.1 | Prisoner file: identity, family and next of kin, classification, the "right now" header | CORE | s.61 [P]; r7(a)(f)(g) [I] |
| F3.2 | Accommodation and separation with capacity | PROVISIONAL | ss.29, 60, 64 [P]; r11 [I] |
| F3.3 | Property and effects ledger | CORE | s.62, s.30(2)(a) [P] |
| F3.4 | Welfare conditions: infants with mothers to 18 months, women prisoners, vulnerabilities | CORE (statutory), vulnerabilities PROVISIONAL | ss.57, 59, 60 [P] |
| **4. Care and contact** | | | |
| F4.1 | Health movements and notifications (not clinical care) | CORE | ss.74 to 76 [P]; r69 [I] |
| F4.2 | Visits and legal access | CORE | ss.64(3), 113 [P]; [S] |
| F4.3 | Letters: reception letter, transfer letter | CORE (documents) | s.78(2) [P] |
| F4.4 | Requests and grievances (application book, Mukutano) | CORE | UHRC [P], US State Dept [S] |
| F4.5 | Rehabilitation and work with certification | CORE | s.5 [P], Farms report [P], UVTAB [S] |
| **5. Security and order** | | | |
| F5.1 | Incidents with notification obligations | PROVISIONAL | s.79, s.119, Inquests Act [P]; r71 [I] |
| F5.2 | Discipline and confinement | PROVISIONAL (with enforced statutory limits) | ss.81, 85, 95 [P]; r43 to 46 [I] |
| F5.3 | Gate register (persons, vehicles, items) and exhibits | PROVISIONAL | Named registers [P] |
| F5.4 | Prohibited articles: posted list, seizure record | PROVISIONAL | ss.101, 102 [P] |
| **6. Records** | | | |
| F6.1 | Instruments (received documents) | CORE | s.58 [P] |
| F6.2 | Generated documents from structured data | CORE | Section N |
| F6.3 | Registers as views over records, printable | CORE | UHRC register list [P]; r6 allows a registration book or a database [I] |
| F6.4 | Dispatch and receipt tracking | CORE | Section N |
| F6.5 | Prisoner access to own record and official copy on release | PROVISIONAL | r9 [I], Uganda position [U] |
| **7. Returns and duties** | | | |
| F7.1 | Monthly return, attested | CORE | UPS abstract shape [P] |
| F7.2 | Visiting Justices' Book extract; visitor's book observations | CORE | ss.110(3), 111(2) [P] |
| F7.3 | Incident notification to HQ | CORE for escape and death | UPS reports escape, recapture, mortality rates [P] |
| F7.4 | s.88 review bundle | CORE | s.88 [P] |
| F7.5 | Inspection response (internal and external) | DEFERRED | s.112 [P], r83 to 85 [I], R-24 |
| **8. Administration** | | | |
| F8.1 | Facility profile and capacity | CORE | s.30, abstracts [P] |
| F8.2 | Staff and posts (establishment context; rosters later) | CORE context, rosters DEFERRED | Rank table [P]; R-07 |
| F8.3 | Accounts, roles, workstation devices | CORE | Section M |
| F8.4 | Node operations: backup, restore, update, health | CORE | Section 04 |
| F8.5 | Connectivity centre and exchange status | CORE | Section 03, 04 |
| F8.6 | Directives inbox and acknowledgment | CORE | ss.7(2), 77(2), 101(3) [P] |
| F8.7 | General stores, vehicles, farm and industry outputs | DEFERRED | R-12 |

### D.2 Head Office capabilities

| ID | Capability | Class | Evidence |
|---|---|---|---|
| HA | Network administration: onboard, verify, suspend, revoke, decommission, versions, keys | CORE | 0001 spec, section 04 |
| HB | Estate awareness: contact health, occupancy and congestion by region and unit | CORE | Congestion is the headline national statistic (360% occupancy, 24 units above 600%) [P/S] |
| HC | Coordination: transfer orders, decongestion planning, temporary prisons | CORE | s.73, s.28 [P] |
| HD | Oversight: VJ extracts, observations, incidents, s.88 pipeline, complaint escalations, returns | CORE | ss.88, 110, 111 [P] |
| HE | Decisions register: parole, licence, review outcomes, transfer orders, rewards | CORE | ss.73, 87, 89, 119 [P] |
| HF | Directives: standing orders, prohibited-articles list, form templates, acknowledgments | CORE | ss.7(2), 77(2), 101, 124 [P] |
| HG | Consolidation and statistics, remand-overstay analysis | CORE | Monthly abstracts [P]; 6,417 overdue figure [P] |
| HH | Locate and access requests | CORE | Locator model (03) |
| HI | HQ administration: HQ accounts, roles, regional scopes, audit, backup | CORE | Section M |
| HJ | Personnel and promotion input consolidation | DEFERRED | Promotion boards [S/P]; depends on staff records |

### D.3 Shared infrastructure

| ID | Infrastructure | Notes |
|---|---|---|
| S1 | Identity and access (accounts, sessions, roles, devices) | Enforced at the node |
| S2 | Audit (change history, sensitive-read log, tamper evidence) | Section M |
| S3 | Vault and documents (content-addressed store, manifest) | Section N |
| S4 | Obligation engine (typed obligations, due rules, evidence requirements) | New; drives Today |
| S5 | Event log and outbox | Domain events; source of exchange |
| S6 | Exchange and transport adapters | Section 03, 04 |
| S7 | Print and export | Local PDF and CSV, letterhead |
| S8 | Search | Facility scope local; HQ scope over locator |
| S9 | Configuration and templates (vocabularies, forms, directives) | Versioned |
| S10 | Backup, restore, update | Section 04 |

---

## E. Domain map

Domains are bounded areas of ownership and language, not screens.

### E.1 Facility domains (IDs DM1 to DM15, distinct from the D1 to D14 decisions in the README)

| ID | Domain | Purpose | Key entities | Primary interaction |
|---|---|---|---|---|
| DM1 | Person and identity | Who this person is | identity facts, next of kin, children, identifiers | Prisoner file header |
| DM2 | Custody | Under what authority, in what legal state | episode, stay, instrument, sentence, status, category | Prisoner file, procedures |
| DM3 | Legal calendar | What the law requires by when | court obligations, remand cycle, clocks, s.118, reviews | Diary and queues |
| DM4 | Movements | Any crossing of custody boundary | reception, discharge, transfer, hospital and court trips, in-transit | Guided procedures and boards |
| DM5 | Population and accommodation | Where everyone is and how many | units, placements, capacity, counts | Count sheet, occupancy |
| DM6 | Property | Custody of prisoners' effects | ledger entries, inventory | Sub-ledger in procedures |
| DM7 | Care and welfare | Health coordination, welfare, rehabilitation | health movement, welfare flag, participation | Case queues, timeline |
| DM8 | Contact | Visits, legal access, letters | authorisation, attendance, letter | Visit workflow |
| DM9 | Grievance | Requests and complaints | request, complaint, escalation | Queue with response |
| DM10 | Security and order | Incidents, discipline, confinement, gate | incident, matter, confinement, gate event | Report workspace, log |
| DM11 | Documents and registers | Institutional records | instruments, generated documents, registers, dispatches | Reader, register viewer |
| DM12 | Returns and oversight duties | What the facility owes upward | return, extract, bundle, notification | Review and attest |
| DM13 | Facility administration | The facility itself | profile, staff, accounts, devices, node | Settings-class panels |
| DM14 | Exchange | Controlled connectivity | outbox, inbox, packages, transports | Connectivity centre |
| DM15 | Audit | Accountability | audit entries, access log, chain heads | Audit viewer |

### E.2 Head Office domains

| ID | Domain | Purpose | Key entities |
|---|---|---|---|
| N1 | Network registry | Facilities and their trust | facility, keys, trust state, transports |
| N2 | Estate view | Read model of the network | locator, returns, contact health |
| N3 | Coordination | Transfers and capacity | transfer order, capacity plan |
| N4 | Oversight | Facility-originated submissions and follow-up | oversight case, extract, notification |
| N5 | Decisions | Institutional acts | decision, instruction |
| N6 | Directives | Rules pushed down | directive version, acknowledgment |
| N7 | Consolidation | Statistics | national return, regional roll-up |
| N8 | Locator | Where a person is | locator entry, access request |
| N9 | HQ administration | HQ itself | HQ accounts, scopes, audit |

### E.3 Re-evaluation of every current domain

`KEEP`, `MERGE`, `SPLIT`, `MOVE`, `REMOVE`, `CREATE`. "Current" is what exists in `apps/prisons` today (07 has the evidence).

| Current domain | Verdict | Reasoning | New home |
|---|---|---|---|
| **Prisoners** | **SPLIT** | One table carries identity, legal status, custody, location and offence. These have different owners and lifecycles. The "prisoner" stays as the user-facing file (the Act's own term), but the data splits into identity (DM1), custody episode and stays (DM2), placement (DM5). | DM1, DM2, DM5, Prisoner file |
| **Admissions** | **CREATE** (as a workflow) | Admission exists today only as a create form. It is a procedure with a decision, gates and follow-on obligations. | DM4 Reception (W1) |
| **Releases** | **MERGE** into Discharge | Release, property handback, documents-pending gate and before-noon rule are one workflow. The gates already exist; the workflow does not. | DM4 Discharge (W4) |
| **Transfers** | **SPLIT** | Out, in-transit, in and the ordering are different responsibilities at different institutions. Today only a sender-side closure exists. | DM4 Transfer (W5), HQ N3 |
| **Court Production** | **MERGE** with Remand | Productions are events under a court obligation. | DM3 Court diary |
| **Remand** (the s.118 list) | **MERGE** with Court Production | It is a report over the court diary, not a domain. | DM3, printable dispatch |
| **Visits** | **KEEP**, plus **CREATE** Gate | Visits are a formal workflow with categories and privacy rules. The general gate register (all persons, vehicles, items) is separate. | DM8, DM10 |
| **Health and Welfare** | **SPLIT** | Health movements (ss.74 to 76) versus welfare conditions (infants, women prisoners, vulnerabilities). Clinical care stays out of scope. | DM7 health movements, DM1/DM2 flags |
| **Property** | **MERGE** | Property is a ledger inside reception and discharge, not a browsable domain. | DM6 within DM4 |
| **Rehabilitation and Work** | **KEEP** | Participation-as-status plus certification is right. Facility programme catalogue is a small addition. | DM7 |
| **Requests and Complaints** | **KEEP**, two channels | Application book (individual requests to the OIC) and Mukutano (committee grievances) are distinct, with escalation. | DM9 |
| **Documents** | **REBUILD** | Generic attachments do not model instruments, generated documents, registers or dispatches. | DM11 |
| **Officers** | **SPLIT** | Institutional staff (rank, post) versus accounts (login, role, devices). | DM13 Staff, S1 Accounts |
| **Reports** | **SPLIT** | Attested returns and statutory outputs (DM12) versus exploratory statistics (Returns and reports area). | DM12, Reports |
| **Search** | **KEEP**, **MOVE** | A global, search-first capability, not a nav destination. HQ scope is the locator. | S8 |
| **Facilities** | **MOVE**, **CREATE** | Today the HQ roster. It becomes the HQ Network registry (N1). The facility itself becomes a first-class profile (DM13). | N1, DM13 |
| **Sync** | **REBUILD** as Exchange | Snapshot push becomes signed exchange packages with outbox, inbox and acknowledgment. | DM14 |

### E.4 Domains and capabilities that must be created

Obligations engine (S4); Sentence and legal authority (DM2/DM3); Count, Duty log, Incidents, Discipline and confinement, Accommodation, Gate (DM5, DM10, all provisional); Facility administration and staff (DM13); Audit (DM15); Returns and oversight submissions (DM12); Exchange inbox and outbox (DM14); and HQ N1 to N9.

---

## F. Workflow map

Every workflow follows event, information, action, responsibility, decision, resulting record, next action. Evidence tags mark what is grounded and what is hypothesis. Tiers T0 to T4 are in 03.

### W1. Reception (admission)

- **Event.** A person arrives with an escort and an instrument: commitment, remand warrant, order of detention, warrant of conviction or committal [P s.58(1)].
- **Information.** The instrument and its authentication (court seal or authorised signer); identity documents; the escort's account; visible condition; property carried.
- **Actions.** (1) Gate event. (2) Verify instrument type, authentication and that particulars match (s.58(2)) [P]. (3) Decide: accept; refuse; accept with rectification pending (s.58(4)); accept with **document pending**, a real state UPS tracks (98 convicted without commitment warrant, 4 without sentence) [P]. Refusals: severely tortured and in bad health (s.58(3)), juvenile to an adult prison (s.58(7)) [P]. (4) Establish identity and legal category (convicted, unconvicted, civil), sex, age, offence, High-Court-only flag. (5) Search (s.62(1)) and record visible injuries and complaints of prior ill-treatment [P; r7(d) I]. (6) Take money, clothes and effects into the OIC's custody with an inventory (s.62(2)(4)) [P]. (7) Health screening as soon as possible [I r30]. (8) Record family, children, emergency contact; offer notification of imprisonment [I r7(f)(g), r68]. (9) Provide written information on rules, discipline and the complaints procedure (s.58(5)); reception letter entitlement (s.78(2)) [P]. (10) Accommodate under separation rules [P/I]. (11) Start the clocks: remand or sentence, next court date, pending-document timer. Ordering of steps is [H].
- **Responsibility.** Reception function performs; OIC or delegate authorises acceptance.
- **Decision.** Accept, refuse, accept-pending.
- **Records.** Custody episode and first stay; instrument scans; admission register line; property ledger opened; placement; injuries and complaints; audit; T1 event `custody.admitted`.
- **Next actions.** Chase pending instrument; next court date; family notification; health screen; disclosure acknowledgment; classification.
- **Boundary.** T1 event to HQ. Nothing else.
- **Offline.** Full.

### W2. Legal clock and review cycle

- **Event.** Time passes, an instrument arrives, or a court outcome is applied.
- **Information.** Instruments, sentence, remand start, offence class (High Court only or hybrid), remission earned and forfeited.
- **Actions.** The system computes and surfaces: mandatory-bail thresholds of 60 and 180 days [P Art. 23(6), not the Act's 120/360]; sentence entitlement with one-third remission (s.84) and forfeiture (s.85) [P]; parole window for sentences of 3 or more years within 6 months of release date (s.89) [P]; s.88 four-yearly review for life or over 7 years [P]; licence for habitual criminals (s.87) [P].
- **Responsibility.** Records function maintains the clocks; OIC acts on thresholds.
- **Decision.** What to do when a threshold passes. **Who the facility must notify is [U] (R-06)**, so the obligation records "action taken" as free text with documents, rather than a fixed recipient.
- **Records.** Clock state, threshold events, dispatch records.
- **Boundary.** T2 overstay counts in returns; optional T1 threshold flag.
- **Offline.** Full.
- **Status.** Computations grounded; edge cases (life, pending mitigation, pending Minister's order [P categories]) and remission mechanics in practice need research (R-05).

### W3. Court production cycle

- **Event.** A court order to produce (s.67); an approaching High Court session (s.118); a remand warrant renewal falling due [H, R-06].
- **Information.** Order, court, date and time, purpose; prisoner state; production method (physical or virtual at the 19+ prisons with conference facilities) [P].
- **Actions.** (1) Register the obligation in the court diary. (2) Before a High Court session, prepare and file the s.118 list: admission date, authority for detention, last court appearance [P]. (3) Prepare production: fitness, documents, escort arrangement [U]. (4) Depart; custody outside is lawful custody (s.67) [P]. (5) Attend (physical or virtual). (6) Receive the outcome. (7) Apply it: remand extended (new next date), bail, acquittal or dismissal (release, W4), conviction (new instrument and sentence). (8) Record return.
- **Responsibility.** Court production function; OIC.
- **Decision.** Production is mandatory when ordered; fitness concerns escalate to the OIC.
- **Records.** Production event with method; outcome instrument; updated custody; s.118 list document and dispatch proof.
- **Next.** Next court date obligation.
- **Boundary.** s.118 list goes to the High Court (external dispatch). T1 event where custody changes.
- **Offline.** Full.

### W4. Discharge (release)

- **Event.** Authority to release arises: entitlement date (s.83); court order under any of UPS's 13 named reasons (dismissed, reconciled, cautioned, acquitted, bailed, bonded, nolle prosequi, time spent on remand, withdrawn, suspended sentence, community service, fine, transferred to remand home) [P]; parole (s.89); licence (s.87).
- **Information.** The authorising instrument; entitlement calculation; property ledger; documents pending; health status (a prisoner under medical treatment on the release date is discharged to a medical or social service, s.83) [P]; other lawful holds [H].
- **Actions.** (1) Capture authorisation and basis. (2) Gates: documents pending blocks; property outstanding blocks (both exist in code today per spec 0002); other holds check [H]. (3) Generate discharge documents: release order or certificate, property receipt, official copy of record on request [I r9]. (4) Execute before noon (s.83), time recorded. (5) Hand back property. (6) Inform next of kin if the prisoner asks. (7) Close the stay and episode.
- **Responsibility.** OIC is responsible for due discharge (s.83) [P]; gate executes.
- **Decision.** OIC authorises.
- **Records.** Release event with type; discharge documents; register line; property ledger closed; audit; T1 event `custody.released`.
- **Next.** Community reintegration follow-up is a statutory function (s.5) with no defined record [U]. Erroneous release detection: the CG may issue a re-arrest warrant (s.79) [P], handled in W18.
- **Offline.** Full.

### W5. Transfer, two-ended

- **Event.** A Commissioner General order under s.73(3), a facility request (medical need, overcrowding), or an HQ decongestion plan (s.28) [P].
- **Actions.**
  1. Optional facility **request** to HQ (T3).
  2. HQ issues the **order** (HQ-owned decision record plus document). It goes to the sending facility's inbox. A minimal **expected-arrival notice** (no file) goes to the receiving facility.
  3. Sender **prepares**: legal state (pending production conflicts), property packed and inventoried, documents, medical summary as permitted, family informed (r68 [I]), transfer letter (s.78(2)) [P], keep-in-area preference noted (s.73(4)) [P].
  4. Sender **dispatches**: departure time, officers, transport. State `in transit`: still in custody of the prison officer (s.73(5)); escape in transit is escape from lawful custody (s.73(6)) [P]. A **transfer dossier** package is sealed for the receiving facility; a T1 event goes to HQ.
  5. Receiver **arrives**: dossier obtained (network or file), identity verified against it at the gate, acceptance or discrepancy report, property received and reconciled, health screen, placement, **confirmation** to sender and HQ.
  6. **Ownership handover** on confirmation: the live record moves; the sender's stay is archived read-only; the episode continues with the same identifier; obligations re-home.
  7. **Failure paths.** No confirmation within a configurable period: HQ oversight item and sender alert. Arrival without dossier: provisional reception with "dossier pending" and a request. Dispatched but not arrived: incident (W11). Receiver refuses (capacity, sex mismatch): return or redirect via HQ.
- **Responsibility.** HQ orders; sending OIC dispatches; receiving OIC accepts.
- **Decision.** CG order; receiving acceptance.
- **Records.** HQ order; sender stay closure and dispatch record; dossier package; receiver stay; confirmation; both audits.
- **Boundary.** T3 dossier (HQ relays sealed content); T1 events.
- **Offline.** Sender can dispatch with an order already received or a paper order attached later. Confirmations queue. The dossier may travel as a file (D9).
- **Status.** Statutory frame [P]; real-world process (who initiates, escort, forms) [U] (R-14).

### W6. Hospital movement

- **Event.** A health need beyond the facility's in-house capacity, or an emergency.
- **Information.** Medical officer's advice (s.75); emergency removal by the OIC alone; mental abnormality (s.74 requires magistrate confirmation) [P].
- **Actions.** Record referral, advice and authoriser. Custody continues; the prisoner is deemed still detained at the sending prison (s.75, s.76) [P]. Notify next of kin of serious illness or injury, respecting an explicit refusal (r69) [I]. Track `away`. The hospital notifies the OIC when care ends (s.76); record return. For s.74: magistrate confirmation obligation; time in a mental hospital counts toward the sentence.
- **Records.** Movement pair and custody continuity. No clinical detail (out of scope).
- **Boundary.** Local. T2 counts. Death is W11.
- **Offline.** Full.

### W7. Visit

- **Event.** A visitor requests or arrives.
- **Information.** Visitor identity (photographic ID) [S]; category (relative: wife, husband, children, siblings; voluntary visitor: lawyers, NGOs, care officers, clergy; personal doctor; researcher; prison minister s.113) [S/P]; prisoner state (unconvicted may have legal-advisor privacy s.64(3)) [P]; timing (Monday to Friday 8am to 5pm; weekend needs special permission) [S].
- **Actions.** Request; eligibility by category; authorisation (special: OIC, researchers: CG [S]); gate identification and search; reception register; supervised visit (legal advisor and personal doctor within sight but not hearing) [P/S]; outcome; record.
- **Records.** Authorisation and attendance as separate facts; gate events.
- **Boundary.** Local; T2 counts.
- **Offline.** Full.
- **Not known.** Visit outcomes beyond attended or denied, cancellation, repeat visitor history, conduct-linked privilege [U] (R-18).

### W8. Property lifecycle

Opened in W1 (s.62), closed in W4 (handback gate). Between, any change (deposit, release to family, transfer with the prisoner in W5) is a ledger entry with the authorising officer. Mid-stay handling beyond these [U] (R-12). Evidence [P].

### W9. Request or complaint

- **Event.** A prisoner asks to see the OIC or raises an application (the application book) [S]; the elected Human Rights Committee (Mukutano) raises a grievance [P/S]; a Visiting Justice inquires (s.110(1)) [P].
- **Actions.** Log, possibly anonymous or committee-sourced; classify (food, remand overstay, welfare, other); route (the OIC sees the prisoner at a convenient hour any day but Sunday and holidays [S]); respond; outcome; escalate (Visiting Justice, Regional Commander, Commissioner General [S]); monthly committee report.
- **Records.** Request or complaint with outcome; escalation dispatch.
- **Boundary.** T2 counts by category; escalations T3.
- **Offline.** Full.

### W10. Discipline and confinement (PROVISIONAL)

- **Event.** Alleged breach reported.
- **Actions.** Record the report; hearing at which the prisoner is heard [H]; finding; sanction from the facility's configured list; remission effect (s.85) [P]; referral to a magistrate where charged (s.95) [P]. Confinement (s.81): OIC authorises, one of four statutory reasons, start, review, end, capped at 14 days with alerts before the limit [P]; daily health monitoring [I r46]; family-contact ban is not a sanction [I r43(3)].
- **Not built from evidence.** Offence taxonomy, sanction ladder, hearing officer rank, appeal path [U] (R-08).
- **Boundary.** Local; T2 counts.

### W11. Incident: escape and death (PROVISIONAL, evidence-seeded)

- **Escape.** Absence discovered at count, gate or in transit. OIC declares; immediate search of prison and neighbourhood and circulation to police [S]; incident record; custody state `escaped`; T1 event to HQ (escape and recapture rates are national statistics [P]); reward machinery is HQ (s.119) [P]. On recapture, recapture event and reinstated custody with instrument continuity. Further charges go to court.
- **Death in custody.** A medical practitioner certifies natural or otherwise. Next of kin informed at once (r69). Independent authority informed without delay (r71). Under the Inquests Act: a coroner always holds an inquest for a death in prison (s.4(2)(a)); the LC I chairperson or officer in charge of a police station is informed (s.9); a natural death confirmed by a medical practitioner takes Form B to the coroner (s.10(4)) [P]. Preserve evidence. Record destination of the remains (r8(f)) and funeral where no other party will (r72) [I]. Close the stay.
- **Records.** Incident, notifications with dispatch proofs, documents.
- **Boundary.** T1 event; T3 incident report to HQ.
- **Offline.** Full; outbound notices queue except where a statutory notice must go by other means, which the UI states.

### W12. Count and handover (PROVISIONAL)

- **Event.** A scheduled or ad hoc count.
- **Actions.** The counting officer records totals (and optionally by category or unit); the system shows the expected figure derived from custody state; discrepancy triggers recount, then escalation or an incident; a second officer verifies [H]; the as-of population (UPS's "Unlock") is fixed. Shift handover: outgoing officer reviews open occurrences, count state and pending obligations, signs a snapshot; incoming officer acknowledges.
- **Not assumed.** Frequency, parade steps, roles, escalation [U] (R-03).
- **Boundary.** T2 population as of.

### W13. Programme placement and certification

Enrol (participation as status), complete, certify (UVTAB certificate reference) [P/S]. No attendance or scheduling [researched and excluded]. Local; T2 counts.

### W14. Statutory returns and oversight submissions

- **Monthly return.** The system assembles the UPS-shaped return from records (population by convict, remand, civil; sex; age group; education; nationality; capital-offence type; sentence category; occupancy; admissions and releases by reason; productions; escapes; recaptures; deaths; staff by rank; children with mothers) [P shapes]. Validate against the event log. OIC attests. Submit as T2. HQ acknowledges or queries.
- **VJ Book extract (s.110(3)).** After a Visiting Justice visit, remarks are entered in the Visiting Justices' Book. The OIC extracts them, adds comments, submits both to the Commissioner General (T3). HQ triages and acknowledges. Whether the physical book remains authoritative or the digital record replaces it is [U] (R-24).
- **Visitor's book (s.111(2)).** Same shape for Minister and Judge observations.
- **s.88 bundle.** Due date computed. Collect the OIC's work-and-conduct statement, the medical officer's report, the social worker's assessment; assemble the bundle; submit to HQ (T3); HQ routes to the Minister and records the outcome (W15/HE).
- **s.118 list.** Under W3.

### W15. Directive and decision delivery (HQ to facility)

HQ authors a directive (standing order revision, prohibited-articles list under s.101(3), form template) or records a decision (parole, licence, review outcome, transfer order). It is published as a versioned message to facility inboxes. The facility OIC acknowledges; decisions are executed by the facility, referencing the decision id; the prohibited-articles list is posted at the gate in English, Swahili and local vernacular (s.101(3)) [P]. HQ tracks acknowledgment and execution.

### W16. Facility onboarding, pairing, decommissioning

Install; initialise (identity, keys); HQ issues an invitation; registration; human verification (pending, then active); suspension; revocation; identity events (split, merge, rename, closure; Moroto Women is a real example [P]); decommission (archive export, key destruction, HQ marks closed). HQ initialisation via activation code exists today. Full definition in 04.

### W17. Backup, restore, machine replacement

Scheduled encrypted backup of database and vault manifest; verification; restore drill; replacement of a node by restore from backup or from HQ escrow; re-enrolment of workstations; exchange resumes with a new epoch and HQ reconciles the locator. Full definition in 04.

### W18. Correction of an erroneous record

An officer requests an amendment with a mandatory reason. Legal-instrument fields require OIC authorisation. The original is preserved and superseded, never overwritten (record destruction and unentered records are disciplinary offences, Sch.2 [P]). If the amendment affects information already sent, a correction event goes to HQ. Erroneous release: the CG may issue a re-arrest warrant (s.79) [P]; the facility records the warrant and the re-admission linked to the original episode.
