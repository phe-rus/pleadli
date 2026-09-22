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
| 6 Today and IA | **partly done, one deliberate change** | Today leads with what is owed. The plan said analytics leave home; the 2026-09-20 decision put statistics on Today and Overview; **superseded 2026-09-21**: Today is Attention, today's operations, custody, recent activity and documents and returns, and the statistics are one chart on Today (facility). Reports carries none: **Reports is documents only** (2026-09-21 direction), with a library, drafts and a composer. Still missing: health and programmes as areas (the nav's Care and contact holds only Visits and Requests), Movements exists |
| 7 HQ estate | **estate done, LAN exchange built (2026-09-21), Locate open** | Home is now the estate: a needs-attention list (no contact for over a week, never heard from, awaiting verification, return overdue, over capacity, connection requests waiting), then every region with its facilities: contact, people held against capacity, occupancy and the return for the last closed month, each with how old it is and never zero for unknown. Facilities send a small status report (`estate.rs`, sync class `status`) and every authenticated call counts as contact. Pairing tiles are gone from Home. **Not done: Locate.** Head Office holds no names since the X4 change, so it finds nobody by name; the locator (T1) needs its field list confirmed and an event stream that does not exist yet. The oversight inbox is not built. Thresholds (seven days silent, seven days of grace for a return) are provisional. 2026-09-21: Head Office now keeps an exchange log and reads each facility's exchange (see the Foundation stage below); the estate view itself was not changed |
| 8 Intelligence seam | **UI only** | the assistant panel and its `askAssistant` seam exist and always answer "not connected". There is no provider setting, no OIC switch, no tools, no thread persistence, and it must not ship a model until those exist ([[AI]]) |
| 9 Field modules | not started | correct: waits for the field kit |

**Safety leftovers** (from [[product/status]] section 5): X4 is **retired** (2026-09-21): the legacy snapshot push, its endpoint, its class and its triggers are gone, and Head Office no longer holds any prisoner row for a facility. X9 and X10 are addressed by D14 (below): the database is SQLCipher, documents are sealed files, and the key is held by the operating system's keystore where there is one. The packaged Tauri app has still never been built or run here, and the Cloudflare Tunnel has never been run against Cloudflare.

**What to do next, in order:** (1) run the LAN exchange between two physical machines (below); (2) build and run the packaged app once per target OS (see [[PACKAGING]]); (3) decide the locator's field list (see stage 7, Locate); (4) the provider setting and OIC switch before the assistant is connected to anything.

---

## Foundation stage (2026-09-21): LAN exchange and data at rest

The goal of this stage: Facility works offline, Head Office works independently, a facility and Head Office exchange over the same LAN, trust is explicit, exchange is explicit, failures are visible, local data is protected as far as this stage safely allows, and the packaged app is ready to be built. Cloudflare Tunnel is deliberately not part of it: it is another transport for the same exchange.

### Completed (built, and covered by the Rust test suite, 151 tests)

- **D14, data at rest.** The database is SQLCipher (`libsqlite3-sys` with `bundled-sqlcipher-vendored-openssl`). A database from an earlier build is encrypted in place at start: an encrypted copy is written, opened with the key, compared table by table with the original and integrity-checked, and only then swapped in and the plaintext original overwritten and removed; an interrupted swap is finished or undone at the next start. Pre-migration snapshots and databases a restore moved aside are encrypted too. Documents are sealed files (ChaCha20-Poly1305) under `<data folder>/vault/attachments/<id>.enc`, named by id, recorded by a path relative to the vault, with a content hash. Older plaintext documents in `Documents/Pleadli Prisons` are moved into the sealed vault once, each only after its sealed copy is read back and matched. The key is in the OS keystore (Windows Credential Manager, macOS Keychain, Linux Secret Service) and falls back to an owner-only key file where there is none; Settings says which. A database whose key is missing is never re-keyed: it goes to recovery mode. See [[SECURITY]] for what this does and does not defend against.
- **Backup and restore with D14.** A backup carries a portable plain database and plain documents inside its passphrase-encrypted archive, so it opens on any machine. A restore unpacks them as plaintext into a private folder and the same start encrypts the database and seals the documents under the new machine's keys, then destroys the plaintext. Tested: a document is backed up on one machine and reads back, sealed, on a machine with no vault.
- **Legacy snapshot retired.** Migration `0190_exchange` drops the prisoner triggers, the `legacy_snapshot` class and its queue, and deletes the prisoner copies Head Office held. `sync.rs` is gone. Head Office keeps counts (`reported_*`), the roster and the returns it is sent, never prisoner rows.
- **LAN transport.** A Head Office serves the exchange API (`/api/network/v1/**` only, nothing of the domain) over TLS on `0.0.0.0:47924` with its own certificate, on and off from Settings. The Cloudflare tunnel's origin stays the plain loopback listener on `127.0.0.1:47923`. Plain HTTP is accepted only for this machine.
- **Trust.** A facility never trusts an address because it was typed or found. It looks at the address (who answers, and the certificate fingerprint it presents, read from the handshake), shows the fingerprint, and a person confirms it against the one Head Office shows in its own settings. Only then is the fingerprint pinned and anything sent; the request then waits for a Head Office officer to approve. A local-network address without a confirmed pin is refused, and a different certificate later is refused.
- **Discovery.** Suggest-only. Head Office answers a UDP probe on port 47924 with its name and port; the facility lists answers and never trusts one. Typing the address always works.
- **Persisted connection.** The address, the pinned fingerprint, the credential (sealed) and the state live in `peer_sync_config` and survive a restart. A saved connection is tried about eight seconds after start; it is never silently pointed at another endpoint.
- **Exchange state.** Every round with Head Office is recorded (`exchange_rounds`). From them the facility reads one exchange state (`idle`, `pending`, `in_progress`, `completed`, `failed`, `stalled`, `offline`) and one link state (`not_connected`, `awaiting_approval`, `rejected`, `revoked`, `paired`, `connected`, `offline`, `needs_attention`, `stalled`, `disconnected`). A refusal is checked against Head Office to tell revocation from other causes. Reaching Head Office is not counted as delivering to it.
- **Head Office exchange log.** `exchange_events` records, per facility, what arrived, when, over which transport and whether it was taken, repeated or refused: metadata only. A facility also reports its own exchange state, so a link that is up but not delivering shows at Head Office even when it cannot be asked. Settings > Network shows it.
- **Packaged-app preparation** (no package was built): see [[PACKAGING]].

### Implemented but not cross-machine verified

- **Two physical machines on one LAN.** The end-to-end test runs Head Office and a facility as two nodes in one process, connected over TLS through this machine's real network interface address (not loopback), with real certificate pinning. It has not been run between two computers, so anything about real switches, firewalls, Wi-Fi client isolation and UDP broadcast across a real facility network is unproven. **Cross-machine LAN verification is outstanding.**
- **Discovery** is proven only on one machine's interface; broadcast behaviour on managed networks is unknown.
- **The OS keystore** is proven on Linux (Secret Service, gnome-keyring) only. The Windows and macOS keystore paths are compiled in and untested.
- **The packaged app** has not been built or run; a release-profile compile check is the only evidence.

### Deferred (does not block the other applications)

Head Office Locate; coordination, oversight, decisions and directives beyond the exchange foundation; a stalled-exchange item in the estate attention list (the data now exists; the estate view was left as approved); Letters, Mukutano, dedicated Health and Programmes modules, Staff and posts, Stores, Vehicles, Farm, Field modules; the AI assistant; localization completion; migration and import; camera; jurisdiction abstraction; the tiered exchange (S5/S6 event stream and signed packages); the file carrier; a Content-Security-Policy for the webview (needs a packaged run to validate); Cloudflare Tunnel run against Cloudflare.

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
