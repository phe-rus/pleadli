# Pleadli Police — Product Definition

This is the **canonical product definition and product knowledge for Pleadli Police**.

Any feature, UX, architecture, navigation, or data-model decision for the Police application must be consistent with this document. It is the product context the desktop application, mobile surfaces, local station environment, and Pleadli Cloud relationships are designed against.

This document was rewritten after a reconciliation pass between the original product intent and how the implementation had drifted toward a case-centric model. If a future decision seems to contradict this document, treat this document as authoritative and raise the conflict rather than silently deviating.

## The fundamental idea

> **Pleadli Police is software for doing police work, not software for entering police data.**

That distinction is fundamental and technical, not just a slogan:

- The unit of product design is a **capability an officer performs** (find a person, open custody, take a statement, refer a case), not a **table an officer fills in**.
- Records are the foundation of the system. They are not the product by themselves. The product is the working environment built around those records.
- **Case management is one important part of Pleadli Police. It is not the organizing principle for the entire product.** Police work does not begin and end with a formal case — an officer searches, logs station activity, checks custody, processes a bond, manages station equipment, and coordinates, independently of whether a case exists.

## What Pleadli Police is NOT

- a digital version of police registers
- a collection of forms
- a case-entry system
- a CRUD application for cases
- a personal digital notebook
- an administrative dashboard
- a case-management application with a few extra menus attached

Some of these things may exist *inside* it. None of them are the product.

## The product organized around work, not tables

Pleadli Police exists to support these kinds of work. These are product capabilities, not final navigation categories or database tables.

- **Find** — locate people, cases, incidents, station activity, exhibits, files, officers, stations, and other authorized information.
- **Understand** — return context around information, not rows. Who is this person in relation to what I'm looking at? What state is this case in? What's already known?
- **Record** — capture new information once, where it naturally belongs, without re-entering what already exists elsewhere in the system.
- **Investigate** — an active workspace: what's known, what's happened, what evidence and statements exist, what remains outstanding, what needs to happen next.
- **Act** — turn information into a next step from where the information already is (open custody from a person's record, add a statement from within a case) rather than a detached, decontextualized "create" flow.
- **Account** — maintain accountability where it's legally or operationally required: custody, exhibits, officer actions, station assets.
- **Coordinate** — eventually, officers/teams/stations coordinating locally, and — where a legitimate relationship exists — coordinating with the wider Pleadli ecosystem.
- **Handover** — continuity that doesn't depend on one officer remembering or manually explaining what happened and what's unfinished.
- **Report** — operational reporting and analytics derived from real work, never a second round of data entry.

## Records, workflows, workspaces, capabilities, derived views

This distinction must be respected throughout the architecture. Not everything that appears in the UI is the same kind of thing.

- **Record** — information with identity, history, and relationships (Person, Case, Statement, Exhibit, Custody entry).
- **Workflow** — a process someone performs using records (opening custody, taking a statement, making a referral). Usually a status/state on a record plus an activity log, not a separate "Workflow" entity.
- **Workspace** — an environment that brings related information and actions together (the Investigation workspace).
- **Capability** — available across multiple domains (Search).
- **Derived view** — calculated from underlying records, never separately maintained (48-hour compliance status, attention items, Reports & Analytics).
- **Generated document** — an output produced from structured information that already exists (a charge sheet rendered from Person + Case + Statement data).

Do not blur these. A derived view that becomes a manually-edited field, or a workflow that becomes its own database-of-record separate from the entities it operates on, is a sign the model has drifted.

## Major domains

For each domain: what work it supports, what it owns, what it legitimately relates to, what kind of thing it is (record / workflow / capability / workspace / derived view), and what should NOT be assumed about it.

### People
- **Supports**: nearly everything — an officer needs to know who someone is in relation to whatever they're looking at.
- **Owns**: identity information, identifiers, contact information.
- **Relates to**: incidents, cases, investigations, statements, custody, bonds, evidence relationships — via relationships, not embedded fields.
- **Kind**: record, foundational, cross-cutting.
- **Do not assume**: that a relationship existing means visibility. **Referenceability is not visibility.** There is no universal person dossier — what's shown is always filtered by authorization in the context being worked in, not by "the record exists, so show it all."

### Search
- **Supports**: find → understand → act, across every domain below.
- **Owns**: nothing of its own — it's a lens over other domains' data.
- **Relates to**: People, Cases, Incidents, Station Diary, Exhibits, Custody, Bonds, Officers, Stations, Assets.
- **Kind**: capability, cross-cutting.
- **Do not assume**: that this requires a generic search-engine abstraction built up front. Each domain exposes what it owns to search as that domain is built; a shared search surface composes across them. A result should lead to real context and a contextual action, not just a matched row.

### Station Diary (SD)
- **Supports**: logging and continuity of actual station activity — incident reports, lost property, public inquiries, officer movement, shift handover, other occurrences.
- **Owns**: SD entries, each with its own identity.
- **Relates to**: may lead to an Incident or other action; most entries remain purely informational.
- **Kind**: workflow with lightweight first-class records; an independent operational concern.
- **Do not assume**: that SD exists to feed Incidents, or that there's a defined rule for which entries escalate. That rule is real police procedure that hasn't been established here — do not invent it.

### Incidents
- **Supports**: representing something that happened or was reported.
- **Owns**: incident details — time, place, initial account.
- **Relates to**: may originate from an SD entry or a direct report; may become a Case.
- **Kind**: record.
- **Do not assume**: a specific lifecycle of states (e.g. reported → assessed → escalated) beyond what's actually established by real procedure.

### Cases
- **Supports**: formal police handling of something that requires it.
- **Owns**: case identity, status, legal/administrative record.
- **Relates to**: Incidents (may originate from one), Investigations (wraps one), People (multiple, with roles), Referrals.
- **Kind**: record. One domain among several — not the organizing structure everything else hangs off.
- **Do not assume**: that every Incident becomes a Case, or that Case is the parent of Custody/Bonds/Station-Diary — those exist independently of case status.

### Investigations
- **Supports**: the active work of investigating a case — the one place the product should feel most different from a CRUD app.
- **Owns**: nothing of its own — **resolved (2026-09), superseding the earlier "cardinality not yet finalized" note**: Investigation is not a separate database entity. It is a composed workspace view over a Case's own already-linked people, statements, custody, bonds, evidence, and a derived timeline — no `investigations` table, no investigation-specific status distinct from the Case's own status. This is inherently one workspace per Case, because there is no separate record to have a cardinality with Case in the first place.
- **Relates to**: Case (the view's subject), Statements, Evidence, Custody, Bonds, Referrals (once built) — all read through the Case's own existing relationships, nothing new.
- **Kind**: workspace (a route/UI composition), not a record, not a folder.
- **Do not assume**: it should become a generic project-management tool. Do not invent task-management features just because "outstanding work" or "actions" are mentioned — only build concepts with a genuine, named product purpose. If investigation-specific state (an assigned IO, an investigation stage distinct from case status) becomes a real requirement later, that is a new decision, not an extension of this one.

### Statements
- **Supports**: recording what a person said, with procedural weight.
- **Owns**: the statement content, who gave it, who took it, when, its status.
- **Relates to**: Person (who gave it), Investigation (the context).
- **Kind**: record, first-class — not text attached to a case.
- **Do not assume**: an elaborate document-management system is needed before there's a proven requirement for one.

### Evidence & Exhibits
- **Supports**: prosecution/investigation traceability — what an exhibit is, who recovered/logged it, where it's stored, who moved it, its current status.
- **Owns**: exhibit identity and its chain-of-custody history.
- **Relates to**: Investigation, Person (who logged/moved it), sometimes Custody.
- **Kind**: record, first-class, legal/accountability workflow.
- **Do not assume**: this is generic inventory. Do not merge with Armory/Stores/Assets — different purpose, different accountability model, even though both involve physical items.

### Custody
- **Supports**: the operational and legal accountability lifecycle around detention, most importantly Uganda's 48-hour constitutional requirement.
- **Owns**: custody window (start/end), location, related legal actions.
- **Relates to**: Person, sometimes Case/Incident.
- **Kind**: record + legal-accountability workflow.
- **Do not assume**: the detailed procedural states (arrest → custody → movement → release → bond → court, medical requirements, exceptions) — this is real Ugandan procedure that has not been established here and must not be invented. 48-hour compliance must always be **derived from the underlying custody timestamps**, never a manually maintained status field.

### Bonds & Sureties
- **Supports**: the financial/legal commitment process around release.
- **Owns**: bond/surety terms, related person(s).
- **Relates to**: Person, Case, sometimes Custody.
- **Kind**: record + legal/operational workflow.
- **Do not assume**: the real bond process or surety requirements — needs verification, not invention (see Research Needed).

### Charge Sheets & Forms
- **Supports**: producing the documents police work actually requires.
- **Owns**: nothing of its own beyond templates — generated from Person + Case + Statement + Evidence data that already exists.
- **Relates to**: whatever domains supply the structured data.
- **Kind**: generated document / capability.
- **Do not assume**: every document must be generated immediately. The requirement is architectural: don't make structured information unusable outside the screen where it was entered.

### Referrals & Dispatches
- **Resolved (2026-09)**: one unified workflow, not two — but only after checking what "dispatch" actually refers to in real Uganda Police usage, rather than assuming the nav grouping was already correct. Verified two distinct senses exist: (1) an operational/emergency-response sense — Uganda Police's National Operations Information Room dispatching officers to a scene for quick reaction — and (2) a purely colloquial media use of "dispatch" as a synonym for sending a case file to the DPP, which is just the Referral event itself, worded differently. Sense (1) is a live radio/location-coordination concern, not a records concern, and stays explicitly out of scope (no live location, no radio integration — see "Desktop, mobile, local station, and Pleadli Cloud" below). Sense (2) is exactly what this domain already models. So "Dispatches" contributes no genuinely distinct workflow to build — the unification is real, not forced.
- **Supports**: connecting Police's work to another institution or unit (DPP, Courts, or another station) when a case requires it.
- **Owns**: the referral event/record — destination, when, status, who made it. One table, a `destinationType` discriminator (`dpp` / `court` / `other_station` / `other`) rather than separate near-duplicate tables, since the shape (case → somewhere else → an outcome) is genuinely the same regardless of destination.
- **Relates to**: Case, and (via Pleadli Cloud) the receiving institution's own record.
- **Grounded in research** (docs/police/research, audit §G.4): for the DPP path specifically, what actually moves is the case file itself (charge sheet + evidence) to the Resident State Attorney, who either sanctions it or forms the opinion no offence is disclosed — no named transmittal form or inward register was found, so `destinationName` stays free text and `status` stays the three real outcomes (pending / accepted / rejected), not an invented procedure.
- **Do not assume**: a referral transfers ownership of the police record. Police retains its own record; the other institution retains its own. See Ecosystem Boundaries below. Also do not assume the `other_station` destination type carries any verified inter-station procedure — it is a plain record of "handed elsewhere," honest about what is and isn't confirmed.

### Stores / Armory / Impounded Assets
- **Supports**: station operational responsibilities outside investigation — equipment, weapons, unclaimed/impounded property.
- **Owns**: item identity, status, holder/location.
- **Relates to**: officers (who holds what), occasionally a Case (an impounded asset may reference one).
- **Kind**: record + workflow, station operations.
- **Do not assume**: this shares a domain with Evidence. Similar shape (an item with status and location), different meaning and accountability — do not merge into a generic "Item" domain merely to be DRY.

### Vehicles
- **Supports**: identifying a person by their vehicle, and identifying a vehicle by its plate — the same lookup People already supports by name/national ID/phone, extended to a plate number. Added 2026-09 alongside a remote-lookup ask to search by plate.
- **Owns**: plate number, make/model/color, an optional owner link to a Person.
- **Relates to**: People (owner, optional — a plate can be logged before its owner is known).
- **Kind**: record, cross-cutting the same way People is, but much thinner — no independent workflow of its own.
- **Do not assume**: this is a DMV/national vehicle-registry integration. It is a local plate/owner registry the station fills in itself, deliberately with a clean boundary (see External integrations) so an authorized external source (e.g. a national vehicle registry) could be connected later without a redesign — no such integration exists or is faked today.

### Duty / Roster
- **Supports**: scheduling, officer status, shift handover.
- **Owns**: assignments, shift data.
- **Relates to**: officers, units/stations.
- **Kind**: record + workflow, station operations.

### Station Operations
- **Supports**: running the station as an organization — duty, stores, armory, handover, and (scope not yet finalized) "Station Admin" configuration.
- **Kind**: capability grouping over the above station-operations domains.
- **Do not assume**: this is secondary to case-work. It is a peer dimension of the product with its own operational purpose.

### Reports & Analytics
- **Supports**: periodic review, trends, workload, station/organizational understanding.
- **Owns**: nothing — pure aggregation.
- **Kind**: derived view.
- **Do not assume**: this is the same thing as Overview. Overview answers "what needs my attention now"; Reports & Analytics answers "how is the station/organization doing over time."

## Investigation workspace, in more detail

The workspace should eventually let an officer understand and act on: people involved, case context, statements taken, evidence logged, actions performed, developments, outstanding work, required documents, referral status, and relevant timeline/history — in one working view, not a folder tree of unrelated child screens. Only build concepts here that have a genuine, named product purpose; resist inventing generic project-management features.

## Ecosystem boundaries

Pleadli Police is one application in a larger ecosystem: **Pleadli, Pleadli Police, Pleadli DPP, Pleadli Courts, Pleadli Lawyers, Pleadli Prisons** — purpose-built applications for different participants, connected through Pleadli Cloud.

- Police owns Police records. DPP owns DPP records. Courts own Court records. Lawyers own their records. Prisons own their records.
- **One case. Every institution keeps its own record.**
- **One case does not mean one shared file.**
- **Referenceability is not visibility.**
- **Connection does not mean universal visibility.**

Never design a universal cross-institution case record. A legitimate relationship between institutional records is not a merge of ownership.

## Application structure

```
routes  →  domain features  →  local data access / domain logic  →  SQLite
```

with genuinely shared UI primitives from `@pleadli/ui` / `@pleadli/forms-tables`.

Feature organization is peer-based, not case-rooted — People and Search sit alongside Cases, Custody, Station Operations, etc., not beneath them:

```
src/features/
  people/
  search/
  station-diary/
  incidents/
  cases/
  investigations/
  statements/
  evidence/
  custody/
  bonds/
  referrals/
  station-ops/
  reports/
```

This tree is conceptual, not a mandate to create every directory now. Create a feature directory when the implementation actually needs it.

- Routes stay thin: composition + loader only, nothing else.
- Each feature owns its own plain data-access functions (direct SQL against local SQLite) — no repository layer, no generic ORM/service architecture, unless a real requirement emerges.
- Domain logic (derivations like 48h compliance, workflow transitions) lives in plain functions colocated with the feature, not in JSX, not scattered across loaders.
- Tauri-specific persistence concerns stay at the boundary (the actual driver call). Database access must not spread arbitrarily through UI components.
- Shared packages (`@pleadli/ui`, `@pleadli/forms-tables`) hold what's proven generic across apps (tables, form fields, sidebar shell). Police-specific domain composition (the Investigation workspace, a Person profile layout) stays local until another app genuinely needs the same shape.

## Desktop, mobile, local station, and Pleadli Cloud

Long-term direction:

```
                    Pleadli Cloud
                         │
                  connected deployment
                         │
                      Station
                   Pleadli Node
                  /      |      \
             desktop   officer   desktop
                        phone
```

The current implementation must **not** include: a sync engine, conflict-resolution framework, peer discovery, local distributed networking, a mobile client, live location, or backup-request infrastructure.

What the current code should do: keep local SQLite as the actual source of truth; keep domain logic (validation, derivations) as plain functions not coupled to Tauri APIs beyond the actual driver call, so the *model* could inform a future mobile client or sync layer without a rewrite; avoid boundaries that make a future sync marker per record, or multiple officers on one station install, awkward to add later. Nothing more.

**Local when possible. Connected when available. Explicit about synchronization.**

## Scale

**Officer → Unit/Team → Station → Division/Sector → Organization.** An individual must be able to use Police meaningfully with zero connection. A station operates as a station. Broader organizational visibility and coordination is something a connected deployment can eventually add — never a requirement for standalone usefulness. Do not assume the entire national police organization is one giant deployment.

## Mobile

A first-class future surface (person/case lookup, assignments, field reporting, communication, assistance/backup requests, location sharing, coordination), not a responsive version of the desktop UI. This should influence architectural boundaries (don't couple domain logic to desktop-only APIs) without causing the mobile app or a shared abstraction layer to be built now.

## External integrations

Eventually: national identification systems, fingerprint/biometric systems, other government systems. Do not invent APIs or pretend an integration exists. Establish clean boundaries so an authorized external source can be connected later without a redesign.

## UI philosophy

Serious operational software. Use the existing visual system — no new design system, no redundant typography classes (global typography already exists).

Roughly 90% of the interface is naturally: dense, searchable, sortable, filterable tables; structured forms built around the actual task; record readers that make important information easy to scan; workspaces that help someone act, not just browse; search; contextual actions; operational attention views. Dashboards are used only where they provide real operational value (Overview: "what needs my attention," not vanity stats).

Do not: use cards merely because cards are common in SaaS apps; add decorative gradients, oversized statistics, unnecessary animation, or empty whitespace that doesn't help someone work.

When representing capabilities intended for a connected/sector deployment in UI mockups while building for an individual station, mark scope with developer-only comments — `{/* Individual station */}` / `{/* Sector / connected deployment */}` — never surfaced to the user.

## Navigation (current baseline)

```
Pleadli Police

Overview

Search
  People
  Files
  Stations
  Cell Lock-up & 48h
  Bonds & Sureties

Station Diary (SD)
Incidents
Case Intake

Investigations
Statements
Evidence & Exhibits
Charge Sheets & Forms

Stores & Armory
  Armory Register
  Impounded Assets

Vehicles

Referrals & Dispatches
Duty Roster
Reports & Analytics
Station Admin
```

This represents areas of work and capabilities, not a database schema — not every item requires an isolated CRUD module, and the implementation underneath a given nav item may be a record, a workflow, a workspace, search, a generated document, an operational view, or a derived view. Keep this as the baseline unless a concrete reason to change it has been established and explained first.

## Implementation discipline

**Less code, not less architecture.**

Avoid: generic CRUD engines; generic Entity/Record abstractions; generic form builders; generic workflow engines; repository/service ceremony; speculative abstractions; giant schemas; arbitrary file splitting; excessive hooks/providers; business logic buried in JSX; duplicated domain logic; premature synchronization; fake external integrations; architecture designed around hypothetical requirements.

Prefer: direct domain modeling; plain functions; clear ownership; local reasoning; contextual actions; thin routes; small meaningful modules; real shared primitives where sharing is proven; domain-specific behavior where domains genuinely differ.

Do not create an abstraction simply because two things currently look similar.

## What to research later, not invent now

None of the following are established product requirements until verified against authoritative Ugandan sources:

- ~~Ugandan police custody procedure~~ — first pass researched, see `docs/police/research/custody-and-bonds.md`. Real gaps remain (UPF Standing Orders were never publicly reachable — likely where the granular procedure actually lives) and every claim there carries its own confidence label; still not a substitute for legal review before anything load-bearing ships.
- ~~The 48-hour custody rule and its exceptions~~ — same file. Constitution Art. 23(4) and Police Act s.25 verified directly from primary text; the commonly-assumed "distance to nearest court" exception was specifically checked and found unsupported — do not model it.
- ~~The police bond process~~ — same file. PF18 "Release on Bond" confirmed as the real, named UPF form (with its 2022 anti-corruption redesign); the exact rank authorized to grant an *ordinary* (non-preventive) bond is still only "plausible but unconfirmed."
- ~~Surety requirements~~ — same file. Residency rule for non-resident suspects verified; whether a surety can be a cash deposit vs. only a person of accountability was not found — do not assume either way.
- Station Diary conventions — partially researched (same file, section 5): the SD → CRB (Crime Report Book) conversion for "criminal in nature" entries has a real, named answer (a UPF Deputy Director CID quote), but the actual decision rule for what counts as "criminal in nature" was not found — model that as a human decision, never an automated trigger. Standard SD entry categories in actual Uganda practice remain unconfirmed.
- Police case-file movement procedure
- CID → DPP/ODPP referral workflow — the ODPP's Decision to Charge Guidelines (2023) and its Two-Stage/Threshold Test are now verified (same file), but the referral hand-off mechanics themselves weren't the focus of that pass.
- Charge-sheet/form content requirements — the real named UPF form series (PF2A/B, PF3, PF16/16A, PF18, PF24/24A, PF53, PF94, etc.) is now catalogued in the same file; PF94 "Detention Order" is confirmed to exist by name but its actual triggering procedure was not found anywhere.
- Police station organizational structures
- NIRA / national identity integration possibilities
- Biometric integration possibilities

## Implementation sequence

Ordered by actual product dependency and user value — not by distance from case-work, and not "database → API → UI":

1. **People** — nearly everything else references one.
2. **Search over People** — the UI groundwork already exists; wire it to real data early since it's a fundamental capability, not a late add-on.
3. **Station Diary** — the actual front door of station activity, built as its own workflow, not an incident pre-processor.
4. **Incidents** — depends on Person and, optionally, an SD entry.
5. **Custody** — pulled forward deliberately: depends only on Person + Incident, and carries real legal urgency (48h) that doesn't benefit from waiting on case machinery.
6. **Cases** — depends on Incidents (or direct intake).
7. **Investigation workspace** — depends on Case; the point where sustained casework happens.
8. **Statements** — inside the investigation workspace.
9. **Evidence** — inside the investigation workspace.
10. **Bonds & Sureties** — alongside/after Custody, related to Person/Case.
11. **Referrals** — once investigations reach a decision point. (Dispatches, if confirmed distinct, follow its own track closer to Duty/Roster.)
12. **Station Operations** (Duty/Roster, Stores/Armory) — an independent track; can proceed on its own schedule since nothing else blocks on it.
13. **Charge Sheets & Forms** — once enough structured data exists to generate from.
14. **Reports & Analytics** — inherently last; purely derived.

## Uncertainties still open (require product clarification, not invention)

- ~~Exact Case ↔ Investigation cardinality and lifecycle mechanics.~~ **Resolved (2026-09)**: Investigation is a composed workspace view, not a separate record — see the Investigations section above.
- ~~Whether Referrals and Dispatches are one workflow or two.~~ **Resolved (2026-09)**: one unified workflow — see the Referrals & Dispatches section above for the verification behind this.
- What "Station Admin" owns relative to Duty Roster and Stores/Armory.
- Real Ugandan custody/arrest/bond procedure (see Research Needed).
- When officer identity/auth becomes load-bearing, given Statements/Evidence/Custody all need "who did this" and auth is currently out of scope.
- Whether a Station maps to Pleadli Cloud's `OrganizationUnit` or `Organization` in the actual institution templates.

## Final test

Before considering any implementation complete, ask:

**Does this feel like software for doing police work, or does it feel like a collection of digital police registers?**

The goal is a practical operational environment where police officers can **find, understand, record, investigate, coordinate, act, account, hand over, and continue their work** with less fragmentation and repetition — not a digitized version of existing paperwork.
