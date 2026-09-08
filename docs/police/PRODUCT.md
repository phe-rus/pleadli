# Pleadli Police — Product Definition

This is the **canonical product definition and product knowledge for Pleadli Police**.

Any feature, UX, architecture, navigation, or data-model decision for the Police application must be consistent with this document. It is the product context the desktop application, mobile surfaces, local station environment, and Pleadli Cloud relationships are designed against.

## What Pleadli Police is

**Pleadli Police is a purpose-built police operations and investigation platform.**

It is software for police officers, units, stations, and police organizations to actually **perform police work**.

It is NOT:

- a digital version of police registers
- a collection of forms
- a case-entry system
- a CRUD application for cases
- a personal digital notebook
- an administrative dashboard

Some of those things may exist inside it, but they are not the product. The records are the foundation. **The product is the working environment built around those records.**

> **Pleadli Police is software for doing police work, not software for entering police data.**

The central design question is therefore:

> What does a police officer need to **know, find, investigate, record, communicate, coordinate, and act on** throughout their work?

Not:

> What forms do police currently fill in?

## The core idea

Pleadli Police lets an officer move naturally between:

**People → incidents → cases → investigations → statements → evidence → documents → actions → referrals → operations**

without repeatedly recreating the same information.

Information should be:

- recorded once where practical
- structured
- connected
- searchable
- reusable
- traceable
- permission-aware
- available in the context where it is needed

If an officer has already entered a person, they should not recreate that person for another part of the case. If a statement belongs to a person and a case, the system should understand that relationship. If evidence belongs to an investigation, the system should understand that relationship. If multiple records concern the same person or incident, the system should expose those relationships to an authorized officer.

The goal is to eliminate unnecessary duplication and turn police records into useful operational information.

## Pleadli Police is information-aware

A major capability is the ability to find and understand people and other important entities.

An authorized officer may need to answer: **Who is this person?**

The system should be capable of searching available authorized information using appropriate identifiers and returning the relevant profile. Potential sources include:

- Pleadli records
- existing police records
- national identification systems
- authorized government systems
- biometric / fingerprint systems
- other approved external sources

Where an external system provides structured information through an API, JSON interface, database exchange, or another authorized integration, Pleadli should be capable of consuming it. For example, an authorized integration could let an officer search an individual using available identifying information and retrieve identity information; a biometric system could return an authorized match/reference that Pleadli associates with the correct person record; existing police information could be imported or queried rather than recreated manually.

This makes Pleadli potentially a **working layer over multiple authorized information sources**, not an isolated database.

Do not assume every external system exists today. Design the product so these integrations are *possible*, but do not invent APIs or pretend integrations already exist.

## Person profiles are important

A person is not simply a text field inside a case. Pleadli should have a meaningful concept of a person.

Depending on authorization and available information, a person may have:

- identity information
- identifiers
- contact information
- associated incidents
- associated cases
- statements
- evidence relationships
- previous reports
- relevant history
- relationships to other people
- organizational relationships
- current matters
- other authorized information

An officer should be able to **search for a person and understand the relevant context around that person**, rather than manually search through individual case files.

This must remain permission-aware. Pleadli must never assume every police user sees everything.

## Investigation is an active workspace, not a folder

An investigation is not simply:

```
Case
 ├── documents
 ├── statements
 └── evidence
```

It is an active workspace. An investigation may involve:

- people
- incidents
- locations
- vehicles
- witnesses
- suspects / persons of interest
- officers
- statements
- exhibits / evidence
- documents
- actions
- tasks
- investigative developments
- related cases
- referrals
- decisions
- timelines
- other relevant relationships

Pleadli should help an officer understand these relationships and reveal what still needs attention, for example:

- incomplete information
- outstanding actions
- pending investigative tasks
- evidence requiring follow-up
- missing documentation
- cases waiting for referral
- matters returned for further investigation
- workload
- relevant related records

This is not about replacing police judgment. It is about making the information already available to the officer more useful.

## Police work happens in the field

Pleadli Police is designed from the beginning with both **desktop and Android/mobile use** in mind. The desktop Tauri application is not the entire product.

An officer may be at a station, in an office, interviewing someone, investigating an incident, travelling, responding to an incident, working away from reliable internet, communicating with the station, or requiring assistance.

The mobile experience should eventually allow authorized officers to perform appropriate work from the field:

- person lookup
- case lookup
- viewing authorized information
- recording field information
- updating cases
- receiving assignments
- reporting developments
- communicating with the station
- requesting assistance
- requesting backup
- sharing location when appropriate
- receiving operational requests
- coordinating with other officers

Not all of this needs to be built immediately, but it is the product's actual direction. Do not architect the desktop application as if mobile is merely a future responsive version of the same UI.

## Local station infrastructure

A Pleadli Police desktop environment can potentially act as a **local station environment** for authorized devices — the station as a local operational network:

```
                 PLEADLI POLICE
                      STATION
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       Officer A      Officer B      Officer C
        Android        Android        Desktop
```

Android devices could communicate with the station environment when appropriate, allowing local information access and operational communication even when external internet is unavailable. When connectivity becomes available, appropriate information can synchronize with Pleadli Cloud.

This must not become a huge distributed-systems project. The principle is simple:

> **Local operation when possible. Cloud connectivity when available. Explicit synchronization when required.**

## Live operational capabilities

Pleadli Police can eventually go beyond records and investigation management into operational coordination:

- **Live location** — authorized officers/devices share location when operationally appropriate.
- **Backup requests** — an officer requests assistance from the station or relevant personnel.
- **Communication** — officers communicate with the station or other authorized officers.
- **Incident coordination** — operational incidents are assigned, updated, and tracked.
- **Officer status** — the station understands relevant officer availability/status where appropriate.
- **Field reporting** — developments reported directly from the field.
- **Support requests** — an officer requests appropriate assistance without relying on disconnected channels.

These are potential capabilities, not requirements to implement now. The product should simply be understood as capable of growing in this direction.

## Pleadli should reduce bureaucracy

Police officers should spend less time re-entering administrative information and more time doing useful work.

Whenever the same information is needed in multiple legitimate contexts: **reuse it.** Whenever information can safely be derived: **derive it.** Whenever a document can be generated from structured information: **generate it.** Whenever an officer needs to find information: **let them search for it.** Whenever information already exists in an authorized external system: **do not make the officer manually recreate it.**

> **Record once. Understand once. Reuse everywhere it is legitimately needed.**

## Pleadli Police should feel like a tool, not a database

The officer should not feel like they are navigating Tables → Records → Forms → Edit → Save. They should feel like they are using a professional tool that helps them work.

The interface should answer:

- What am I working on?
- What needs my attention?
- Who or what am I looking for?
- What do I already know?
- What is connected to this?
- What happened?
- What needs to happen next?
- Who is responsible?
- What information can I access?
- What can I do from here?

## Navigation

The current sidebar is the **starting navigation, not the definition** of the product:

```
Overview
Case Intake
Investigations
Statements
Evidence
Referrals
Station
```

As the product develops, other areas may naturally emerge — for example:

- **Work** — overview, my work, assignments, tasks, cases
- **People and information** — people, search, related records, vehicles, locations
- **Investigation** — cases, incidents, statements, evidence, investigation activity, actions
- **Operations** — field operations, incidents, officer coordination, assistance, backup, communication
- **Records** — reports, documents, generated documents, referrals, registers
- **Station** — station overview, officers, units, workload, local operations
- **Integrations** — national identification, biometrics, existing police systems, other authorized government systems

Do not create all of these simply because they are listed here. Build based on actual product priorities. The list exists to prevent the product ending at Case Intake → Investigations → Statements → Evidence → Referrals.

## Individual officer to police organization

Pleadli Police should work at multiple levels: individual officer, team/unit, station, division, and a larger police organization. It should not assume every deployment must immediately represent an entire national force.

Conceptually: **Officer → Unit → Station → Division → Organization**, where that hierarchy is appropriate to the organization.

## Uganda first, adaptable beyond

The first real-world design context is Uganda. The product should understand the realities of policing in Uganda — terminology, reporting practices, station structures, investigation workflows, referrals, DPP relationships, courts, prisons, national identification, available government systems, connectivity constraints, and field conditions.

Do not hard-code assumptions that are not confirmed. Uganda is where the product is designed and proven first; the underlying model should remain adaptable to other police organizations.

## Relationship with the wider Pleadli ecosystem

Pleadli Police is one application in the Pleadli family. It does not become the entire justice system.

- Police owns its police work and records.
- DPP has its own application and records.
- Courts have their own application and records.
- Lawyers have their own application and records.
- Prisons have their own application and records.
- Pleadli Cloud connects the ecosystem.

A legitimate case relationship can allow appropriate information to move between applications. But **one case does not mean one shared file**, and **connection does not mean universal visibility**. Police records remain police records. The DPP should not automatically receive every internal police record; a lawyer should not automatically gain access to internal police information; a court should not become a universal police database. The system connects legitimate work without flattening institutional boundaries.

## The most important product distinction

Pleadli Police is not trying to make existing police paperwork prettier. It is trying to make **police work itself better**.

Existing police systems often start with "What information must be recorded?" Pleadli should additionally ask "What can we do with that information to help the officer?" That difference should influence every feature decision.

## Product direction

Pleadli Police is the combination of:

**Police records + investigation workspace + information search + operational tools + field mobility + station coordination + authorized integrations + connection to the wider justice ecosystem.**

The long-term product can become the software environment through which police officers **find → understand → investigate → record → coordinate → act → report → refer** their work.

## Final mental model

> **Pleadli Police is software for doing police work, not software for entering police data.**

- The data is what makes the system intelligent and useful.
- The officer is the user.
- The investigation is the working context.
- The station is an operational environment.
- The mobile device is a field interface.
- The desktop application is a powerful workstation.
- Pleadli Cloud is the wider connectivity/control layer.
- External systems can become authorized information sources.
- The wider Pleadli ecosystem allows legitimate case relationships between Police, DPP, Courts, Lawyers, and Prisons without turning their records into one giant shared database.

## Key entity model

The product must eventually understand meaningful entities and relationships:

```
Person
Incident
Case
Investigation
Statement
Evidence
Officer
Location
Organization / Unit
Task / Action
Document
Referral
```

A Person profile has relationships to identifiers, incidents, cases, statements, evidence relationships, history, related people, and other authorized records.

Do not force people to remain embedded inside cases (e.g. `suspectName`, `complainantName`, `witnessName` strings). Do not make the entire architecture `Case → Statements/Evidence/Referral`. Build only the entities the current implementation genuinely needs — do not build a giant universal schema speculatively.

## Implementation discipline

- **Less code, not less architecture.** Prefer direct, understandable implementation.
- Build real foundations for real requirements.
- Avoid speculative: synchronization frameworks, plugin systems, generic registries, service factories, repository abstractions without a real need, giant domain frameworks, excessive hooks/providers, generic "manager" classes, premature integration layers, fake APIs, fake intelligence, unnecessary abstractions.
- Do not invent integrations. Create clean boundaries so authorized information sources can be added later.
- Do not turn the desktop app into a responsive website and call it mobile support.
- Do not build the local station networking system now unless there is a concrete requirement; the current architecture should simply avoid preventing it.