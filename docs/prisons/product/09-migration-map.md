# 09. Migration map: existing implementation to new structure

Format per item: **current**, **verdict** (`KEEP`, `MERGE`, `SPLIT`, `MOVE`, `REMOVE`, `REBUILD`), **new location**, **why**. Nothing is deleted without a reason, and working infrastructure is preserved. No item here is executed in this phase.

## 1. Routes (`apps/prisons/src/routes/_public`)

| Current | Verdict | New location | Why |
|---|---|---|---|
| `/` Overview (facility and HQ variants in one file) | REBUILD (two separate homes) | Facility: **Today**. HQ: **Estate** | The current page is a stat and chart dashboard. The brief asks "what requires attention and what work needs doing". Alert logic (mandatory bail, hospitalised, native notifications) is reused inside the obligation queue |
| `/search` | KEEP | Global **Search** (top bar, command palette, results view) | Search-first is right; nine entity types already covered. HQ scope becomes locator search |
| `/facilities` (HQ roster, pairing, verify, revoke) | MOVE | HQ **Network** | Correct HQ function; leaves the facility structure entirely |
| `/officers` | SPLIT | Facility area: **Accounts and devices** and **Staff**; HQ **Administration** | Accounts and institutional staff are different things (05 M.1) |
| `/prisoners` | REBUILD | **Population** roster | Search-first register; adds accommodation and counts alongside |
| `/prisoners/$prisonerId` | REBUILD | **Prisoner file** (header "right now", timeline, open items, procedures) | The workspace is tabs per domain; the redesign adds the header, timeline and obligations |
| `/visits` | KEEP | **Care and contact > Visits** (facility-wide log view) | Findability is preserved; becomes one view of a visit workflow |
| `/remand` | MERGE | **Legal** (diary, thresholds, s.118 list) | The s.118 list is a report over the court diary |
| `/requests` | KEEP | **Care and contact > Requests and grievances** | Two channels added (application book, Mukutano) |
| `/reports` | REBUILD | **Returns** (breakdown queries kept as inputs) | See 05 O.6 |
| `/settings` | SPLIT | **Facility** (profile, node, connectivity); HQ **Network** (transports) and **Administration**; appearance to user preferences | Settings is currently officers plus network status; each belongs with its owner |

## 2. Components (`apps/prisons/src/components`)

| Current | Verdict | New location | Why |
|---|---|---|---|
| `add-record-panel.tsx` (framer-motion grid, three steps) | REBUILD | **Start** launcher (procedures, not record types) | Keep the motion pattern and grid to person to action flow; change what the cards are |
| `facility-onboarding-gate.tsx` | KEEP, extend | Facility initialisation | Add node identity and keys, capacity, backup target, first OIC. Pairing via invitation stays |
| `hq-onboarding-gate.tsx`, `pre-auth-layout.tsx`, `splash-screen.tsx` | KEEP | Same | Onboarding and activation are sound |
| `hq-sign-in-gate.tsx` | REBUILD | Unified sign-in on `/api/auth` for all roles | Facility work also needs an authenticated session |
| `dev-role-switch.tsx` | KEEP, verify | Debug builds only | Must be compiled out of release builds |
| `command-menu.tsx` | KEEP | Global Search | Already the right control |
| `sidebar-provider.tsx`, `data/navigationItems.ts` (`facilityOnly`, `hqOnly` flags) | REBUILD | Permission-driven navigation for the two IAs in 08 | Role flags become permission checks |
| `stat-tile.tsx`, charts | MOVE | Returns and Estate, not the working home | Statistics are not the working surface |
| `settings-table.tsx` | KEEP | Configuration panels | Fits the one place settings patterns are right |
| Theme, window controls, loaders, not-found | KEEP | Same | Infrastructure |

## 3. Frontend features (`apps/prisons/src/features`)

| Current | Verdict | New location | Why |
|---|---|---|---|
| `prisoners` | SPLIT | Person and identity, Custody (episode, stays, instruments, sentence), Accommodation | Different owners and lifecycles |
| `releases` | MERGE | **Discharge** procedure (with gates, softened) | One workflow |
| `transfers` | SPLIT | Transfer out, in-transit, arrival; HQ coordination | Two-ended |
| `court-productions` | MERGE | **Legal > Court diary** | Events under a court obligation |
| `visits` | KEEP | **Care and contact** | Sound model; add the s.113 prison-minister category still open from `../ux/navigation.md` |
| `health-events` | KEEP | **Care and contact** | Add notification obligations |
| `property-records` | MERGE | Property ledger inside Reception and Discharge | Property is a ledger, not a domain |
| `programme-participations` | KEEP | **Care and contact** | Participation plus certification is right |
| `requests` | KEEP | **Care and contact** | Add escalation |
| `attachments` | REBUILD | Documents (instruments, generated, registers, dispatches) | Generic attachments do not carry the document model |
| `officers` | SPLIT | Accounts, Staff | 05 M.1 |
| `session` | REBUILD | Unified `/api/auth` sessions | Per-request, device-aware |
| `activation` | KEEP | HQ initialisation | Sound |
| `facilities` | SPLIT | HQ Network registry; facility profile; pairing and connectivity (Exchange) | Three concerns in one folder |
| `network` (Cloudflare config) | MOVE | HQ Network > Transports | It is one transport adapter |
| `reports` | REBUILD | Returns | 05 O.6 |
| `search` | KEEP | Global Search | Add locator scope for HQ |
| hooks `use-mandatory-bail-alerts`, `use-hospitalised-alerts`, `use-pending-facility-alerts` | MERGE | Obligation engine notifications | Alerts become one mechanism |
| hooks `use-report-dirty`, `use-deep-link-record`, `use-disable-devtools` | KEEP | Same | Infrastructure |

## 4. Backend (`apps/prisons/src-tauri/src`)

| Current | Verdict | New location | Why |
|---|---|---|---|
| `domain/prisoners.rs` | SPLIT | identity, custody, placement modules | Ownership |
| `domain/releases.rs` (gates) | MERGE, soften | Discharge; OIC-authorised exception (D13) | Avoid unlawful detention |
| `domain/transfers.rs` | REBUILD | Two-ended transfer with in-transit and dossier | Ownership handover |
| `domain/court_productions.rs`, `visits.rs`, `health_events.rs`, `programmes.rs`, `property_records.rs`, `requests.rs`, `search.rs` | KEEP, extend | Same modules | Sound data foundations; add obligations, authorisation and audit |
| `domain/attachments.rs` | REBUILD | Document store | Content-addressed, relative paths |
| `domain/officers.rs`, `session.rs` | SPLIT, REBUILD | Accounts, staff, sessions | 05 M.1 |
| `domain/activation.rs` | KEEP | HQ initialisation | Sound |
| `domain/facilities.rs` | SPLIT | HQ registry and trust; peer config | Roles differ |
| `domain/sync.rs` | REBUILD | Exchange (outbox, inbox, packages, transports) | 03 K |
| `domain/cloudflare_tunnel.rs` | KEEP, wire | Transport adapter (provisioning wired, token to keystore) | X6, X9 |
| `domain/reports.rs` | KEEP queries | Returns builder inputs | UPS-shaped breakdowns are correct |
| `commands/*` and `transport/dev_server.rs` | REBUILD | **One** node API under `/api/**` | D2, X1 to X3 |
| `transport/hq_server.rs` | KEEP shape | Network listener on `/api/network/v1/**` | Two-listener design |
| `db.rs` | KEEP, extend | Node initialisation, integrity check, backup hooks | |
| `migrations` 0001 to 0020 | KEEP | Forward-only history preserved; new migrations extend | Do not rewrite history |

### Route mapping

Current HTTP routes to target routes are in 04 ("The `/api/**` namespace"). Summary: every unprefixed route (`/prisoners`, `/visits`, `/facilities`, `/peers/register`, `/sync/prisoners`, `/cloudflare/config`, `/login`, `/hq/*`, `/activation/*`) moves under `/api/auth`, `/api/prisons`, `/api/hq`, `/api/network/v1` or `/api/system`.

## 5. Documents

| Document | Verdict | Note |
|---|---|---|
| `PRODUCT.md` | Retain research and citations; superseded on daily-operations verdicts, single-installation topology, nav | Pointer added |
| `../research/findings.md` | Retain in full; extended by `../research/backlog.md` | Add international-baseline section on next research edit |
| `../research/capabilities-facility.md`, `../research/capabilities-head-office.md` | Superseded by 02 (capability map); evidence labels retained | Pointer added |
| `domain-workflow-model.md` | Superseded by 02 (E.3, F) | Pointer added |
| `../ux/navigation.md` | Superseded by 08 | Pointer added |
| `responsibility-matrix.md` | Retained as base; extended by 03 G | Pointer added |
| `docs/scope/prisons/scope.md` | To be reconciled after approval (`/scope`); feature 22 and 23 remain valid | Not edited in this phase |
| `docs/specs/prisons/0001-*` | Sync design superseded by 03 K and 04 J; pairing, activation and identity stay | Not edited; `/architect` to revise after approval |
| `docs/specs/prisons/0002-*` | Release gates revisited (D13); statistics retained | Not edited |
