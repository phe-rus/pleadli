# Plan and stages

**Date:** 2026-09-19  
**Product:** Pleadli Prisons only  
**Rule:** docs first (this pass), then code in the order below. No feature work jumps a stage unless it is a safety fix.

This note is the **staging**. [Scope](../scope/prisons/scope.md) is the checklist the pipeline tools read. Keep them aligned when a stage starts.

Related: [[product/principles]], [[ARCHITECTURE]], [[UX]], [[LOCALIZATION]], [[AI]].

---

## Where we actually are (reviewed 2026-09-20)

Method: each line below was checked against `apps/prisons` and `src-tauri` on this date, not against notes. Capability-level truth stays in [[product/status]]; this section is the stage view of it.

| Stage | State | Evidence |
|---|---|---|
| 0 Docs vault | done | this folder, `product/`, `status.md` |
| 1 Code craft | **routes done, rest open** | every file under `routes/` now exports only `Route` and `RouteComponent` (`__root` also declares its context type); page bodies moved to `features/` (`facilities-page`, `officers-page`, `features/procedures/`, `today/home-page`, and the list and file pages of the other areas). Still open: `features/` is 36 flat folders, not nested by work; `icon: any` remains in 3 places; the `Createpanel` name is unchanged |
| 2 Interface | **mostly done** | workspace shell: ribbon, sidebar, tabs (five at most), Ctrl K palette, Start as procedures, right pillar with the assistant and the open record's context, printable documents as tabs |
| 3 Motion and tasks | **partly done** | procedures share `ProcedureShell`. Dirty close still uses `window.confirm` in `add-record-panel.tsx` and `create-panel.tsx`, which the stage says to remove |
| 4 Languages | **in progress** | Paraglide compiles and about 2,500 messages are extracted. Only `en.json` has content: `sw`, `de`, `fr`, `zh` are empty files and fall back to English |
| 5 Returns and paper | **mostly done** | the node builds seven report kinds and the UI produces numbered, fingerprinted, printable returns. A monthly return is now checked (adds up, generated after its period closed, the period's records unchanged), attested by the OIC (`report.attest`, final, printed on the sheet), and submitted to Head Office, which acknowledges it and lists what it received, replacing an earlier return for the same period. Still missing: Visiting Justices extract and observations record; property inventory print; the fields of the UPS return the records do not yet hold (staff by rank, escapes, deaths) |
| 6 Today and IA | **partly done, one deliberate change** | Today leads with what is owed. The plan said analytics leave home; the 2026-09-20 decision is that statistics belong on Today (facility) and Overview (Head Office), below the owed work, and Reports is only the printable returns. Still missing: health and programmes as areas (the nav's Care and contact holds only Visits and Requests), Movements exists |
| 7 HQ estate | **estate done, Locate open** | Home is now the estate: a needs-attention list (no contact for over a week, never heard from, awaiting verification, return overdue, over capacity, connection requests waiting), then every region with its facilities: contact, people held against capacity, occupancy and the return for the last closed month, each with how old it is and never zero for unknown. Facilities send a small status report (`estate.rs`, sync class `status`) and every authenticated call counts as contact. Pairing tiles are gone from Home. **Not done: Locate.** Head Office holds no names since the X4 change, so it finds nobody by name; the locator (T1) needs its field list confirmed and an event stream that does not exist yet. The oversight inbox is not built. Thresholds (seven days silent, seven days of grace for a return) are provisional |
| 8 Intelligence seam | **UI only** | the assistant panel and its `askAssistant` seam exist and always answer "not connected". There is no provider setting, no OIC switch, no tools, no thread persistence, and it must not ship a model until those exist ([[AI]]) |
| 9 Field modules | not started | correct: waits for the field kit |

**Safety leftovers** (from [[product/status]] section 5): X4 is narrowed, not retired: the legacy push now carries only the columns Head Office's counts read (no name, national ID, reference, location or notes; birth date held to the year) and Head Office scrubs what older builds sent. X9 is fixed at rest: the four network credentials are sealed under a key file beside the database, which defends against a copy of the database alone, not against the whole data folder (D14). X10 database and vault unencrypted; the packaged Tauri app has never been run here. The Cloudflare Tunnel is provisioned from a Head Office route and the `cloudflared` connector is bundled and supervised, but none of that has been run against Cloudflare.

**What to do next, in order:** (1) decide the locator's field list (see stage 7, Locate) before any Head Office search is rebuilt; (2) the provider setting and OIC switch before the assistant is connected to anything; (3) D14 (key in the OS keystore or under a passphrase, database and vault encryption) and retiring the legacy push for the tiered exchange, before a real facility pilot.

---

## Order of work

Code cleanliness is first because every later stage (Obsidian chrome, languages, AI tools) lands in the wrong place if routes stay fat and features stay flat.

| Stage | Name | Ships when | Depends on |
|---|---|---|---|
| 0 | Docs vault | This folder is the map. Scope rows 24+ exist | — |
| 1 | Code craft | Routes are thin. Features are nested. Naming is stable | 0 |
| 2 | Interface | Obsidian-like work: command, links, quiet chrome, Start as procedures | 1 |
| 3 | Motion and task | One path per job, short motion, no nested wizards | 1, 2 |
| 4 | Languages | Paraglide, English default, four more locales for chrome | 1 |
| 5 | Returns and paper | Attested monthly return, print of named documents | 1 |
| 6 | Today and IA | Home is owed work. Care includes health and programmes. Reports is Returns | 2, 5 |
| 7 | HQ estate | Occupancy, currency, locate “as of”, oversight inbox (not pairing tiles) | 5, 6 |
| 8 | Intelligence seam | TanStack AI, BYOK or account, tools on `/api/**`, off by default | 1, 4 |
| 9 | Field modules | Count, gate, incidents, discipline after a real facility week | Field kit in [[research/backlog]] |

Safety leftovers (secrets at rest, vault encryption, real HQ transport, stop live full-row snapshot) sit **beside** stages 1 to 7. They never wait for polish. They do not open new product domains.

---

## Stage 0 — Docs (this pass)

Done when:

- This vault has a home, a plan, and craft notes.
- Product map remains the operating-model contract.
- Scope enrolls craft, interface, languages, intelligence.
- No application code changed for the docs themselves.

---

## Stage 1 — Code craft (first implementation)

See [[ARCHITECTURE]].

Done when:

- Every file under `apps/prisons/src/routes/` exports `Route` and a `RouteComponent` (or `RootComponent` on `__root`). Nothing else.
- Page bodies live in `features/<area>/`. Shared chrome lives in `components/`.
- Features are nested by work (`legal/`, `custody/file/`, `movements/`), not one flat folder per old table.
- Data access stays `schema.ts` + `data.ts` + `queries.ts` + UI. Rust stays `domain/` vs `api/`.
- TanStack Router, Query, and Form are the client stack. No extra client database. No extra AI SDK.

This stage is a move, not a redesign. Behaviour stays. Paths stay unless a path was already wrong.

Worst current offenders (move first): `routes/_public/index.tsx` (HQ overview), `facilities/index.tsx`, `officers/index.tsx`, `reports/index.tsx`, `procedures/arrival.$transferId.tsx`, `procedures/transfer.$prisonerId.tsx`, `settings/index.tsx`.

---

## Stage 2 — Interface (Obsidian approach)

See [[UX]].

Done when:

- Command palette is the fastest way to a person, a procedure, and a setting.
- A prisoner file reads as one note with backlinks (legal, visits, property, movements), not a stack of CRUDs.
- Start launches **procedures**, not “add record type”.
- Chrome is quiet. Density is for records officers, not marketing tiles.
- The same patterns are written so Police and DPP can copy them later, without building those apps now.

---

## Stage 3 — Motion and simpler tasks

Done when:

- Reception, discharge, transfer, arrival share one `ProcedureShell` motion language.
- Dirty close uses the same confirm pattern as the rest of Pleadli, not `window.confirm`.
- No task asks the officer to pick a record type if Today or the file already knows the job.
- Animation is short, opacity and small translate, interruptible. No decorative springs on tables.

---

## Stage 4 — Languages

See [[LOCALIZATION]].

Done when:

- `@inlang/paraglide-js` compiles messages for `en` (default), `sw`, `de`, `zh`, `fr`.
- Locale is an officer setting on the node, not a URL prefix (this is a desktop node).
- Chrome, procedures, and empty states use `m.*`. Statute citations and proper names stay as sourced until a jurisdiction pack exists.
- German and Chinese are present because the product family will need them. They do not mean Germany or China is a market. Uganda English remains default.

---

## Stage 5 — Returns and paper

This is the product gap from the 2026-09-19 review, not a visual restyle.

Done when:

- An officer can build, check, attest, and export a monthly return in UPS’s shape (not only charts).
- Admission, property inventory, s.118 list, transfer dossier, and discharge can be printed as documents.
- Visiting Justices extract and official-visitor observations have a record shape, even if HQ inbox is later.

---

## Stage 6 — Today and information architecture

Done when:

- Today answers “what is owed”. Analytics are gone from home.
- Movements shows everyone crossing the wall today (court and hospital as well as transfers).
- Care and contact includes health movements and programmes at the area level.
- Officers + Settings sit as Facility administration.
- Unlock is the word for the population figure when capacity is set.

---

## Stage 7 — Head Office estate

Done when:

- Home is estate health: occupancy, last exchange, facilities in trouble.
- Locate shows last known facility and how old that knowledge is.
- Pairing stays a Network action, not the Overview.

---

## Stage 8 — Intelligence seam

See [[AI]]. **Do not ship a model in the facility** until tools, audit, and an off switch exist.

Done when:

- TanStack AI can be turned on with an officer-supplied key (BYOK) or a Pleadli account later.
- Tools call the same `/api/prisons/**` the UI uses. The model never gets a raw database.
- Threads persist in the node SQLite through TanStack AI persistence, attributed like any other write.
- Default is off. No prisoner text leaves the machine unless the OIC enabled a provider.

---

## Stage 9 — Field modules

Count, handover, gate, incidents, discipline. Shapes stay provisional until the field kit in [[research/backlog]] has been run at two facilities.

---

## What we are not doing in these stages

- Building Police, DPP, Courts, or Lawyers UI.
- Replacing sqlx with TanStack DB.
- Adding Vercel AI SDK, i18next, or a second router.
- Inventing German Strafvollzug, Kenyan clocks, or PMIS replacement.
- Headcount mechanics from blog posts.

---

## Suggested first code PR after this note

Stage 1 only: thin the worst route files, nest the matching features, fix `Createpanel` naming and `icon: any` while you are there. No new domains.
