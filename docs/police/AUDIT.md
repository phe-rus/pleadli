# Pleadli Police: audit and improvement plan

Written 2026-09-21. This is an audit, a review and a recommendation. **No Police code was changed to write it.** It is meant to be read, argued with, and decided on before anything is built. The last section lists the decisions it needs.

Evidence is cited as files in `apps/police/`. Where a claim about the real Uganda Police Force comes from the web it carries a confidence label, in the same convention as `docs/police/research/`. Nothing here has been reviewed by a serving officer.

## 1. Verdict

Pleadli Police is **broad and shallow**. Every domain in `PRODUCT.md` exists as a working screen over a working table, and the ideas in `PRODUCT.md` are good (work not registers, derived views, an investigation workspace that is not a table). But it was built early, before the practices the other apps now share, and it shows in four ways:

1. **The structure under the screens is thin.** A station is one row of free text. An officer is four different things and a text column in six tables. There are no register numbers. A case has no offence, no investigating officer and no lifecycle. There is no command chain, so nothing above the station can exist.
2. **The interface is the old shell.** It is the same sidebar-and-container shell DPP had before it was rebuilt, with fat routes and no workspace, no tabs, no status language.
3. **It is not safe to connect.** The database and the documents are plain files. There is no lock, no audit trail, no encrypted backup, and a server that listens on every network interface. Any connection to DPP or to a command level would put unprotected police data on a wire.
4. **There is one Rust test in the whole application.**

None of this is a criticism of the domain knowledge, which is the strongest part. The recommendation is to keep the domain model's spirit and rebuild its skeleton, **starting with the interface and the structures** as asked, in an order that never leaves the station without a working app.

## 2. What exists

| | |
|---|---|
| Size | about 27,000 lines (TypeScript and Rust), 23 migrations, 27 tables |
| Surface | one Tauri desktop app, offline first, one SQLite file, no sign-in for local use |
| Domains | people, station diary, incidents, cases and an investigation workspace, statements, exhibits and movements, custody with the 48 hour rule, bonds, charge sheets, referrals, vehicles, stores and armory, duty roster with check-in and handover, station profile and establishment, officers, reports, an activity feed, data import and export, backup alerts |
| Screens | 32 pages, 18 with a data table, 3 print routes, 16 places where documents attach |
| Remote | a restricted web page on the station network (search and custody alerts only), optional Cloudflare tunnel, officer accounts for it |
| Documents | PDF, DOCX and XLSX export for a person, a case, a charge sheet, and a bulk export; a bulk import wizard |
| Tests | 1 Rust test; no frontend tests |

What is good and should be kept:

- **The product definition** (`docs/police/PRODUCT.md`): capabilities, not tables; records, workflows, workspaces and derived views kept apart; referenceability is not visibility.
- **The 48 hour custody rule is derived** from timestamps, never a status field, as `PRODUCT.md` demands.
- **The investigation workspace is a composed view**, not a table of its own.
- **The research** on custody, bonds, PF forms and the real CRB number format is sourced and honest about its gaps.
- **Shift check-in and handover** exist as their own records.
- **Import and export** exist, which matters for a station moving off paper.
- **Table convention** (UUID badge first, comprehensive columns) is applied.

## 3. Findings

Severity: **A** blocks connecting or scaling; **B** limits what the app can honestly be; **C** quality of life.

### 3.1 Structure and data model

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S1 | A | **An officer is four things and a text column.** Login credentials (`officers`), the roster (`station_establishment`, a person plus post and rank), shift assignments (`duty_assignments.officer_name`, plain text) and a person link added later (`0021`). Then `officer_name` or similar is a free text column in statements, bonds (two), exhibits (two), charge sheets and referrals. There is no single "who did this", so accountability, roles, "my work", and an audit trail cannot be built on it. | `migrations/0004,0007,0009,0011,0012,0013,0014,0015,0021` |
| S2 | A | **A station is one row.** `station_profile` is a singleton of free text (name, address, jurisdiction, contact, OC). No station id, no units or teams inside it, no division, district or region above it. Nothing can be keyed to a station, so register numbers, roll-ups, command visibility and DPP connections have nothing to attach to. | `0014_station_admin.sql` |
| S3 | A | **No register numbers.** Station diary entries have no number at all. A case reference is a free text field with no uniqueness, no per station per year sequence, and no link between a diary entry, its crime record number and the case. The real format is known (`{station name} CRB {n}/{year}`) and is only a placeholder in a form. | `0002`, `0006`, `case-form.tsx`, `file-structure-and-numbering.md` |
| S4 | B | **An incident is too thin to be a report.** Summary, description, location, one time, one person. No time reported against time occurred, no reporter, complainant, victim or suspect roles, no offence classification, no source. | `0003_incidents.sql` |
| S5 | B | **A case is a reference, a summary and a status.** No offence, no charge structure (charge sheets are separate rows), no investigating officer, no unit, no registered or closed date, no lifecycle, no investigation diary, no file number from the DPP or court, no link to what the DPP decided. | `0006_cases.sql` |
| S6 | B | **Custody records an arrest, not a detention.** No arresting officer, no offence or reason, no cell or register number, no record of rights, medical examination or property, no production in court, no charge. The derived 48 hour clock is correct but rests on little. | `0008_custody.sql` |
| S7 | B | **A referral is a note.** Free text destination, a status someone types, no material sent, no reply. Nothing moves to the DPP, and nothing returns. Stage 8 defined the contract; the Police side of it does not exist. | `0013`, `referrals.rs`, `docs/interchange/police-dpp.md` |
| S8 | B | **The roster has no post.** A shift is a name, a rank, a free text unit and two times. No beat, desk, cell duty, or role for the shift. | `0004` |
| S9 | B | **Attachments are plain files in the user's Documents folder, in folders named after the case reference, with absolute paths in the database.** This is the same defect class DPP had before Stage 7 (paths leak, names reveal cases, renaming a case orphans its folder). To verify against `attachments.rs`. | `attachments.rs` |
| S10 | C | **The activity feed is derived, but there is no audit trail.** Nothing records who changed a custody record, released someone, or edited a statement. Only remote requests are logged. | `activity.rs`, `remote_access_log` |

### 3.2 Domain depth

| # | Sev | Finding |
|---|---|---|
| D1 | B | **The crime report is missing as a thing.** `PRODUCT.md` records that a diary entry that is "criminal in nature" becomes a CRB entry, and the research names PF16 as the likely crime report form. The app has a diary, incidents and cases but no crime report record that carries the CRB number, so the chain diary, report, register, case is not represented. Do not invent the decision rule (human decision, per the research). |
| D2 | B | **Statements are text with a person.** The real statement forms (PF2A continuation sheets, PF2B particulars sheet) have a structure the app does not follow: date, time, place, occupation, age, sex, nationality or tribe, residence, address, then the statement. The person model has no occupation, age or sex. |
| D3 | B | **Charge sheets exist but the charge is not modelled.** A charge sheet row holds offence, section and particulars as text. There is no offence list, no per accused count structure, and no connection to what DPP later sanctions. DPP already models counts and per accused decisions. |
| D4 | B | **Bonds and custody are separate silos.** A release on bond is a bond record, not the end of a custody record with a reason (bond, court, transferred, released). The research says PF18 is the real bond form; the app does not mirror it. |
| D5 | C | **Exhibits are good** (they have movements as chain of custody). They lack a register number and a link to the statement that produced them. |
| D6 | C | **Stores, armory and vehicles work** but have no link to the officer who holds an item, because of S1. |

### 3.3 Interface

| # | Sev | Finding |
|---|---|---|
| U1 | A | **It is the old shell.** The shared `Dashboard` sidebar with a breadcrumb header, `container` pages, no workspace, no tabs, no left ribbon, no status bar, no semantic status tags, no settings cards. It looks like a different product from Prisons and DPP. |
| U2 | B | **Fat routes.** The largest are the Overview (405 lines), the investigation workspace (287), settings (287), the roster (220), reports (214). Pages hold their own tables, forms and helpers, against the rule Prisons wrote down. |
| U3 | B | **Navigation is a register list.** Twenty top-level entries in the order of the paper registers, with Search holding people, files, custody and bonds as children. It is not organised by the officer's work (what needs me now, my cells, my cases, my station). |
| U4 | B | **No "what needs attention" that answers for a role.** The Overview is a set of stat cards and lists for whoever opens it. An OC Station, a duty officer, a detective and a records clerk want different first screens. |
| U5 | B | **The custody board is a table.** The one screen where time is the whole point (who is inside, how long, what is due) is a data table with a badge, not a board ordered by deadline. |
| U6 | C | **Print and export are per screen** rather than one document model (compare DPP Stage 5). |
| U7 | C | **No responsive standard**, no reduced motion handling, no keyboard shortcuts. |

### 3.4 Architecture and code

| # | Sev | Finding |
|---|---|---|
| C1 | A | **Three doors to the same data.** 99 Tauri commands, a dev only Axum mirror on an unprefixed path, and a separate remote server. Every frontend data file has an `isTauri()` branch (102 of them). This is what DPP had before it moved to one `/api/**` router. Adding a station node, a command level or DPP packages on top of this means three implementations of each. |
| C2 | B | **No domain error type.** Validation and refusals are not separated from database errors; derived rules live in the frontend (the 48 hour compliance is TypeScript). |
| C3 | B | **One test.** No test pins custody, bond, roster or import behaviour. This is the single largest risk to any restructuring. |
| C4 | C | **Migrations are additive and small** (good), but several tables carry text where a reference belongs (S1). |

### 3.5 Security

| # | Sev | Finding |
|---|---|---|
| X1 | A | **Plaintext database and plaintext documents.** No SQLCipher, no sealed vault, no key management. Custody, statements and identities of suspects and witnesses sit unprotected on a shared station computer. |
| X2 | A | **The remote server listens on `0.0.0.0`** whenever remote access is on, over plain HTTP on the station network, with opaque bearer tokens. The Cloudflare API token, a real secret, is stored in a plain table. Prisons found and fixed the same class of problem (X9, sealed under a key). |
| X3 | A | **No lock and no audit trail** for local use, by design so far ("local desktop use stays completely unauthenticated"). That was defensible for a single officer on a personal machine. It is not defensible for a station machine, and it blocks any role model. |
| X4 | B | **An officer's password can appear in Debug output** (already a planned item in `docs/scope/police`). |
| X5 | B | **Backups are alerts about backups**, not encrypted backups. There is no restore. |

### 3.6 Ecosystem

| # | Sev | Finding |
|---|---|---|
| E1 | B | No station identity, so no pairing with a DPP office (the Stage 8 contract needs one), and nothing to key a command level on. |
| E2 | B | No commitment to who else needs to see what. `PRODUCT.md` states "referenceability is not visibility" and "connection does not mean universal visibility" but nothing implements a disclosure rule. Prisons does: its head office sees counts, the roster and returns, never records. |
| E3 | C | Prisons transfer (a custody record ending in a remand) has no counterpart. |

## 4. The real structure of the Uganda Police Force

This section exists because "what the Police structure should be" cannot be answered from the code. What I could establish from public sources is small. **It is a starting reference, not a model.**

Confirmed from public pages (labels follow the research convention):

| Fact | Confidence | Source |
|---|---|---|
| The force is headed by the Inspector General of Police (IGP), assisted by the Deputy IGP, under Article 213 of the Constitution; headquarters at Naguru, Kampala | Secondary | [Wikipedia](https://en.wikipedia.org/wiki/Uganda_Police_Force), [UPF directorates](https://upf.go.ug/directorate/) |
| Thirteen headquarters units are listed: Administration, Counter Terrorism, Criminal Investigation, Human Resource Development and Management, Information and Communication Technology, Interpol, Kampala Metropolitan Police, Logistics and Engineering, Oil and Gas, Operations, Political Commissariat, Research Planning and Development, Special Duties, Welfare | Secondary | [Wikipedia](https://en.wikipedia.org/wiki/Uganda_Police_Force) (the UPF page itself would not load: expired certificate) |
| Regions were renamed after physical features (for example West Nile, Albert, Ruwenzori, Bwindi, Katonga, Equator, Victoria, Kiira, Elgon, Malaba, South Kyoga, North Kyoga, Aswa), and Kampala Metropolitan was kept | Secondary | [Uganda Radio Network](https://ugandaradionetwork.net/story/police-regions-renamed) |
| Kampala Metropolitan Police covers Kampala Metropolitan North, South and East | Secondary | search results, same source family |
| Command positions below headquarters are Regional Police Commander (RPC), District Police Commander (DPC), Officer in Charge of a station, and Officer in Charge of the Criminal Investigation Division (OC CID) | Secondary | [Justice Centres Uganda](https://justicecentres.go.ug/glossary/police/) |
| A lower rank is supervised by a higher rank; RPCs are meant to be Senior Superintendents | Secondary | [Justice Centres Uganda](https://justicecentres.go.ug/glossary/police/), [Monitor](https://www.monitor.co.ug/uganda/lifestyle/reviews-profiles/understanding-police-ranks-1516804) |

Not established (and not to be invented):

- how many regions, districts, divisions, stations and **posts** there are, and what a **police post** is relative to a station;
- what a **division** is between a district and a station (in Kampala, in particular), and how a district is divided;
- how CID is organised at region, district and station level, and who the case file passes through;
- how the **Crime Record** office at a station works (who holds the CRB), and who assigns numbers;
- how supervision and returns to the region work in practice;
- the current rank structure as it applies to posts (the codebase has a free text rank).

**Recommendation on this gap.** Two things follow from it. First, the structure must be stored as **data, not code**: a tree of units with a kind, a name and a parent, so that whatever the real structure is can be entered and corrected without a release. Second, the specific answers above need a **dedicated research pass and a review by serving officers** (the same route used for custody and CRB numbering) before the levels, their names and their command roles are fixed in the product.

A tree that is safe to build now, whatever the answers turn out to be:

```
Force headquarters
  Directorate / unit at headquarters (CID, Operations, ...)
  Region (Regional Police Command)
    District (District Police Command)
      Division / Station (Officer in Charge)
        Post
        Unit inside a station (CID, records, cells, stores, patrol ...)
```

Each node has a `kind`, a name, a parent, a commander post, and (for stations) a register namespace. The kinds above are **proposals to be validated**, not facts.

## 5. What Prisons already solved

Police should adopt Prisons' answers rather than reinvent them. The mapping is direct.

| Prisons | Police equivalent |
|---|---|
| **Facility** node with its own database, its workstations, its officers | **Station** node |
| **Head Office** that aggregates: counts, the roster and returns, never records ("tiered disclosure") | **Command** (district, region, headquarters): counts, roster, returns, custody compliance; never case or person records |
| Facility-first onboarding, roles and permissions enforced at the node, not the UI | Station onboarding, roles (OC Station, OC CID, desk officer, cell duty officer, records officer, storekeeper), enforced at the node |
| One `/api/**` router, one typed client | same |
| Three pillar workspace: ribbon, sidebar with Pinned, Recent and areas, tabs, status bar, semantic tags, settings cards | same shell |
| D14: SQLCipher, sealed vault, key in the OS keystore, encrypted backups, audit chain | same, ported |
| Pinned-TLS exchange between machines, fingerprint confirmation | for workstation to node and node to command |
| Reports, inbox, documents with print | same |

Prisons also shows the cost: its shell, node model and command level took many sessions. The plan below is ordered so that each step is usable alone.

## 6. Target: three surfaces from one application

`PRODUCT.md` already says an individual officer must be useful with zero connection, a station operates as a station, and broader visibility is something a connected deployment adds. That maps onto three modes of one application, chosen at onboarding (Prisons does the same with `isHeadOffice`):

| Mode | Who | What it is |
|---|---|---|
| **Officer** | one officer on their own computer | today's app, unchanged in spirit: no server, no sign-in, their own diary, cases, statements and custody watches. Becomes the mobile boundary later. Encrypted, optional lock. |
| **Station** | a station's node and its workstations | the station's shared records with real officers, roles, registers, numbering, the station commander's view, packages to its DPP office |
| **Command** | a DPP-equivalent: a district, region or headquarters | reads what stations disclose (counts, roster, returns, custody compliance), holds no case records, can send directives and receive returns |

**Officer side** is not a separate product; it is the station app with the node switched off. This keeps one codebase and one set of screens and matches "zero connection, still useful".

**Command side** should be one mode that works at more than one level (a district sees its stations; a region sees its districts) because the structure tree in section 4 makes level a property of the node, not of the app.

**Station to DPP** uses the Stage 8 contract unchanged: the station lists the DPP office it was given a connection to, sends referrals to it, and reads receipts and decision notices.

## 7. Recommended plan

The order is: **the interface first**, then the structures, then depth, then security and connection. Each step ships on its own. The interface comes first because it is what the user sees and it does not change the data; the structure comes second because everything after it needs it.

### P0. Ground truth (no product change)

- Research pass on the real structure (section 4 gaps), and a review by serving officers. Output: a corrected `docs/police/research/structure.md`.
- A **characterisation test suite** for what exists (custody clock, bonds, roster, import, export). This is the safety net for everything else, and today there is none.
- Decide the questions in section 8.

### P1. Interface: the Prisons workspace, in Police's own language

Same approach as DPP Stage 1, and the same rule: borrow the design language, not the terminology.

- Shell: ribbon, sidebar (Pinned, Recent, areas with live counts), tabs, status bar, semantic tags, settings cards, print sheet, responsive standard.
- Navigation reorganised **by the officer's work** rather than the paper registers: Overview, Search, then groups such as Desk and Diary, Cells and custody, Investigations, Exhibits and stores, Station, Reports. The same domains, in the order work happens. A proposal for the map is part of P1's plan.
- **Overview by role**: what needs this person now (a duty officer sees custody deadlines and open diary entries; a detective sees their cases and statements outstanding; the OC sees the station). Answered from real data only.
- **Custody board**: ordered by deadline, not a table.
- Case and person workspaces (the person profile and the investigation workspace) brought into the same tabbed structure.
- Thin routes and one reader pattern.

No table changes. Real data or an honest empty state, as elsewhere.

### P2. Structure

- **One `/api/**` router** replacing 99 commands, the dev mirror and per feature `isTauri()` branches (as DPP Stage 0). Domain error type; derived rules (48 hours) moved to Rust and tested.
- **The unit tree** (section 4) and a real **station identity**.
- **One officer**, referenced everywhere; roles; migrate the six text columns to a reference without losing data.
- **Register numbers**: per station and year sequences for the diary and the CRB, with the CRB reference generated in its real format.
- Attachments moved to id based paths (as DPP), documents sealed after P4.

### P3. Domain depth (each grounded in research, none invented)

- Crime report between diary and case, with the CRB number (human decision to convert; never automatic).
- Incident: reported and occurred times, roles, offence classification.
- Case: offence and counts, investigating officer and unit, lifecycle, investigation diary, DPP file reference.
- Statement in the PF2B structure; charge structure aligned with what DPP models.
- Custody detail: arresting officer, offence, rights, medical, cell, property, production in court, and its end reasons. Bond as one end reason (PF18).
- Referral becomes a real package (Stage 8 Police side).

### P4. Security foundation

The D14 port: SQLCipher, sealed vault, key in the keystore, optional lock, hash chained audit trail, encrypted backups with restore, recovery mode. **Before any network feature.** The existing remote server is replaced by the node model in P5, and the Cloudflare token is sealed.

### P5. Station node and roles

Node and workstation model as Prisons: officers sign in at the node, permissions enforced at the node, onboarding, pinned TLS between workstation and node. The single officer mode remains the default.

### P6. Command side

The aggregator: what a station discloses (counts, roster, returns, custody compliance), by level. Directives out, returns in. Never records.

### P7. Officer side and mobile boundary

Individual mode polished; the mobile client's contract (lookup, assignments, field reporting) as an API surface, without building the mobile app.

### P8. Ecosystem

DPP connections (Police side of Stage 8), Prisons transfer from custody, Courts later.

## 8. Decisions needed

1. **Order.** Interface first (P1) then structure (P2), as you asked. The risk is that P1's new screens later need adjusting when P2 changes the data. I recommend P1 reads through thin, stable view models so P2 does not break it, and that P0's tests come first. Agree?
2. **One application in three modes** (Officer, Station, Command), rather than separate Police apps for the command level. Agree?
3. **Structure as a tree of units stored as data**, with the kinds in section 4 as proposals until the research pass confirms them. Agree, and can the research pass go through serving officers?
4. **Command levels.** One Command mode serving district, region and headquarters by level, or separate products? I recommend one.
5. **Roles.** The station roles in section 5 (OC Station, OC CID, desk officer, cell duty officer, records officer, storekeeper) are my mapping from the command positions found and from Prisons. They need confirming before permissions are built.
6. **Officer mode and security.** Encryption and an optional lock become the default for every mode, including a single officer's own computer. Agree?
7. **What happens to existing data.** Every station using the current app has plaintext data and text officer names. P2 and P4 migrate in place with verification and a kept backup, as DPP did. Is there a real station database to test the migration against, or only the seed?
8. **Scope of P1.** The Prisons shell includes an AI assistant pillar and inbox. Police should not, in P1. Agree?

## 9. What not to do

- Do not fix the structure levels or command names from this document. Section 4 is a reference, not a model.
- Do not build the command side before the station node and P4 exist: it would put unprotected police data on a wire.
- Do not rebuild every screen at once. The shell and the Overview first, then the two workspaces (custody board, case), then the rest as the structure lands.
- Do not merge exhibits with stores, or people with officers by convenience: `PRODUCT.md` is right to keep them apart.
- Do not invent procedure: the diary to crime report rule, bond authority, PF94 triggers and posts are all open in the research.

## Sources

- [Uganda Police Force, Wikipedia](https://en.wikipedia.org/wiki/Uganda_Police_Force)
- [Police regions renamed, Uganda Radio Network](https://ugandaradionetwork.net/story/police-regions-renamed)
- [Police, Justice Centres Uganda glossary](https://justicecentres.go.ug/glossary/police/)
- [Understanding police ranks, Monitor](https://www.monitor.co.ug/uganda/lifestyle/reviews-profiles/understanding-police-ranks-1516804)
- [UPF directorates](https://upf.go.ug/directorate/) (found in search; the page would not load: expired certificate)
- [UPF Annual Crime Report 2024](https://upf.go.ug/wp-content/uploads/2025/02/ACR2024-Web.pdf) (too large to read here)
- In repo: `docs/police/PRODUCT.md`, `docs/police/research/*`, `docs/scope/police/`, `docs/prisons/ARCHITECTURE.md` and `SECURITY.md`, `docs/interchange/police-dpp.md`

## Progress log

### 2026-09-21: P1 interface and the first part of P2

Decisions taken as recommended: interface first, one application, no AI or inbox pillars, structure held as data. No characterisation test suite was written first (asked to avoid tests until the work is done); the one test added covers the new router, the register numbers and the command structure.

Built:

- **Workspace shell** (`apps/police/src/features/workspace`, ported from DPP): left ribbon and sidebar, Chrome-style tabs (case, person and charge sheet tabs take their own names), status bar, Ctrl K search, quick actions (diary entry, incident, case, custody, person). The old `Dashboard` sidebar, breadcrumb header and `toolbar/headers` are gone.
- **Navigation by the officer's work**: Front desk, Cells and custody, Investigations, Station, Administration. Routes unchanged. Chips show real counts only (people in the cells or near the limit, open cases, referrals without an outcome).
- **Overview**: kept Police's stat tiles, banners and chart; added a "Needs attention" list of named people near or past the custody limit and referrals with no outcome. Not yet role-based: that needs officer identity (P5).
- **Custody**: a board of who is in the cells, soonest limit first, above the full register table. Deadline text says which rule applies, in words.
- **Page rhythm**: every route uses the shared `page` layout; shared components (operational rows, tags, stat tile, settings card, planned/empty notes, add panel) ported.
- **One `/api` router**: `apps/police/src-tauri/src/api/mod.rs` replaces the dev mirror; the desktop app reaches it through the single `api_request` command; the frontend has one `api()` in `src/lib/api.ts`. 17 per-domain Tauri command modules deleted. Kept as commands only what needs the operating system or a window event: attachments, exports, import, network, Cloudflare, photo-from-path, backup-alert respond/end.
- **Units tree and station place**: migration `0024_units`, `domain/units.rs`, `/api/units/chain`, and a "Place in the command structure" section on Station profile (region, district, division, all optional, none checked against a list).
- **Register numbers**: migration `0025_registers`. Diary entries are numbered per year (`SD n/year`, existing entries backfilled in the order made, East Africa Time year). A case saved with a blank reference takes the next Crime Record Book number and is cited `{station} CRB n/year`; a typed reference is kept as written.

Not done from P1: splitting the largest routes (settings, case workspace, person profile, roster, reports) into feature modules; role-based Overview; the shell has not been seen in the Tauri window (checked in headless Chrome against sample data only).

Not done from P2: one officer record (officers, establishment, roster names and six `officer_name` text columns are still separate), id-based attachment storage, the Cloudflare token still plain. Then P3 onward.

### 2026-09-21 (later): one officer record

Finding S1 is closed for the officer itself and for the four places that name the officer who acted.

- **One `officers` table** (migration `0026_officers_unified`, runs outside sqlx's transaction so foreign keys can be switched off for the rebuild): name, rank, post, role, active, optional badge number, optional remote sign-in (`password_hash` is NULL for an officer with none), optional person link, notes. `station_establishment` rows were folded in (a person posted twice becomes one officer); the old table is left in place, unread and unwritten, to drop once a station confirms. Checked on a scratch database with foreign keys on, including sessions still pointing at the rebuilt table.
- **Officers page** replaces Establishment; the Establishment route, forms, API routes and import type are gone (the import type is now `officer`). Officers export in the vault, workbook and bulk documents.
- **Shifts and records point at an officer**: `duty_assignments.officer_id` and `officer_id` on statements, bonds, charge sheets and referrals (migration `0027`). Choosing an officer takes the name (and rank on bonds) from the officer's record; the name stays on the record as a snapshot, so a printed charge sheet does not change if the officer is renamed. Existing typed names are linked only where exactly one officer has that name. A person not on the books can still be typed in.
- Refusals say why: a sign-in needs a badge number (422), a badge number is unique (409). `CreateOfficerInput` and `UpdateOfficerInput` are no longer `Debug`, so a password cannot reach a log line (scope item 24).
- Three router tests pass (registers and structure; one officer record; the existing remote login round trip).

Still typed text: exhibits (`receiving_officer_name`, `custodian_name`), store assets (`holder_name`), vehicles. Roles beyond `officer` / `admin` (OC Station, desk officer and so on) wait for P5.

### 2026-09-21 (later still): the attachment vault

Finding S9 is closed. The vault stays a browsable folder in Documents, organised by case as an officer would look for it (that is the product's intent); what changed is that it no longer breaks when a name changes or the folder moves.

- **Stored paths are relative to the vault root.** The database no longer holds absolute paths, so the vault can move (another Documents folder, a restored backup, another machine). Rows written earlier are rewritten at start (`normalise_stored_paths`, idempotent; a file outside the vault keeps its absolute path until it is moved in).
- **A case renamed takes its files with it.** Changing a case reference renames its whole folder in one step (documents, companions and every record filed under it) and the stored paths follow. When two cases share a reference (references are not unique) each record's files are moved one by one instead.
- **A record moved to another case brings its files.** Asking for a record's folder now also moves any of its attachments that are somewhere else, so the folder and the files always agree.
- **A reference cannot leave the vault.** Folder names drop characters a file system dislikes and trailing dots or spaces; `..` or an empty reference becomes `unnamed`. Existing folders with such characters are moved into their sanitised name the next time the record is saved.
- **No absolute path reaches the window.** `absolutePath` is gone from the vault listing; files are opened and revealed by naming the attachment or its place in the vault (`open_attachment`, `open_vault_path`, `reveal_vault_path`) and the app works out where it is on disk. The Files page shows the location within the vault.
- One unit test covers rename, move between cases, legacy rows and traversal.

Known limit: the generated Markdown companion of a record moved between cases is rewritten in the new folder but the old copy stays until that folder is removed (a case rename moves companions with the folder, so this is only for a record filed under a different case).

The vault is still plain files in Documents. Sealing it belongs to the security stage and would change the "browsable folder" intent, which is a decision to take then.
