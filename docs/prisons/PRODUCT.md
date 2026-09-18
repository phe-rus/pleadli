# Pleadli Prisons — Product Model

This is the product model for Pleadli Prisons, produced after the research phase (`docs/prisons/RESEARCH.md`) and revised after a deep operational research pass (RESEARCH.md §11) explicitly demanded before any further code. It follows the same discipline as `docs/police/PRODUCT.md` and `docs/dpp/PRODUCT.md`: only claims grounded in verified research are treated as real requirements; everything else is marked as an open question, not invented.

**Status**: built through Prisoners/Releases/Transfers/Health & Welfare/Court-Production/Remand/Visits(authorization+attendance)/Rehabilitation & Work, all runtime-verified. **This revision does not itself implement anything** — per explicit instruction, this is research + product-model + gap-analysis + navigation proposal only, for review before any further implementation begins.

**2026-09-18 correction**: a skeptical code audit (requested after the engineer pushed back on an earlier "zero gaps" scope-planning pass) found this document's own Gap Analysis table was wrong about Reports (claimed done, wasn't) and silent about Search (never listed at all, only covers Prisoners). See the corrected rows in §4 below and `docs/scope/prisons/scope.md` for the resulting planned work. See also `docs/prisons/RESEARCH.md` §12 for new research into what would help Uganda government adoption specifically (JLOS, NITA-U, the Data Protection and Privacy Act 2019) — a different question from the operational research above, not previously covered.

**Why this revision happened**: the built application was assessed, correctly, as "clean and structured" but still too centered on `Person → Admission → Custody → Movement → Release` — real, but only part of what a prison actually is. A prison is a continuously operating institution, not just a place where people are stored and moved. This revision's job was to find out, from real evidence, what else that institution actually does — not to add features until the sidebar looks complete.

## Research method, and what it changed

Four parallel research passes covered: (1) custody depth, movements, court/legal interaction; (2) daily operations, headcounts, staff, incidents, discipline; (3) visits, appointments, attendance, rehabilitation depth; (4) property, medical coordination, requests, documents/registers. Full findings are in RESEARCH.md §11. Two things matter for reading everything below:

1. **A real methodological trap was caught mid-pass and is now a standing rule** (RESEARCH.md §11.0): search-engine snippet synthesis of the still-inaccessible Prisons Regulations 2012 surfaces fluent, specific-sounding text — some of which turned out to be **Barbados's** prison regulations, not Uganda's, due to shared Commonwealth colonial-era legislative boilerplate. Every finding below sourced this way is marked accordingly and treated as unconfirmed unless independently corroborated by a genuinely Ugandan primary source. This directly validates the brief's own instruction not to assume Uganda does what another country's prison service does — it nearly happened here, and was caught.
2. **Several things previously marked "still genuinely UNKNOWN" are now grounded**, mostly by re-mining the Prisons Act 2006's own already-fetched full text more carefully (prisoner property/effects, sex segregation, cell/ward vocabulary, a disclosure duty at admission) and by two strong new primary sources: the Commissioner General's own Feb 2024 conference paper, and UHRC's 26th Annual Report (2023). Others (headcount mechanics, staff duty rosters, granular prisoner-discipline procedure) remain genuinely unresolved even after this fourth attempt — that is a real finding, not a shortcut, and is stated plainly below rather than filled with a plausible guess.

## The fundamental idea

> **Pleadli Prisons is software for operating one prison — both the custody/welfare responsibility for each person in it, and the day-to-day coordination the facility itself requires — not a national UPS database, and not Police or DPP with different labels.**

This has two distinct levels, and the product must answer both:

- **Person level**: what is happening with this person — their custody status, movements, visits, health, rehabilitation, property, discipline, documents.
- **Facility level**: what is happening in this prison right now — staffing, incidents, and (where the evidence supports it) daily operational coordination. This level is real but, per the research, much thinner than the person level for this specific institution — see the Gap Analysis for exactly why.

## What Pleadli Prisons is NOT

- a national Uganda Prisons Service system (that's UPS's own PMIS — RESEARCH.md §11.8 confirms PMIS is real, its own separate system, still pilot-stage at two facilities — Pleadli Prisons is one prison's own working tool, not a competitor to PMIS)
- a clone of Police's or DPP's domains
- a health-records system (health care is statutorily hybrid, and evidence this pass shows custody-officer discretion actually dominates real medical-movement decisions — Prisons coordinates around health events, it doesn't direct clinical care)
- a coronial/inquest-management system
- a generic calendar or task-management app — scheduling only exists here in service of a real, evidenced workflow (court attendance), not as a general-purpose feature
- a disciplinary-tribunal system built from unverified regulation text — the granular prisoner-discipline detail found this pass is explicitly flagged low-confidence and not modeled yet

## 1. Core record — unchanged, already correct

**"Prisoner"** (Prisons Act s.2) — one record per custody episode, not a de-duplicated person (RESEARCH.md §9, unchanged this pass). Three statutory categories on one entity (convicted / unconvicted / civil), no official reference-number format. See prior revision's reasoning, still valid — nothing in this pass contradicts it.

## 2. Person-level operational capabilities

### Admission & Custody
- **Owns**: the admission event (instrument type, issuing authority, date, particulars), current status, the s.118 pre-session list, derived mandatory-bail-eligibility flag (60/180 days — now independently re-confirmed by the Commissioner General's own Feb 2024 figures, RESEARCH.md §11.3, not just a secondary case-law source).
- **New this pass**: a real, named disclosure duty at admission (s.58(5)) — every prisoner must be given written information on the rules governing their category, disciplinary requirements, and the complaints procedure. **Real but too shallow to build a feature around yet** — no named form exists, and the "complaints procedure" this refers to is very likely the Human Rights Committee/Mukutano mechanism (see Communication & Requests below), which is worth grounding as its own domain before wiring a disclosure-acknowledgement feature to it.
- **A real, named data-integrity state, not an error to prevent**: UPS's own Commissioner General reports "conviction without commitment warrant" (98 cases) and "conviction without sentencing" (4 cases) as real, tracked states (RESEARCH.md §11.3). The current schema effectively assumes admission always has its instrument on file. **Product question, not yet resolved**: should `admission_instrument_type` be able to represent "convicted, document pending" as an honest state rather than forcing a false completeness? Flagged for a product decision, not silently changed.
- **Sex segregation and cell/ward vocabulary confirmed** (s.29, s.60, s.81, s.124(2)(g)) — corrects an earlier over-broad claim that no such terms exist in the Act. Still no structured Facility→Block→Wing→Cell hierarchy found — the free-text `current_location` field remains the right, honest model, but could reasonably show "ward"/"cell" as real example placeholder text instead of a made-up example.

### Property & Effects — new, grounded directly in the Prisons Act, no longer UNKNOWN
- **Supports**: an admission-time record of what the prisoner isn't allowed to retain, returned at release — a real statutory duty, previously flagged as a genuine gap.
- **Grounded in** (RESEARCH.md §11.1, s.62/s.30(2)(a), **Primary**): non-retainable money/clothes/personal effects are placed in the officer in charge's custody at admission, entered in "prescribed registers," with an inventory kept, and returned at release/discharge. The officer in charge is personally accountable for loss/damage. Corroborated in the field by UHRC's 2023 inspections (a real "property register" and "inventory" exist in practice) and by UK consular guidance noting items sometimes go missing during arrest/transfer.
- **Model as**: a simple admission-time record (what was retained, brief description) linked to the Prisoner, marked returned at release. **Do not** build a structured multi-field inventory system yet — the exact recordable fields, any signature/receipt step, and precise release-time return procedure remain unconfirmed (most likely in the still-unreachable Regulations). A free-text-heavy record, honest about what's actually known, is the right scope for now.

### Movements — extended beyond transfer
- **Court production** (s.67, unchanged) now has a real, evidenced alternative delivery mechanism: **virtual/video-link production**, operating in 19 (per the Commissioner General, Feb 2024) to possibly 21 prisons, since a 2019 Chief-Justice-launched pilot at Luzira (RESEARCH.md §11.2, **Primary**). UPS's own Prisoner Management Information System separately names "court attendance and scheduling" as one of its real modules (§11.8) — the clearest evidence this is a first-class UPS concept.
  - **Model as**: a `production_method` field (physical / virtual) on the existing Court Production record, not a new domain. Only relevant where the installation's prison actually has conference-facility equipment — not universal.
- **No "escort" role, rank, or procedure exists anywhere in the Prisons Act** (confirmed by direct full-text search this pass) — this is a genuine, confirmed absence, not an unresearched gap. Do not model an escort concept.
- **Medical movement** remains exactly what's already built (health-event referral/return pairs, ss.74-76) — a distinct full-prison *transfer* for medical reasons (not a temporary hospital removal) is just an application of the existing general transfer power (s.73), with "medical need" as one real, named reason worth allowing as free text, not a new domain.

### Visits — refined and built out to six categories (decided and implemented 2026-09-11)
The authorization+attendance model remains structurally correct. Three concrete refinements were decided and built:
- **A fourth category, personal_doctor**: a prisoner's personal doctor gets the same "not within hearing" privacy exception as a legal advisor (RESEARCH.md §11.7, **Secondary**), distinct from both an ordinary visitor and the prison's own s.26 medical officer.
- **A fifth category, voluntary_visitor**: relatives (wife, husband, children, siblings — a narrow list) are now distinguished from "voluntary visitors" (lawyers, NGOs, care officers, clergy, religious teachers), who don't map cleanly onto ordinary/legal/medical.
- **special_authorization split into two**: `special_authorization_weekend` (a timing exception, any visitor) and `special_authorization_researcher` (a visitor-category exception, any day) — the evidence suggested these are genuinely separate concepts, not one tier. Older rows with the unsplit `special_authorization` value may still exist; the label falls back to the raw value for those.
- `visit_type` remains a free-text tag (no backend schema change was needed) — the full enumerated set of six real categories lives in `apps/prisons/src/features/visits/schema.ts`.
- **Still genuinely UNKNOWN, not built**: visit privilege as conduct-contingent (a 3-visitor cap, "conduct and progress" eligibility) — **Secondary, real contamination-risk caveat applies (RESEARCH.md §11.0)**; visit outcomes beyond attended/denied, no-show/cancellation, and repeat-visitor history.

### Rehabilitation & Work — extended with a real completion/certification concept
- The existing "participation as status, not calendar" model holds up — no scheduling/attendance system was found to contradict it, confirmed again by an independent primary source (UPS's own Farms Department FY2022/23 report: real recordkeeping exists, but for produce/machinery outputs, not per-inmate attendance).
- **New, grounded, and should be added**: the Uganda Vocational and Technical Assessment Board (UVTAB), an external national body, runs real competence-based trade-testing assessments UPS inmates participate in, resulting in an actual certificate (RESEARCH.md §11.9-11.10, **Secondary** — press + UPS's own social-media citation of a JLOS report). This is a discrete, dated, external assessment/certification *outcome*, not daily attendance. The existing domain's own doc comment ("do not invent skill-certification tracking... none of that was found") is now outdated — **add a completion/certification field** (date + optional certificate reference) to Programme Participation; do not build a scheduling system around it.
- Real staff/instructor detail now exists for at least the Farms sub-programme (3,618 staff, mixed custodial/civilian-technical, 1:6 ratio) — informative context, not a feature to build (staff assignment to programmes is a facility/staff-operations question, not a Prisoner-record one).
- **Classification-driven programme placement remains aspirational** (a UNODC pilot, six sites, security/radicalization-focused) — do not model programme eligibility as classification-driven.

### Health & Welfare — unchanged, doubly corroborated
No change to the existing referral/return event-pair model. This pass independently confirmed the referral boundary is right (UHRC 2023: in-facility emergency care for minor cases, referral out for complex ones) and surfaced a real, important finding about **what not to build**: evidence (Human Rights Watch, 2011, dated but illustrative) shows medical-movement decisions in practice are custody-officer-led, not medical-directive-led, with officers moving prisoners "including those undergoing medical treatment" without medical consultation. **Do not build a "medical instructs custody" restricted-duty feature** — it would misrepresent real practice, not reflect it.

### Release — unchanged
No change. The six-plus-one real trigger types remain correct.

### Communication & Requests — new domain, real evidence from two independent sources
- **Supports**: a real, named grievance/complaint mechanism, distinct from Visits and from a formal Decision-equivalent process.
- **Grounded in** (RESEARCH.md §11.6, **Primary** — UHRC 26th Annual Report 2023, §11.2.3.20; independently corroborated **Secondary** by UK FCDO consular guidance naming the same mechanism locally as "Mukutano"): an elected inmate committee receives complaints (food quality/quantity, remand overstay, general welfare), escalates to the officer in charge / a staff committee via monthly reports, which then "take further action." UHRC found this mechanism "instituted in the majority of prisons" and "active." A separate "Welfare Officer" channel is also named (Secondary only).
- **Model as**: a plain complaint log — who raised it (may be anonymous/committee-sourced rather than individually attributed), category (food / remand overstay / general welfare / other), date, a free-text outcome note. **Do not** build a structured multi-stage case-management system — the exact record format and "further action" detail are not confirmed beyond this shape.
- This is the strongest new candidate for a first-class domain in the entire research pass — real, evidenced by two independent sources, narrow enough not to require invention.

### Disciplinary (prisoner) — real in principle, NOT built, confidence too low for the detail
- The Act itself confirms a disciplinary system exists in outline (s.85's remission-forfeiture-for-discipline hook is already built and correct). Search-snippet synthesis surfaced a much more detailed hearing-before-punishment rule, an offence taxonomy (minor vs. aggravated), a sanctions ladder, and a medical-veto-on-punishment-diet rule — **but this is exactly the kind of fluent, specific, Commonwealth-boilerplate-shaped text RESEARCH.md §11.0 warns about, with no independent Uganda-specific corroboration**.
- **Do not build a Disciplinary domain from this pass's findings.** The *existence* of a disciplinary process is real; the *procedure* is not reliably confirmed. This needs either the actual Regulations text or a practitioner source before it becomes a real feature, exactly the same standard already applied to headcounts and staff duty.

### Documents — extended with a real register taxonomy
- **New**: UHRC's 2023 inspection names the actual register set a Ugandan place of detention keeps: admission, release, property, transfer-of-detainees, gate, exhibits, and medical registers, plus medical treatment records (RESEARCH.md §11.6, **Primary** for the names; content/fields UNKNOWN). "Lockup register"/"station diary" read as police-specific in the same source, not prison-specific — excluded here.
- This closes part of the prior "does a transfer register exist beyond what the Act names" open question — yes, by name, confirmed in real 2023 field inspections, even though the Act itself never names one.
- **Model as**: names and rough purposes only in this document — do not build field-level schemas for registers whose content isn't independently confirmed. The existing generic Attachment/Vault mechanism remains the right storage pattern.

## 3. Facility-level operational capabilities

This is where the research pass, honestly, found the least — and that is itself the most important finding to carry forward rather than paper over.

### Daily operations & headcounts — mostly still genuinely UNKNOWN after a fourth attempt
- **What's real**: UPS's own vocabulary for a population snapshot is "**Unlock**" (Commissioner General's own Feb 2024 paper, **Primary**) — worth adopting for the product's own "as of [date]'s count" framing. A regulation titled "Counting prisoners" is confirmed to exist (bare section title, lower contamination risk than full text, but still unread). Escape response is grounded in outline (officer in charge orders an immediate search + police notification, **Secondary**, consistent with the Act's own re-arrest mechanism).
- **What's still not found**: the actual headcount/muster mechanics (frequency, parade steps, discrepancy escalation), shift handover procedure, and any daily-log/register format for routine facility events. This is not for lack of trying — four independent research attempts across two sessions have now failed to recover this, from official UPS material, UHRC's own field inspections, parliamentary/Auditor-General material, and incident-driven press coverage.
- **Do not build a headcount, daily-log, or shift-handover feature.** A title existing in a regulation is not a procedure. This stays honestly UNKNOWN.

### Staff operations
- **Staff establishment** (headcount by rank/category) is real, well-grounded, and already correctly modeled as read-only profile-level context (RESEARCH.md §1, freshly re-confirmed §11.5) — no change needed.
- **Staff duty/shift/post assignment** — the "who's on duty right now" layer — remains genuinely MISSING/UNKNOWN after a fourth attempt. The Regulations' own standing-conduct rule titles (gatekeeper duties, not leaving a prisoner unattended, not being absent during working hours) don't imply a formal rostering system exists. **Do not build a duty-roster domain.**
- **Staff discipline** is real (delegated to the Officer in Charge, one fully-documented real case) but currently entirely unbuilt, and the confidence level (mostly Secondary, rank-cutoff details uncertain) doesn't support building it yet as a first-class domain — flagged, not built.

### Incidents & security events
- **Escape response** is the one real, if thin, grounded workflow (Secondary, search-snippet synthesis, consistent with the Act's own re-arrest mechanism) — officer in charge orders an immediate prison-and-neighbourhood search and notifies police.
- **No broader incident taxonomy** (altercations, prohibited items, visitor/staff incidents, investigations) was found grounded enough to model. **Do not build a generic Incident domain** from this pass — the one real workflow found (escape) is arguably already representable as a Release-adjacent or Movement-adjacent event once a product decision is made about where it lives; a broader incident-management system would be invention.

### Reports
- Unchanged in shape. New, real data to extend breakdowns with: the Commissioner General's own age-group / capital-offence-type / nationality / sentence-category statistical categorization (RESEARCH.md §11.1, **Primary**) — real, current, and directly usable to extend Reports' population breakdowns without inventing anything.

### Organizational responsibility
- Unchanged. One installation, one prison, one Officer in Charge remains correct and is, if anything, reinforced by this pass (officer-in-charge-level discretion shows up repeatedly as the real locus of day-to-day authority — property custody, disciplinary delegation, movement decisions, escape response).

## 4. Gap analysis

| Area | Assessment | Why |
|---|---|---|
| Admission & Custody | REAL AND GOOD, extend cautiously | Core model correct; the "conviction without commitment warrant" real-data-state is a genuine open product question, not a bug to silently fix |
| Property & Effects | REAL BUT DISCONNECTED (2026-09-18 audit) | The admission-time record and returned marker are both built, but Release does not touch property at all — releasing a prisoner never marks or prompts marking their property returned. Two features that coexist, not the one workflow s.62 actually describes |
| Court Production | REAL BUT TOO SHALLOW | Physical production only; virtual/video-link production is real, operating at 19+ prisons, and has no field to represent it |
| Movements (escort, other) | NOT CURRENTLY NEEDED | No escort role/procedure exists in Ugandan law at all — confirmed absence, not a gap |
| Visits | REAL AND GOOD | Structurally right; personal-doctor category, voluntary-visitor taxonomy, and the special/researcher-authorization split are now built (decided 2026-09-11) |
| Rehabilitation & Work | REAL BUT TOO SHALLOW | Participation-as-status model holds; certification/completion (UVTAB trade-testing) is real and missing |
| Health & Welfare | REAL AND GOOD | Doubly corroborated this pass; explicitly do not extend into "medical instructs custody," since that would misrepresent real (custody-officer-led) practice |
| Release | REAL AND GOOD | No change |
| Communication & Requests | MISSING → now buildable | Real, two-source-corroborated mechanism (Human Rights Committee/Mukutano) — the strongest new domain candidate in this pass |
| Disciplinary (prisoner) | UNKNOWN, do not build | Real in outline (s.85 hook already built); granular procedure is contamination-risk-flagged, not reliable enough to model |
| Documents | REAL BUT TOO SHALLOW | Register taxonomy now named (UHRC); content/fields still unconfirmed — extend the document list, not the schema |
| Daily operations / Headcounts | UNKNOWN, do not build | Confirmed unresolved after a fourth independent attempt from new angles — genuinely the hardest gap in Ugandan-specific sourcing |
| Staff duty/shift/handover | UNKNOWN, do not build | Same as above — standing conduct rules exist, a rostering system is not evidenced |
| Staff discipline | FUTURE | Real, but confidence too low and scope too HR-adjacent to build now; revisit if Standing Orders or a practitioner source surface |
| Incidents (beyond escape) | UNKNOWN, do not build | No broader taxonomy found; escape response alone doesn't justify a general Incident domain |
| Reports | MISSING, despite being marked done (2026-09-18 audit correction) | This row previously said "REAL AND GOOD, extend" — a 2026-09-18 code audit found none of the four documented breakdowns (age group, capital-offence type, nationality, sentence category) actually exist in `domain/reports.rs`. Still grounded and buildable exactly as described below; the prior verdict here was simply wrong, not a change in the underlying research |
| Search (cross-domain) | REAL BUT TOO SHALLOW (2026-09-18 audit) | Not previously in this table. Only searches Prisoners; Visits, Requests, Court Productions, Releases, Transfers, Health Events, Property, and Programme Participation are all real domains with no search coverage |
| Appointments (general) | NOT CURRENTLY NEEDED | Evidence supports only court-attendance scheduling as a real concept; a cross-cutting Appointments domain would be invention |
| Attendance (general) | NOT CURRENTLY NEEDED | Confirmed again by an independent primary source (Farms Dept report) — not evidenced beyond court attendance |
| Facility hierarchy (block/ward/wing/cell) | UNKNOWN, do not build | "Cell"/"ward" are real flat terms; no structured hierarchy is evidenced — free-text location remains right |

## 5. Prisons ↔ Courts boundary — reinforced, one addition

Unchanged in principle (s.118 proactive list, s.67 reactive production). This pass adds: virtual/video-link production is a real, operating alternative delivery mechanism for the same obligation, worth a `production_method` field, and UPS's own Legal Aid/Paralegal Advisory Services partnership delivers the s.64(3) legal-access entitlement at real scale (12,985 inmates, FY2023/24) through a named external programme — worth noting as context for the legal_advisor visit type, not a new domain.

## 6. Prisons ↔ Police / DPP boundary — unchanged

No general "Prisons must notify DPP" statute was found, confirmed again. Death-in-custody remains the one real cross-institutional workflow, routing through LC I/police and the coroner.

## 7. Person model, Document model, Search model — unchanged

See prior revision; nothing in this pass contradicts them. Documents gains the register-name list above; no structural change.

## 8. Navigation proposal (revised)

```
Pleadli Prisons

Overview                    (what needs attention: remand thresholds, court sessions due,
                              parole windows, hospitalised prisoners awaiting return —
                              real derived stats only, per the standing convention)

Search

Admission                   (receiving a prisoner under a real warrant/order)

Prisoners                   (the core record + workspace: custody/remand tracking,
                              property & effects, health/welfare events, transfer history,
                              release history, visits (authorization + attendance),
                              programme participation + certification, documents —
                              one workspace, not scattered registers)

Court Production & Remand   (s.118 list, s.67 production orders, now with a
                              physical/virtual production-method distinction)

Requests & Complaints       (NEW — the Human Rights Committee/Mukutano mechanism:
                              a plain log of complaints raised, category, and outcome)

Reports                     (population by category incl. age/offence-type/nationality/
                              sentence breakdowns, occupancy, releases, transfers,
                              visits, health events, court productions)
```

**What is deliberately NOT a new top-level nav item, and why**: Property & Effects lives inside the Prisoner workspace (an admission-time record, not a browsable list of its own). Staff duty, headcounts, and Disciplinary are not in the navigation at all — they're UNKNOWN or FUTURE, not built, and adding an empty or placeholder nav entry for them would misrepresent the product the same way an invented feature would.

This is a revised proposal, not a locked structure — it should be confirmed before implementation, same as the original navigation was.

## 9. What is explicitly out of scope (for now)

- A national UPS system (PMIS is UPS's own, confirmed real and separate, still pilot-stage — not this app's job)
- A health-records/clinical system, or a "medical instructs custody" directive feature (evidence shows the opposite is real practice)
- Inquest/coronial process management
- Sync engine, offline conflict-resolution, multi-prison infrastructure
- Biometric identification, AI decision-making
- A hardcoded complete UPS national organizational hierarchy
- Billing, decorative analytics, invented metrics
- A structured facility hierarchy (block/ward/wing/cell) — "cell"/"ward" are real flat terms, no hierarchy is evidenced
- A general cross-cutting Appointments domain — only court-attendance scheduling is evidenced
- A general cross-cutting Attendance domain — only court attendance is evidenced, confirmed by two independent passes now
- A Disciplinary (prisoner) domain with granular procedure — real in outline only, detail is contamination-risk-flagged
- A Staff duty/shift/handover domain — genuinely unevidenced after four attempts
- A Headcount/daily-log domain — genuinely unevidenced after four attempts
- A general Incidents domain beyond the one grounded escape-response workflow
- A generic calendar or task-management feature

## 10. Uncertainties still open (require product clarification or further research, not invention)

- Exact prescribed admission particulars, and property/effects record fields — the Prisons Regulations 2012 likely has both; still inaccessible after four attempts across four sessions (see RESEARCH.md §9, §11.0).
- **Headcount/muster mechanics, staff duty rosters/handover, and granular prisoner-discipline procedure remain genuinely UNKNOWN** even after this deep pass — do not build any of these without either the Regulations text or a practitioner source.
- Whether "convicted without commitment warrant on file" should be representable as an honest state in the schema — a real product decision, not a research question.
- Whether the Trial on Indictments Act's alleged "officer-in-charge certificate of prior conviction" provision is real — surfaced via search synthesis only, not independently verified; a different, not-yet-attempted URL exists for this one and could be worth a real fetch in a future pass.
- Whether `nationalId` is a reliable cross-episode search key — unresolved, same as before.

## Final test

Before considering any implementation complete, ask:

**Could a prison officer actually use this during their shift? Does it help them know what is happening, coordinate people and activities, and preserve the institutional record — using only what's actually been verified about how this institution works, not a plausible-sounding guess?**
