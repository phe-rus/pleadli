# Pleadli Prisons: Product Re-establishment

**Date**: 2026-09-18
**Phase**: product model, operating model, architecture and application structure. **No code, routes, components, schemas or migrations were changed by this phase.**
**Status**: approved as the implementation contract. Build phase 1 (foundation) is complete and verified; see `07-implementation-gap.md` section 0 for what is built, what is verified, and what is next.

This folder re-establishes what Pleadli Prisons is, how a prison facility and Head Office each operate through it, how information moves between them, and how the same product runs on one machine, on a facility LAN, and across a production network. It was produced after reading every existing Prisons document and inspecting the actual implementation (Rust backend, migrations, HTTP servers, sync, pairing, frontend routes) rather than trusting the documents.

## Reading order

| File | Contents | Answers brief sections |
|---|---|---|
| `README.md` (this file) | Principles, vocabulary, decisions needed, supersession notes | 1, 5, 20 |
| [`01-product-and-operating-models.md`](01-product-and-operating-models.md) | A. Product definition, B. Facility operating model, C. Head Office operating model | 2, 3, 4, 8, 9, 10 |
| [`02-capabilities-domains-workflows.md`](02-capabilities-domains-workflows.md) | D. Capability map, E. Domain map and KEEP/MERGE/SPLIT/MOVE/REMOVE/CREATE verdicts, F. Workflow map | 6, 7 |
| [`03-ownership-information-flow-sync-offline.md`](03-ownership-information-flow-sync-offline.md) | G. Data ownership, H. Information flow, K. Sync, L. Offline and failure states | 5, 15, 16, 27 |
| [`04-deployment-and-networking.md`](04-deployment-and-networking.md) | I. Local and facility LAN, J. Production network, transports, `/api/**` namespace, production-readiness | 11 to 14, 25, 26 |
| [`05-security-accountability-documents-reporting.md`](05-security-accountability-documents-reporting.md) | M. Security and accountability, N. Document model, O. Reporting | 17, 18, 19 |
| [`06-research-backlog.md`](06-research-backlog.md) | P. Evidence ledger and research backlog | 3, 20 |
| [`07-implementation-gap.md`](07-implementation-gap.md) | Q. Intended vs built, plus defects found in the code | 1, 28 |
| [`08-application-structure.md`](08-application-structure.md) | Facility and Head Office information architecture and interaction patterns | 21, 22, 23, 29 |
| [`09-migration-map.md`](09-migration-map.md) | Every existing route, feature, backend module and doc mapped to its new place | 24, 30 |

## Read this first: two findings that change priorities

These came from inspecting the code, not the docs. Details and evidence in [`07-implementation-gap.md`](07-implementation-gap.md).

1. **The "dev-only" local API is live in release builds and unauthenticated.** `transport/dev_server.rs` says it is "compiled out of release builds entirely", but `lib.rs` spawns `dev_server::serve` with no `cfg(debug_assertions)` gate. In a shipped build it serves the whole domain API on `127.0.0.1:47922` with `CorsLayer::new().allow_origin(Any)`. Its facility-management routes (pairing code, verify, revoke, save credentials) do not perform the HQ-session check that the equivalent Tauri commands do. Any local process, or any web page open in a local browser, can read and write prisoner records and drive pairing. This must be closed before any real facility use, independent of everything else here.
2. **The current sync copies more than the ownership model allows.** The peer pushes its entire `prisoners` row, including free-text `notes`, national ID and date of birth, every five minutes, and Head Office stores the rows in its own `prisoners` table. That contradicts "connection does not mean universal visibility". The redesign replaces this with tiered disclosure (locator, attested returns, workflow packages, access on request).

## What this phase reverses in earlier documents (recorded plainly)

| Earlier position | Where | New position | Why |
|---|---|---|---|
| Headcount, daily log, shift handover, incidents, prisoner discipline, duty roster are "REMOVE / never build" | `PRODUCT.md` §3/§9, `domain-workflow-model.md`, `capabilities-facility.md` B3/B6/A11 | Reclassified **NOT YET RESEARCHED (field)** and modelled as **Provisional** domains with minimal, evidence-shaped records | Five desk-research attempts showing "no source" prove the method is wrong, not that the work does not exist. A prison must know who it holds and where (UPS itself reports an "Unlock" figure and a regulation titled "Counting prisoners" exists). Removing it from the model is a product defect. |
| "One installation = one prison = one machine" | `PRODUCT.md`, `0001` spec | One prison = one **Facility Node** with N workstations on the facility LAN. Single machine is the degenerate case. | Real facilities have several officers and computers. |
| Flat nav is "settled" (D6) | `navigation.md`, `scope.md` 23 | Reopened. Navigation is derived from the operating model. | You directed that the sidebar is not the product definition, and the model changed. |
| Sync = full `prisoners` snapshot push, "torrent-like" later | `0001` spec, `sync.rs` | Signed exchange packages: ordered event outbox, attested returns, workflow packages, HQ inbox, locator reconcile. Transport-agnostic. | Ownership model and offline reality (see 03, 04). |
| HQ "has no prisoners of its own" | `0001` spec | **Retained.** HQ holds locator entries and its own institutional records only. | Still correct. |
| Transfer is a one-ended closure at the sender | `transfers.rs` | Two-ended, ownership-moving workflow with in-transit state and confirmation | s.73(5): a prisoner in transit remains in the custody of the prison officer. Only a defined process may change record ownership. |

## Principles (non-negotiable, referenced by number elsewhere)

- **P1 Facility owns facility operations.** Its operational records are authoritative at the facility unless a defined institutional process transfers ownership.
- **P2 Head Office oversees and coordinates.** It never edits a facility's operational record and holds no prisoners of its own.
- **P3 Connection is not visibility.** A paired facility discloses only what a rule discloses (tiers T0 to T4 in 03).
- **P4 Referenceability is not visibility.** Head Office can know that a person exists and where, without seeing the file.
- **P5 A shared person identity is not a shared operational record.** One custody episode is a thread; each facility owns the record of its own stay.
- **P6 Work before record.** The system helps perform the procedure that causes the record. Obligations (things owed, by whom, by when, with what evidence) drive the interface, not tables.
- **P7 Offline is the normal state.** Connectivity extends the system; nothing ordinary depends on it. Connectivity state is always explicit.
- **P8 Transport is a plug-in.** Facilities and Head Office exchange signed packages. Cloudflare Tunnel, VPN, a government network, or a USB stick are interchangeable carriers.
- **P9 Evidence honesty.** Four evidence states, never conflated (below). Unknown is not nonexistent. Provisional modules are labelled as such.
- **P10 Accountability is structural.** Every change is attributable, every legal-instrument edit is reasoned, nothing is deleted, only superseded.
- **P11 One API surface under `/api/**`.** All HTTP APIs are namespaced: `/api/auth/**` (identity), `/api/prisons/**` (facility domain), plus `/api/hq/**`, `/api/network/**`, `/api/system/**`. Recorded from your instruction of 2026-09-18. See 04.
- **P12 Authorization is enforced at the node, never only in the UI.**

## Vocabulary

### Implementation status (used in 07 and 09)

`INTENDED` (documented or implied by this model) then one of: `BUILT` (verified in code), `PARTIAL` (exists but incomplete or disconnected), `PLANNED` (documented, no code), `EXCLUDED` (deliberately not built, with reason), `NEEDS RESEARCH` (cannot be specified without evidence).

### Evidence state (brief section 20; used in 06)

| State | Meaning |
|---|---|
| `SUPPORTED` | Established by a primary or credible source, or by a verified international baseline |
| `NOT YET RESEARCHED` | Not established. Sub-tag `DESK` (a written source likely exists and has not been read) or `FIELD` (only practitioner or site validation can settle it) |
| `RESEARCHED AND EXCLUDED` | Investigated, and a reason found not to model it as proposed |
| `PRODUCT OUT OF SCOPE` | A real thing that Pleadli Prisons deliberately does not do |

### Evidence tags on individual claims

`[P]` primary Ugandan source (Act, Constitution, UPS documents, UHRC). `[S]` secondary source. `[I]` international baseline, verified in this phase against the text of the Nelson Mandela Rules (UNGA A/RES/70/175): Rules 6 to 11, 30, 36 to 46, 58, 68 to 73, 83 to 85. `[H]` hypothesis from structural necessity or from the international baseline, **not** evidence of Ugandan practice, needs field validation. `[U]` unknown.

### Build class for a capability

`CORE` (grounded, build). `PROVISIONAL` (real responsibility, minimal record shape, procedure unvalidated, configurable, not a required workflow until validated). `DEFERRED` (real, later slice). `EXCLUDED`. `OUT OF SCOPE`.

## Decisions needed from you

Recommendations are defaults; nothing proceeds on them without your approval.

| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| D1 | Facility LAN topology | One authoritative **Facility Node** (SQLite plus vault) and thin workstations over `/api/**`. Standalone is a node with one client. | Peer-replicated databases (conflict resolution, rejected), central Postgres (breaks offline simplicity) |
| D2 | One API surface | Collapse the two parallel surfaces (Tauri commands and `dev_server.rs` axum handlers) into one `/api/**` service. UI uses one client with a base URL. | Keep both (drift risk, already visible in the unauthenticated dev routes) |
| D3 | Ownership across transfer | One **custody episode** with per-facility **stays**. Ownership of the live record moves only on confirmed transfer via a dossier package. The sender keeps its stay as an archive. | Treat receipt as a fresh admission (loses continuity) |
| D4 | Disclosure to HQ | Tiered: locator and events, attested returns, workflow packages, access on request. Stop pushing full prisoner rows. | Keep full snapshot |
| D5 | Provisional operations policy | Build minimal Count, Duty log, Incidents, Discipline and confinement, Accommodation, Gate as `PROVISIONAL`, pilot-gated on field validation | Keep excluded until research completes |
| D6 | Navigation | Adopt the work-oriented IA in 08, reopening the "flat nav settled" decision | Keep flat nav |
| D7 | Staff vs accounts | Separate institutional **Staff** (rank, post) from **Accounts** (login, role, devices) | Keep `officers` as both |
| D8 | Backup escrow | Optional encrypted off-site backup to HQ (HQ cannot read it) | Local and removable-media backup only |
| D9 | File-carried exchange | Every package is signable and may travel as a file | Network-only |
| D10 | HQ store scale | SQLite for pilot, revisit at pilot exit (R-22, R-35) | Start on Postgres |
| D11 | Workstation client | Node serves the SPA over HTTPS; workstations run the Tauri shell or a browser | Tauri only |
| D12 | API namespace detail | `/api/auth`, `/api/prisons`, `/api/hq`, `/api/network`, `/api/system`. I read "api/ath" as `/api/auth`. | HQ workspace under `/api/prisons/hq/**` |
| D13 | Release gates | Replace hard blocks (property outstanding, documents pending) with a gate that requires completion **or** an OIC-authorised exception with a recorded reason. s.83 makes the OIC responsible for discharge on entitlement; a hard block can cause unlawful detention. This revisits a decision in spec 0002 | Keep hard blocks |
| D14 | Encryption at rest | SQLCipher for the node database with an encrypted vault | Verified OS full-disk encryption only |

## Supersession

`PRODUCT.md`, `navigation.md`, `domain-workflow-model.md`, `capabilities-facility.md` and `capabilities-head-office.md` each carry a pointer to this folder. Their research findings, statutory citations and evidence labels remain valid and are reused here. Their build-or-never-build verdicts for daily operations, their flat navigation and their single-installation topology are superseded. `responsibility-matrix.md` remains the base for the ownership map in 03, extended with disclosure tiers.
