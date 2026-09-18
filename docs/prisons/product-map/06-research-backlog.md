# 06. Evidence ledger and research backlog

The earlier research was disciplined about not inventing unsupported prison workflows, and that discipline is kept. But "we did not find enough evidence" was allowed to become "this is out of the product", and that is corrected here. Four evidence states, never conflated:

| State | Meaning |
|---|---|
| `SUPPORTED` | Established by a primary or credible source, or by the verified international baseline |
| `NOT YET RESEARCHED` | Not established. `DESK`: a written source likely exists and has not been read. `FIELD`: only practitioners or a site visit can settle it |
| `RESEARCHED AND EXCLUDED` | Investigated; a reason found not to model it as proposed |
| `PRODUCT OUT OF SCOPE` | A real thing Pleadli Prisons deliberately does not do |

**A finding about method.** Five desk-research attempts at the daily routine, headcounts and duty rosters returned nothing Uganda-specific, from UPS, UHRC, US State Department, HRW and the press. The Prisons Regulations 2012 and UPS Standing Orders remained unreachable by automated fetching, and a search-snippet "quotation" was caught being Barbados's regulations. Repeating desk research is not the way to close these. They are `NOT YET RESEARCHED (FIELD)`, and the method is the field validation kit below. Desk-exhausted does not mean excluded, and it does not mean the work does not happen.

---

## 1. Ledger by area

### SUPPORTED

Admission instruments and verification (s.58, s.61, s.62). Legal categories and separation (s.29, s.60, s.64). Mandatory-bail thresholds (Art. 23(6): 60 and 180 days, not the Act's 120 and 360). Release triggers and entitlement (ss.66, 83 to 85, 87, 89) and UPS's 13 court-release reasons. Transfer power and in-transit custody (s.73, s.78(2), s.28). Medical movement (ss.74 to 76). Property and effects (s.62, s.30(2)(a)). Court production and the s.118 list (ss.67, 118), virtual production in 19+ prisons. Visits categories and privacy exceptions (s.64(3), s.113; UPS-adjacent sources). Human Rights Committee (Mukutano) and the application book. The named registers (admission, release, property, transfer-of-detainees, gate, exhibits, medical, plus VJ Book and visitor's book). Cell restraint limit and reasons (s.81). Disciplinary offences of officers (Sch.2). Visiting Justices and official visitors, and their upward duties (ss.109 to 112). Periodic review s.88, parole s.89, licence s.87. Death in custody notification chain (Inquests Act). The 21-rank ladder and monthly statistics shape. Congestion facts. UVTAB certification (secondary). PMIS module names (secondary). **International baseline (verified this phase):** Mandela Rules 6 to 11, 30, 36 to 46, 58, 68 to 73, 83 to 85.

### NOT YET RESEARCHED

Daily routine, count, duty and handover (FIELD). Incident taxonomy and reporting chain (DESK, FIELD). Prisoner discipline procedure (DESK Regulations, FIELD). Accommodation structure and capacity per unit (FIELD). Food and rations (FIELD). General stores and vehicles (FIELD). Register layouts (FIELD). Sentence and remission computation in practice (DESK, FIELD). Remand warrant renewal cycle (FIELD). Role delegation and dual control (FIELD). Transfer, release and court-production practice (FIELD). Health records and medical register content (FIELD). Visits details and letters (FIELD). Retention rules (DESK). NITA-U, PDPO, residency (DESK). ICT environment at facilities (FIELD). Regional tier practice (FIELD). Facility identity scheme (DESK, FIELD). Prisoner identifiers (DESK). Juveniles, foreign nationals (DESK). JLOS and Judiciary interfaces (DESK). Sex and gender recording (policy and legal review). Localisation (FIELD).

### RESEARCHED AND EXCLUDED

| Item | Reason | Revisit if |
|---|---|---|
| A formal "escort" role or rank | None exists in the Prisons Act (confirmed by full-text search). Movements record accompanying officers as ordinary data | Standing Orders or practice show a formal role |
| "Medical instructs custody" restricted-duty directive | Evidence shows movement decisions are custody-led in practice; and the international baseline keeps healthcare staff out of sanction decisions (r46) | A Ugandan rule makes medical direction binding |
| Programme scheduling and attendance | Two independent primary sources describe output records, not per-prisoner attendance | Field visit shows attendance registers |
| Classification-driven programme placement | Aspirational six-site UNODC pilot only | National rollout evidence |
| A general Appointments or Attendance domain | Only court attendance is evidenced | Field evidence for others |
| A national Facility, Block, Wing, Cell hierarchy | No national scheme exists. Replaced by facility-defined accommodation units, which are **not** excluded | A national scheme is published |
| Search-snippet Regulations text as a source | Cross-jurisdiction contamination confirmed | The actual Regulations are read |

### PRODUCT OUT OF SCOPE

A clinical or electronic health record system. Inquest or coroner case management. Biometric identification and AI decisions. Staff payroll, HR case management, promotion decisions (inputs are `DEFERRED`). Procurement and finance. Farm and industry ERP. Replacing PMIS or claiming to be UPS's official system. A generic calendar or task manager (obligations are typed and evidence-bound).

---

## 2. Research backlog

Priority: **P0** blocks the custody spine or deployment sizing. **P1** blocks a major domain. **P2** improves fidelity. **P3** later. Each item is closed when two independent facilities confirm it, a blank form or written procedure is obtained, and an OIC has reviewed the resulting model.

| ID | Area | Question | Why it matters | Known | Hypothesis in the model | Method | Pri |
|---|---|---|---|---|---|---|---|
| R-01 | Regulations | Full text of the Prisons Regulations 2012: admission particulars (s.61), prescribed registers, counting, discipline, visits, property, classification | Settles many `[U]` at once | Exists as SI 2012 No. 65; automated access blocked | Provisional shapes in 01 B.7 | DESK: obtain via UPS Legal, a practitioner, or manual download | P0 |
| R-02 | Standing Orders | UPS Standing Orders content | Same; also role and delegation | Referenced in ss.7(2), 77(2) | As above | DESK and FIELD | P0 |
| R-03 | Daily routine | Unlock and lock-up, count method, parade, shift pattern, handover | Count and duty log design | "Unlock" figure [P], regulation title [S] | Count and occurrence records (F1.1, F1.3) | FIELD: shadow a full 24 hours | P0 |
| R-04 | Registers | Actual formats of admission, release, property, transfer-of-detainees, gate, exhibits, medical registers, VJ Book, visitor's book, application book | Register views, generated documents | Names [P] | Neutral provisional layouts | FIELD: photograph blank books | P0 |
| R-05 | Sentence administration | Entitlement computation, remission in practice (s.84, s.85), states such as life, pending mitigation, pending Minister's order | Core of discharge and due lists | Statutory rules [P]; CG categories [P] | F2.3 | DESK and FIELD | P0 |
| R-06 | Remand cycle | Warrant renewal cadence and who tracks it; threshold action; s.118 form; who is notified at 60 and 180 days | Court diary and thresholds | Thresholds [P]; 6,417 overdue [P] | Free-text action taken plus documents | FIELD | P0 |
| R-07 | Roles | Who does which action at a facility; OIC delegation; dual control; account vs staff | Permission templates | OIC [P] | Templates in 05 M.2 | FIELD | P0 |
| R-13 | PMIS and returns | What facilities send to region and HQ today; PMIS data dictionary, pilot sites, import and export | Adoption, duplicate entry, interop | Module names [S]; two-site pilot [S] | Monthly return in UPS shape | DESK and FIELD | P0 |
| R-14 | Transfers | Who initiates, order form, escort, documents, receiving acceptance, how property and health files travel | W5 | Statute [P] | Dossier plus confirmation | FIELD | P0 |
| R-22 | ICT environment | PCs per facility, OS, power, LAN, internet, printers, scanners, skills | Node design, sizing, transports | Nothing | Modest PC as node; Windows likely [H] | FIELD: audit | P0 |
| R-08 | Prisoner discipline | Offences, hearing, sanctions, appeal | F5.2 | s.81, s.85, s.95 [P]; Mandela [I] | Configurable vocabularies | DESK (Regs), FIELD | P1 |
| R-09 | Incidents | Taxonomy, reporting chain, use of force (s.40), injury reporting | F5.1 | Escape [S], death [P] | Seed kinds | DESK, FIELD | P1 |
| R-10 | Accommodation | Unit naming, capacity per unit, categories | F3.2 | Sex separation [P] | Facility-defined units | FIELD | P1 |
| R-15 | Release practice | Discharge forms, before-noon execution, transport, foreign nationals, holds | W4 | s.83 [P] | As W4 | FIELD | P1 |
| R-16 | Court practice | Production sheets, escort by prison or police, virtual booking, how outcomes arrive | W3 | ss.67, 118 [P] | As W3 | FIELD | P1 |
| R-17 | Health | Who employs medical officers; register content; TB and HIV reporting; certification of death; confidentiality | F4.1 scope | s.26 [P] | Movements only | FIELD, Ministry of Health | P1 |
| R-20 | Retention and access | Records retention schedule; DPPA storage limitation; prisoner access and copy | Archive and Disclosure Register | DPPA [P]; r9 [I] | Configurable classes | DESK | P1 |
| R-21 | Adoption gates | NITA-U certification, PDPO registration, residency, e-GIF | Whether the Service may adopt | Partly [S] | Deployable in Uganda | DESK, direct enquiry | P1 |
| R-23 | Regional tier | What Regional and District Commanders monitor; whether a regional node is needed | HQ scopes, relay transport | ss.32 to 34 [P] | Scoped views over HQ | FIELD | P1 |
| R-25 | s.88, parole, licence | Forms and processes in practice | F2.8 | Statute [P] | Bundle assembly | FIELD, DESK | P1 |
| R-26 | Facility identity | Canonical facility codes; split, merge handling; regions and districts | Registry | 19 regions [P]; Moroto split [P] | Self-declared identity, verified | DESK, FIELD | P1 |
| R-27 | Prisoner identifiers | Any PMIS number; NIN integration; biometrics; cross-episode matching | Locator design | None found [P] | National ID as keyed match | DESK | P1 |
| R-35 | Statistics definitions | "Unlock" versus daily average; how approved capacity is defined per unit | Return correctness | Both terms used [P] | As documented | DESK | P1 |
| R-11 | Food | Ration issue, count linkage, special diets | Deferred | s.110(1)(b) [P] | Derive from count | FIELD | P2 |
| R-12 | Stores | Stores, vehicles, farm outputs | Deferred | s.30(2)(a) [P] | Out for now | FIELD | P2 |
| R-18 | Visits detail | Passes, register, conduct-linked privilege, prison ministers | W7 | Categories [S] | As W7 | FIELD | P2 |
| R-19 | Communication | Letters, censorship, telephone, electronic | F4.3 | s.78 [P] | Letters only | FIELD | P2 |
| R-24 | VJ procedure | How remarks are entered and extracted; channel and timing | W14 | s.110 [P] | Digital record replaces extraction copy | FIELD | P2 |
| R-28 | Juveniles | Remand homes boundary | W1, W4 | s.58(7) [P] | Refuse, redirect | DESK | P2 |
| R-29 | Foreign nationals | Consular notification, discharge | W4 | Consular guidance [S] | Flag only | DESK | P2 |
| R-30 | Death chain | Prison-side practice against the Inquests Act | W11 | Act [P] | As W11 | FIELD | P1 |
| R-31 | JLOS interfaces | Judiciary case systems, E-Justice APIs | Later interop | E-Justice aim [P] | Documents in and out | DESK | P2 |
| R-32 | Programmes | UVTAB, education specifics | F4.5 | Secondary | Current model | DESK | P3 |
| R-33 | Localisation | Languages of forms and notices | Templates | s.101(3) [P] | English plus vernacular | FIELD | P3 |
| R-34 | Sex and gender | Recording under Ugandan law against Mandela r7(a) | Prisoner file | Male, female today | Policy-controlled field | Legal review | P2 |

---

## 3. Field validation kit

A single structured site programme closes most P0 and P1 items, and it doubles as the pilot design for the provisional modules. It needs UPS written authorisation, and **no identifiable prisoner data leaves the facility**.

1. **A full 24 hours** at a willing facility: unlock, count, court departures, meals, work, visits, medical, lock-up, shift change, handover. Timestamp what happens.
2. **Blank forms and books**, photographed: every register named in the ledger, plus occurrence book, count sheets, application book, remand warrant, production order, release order, transfer order, discharge certificate, monthly return.
3. **Interview matrix**: OIC; records or reception; gate; duty officer; court production; medical officer or liaison; welfare or social worker; store keeper; a Mukutano representative with consent; the Regional Commander's office; HQ statistics.
4. **Five traced cases** (anonymised): a convicted admission, a remand admission with a pending instrument, a court-ordered release, a transfer, a hospital referral. Follow each from paper to paper.
5. **ICT audit** (R-22): machines, operating system, power, LAN, internet, printers, scanners, skills.
6. **Paper prototypes** of the provisional shapes (count sheet, occurrence log, incident report, confinement record) shown to practitioners for correction.

**Second facility** for confirmation, chosen to differ (a large remand facility such as Luzira-type versus a small rural unit; a women's facility).

**What can be built before this completes**: everything `CORE` whose rules are statutory (custody, reception, discharge with gates, court diary, s.118, visits, property, requests, transfers two-ended, returns builder, documents, audit, exchange, node and LAN, backup). **What waits for it**: making any `PROVISIONAL` module a required workflow or a source of HQ statistics.
