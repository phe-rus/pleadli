# Plan and stages

**Date:** 2026-09-19  
**Product:** Pleadli Prisons only  
**Rule:** docs first (this pass), then code in the order below. No feature work jumps a stage unless it is a safety fix.

This note is the **staging**. [Scope](../scope/prisons/scope.md) is the checklist the pipeline tools read. Keep them aligned when a stage starts.

Related: [[product/principles]], [[ARCHITECTURE]], [[UX]], [[LOCALIZATION]], [[AI]].

---

## Where we actually are

The 2026-09-18 scope still lists Reports breakdowns, property-at-release, pending instruments, and audit as “planned”. The app already has them in some form (UPS-shaped charts, release gates, documents-pending, hash-chained audit, Today, Legal, reception procedure, prisoner file).

Treat those rows as **existing / in progress**, not as the next invention.

What is still true:

- The **custody spine** (reception, file, clocks, court, transfer two-ended, discharge gates) is the strongest part.
- **Head Office** can pair and look at copies. It is not yet an estate, oversight, or returns desk.
- **Sync** still over-discloses full prisoner rows on a legacy path.
- **Routes** still contain page bodies, helpers, and tables. That is the first code job.
- **Today / Reports / Start** do not yet match [[product/08-application-structure]].
- **Count, gate, incidents, discipline** stay provisional until a field week.
- **AI is not in the app.** We only leave a seam so it can arrive without a rewrite.

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
