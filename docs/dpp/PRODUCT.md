# Pleadli DPP — Product Model (Phase 1)

This is the **Phase 1 product model** for Pleadli DPP, produced after the research phase (`docs/dpp/RESEARCH.md`) and before any schema or broad implementation work. It follows the same discipline as `docs/police/PRODUCT.md`: only claims grounded in verified research are treated as real requirements; everything else is marked as an open question, not invented.

**Status**: approved 2026-09-11, first vertical slice built (`apps/dpp/`: People, Prosecution Files, Referrals, Decisions, Search). **Revised twice since**: first after the user flagged the UX was too shallow relative to real document-centric Ugandan file work (see [[feedback_pleadli_document_centric_ux]]) and that Plea Bargaining had been wrongly assigned to DPP — resolved via a wider research pass. **Revised again** after a full product-direction correction: the DPP built so far "looks like well-organized software for storing forms, rather than software prosecutors would actually want to use to do their work." The concrete problem named: a prosecutor cannot make an informed legal decision from a referral containing "a few basic structured fields" — DPP must actually receive and let the prosecutor review the real material Police sends (statements, evidence, charge information), not just a reference to it. See §"Police Material (received)" and §"Review & Legal Observations" below, both new, and the "Architectural boundary" section addressing the real constraint this redesign runs into: Police and DPP are separate local databases with no sync engine, so this cannot mean live cross-app data-linking today.

Every claim below traces to a numbered finding in `docs/dpp/RESEARCH.md`, or to the follow-up docs named above where noted. Where research left something genuinely unresolved, this document says so rather than filling the gap.

## The fundamental idea

> **Pleadli DPP is software for doing prosecution work — receiving, reviewing, deciding, preparing, and tracking a file through prosecution — not software for entering case data.**

Do not copy Police's domains into DPP. Police investigates; DPP reviews what's referred to it, makes and records prosecutorial decisions, prepares court documents, and tracks the matter through court. These are different jobs and need different software, even though both work with "the same" underlying real-world matter.

## What Pleadli DPP is NOT

- a renamed clone of Pleadli Police
- a generic case-management SaaS template
- a digital register of incoming files
- a judiciary case-management system
- a decision-maker (AI or otherwise) — prosecutorial decisions are made by prosecutors; the software records and organizes them

## 1. Core DPP record

**"Prosecution File"** — chosen as the entity name for this codebase.

ODPP's own working term, confirmed directly from its 2023 Decision to Charge Guidelines, is simply **"file"** — not "case," "matter," or "docket" (RESEARCH.md §2). "Case" is used loosely and informally alongside "file" in the same documents, never as a distinct defined term. Three distinct reference numbers exist on one real-world matter (RESEARCH.md §2, §5):

1. A **police-side reference** — **format confirmed 2026-09-11** (`docs/police/research/file-structure-and-numbering.md`, cross-checked against three independent ULII case citations): `{full station name} CRB {number}/{year}`, e.g. "JINJA CRB 314/2019" — the station name is always spelled out in full, never abbreviated to a code, and is part of the reference itself, not a separate prefix. The seed/example data used in DPP's first slice ("CRB 221/2026" with the station recorded only in a separate field) was missing this — treat the police reference as a single citation string in this real form, with the separate `policeStation` field kept only as additional structured metadata for search, not as a replacement for the full citation.
2. The **ODPP registration number**, assigned by ODPP to its own file. Exact format **still unconfirmed** even after the 2026-09-11 follow-up pass (`docs/dpp/research/file-structure-and-jurisdiction.md`) — ODPP's Decision to Charge Guidelines were re-checked in full and contain no file-numbering convention anywhere. Continue treating this as free text; do not invent a pattern.
3. The **court case number**, assigned only once the Charge Sheet is filed and a court file is opened (RESEARCH.md §2, §5).

**Naming decision, flagged for confirmation**: "Prosecution File" is proposed rather than bare "File" purely for UI/codebase disambiguation across a multi-app product (Police already uses "Case"). This is a Pleadli-specific naming choice, not a claim about ODPP's own vocabulary — the entity's real-world referent is what ODPP itself just calls "the file."

**Cardinality (grounded in RESEARCH.md §2, §3):**
- One Prosecution File can bundle multiple charges/counts against multiple accused, provided they arise from the same facts/character (governed by real joinder rules — Magistrates Courts Act §86-88, Trial on Indictments Act §23-24). Unrelated charges must be split into **separate** ODPP-registration-numbered files, even if referred together.
- A Prosecution File can be sent back to Police for further investigation and resubmitted — this is a named, established ODPP practice ("return for further investigation"), not a terminal rejection.
- A Prosecution File can proceed through more than one court: it starts in a magistrate's court and may be **committed** to the High Court (Magistrates Courts Act §168-169), can be **transferred** to a superior court mid-proceeding (§167), or **committed for sentence only** after conviction (§164).
- Whether one Police case can produce multiple Prosecution Files, and whether multiple Police referrals can ever relate to one Prosecution File, is **not directly established** beyond the joinder/splitting rule above — do not assume a strict 1:1 beyond what that rule implies.

## 2. Major operational domains

Not final navigation categories or tables — work capabilities, per the Police convention.

### Intake & Referrals
- **Supports**: receiving a Police file as an actual incoming work item, not "another case record."
- **Owns**: the referral record — Police station/reference, date received, current review status, assigned prosecutor. **The "accompanying material inventory" this originally described as a single free-text field is no longer sufficient — see Police Material (received) below, which is where the actual content now lives.**
- **Relates to**: creates or updates a Prosecution File; references (never imports) the Police case.
- **Kind**: workflow + record. First-class per the brief — this is one of the most important early screens.
- **Grounded in**: RESEARCH.md §3 (sanctioning as the normal-track handoff mechanism; Threshold Test as the fast-track exception for very serious cases with incomplete investigation); ODPP's own Decision to Charge Guidelines list, in enumerated detail, what evidence must actually be on the file at the point of charge (RESEARCH.md §3): "all relevant witness statements (including exculpatory ones), statements from investigating/arresting officers, expert evidence, statements of the accused, arrest-related statements, digital evidence (CCTV, audio/visual, metadata), documentary evidence, exhibits" — this is not a vague notion of "supporting material," it's a specific, already-verified list this domain must actually represent.

### Police Material (received) — new, replaces the old single "materialSummary" text field
- **Supports**: the actual product problem named in this revision — a prosecutor cannot make an informed legal decision from a referral containing a few structured fields. This is the material a prosecutor reads before deciding anything.
- **Owns**, per the confirmed evidence list above: **Statements** (each with its own content, the person who gave it, role — witness/suspect/arresting officer, given-at date — rich text, since a statement is a narrative document, not a form), an **Evidence/Exhibits list** (description, recovered-from location, identification mark — DPP records what Police says exists and its description; DPP does not independently track physical chain-of-custody the way Police's own Exhibits domain does, since DPP never holds the physical item), and the **Charge information Police is proposing** (offence(s), statutory section(s), particulars — the same structured shape Police's own `charge_sheets` table already carries, since DPP is reviewing a proposed charge sheet, not inventing one from nothing).
- **Kind**: records, owned by the Prosecution File, first-class in the review workspace — not attachments-as-decoration.
- **Do not assume** these are live-linked to Police's own `statements`/`exhibits`/`charge_sheets` rows — see "Architectural boundary" below for why that's not currently possible, and how this domain is populated instead.

### Review & Legal Observations — new
- **Supports**: the actual reviewing work distinct from the final decision — the brief is explicit that "comments/observations" and "the legal decision" are different things, and a prosecutor needs to record problems/questions/requests-for-clarification as they read, not only the eventual verdict.
- **Owns**: a running, timestamped, rich-text observation trail per Prosecution File — who wrote it, when, and (optionally) what it's about (a specific statement, a specific evidence item, or the file generally).
- **Relates to**: Prosecution File; optionally references a specific Statement or Evidence item within it.
- **Kind**: record, append-only in spirit (an observation is a note in a working review, not something that needs a full audit-trail guarantee the way Decisions does — but still never silently overwritten, since a "what did I already flag" history is the whole point).
- **Do not confuse this with Decisions**: an observation doesn't change the file's status; only a real Decision (sanction/decline/etc., already modeled) does that.
- **Do not assume**: DPP only sees capital-offence matters at committal. Research directly contradicts this — DPP is the pre-charge gatekeeper (sanctioning) for essentially all matters; committal is a separate, later, additional touchpoint specific to High-Court-triable offences.

### Charging Review (the Decision-to-Charge workspace)
- **Supports**: the actual working environment where a prosecutor applies the Evidential Test, Public Interest Test, or (for rare, very serious cases) the Threshold Test, and reaches a charging decision.
- **Owns**: nothing separate from the Prosecution File itself — this is a workspace view, same pattern as Police's Investigation workspace being a composed view over a Case (see `docs/police/PRODUCT.md` §Investigations).
- **Relates to**: Prosecution File (subject), the evidence/statements inventory referred in, Decisions (the outcome it produces).
- **Grounded in**: RESEARCH.md §3 — the Two-Stage Test (Evidential Test → Public Interest Test) is the default; the Threshold Test is a narrower fast-track with five explicit required conditions and a mandatory 14-day review.
- **Do not assume**: a generic "review a form, click approve" pattern is sufficient. The actual test criteria (relevance/admissibility/reliability/credibility/available-defence for the Evidential Test; seriousness/culpability/harm/age/proportionality for the Public Interest Test) are real, named, structured criteria a working prosecutor applies — the workspace should support applying them, not just record a final verdict.

### Decisions & Reviews
- **Supports**: every formal prosecutorial decision as an auditable institutional action, not a status dropdown.
- **Owns**: an append-only decision log per Prosecution File — decision type, decision-maker, date, reasons, supporting material referenced.
- **Kind**: record, audit-trail workflow. **Later edits must never silently rewrite a historical decision** — a correction is a new decision record, not a mutation.
- **A decision should produce a real resulting document, not stop at the log entry.** A sanction decision's real institutional output is the sanctioned Charge Sheet (RESEARCH.md §3: "sanction the charges by appending his or her signature, date, and stamp on the Charge Sheet"); a decline decision's output is a written reasons record (already privileged/confidentiality-restricted, per the Documents section). **Built 2026-09-11**: a Sanction/Threshold-charge/Amend decision now links to a real, printable Charge Sheet generated from the Prosecution File's own structured data (title, charges, accused, preferring officer, sanctioning Prosecutor) via a `/print/charge-sheets/$fileId/$decisionId` route, following the same "generate from what already exists, don't retype" principle as Police's own Charge Sheets & Forms domain. A decline decision's written-reasons output is still just the existing `reasons` field on the Decision record, not a separate generated document.
- **Grounded in**: RESEARCH.md §4 — the confirmed decision types and their delegability:

  | Decision | Delegable? |
  |---|---|
  | Sanction / charge | Yes (Art. 120(4)) |
  | Decline to charge | Yes, with written reasons, subject to supervisory review |
  | Alternatives to prosecution / diversion | Yes |
  | Threshold Test charge | Requires supervisor consultation, not DPP-exclusive |
  | Return for further investigation | Yes |
  | Committal for trial / venue decision | Filing delegable; DPP decides venue |
  | Take over prosecution | Yes (Art. 120(3)(c)) |
  | **Discontinue proceedings** | **No — DPP personally, exclusively** (Art. 120(3)(d)/(4)) |
  | **Nolle prosequi** | **No — DPP only** (Trial on Indictments Act §135, explicit carve-out) |
  | Plea bargain / accept guilty plea | Delegable in practice (dedicated Plea Bargain Unit) |
  | Direct alternative/amended charges | Delegable |

- **Do not assume**: any decision type or its delegability beyond this table without checking RESEARCH.md §4 directly — this table is deliberately narrow to what was actually verified.
- A declined charge can be **reopened**: wrong original decision, new/significant evidence, or an inquest finding recommending prosecution (RESEARCH.md §4, §2.9 of the Guidelines) — model this as a new review event linked to the prior decision, not a silent status flip.
- **Continuous review triggers** exist independent of any single decision: three consecutive prosecution-caused adjournments, new evidence surfacing, witness unavailability, disclosure obligations (RESEARCH.md §4, §8) — these should drive the work-queue model (below), not just be documented as policy.

### Court Matters
- **Supports**: what DPP legitimately needs to track about the court side without becoming a judiciary case-management system.
- **Owns**: court case number, committal status/venue, trial-date notice, adjournment count, bail status, plea/progress status — DPP's own **operational copy**, not the authoritative record (see below).
- **Relates to**: Prosecution File (one file, evolving court state).
- **Grounded in**: RESEARCH.md §5 — Trial on Indictments Act §27(2) (14-day trial-date notice to DPP), Magistrates Courts Act §168(4)-(5) (bail survives committal unless High Court cancels it), the three-consecutive-adjournments review trigger. **Confirmed by the 2026-09-11 follow-up** (`docs/courts/RESEARCH.md`): court case numbers follow a real confirmed format for the High Court criminal division, `HCT-{code}-CR-SC-{seq}-{year}` (magistrate-level format still unconfirmed), and ECCMIS's own "Benefits" page states data flows Police → ODPP → Courts → Prisons — evidence that **Courts is the authoritative source for court-side state; DPP legitimately keeps a reference copy, never a competing one.** This is not a change to what was already modeled here, just independent confirmation of it.
- **Do not assume** a live system-to-system feed from the Judiciary's ECCMIS or ODPP's own PROCAMIS. RESEARCH.md §5 found ECCMIS's own description does not mention PROCAMIS integration at all — treat court-side data as something DPP staff track (manually or via whatever ODPP system Pleadli DPP is meant to complement), never as guaranteed auto-sync. Do not build a miniature Judiciary system here.

### Plea Bargaining — **not a DPP-owned domain; do not build a full Plea Bargaining feature inside DPP**
- **Revised 2026-09-11**, after the user flagged that this looked wrong and a follow-up research pass across Courts (`docs/courts/RESEARCH.md`) and Lawyers (`docs/lawyers/RESEARCH.md`) actually read the Judicature (Plea Bargain) Rules 2016's substantive text (rasterized and read visually — the prior single-app research pass could only confirm the Rules exist, not their content).
- **What the Rules actually establish**: the signed plea agreement (Schedule 1) is filed **with a court and case number**, closes with the presiding judge/magistrate ordering it "incorporated in the record of proceedings," and Schedule 3 is a separate court-witnessed confirmation form — this is unambiguously a **Courts-of-record document**, not something that lives inside ODPP's file and is merely referenced by the court.
- **Representation is not mandatory**: Rule 10 lets the agreement be explained to the accused "by his or her advocate **or a justice of the peace**," and Schedule 1's own form has an explicit advocate-waiver clause — so an unrepresented accused can lawfully plea-bargain. A defense lawyer's participation is common but not required, which is why this isn't simply a Lawyers-owned domain either.
- **The real shape**: genuinely cross-institutional. DPP negotiates and keeps its own operational copy (ODPP's own Decision to Charge Guidelines Ch. 4 already confirm this, RESEARCH.md §6) — that much is a legitimate small part of DPP's own Decisions & Reviews trail (a plea outcome is a decision-adjacent event, as already noted). But the **authoritative agreement, the negotiation-witnessing procedure, and the court-approval step belong to Pleadli Courts**, with Pleadli Lawyers representing the client's side when one is instructed. **Do not build plea-agreement authoring, Schedule 1/3 form generation, or negotiation-workflow UI inside DPP** — that's Courts' (and, when relevant, Lawyers') domain to own once those apps exist. DPP's only legitimate footprint here is recording that a plea-bargain decision was reached, as one row in its own Decisions log (already supported by the existing `plea_bargain_accepted` decision type) — nothing more.

### Documents
- **Supports**: the actual document-heavy nature of prosecution work. **Standing correction, 2026-09-11** (see [[feedback_pleadli_document_centric_ux]]): the first vertical slice built this domain as a deferred nav item with plain-text fields standing in for it (a "what accompanied the file" textarea, a free-text notes field) — that is not sufficient on its own. A file's workspace needs real attachments (actual documents a prosecutor can open/read, Vault-backed, same DB-owns-facts/Vault-owns-bytes split as Police) and rich text for narrative content (decision reasons, referral material summaries, file notes) as first-class parts of the workspace, not a later polish pass deferred behind a "Documents" nav item that never gets built.
- **Owns**: nothing beyond structured metadata and generation templates — same DB-owns-facts / Vault-owns-bytes split as Police.
- **Confirmed document types** (RESEARCH.md §6): Charge Sheet (sanctioned copy retained in the ODPP file), Indictment (High Court, must be in the DPP's name, specific framing rules), Summary of the Case (filed alongside indictment at committal), legal opinion / written review (privileged, confidentiality-restricted), Plea Agreement, committal-proceedings documents (indictment + summary transmitted to the High Court registrar).
- **Do not assume**: a standard "no case to answer" submission template exists as a named ODPP form — the concept is implicit in trial procedure (TIA Part VII) but not confirmed as a distinct document type ODPP itself names or templates (RESEARCH.md §6).
- Written reviews/decision reasons carry an explicit confidentiality requirement in ODPP's own Guidelines ("must never be given to unauthorised persons") — this is a real access-control requirement to carry into the permission model, not a generic "make it private" assumption.

### People
- **Supports**: understanding who's involved in a Prosecution File — accused, complainant/victim, witnesses — without hunting through disconnected registers.
- **Owns**: identity/contact information DPP itself legitimately holds.
- **Relates to**: Prosecution Files, via roles, not embedded fields.
- **Do not assume**: any DPP-side person record makes a Police-side record about the same person visible. **Referenceability is not visibility** — same principle as Police, carried forward unchanged.

### Search
- **Supports**: one system-wide "Search Pleadli DPP," never siloed per-domain search screens.
- **Owns**: nothing of its own — a lens over Prosecution Files, People, Documents, Decisions, and the three reference numbers (police/ODPP/court).
- **Do not assume**: biometric or AI-driven matching now. Design the boundary so it can be added later without a rewrite — do not build it now.

### Work Queues ("what needs my attention")
- **Supports**: prioritizing actual pending work, not a stats dashboard.
- **Grounded directly in confirmed review triggers** (RESEARCH.md §4, §8) — these are not invented buckets:
  - Files awaiting an initial charging decision (Intake backlog)
  - Threshold Test files due for their mandatory 14-day review
  - Files with three or more consecutive prosecution-caused adjournments (mandatory review trigger)
  - Files returned to Police for further investigation, awaiting resubmission
  - Upcoming committal/trial-date notices (TIA §27(2)'s 14-day notice window)
  - Recently reopened declined-charge reviews (new evidence / inquest finding)
- **Do not**: invent percentage changes, backlog-rate stats, or any metric ODPP itself doesn't track. RESEARCH.md §8 found no ODPP-published disposal/backlog statistics — Police's own 2024 Annual Crime Report figures (37.4% of reported cases fully investigated-sanctioned-court, 41.5% still under inquiry) are a Police-authored proxy for pipeline shape, not an ODPP KPI DPP's own Overview screen should surface as if it were ODPP's official standard.

### Organizational responsibility
- **Scale model — corrected 2026-09-11 (product decision from the user, not a research finding)**: a Pleadli DPP installation is **one prosecutor, never a team or office deployment**. There is no multi-user roster, no workload-balancing-across-prosecutors feature, no office-administration surface to build. This directly supersedes the "Office Admin (prosecutor workload, unit assignment)" nav sketch this document originally proposed — that sketch assumed a team/office model and was wrong. Closer to Police's own "an individual can use the app with zero connection" scaling principle than to a team model.
- **Regional scope**: a DPP installation only handles matters from its own region — it is not a window onto every ODPP file nationally. RESEARCH.md §1's 19-regions/127-RSA-stations structure is independently reconciled (`docs/dpp/research/file-structure-and-jurisdiction.md`: 16 original regions + 3 newly established, cross-confirmed against ODPP's own FY2023/24 budget document), but whether jurisdiction is *strictly* region-bound (vs. just default practice, with an undocumented transfer path for matters that need to cross regions) remains genuinely **unconfirmed** — no cross-region transfer process was found. Model the region as a fixed property of the installation, but do not hardcode an assumption that a matter can *never* cross regions.
- **Rank hierarchy** (RESEARCH.md §1, confirmed from ODPP's own site): DPP → Deputy DPP → Principal Assistant DPP → Assistant DPP → Chief State Attorney → Senior State Attorney → State Attorney → Resident State Attorney/Prosecutor. Relevant for knowing *what a prosecutor's own rank/title is* (a profile-level fact about the single user), not for building a multi-prosecutor assignment system.
- **Specialized units** (RESEARCH.md §7): Anti-Corruption, Gender/Children/Sexual Offences (GBV), Land Crimes, Homicide, Building Control Crimes, Cybercrime, Plea Bargain Unit, Appeals & Applications, International Crimes (incl. Anti-Trafficking), International Cooperation & Asset Recovery, Inspections & Quality Assurance, Research & Training, Field Operations (19 regional offices / 127 RSA stations), Witness Protection & Victim Empowerment — background context on how ODPP is organized nationally, not something this single-prosecutor installation needs to model as navigable structure.
- **Do not**: hardcode a national org chart, or build any cross-prosecutor administration surface. Pleadli Cloud's existing org/entitlement infrastructure (Organization, OrganizationUnit, Membership, Entitlement) remains the identity/membership substrate at the platform level; it is not something this single-installation app needs its own admin surface for.

### Police ↔ DPP connectivity (design note, not building yet)
- **Corrected 2026-09-11**: Police and DPP installations of the **same region** connect to each other — not automatically, not globally. The mechanism is **manual pairing**, reusing/extending Police's already-built local-network + Cloudflare Tunnel pairing infrastructure (`docs/police/remote-access.md`, [[project_pleadli_police_remote_access]]), not a new protocol and not automatic discovery.
- This is a forward-looking constraint to carry into future design, not a feature to build now — no pairing flow, no cross-app referral transport exists yet. The current DPP "Intake" screen still only records what a prosecutor manually enters about a Police referral; it does not receive anything automatically from a Police installation.

## 3. Police → DPP boundary

A Police case's referral creates or updates a Prosecution File that **references** the Police case (station, police-side reference) without importing Police's database. Police retains its own record; DPP creates and maintains its own. Same principle as Police's own Referrals domain, mirrored from the other side of the same relationship — see `docs/police/PRODUCT.md` §Referrals & Dispatches, which already models this handoff from Police's side and found no named transmittal form or inward register either.

**Architectural boundary — how material actually reaches DPP today (added in this revision, the central unresolved question of the whole redesign):**

Police and DPP are separate desktop apps, each with its own local SQLite database, and **no sync engine exists or is planned** (`docs/police/PRODUCT.md`'s own scope explicitly excludes one). That means "DPP receives Police's case material" cannot mean live, relational linking between Police's `statements`/`exhibits`/`charge_sheets` rows and DPP's own tables — there is no live connection between the two databases to link through. Two real paths exist, and only one is buildable now:

1. **Buildable now, and what this revision actually builds**: the Police Material (received) domain above is populated by a prosecutor (or a future import step) **re-entering the legitimately-provided material as DPP's own records** — a real Statement row with the actual content, a real Evidence-item row with its actual description, the actual proposed charge. This is not "duplicating Police's database" in the sense the ecosystem principle warns against (Police still owns its own originals; nothing is copied automatically or silently); it is DPP creating its own institutional record from material legitimately handed over, exactly the same way a real prosecutor's office would type up or file what a physical case file contained. This is manual today, and that is an honest, acceptable limitation to state plainly — not a gap to hide behind a fake "synced" UI.
2. **Not buildable now, a real future integration boundary**: an actual transfer mechanism (the "manual pairing, reusing Police's local-network/Cloudflare Tunnel infrastructure" already noted under Police ↔ DPP connectivity above) that could let a Police installation push a structured referral package to a paired DPP installation directly, reducing the re-entry work. This is explicitly **not being built now** — no pairing flow, no transport format, no cross-app schema-compatibility work exists yet. Treat this as a named future capability with a clean boundary, not something to fake with a hardcoded mock.

**The same constraint applies to any result flowing back to Police.** DPP's decision does not automatically update Police's own `referrals.status` — there is no live path for that today either. The realistic, current answer: the resulting document (e.g. the sanctioned charge sheet) is produced by DPP and handed back through whatever channel the referral itself arrived through (currently: manually, between two people); a future integration (the same pairing mechanism above) could eventually push the outcome back automatically. **Do not build a fake "notify Police" button that doesn't actually reach Police's installation** — this is exactly the "do not fake integrations" principle: build the DPP-side record of the outcome (already covered by Decisions), and leave the actual cross-app transport as the named, unbuilt future capability it is.

## 4. DPP → Court boundary

DPP tracks the court reference number, committal status, trial-date notices, adjournment count, bail status, and plea/outcome progress as its own data (Court Matters domain above) — it does not run a mirror of the Judiciary's case-management system, and must not assume live sync with ECCMIS/PROCAMIS given that integration is unconfirmed (RESEARCH.md §5).

## 5. Person model

Accused, complainant/victim, and witness are roles on a Prosecution File, not separate top-level record types with duplicated identity fields. Referenceability is not visibility, carried unchanged from Police.

## 6. Document model

Database owns structured facts/metadata/workflow; Vault (`Documents/Pleadli DPP/`, same principle as Police's Vault, hierarchy not yet finalized) owns file bytes. See Documents domain above for confirmed document types.

**Document Reader — new capability this revision requires.** A prosecutor must be able to actually *read* a Statement or a generated document inside DPP, in a dedicated read-first view, without that view being "an edit form that happens to be open." Concretely: rich-text content (Statements, Review & Legal Observations, decision reasons) needs a read-only rendering mode as the default view (already technically possible — `@pleadli/rich-text`'s `RichTextPreview` already exists and is already used this way in the file workspace), with editing as an explicit secondary action, not the only mode. For attached files (a scanned document, an imported file), preview support should match what's technically reasonable — do not build a universal file-format viewer; support real preview for the formats Pleadli already produces/consumes (its own rich-text/Markdown content, common image/PDF formats via the OS's own opener as already exists) rather than inventing a generic document-conversion engine. This is a real, if modest, UI capability to build (a "Reader" mode for a Statement/document, distinct from its edit drawer), not a new domain.

## 7. Search model

One system-wide search surface, composed across domains as they're built — same discipline as Police: no isolated "Files search / Documents search / People search" experiences.

## 8. Work/queue model

See Work Queues domain above — every bucket traces to a specific, confirmed review trigger or workflow state, none invented.

## 9. Organizational responsibility

See Organizational responsibility domain above.

## 10. Navigation proposal

```
Pleadli DPP

Overview                    (what needs my attention: queues above)

Search

Intake                      (incoming Police referrals, review status)
Charging Review             (folded into the Files workspace — see below)

Files                       (Prosecution Files — the core record + workspace)

Court Matters                (committal, trial dates, adjournments, outcomes — DPP's own reference copy)

People

Reports & Analytics          (derived only — no invented metrics)
```

**Revised 2026-09-11**: "Plea Bargaining" is removed as a nav item — it is not a DPP-owned domain (see the Plea Bargaining section above); DPP's only footprint is a decision-type row, already covered by "Files"/Decisions, nothing separate to navigate to. "Office Admin" is removed entirely — it assumed a multi-prosecutor team/office model that doesn't apply (see Organizational responsibility above); nothing replaces it, a single-prosecutor installation doesn't need an administration surface. "Decisions" is folded into "Files" (it was never a separate table, just the same workspace's decision-history section — this only corrects the nav sketch, not the data model). "Documents" is likewise folded into "Files" — attachments/rich text belong inside the file workspace itself, not a separate top-level browse screen, per the Documents section above.

**Revised again, same day (product-direction correction)**: Police Material (received) and Review & Legal Observations, both new, are likewise **not** separate nav items — they're sections of the Files workspace, the same "workspace over one core record" pattern already established. The Files workspace itself needs to become a real multi-section review experience: what the matter is about (people, allegations) → the actual received material (statements, evidence, charge information) → the prosecutor's own review trail (observations) → the decision history → documents. This is the difference the brief draws between Police's Investigation workspace ("what do we know, what needs investigating") and DPP's review workspace ("what has been presented, what does it establish, what should happen next") — same shape, different question being answered.

This remains a starting proposal, not a locked structure — same caveat as Police's own nav baseline. "Files" carries the weight Police's "Cases" does; "Intake" is pulled out as a distinct first-class screen specifically because the brief requires the Police handoff to be a real workspace, not buried inside a generic file-detail page. "Charging Review" is not a separate route — it's the same file workspace, same as it was built.

## 11. What is explicitly out of scope (for now)

- Sync engine, offline conflict-resolution, station-node-style infrastructure (same as Police — not needed until a real requirement emerges)
- A judiciary case-management clone
- Biometric identification, facial recognition, AI legal/prosecution decision-making, conviction prediction
- A hardcoded complete ODPP national organizational hierarchy
- A universal cross-institution case database
- Billing, decorative analytics, invented percentage/KPI metrics
- Assuming live PROCAMIS/ECCMIS system integration exists
- Specific inquest-to-DPP referral procedure (statute not found — RESEARCH.md §3)
- Specific Uganda Police Act referral-duty clause (not found in the sections extracted — RESEARCH.md §3, ref #10)
- Exact ODPP registration-number format (still not published, re-confirmed 2026-09-11 — RESEARCH.md §2, `docs/dpp/research/file-structure-and-jurisdiction.md`)
- Plea-agreement authoring/negotiation UI, Schedule 1/3 form generation — explicitly Courts'/Lawyers' domain, not DPP's (see Plea Bargaining above)
- A multi-prosecutor office-administration surface — not applicable, single-prosecutor scale model (see Organizational responsibility above)
- Any Police↔DPP pairing/connectivity implementation — design note only (see Police ↔ DPP connectivity above), reuses Police's existing infrastructure when actually built

## Uncertainties still open (require product clarification, not invention)

- **"ODPP Act 2019"**: RESEARCH.md §1 found no evidence this Act exists — ODPP's own site cites only Article 120 as its legal basis, with appointments through the general Public Service Commission, not an ODPP-specific one. Flagged here rather than assumed; does not currently block any structural decision above since Pleadli Cloud's institution/entitlement model already treats `dpp` as one of several generic institution types (per root `CLAUDE.md`), independent of this legal detail.
- Whether one Police case can produce multiple Prosecution Files, or vice versa, beyond the joinder/splitting rule already established (§1 above).
- The exact statutory/procedural inquest-to-DPP referral pathway.
- Whether PROCAM and PROCAMIS denote a manual/digital distinction or something else — Guidelines use both without defining the difference.
- Whether ODPP has a codified file-assignment rule beyond ad hoc supervisory practice.
- The specific "no case to answer" submission — whether ODPP has a standard internal template.
- **Whether RSA jurisdiction is strictly region-bound** — no documented cross-region transfer process was found (`docs/dpp/research/file-structure-and-jurisdiction.md`); a fine-grained police-station-to-RSA-station mapping is also unconfirmed, and a real name-collision risk was flagged (a "Kira" RSA station in Wakiso vs. "Kira Road" Police Station in Kampala Central are likely different administrative homes despite the similar name) — do not assume station names alone are enough to derive the mapping.
- **The cross-app transport question is the single biggest open item from this revision.** Re-entering Police material into DPP's own records (the buildable path, see "Architectural boundary" above) is a real, honest, if manual, workflow. Whether/when the actual pairing-based transfer mechanism gets built (letting a paired Police installation push structured material directly) is a genuinely separate, larger effort — not scoped or scheduled by this document, just named as the real future capability that would remove the manual re-entry step.
- Whether "Review & Legal Observations" needs its own formal audit-trail guarantee (like Decisions has) or is genuinely fine as an editable working-notes trail — leaning toward the latter (it's not itself a legal act), but not conclusively settled.

## Final test

Before considering any implementation complete, ask:

**Does this feel like software for doing prosecution work, or does it feel like Police with different labels?**
