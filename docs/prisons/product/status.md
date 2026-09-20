# Product status — the single source of truth

**Method.** Every row below was checked against `apps/prisons` on 2026-09-20, not against notes. Where a note and the code disagree, the code is stated and the disagreement recorded here.

**Role.** This file is the one authority for *what is actually built*. `PLAN.md` stages sequence work; `scope.md` tracks pipeline rows; neither may contradict a state given here. A capability changes state only by the rule in §4.

**Layers.** `node` (Rust `domain/` + migrations + `/api/**`), `ui` (routes and features), `docs` (the vault). A row is one state for the capability as a whole; the layers note says which layer the evidence is in.

## 1. The states

| State | Meaning |
|---|---|
| `research` | Being investigated; no commitment to build |
| `planned` | Committed and sequenced; no design yet |
| `designed` | A spec or design note exists in the vault; no code |
| `in-progress` | Being implemented; partial, incomplete or disconnected |
| `implemented` | Built and present; not yet proven by tests or a run |
| `verified` | Proven by tests and end-to-end runs |
| `field-tested` | Proven at a real facility or pilot |
| `deprecated` | Deliberately retired; the reason is recorded |

This replaces the earlier vocabulary (`INTENDED/BUILT/PARTIAL/NOT BUILT/NEEDS RESEARCH/EXCLUDED`) used in the 2026-09-18 ledger. Mapping for history: `BUILT`→`verified` (code) or `implemented`; `PARTIAL`→`in-progress`; `NOT BUILT`→`planned` when sequenced or `designed` when specified; `NEEDS RESEARCH`→`research`; `EXCLUDED`→`research` or `deprecated` with its reason. Build classes (`CORE`, `PROVISIONAL`, `DEFERRED`, `OUT OF SCOPE`) from `principles.md` are orthogonal and stay.

## 2. What the 2026-09-18 ledger missed

The 2026-09-18 ledger (the previous `07`) recorded phase 2, the **custody spine, as not started**. It is now built in the node layer and was absent from the ledger because the notes lagged the code. Reconciliation, verified today:

| Earlier map (02) | Now in code |
|---|---|
| F2.1 Reception "one create form only" | `custody.rs` `receive()` — a procedure with decision, refusal grounds, search, injuries, complaints, health screen, rules-information, contacts; `receptions` table (0023) |
| F2.2 Instruments "no entity, no versions" | `instruments.rs` `record_instrument` / `expect_instrument` / `supersede_instrument` / `sync_pending_flag`; statuses verified / pending / rectification_pending / superseded (0023) |
| F2.3 Sentence "no sentence length, start, clocks" | `sentences.rs` `set_sentence`, `compute_clocks`, `review_marks_passed`; term y/m/d, life, remission-forfeited, superseded (0023) |
| F2.4 Court diary "no obligation ahead, no outcomes" | `court_productions.rs` states scheduled/produced/not_produced/cancelled, `record_outcome`, `list_remand`, next_date (0023) |
| F2.5 Discharge "no authoriser, no exception" | `releases.rs` `assess()` gate assessment and `create_release()` with basis, OIC `authorised_by`, `exception_gates`, exception reason (D13 accepted) (0023) |
| F2.6 Transfers "sender-side closure only" | `transfers.rs` two-ended: prepare, checklist, dispatch, dossier export/import, `confirm_arrival`, receipt export/import (0023 rebuilds `transfers`) |
| F2.8 review | `sentences.rs` review marks computed for the s.88/parole cycle (node), not yet a bundle workflow |
| F3.1 next of kin | `prisoner_contacts` table, `insert_contact` (0023) |
| S4 obligation engine "none" | `obligations.rs` `derive()`/`resolve()`, typed keys, `obligation_resolutions` (0023); 60/180 mandatory-bail derives from `mandatory_bail` procedures |
| F7.1 monthly return data | `reports.rs` `build()`/`generate()` with report `Kind`, `GeneratedReport`; `returns.rs` `checks()`, `attest()`, `submit()`, `send_queued()`, and `receive()` on the Head Office side |
| S2 audit "none" | `audit.rs` same-transaction `before`/`after` audit, `verify_chain()` tamper check |
| S10 backup "no backup anywhere" | `backup.rs` create/verify/restore/scheduler, startup integrity, snapshot-before-migration |

## 3. Capability ledger (current)

Facility capabilities, keyed to the F map in `02-capabilities-domains-workflows.md`:

| ID | Capability | State | Layers note |
|---|---|---|---|
| F1.1 | Population and occupancy | `implemented` | node: overview derives in-custody/remand/civil; `facility_profile.approved_capacity`; ui: Overview. "Unlock" label and count reconcile are `planned` |
| F1.2 | Obligation queue | `implemented` | node: `obligations.rs`; ui: Today due queue |
| F1.3 | Watch log and shift handover | `research` | PROVISIONAL; needs field (R-03) |
| F1.4 | Exceptions | `in-progress` | mandatory-bail, documents-pending, hospitalised built; count and capacity exceptions `planned` |
| F2.1 | Reception | `implemented` | node: procedure above; ui: guided ProcedureShell is stage 2–3 work |
| F2.2 | Legal authority chain | `implemented` | node: instruments with verification; ui documents pending surface |
| F2.3 | Sentence and remand | `implemented` | node: clocks, remission, review marks; statutory edge cases (life mitigation, pending Minister's order) `research` (R-05) |
| F2.4 | Court diary | `implemented` | node: schedule, outcome applied, s.118 `list_remand`; s.118 print is `planned` |
| F2.5 | Discharge | `implemented` | node: gates + OIC exception (D13), before-noon flag; discharge document printing `planned` |
| F2.6 | Transfers, two-ended | `implemented` | node: order–dispatch–in-transit–dossier–confirm–receipt; HQ coordination ownership (W5) `designed` |
| F2.7 | Correction and re-arrest | `designed` | instrument supersede built; general amendment-preserving workflow (W18) designed, not built |
| F2.8 | Review, parole and licence | `in-progress` | node: review marks; licence/parole outcomes (W14/W15) `designed` |
| F3.1 | Prisoner file | `implemented` | node: `prisoner_file()`, contacts, photos; ui file workspace exists |
| F3.2 | Accommodation and separation | `research` | PROVISIONAL; free-text `current_location` now, hierarchy not evidenced |
| F3.3 | Property and effects | `implemented` | node: ledger, return marker, release gate, transfer check; mid-stay entries and witness `research` |
| F3.4 | Welfare conditions | `research` | flags (infants, women) not modelled |
| F4.1 | Health movements | `implemented` | node: referral/return pairs, hospitalised list; s.74 magistrate confirmation `planned` |
| F4.2 | Visits and legal access | `implemented` | node: rules, approved visitors, full lifecycle; s.113 prison-minister category `planned` |
| F4.3 | Letters | `planned` | reception/transfer letter entitlements documented |
| F4.4 | Requests and grievances | `implemented` | node: single channel, resolve; Mukutano committee channel `planned` |
| F4.5 | Rehabilitation and work | `implemented` | participation + certification |
| F5.1 | Incidents | `research` | PROVISIONAL, evidence-seeded (W11) |
| F5.2 | Discipline and confinement | `research` | PROVISIONAL (W10) |
| F5.3 | Gate register | `research` | PROVISIONAL |
| F5.4 | Prohibited articles | `research` | list is HQ-owned directive (W15); not built |
| F6.1 | Instruments (received docs) | `implemented` | shipped inside F2.2 |
| F6.2 | Generated documents | `in-progress` | reports documents (now with a UI: numbered, printable, listed), transfer dossier + receipt built; admission slip, release order `planned`. The s.118 list is the remand list report |
| F6.3 | Registers as views | `designed` | this vault (`registers.md`) now defines them; no code |
| F6.4 | Dispatch and receipt | `in-progress` | transfer dossier receipt built; general dispatch tracking `designed` |
| F6.5 | Prisoner access to own record | `research` | r9 [I]; Uganda position [U] |
| F7.1 | Monthly return | `implemented` | generate, check, OIC attests (final), submit to Head Office as T2 counts, Head Office acknowledges and lists what it received (2026-09-20). Tests cover the checks, attestation, and a real facility to Head Office HTTP round trip. Not yet run in the packaged app. Still open: signed exchange package (K.2), staff by rank, escapes, deaths and other UPS fields the records do not hold yet, HQ discrepancy check against the event stream |
| F7.2 | VJ book extract and observations | `research` | physical-book authority is [U] (R-24) |
| F7.3 | Incident notification to HQ | `research` | depends on F5.1 |
| F7.4 | s.88 review bundle | `planned` | duty documented; no shape |
| F8.1 | Facility profile and capacity | `implemented` | `facility_profile`, capacity form |
| F8.2 | Staff and posts | `planned` | D7: staff vs accounts separation designed, not built |
| F8.3 | Accounts, roles, devices | `implemented` | Argon2, sessions, roles, device enrolment |
| F8.4 | Node operations | `implemented` | backup/restore/scheduler/health |
| F8.5 | Connectivity centre | `in-progress` | status + manual sync + Cloudflare config; transports and queue `designed` |
| F8.6 | Directives inbox | `planned` | no HQ→facility channel yet |
| F8.7 | Stores, vehicles, farm | `planned` | DEFERRED |

Head Office (keyed to `D.2` in 02):

| ID | Capability | State | Layers note |
|---|---|---|---|
| HA | Network administration | `in-progress` | onboard/verify/revoke/roster built; suspend, decommission, versions, keys `designed` |
| HB | Estate awareness | `implemented` | `domain/estate.rs`, `GET /api/hq/estate`, the Home page (2026-09-20): contact health, occupancy against reported capacity, last-closed-month return state, attention list. Facilities report counts on the `status` sync class. Tests cover the view against a fixed clock and a real facility to Head Office round trip. Not run in the packaged app. By region only: no unit-level occupancy, no region scoping for commanders (R-23), no map, no oversight items or transfers in the attention list |
| HC | Coordination (transfers, decongestion) | `planned` | W5 HQ side designed |
| HD | Oversight | `planned` | W14 designed |
| HE | Decisions register | `planned` | W15 designed |
| HF | Directives | `planned` | W15 designed |
| HG | Consolidation | `in-progress` | HQ report kinds built; remand-overstay analysis `planned` |
| HH | Locate | `blocked` | Head Office search used the synced prisoner rows, which no longer carry names after the X4 narrowing (2026-09-20), so it finds nobody by name. Needs the T1 locator (03 tier T1: field list awaits Prison Service and legal confirmation) and the event stream. Access-request model `designed` |
| HI | HQ administration | `implemented` | activation code, HQ sign-in, roles, audit |
| HJ | Personnel inputs | `planned` | DEFERRED |

Shared infrastructure (`D.3`):

| ID | Item | State | Layers note |
|---|---|---|---|
| S1 | Identity and access | `implemented` | enforced at the node |
| S2 | Audit | `implemented` | hash chain, before/after, verify; sensitive-read log `planned` |
| S3 | Vault and documents | `in-progress` | attachments vault; at-rest encryption `designed` (D14) |
| S4 | Obligation engine | `implemented` | typed keys, due rules, resolutions |
| S5 | Event log and outbox | `designed` | ownership model (03) specifies; legacy snapshot retained |
| S6 | Exchange and transports | `in-progress` | LAN listener/TLS, pairing, dev-loopback debug; Cloudflare provisioning route, Settings button and a supervised bundled `cloudflared` connector `implemented` 2026-09-20 (never run against Cloudflare); file carrier `designed` |
| S7 | Print and export | `in-progress` | browser print of reports, registers and named documents (landscape for registers); the population-profile CSV export moved with the statistics to Today/Overview. PDF/letterhead `planned` |
| S8 | Search | `implemented` | node: nine entity types; HQ locate blocked (see HH) |
| S9 | Config and templates | `in-progress` | visit rules, facility profile, numbering; directives `planned` |
| S10 | Backup, restore, update | `implemented` | round-trip, tamper-refusal, restore-at-startup, retention verified by tests |

## 4. How a capability moves state

1. A capability is `research` until a decision to build is recorded (in `principles.md` decisions or `scope.md`).
2. `planned` after the decision; `designed` when a spec/design note in the vault covers it (this vault's `registers.md`, `custody-spine.md`, etc.).
3. `in-progress` while node or UI is partial or disconnected.
4. `implemented` when the node and UI both ship it; `verified` when a test or end-to-end run proves it.
5. `field-tested` only after a real-facility pilot (see `PLAN.md` stage 9). `deprecated` only with a recorded reason.
6. Anything the notes and code disagree on is resolved here, on the code side, in the same change (vault rule in `README.md`).

## 5. Carried defects and blockers

| # | Finding | State |
|---|---|---|
| X1, X2 | Unauthenticated dev API in release builds; duplicate API surface | **Fixed** — single authenticated `/api/**`; no per-domain commands |
| X3 | Two frontend clients | **Fixed** — one `api.ts` client |
| X4 | Snapshot sync over-discloses full `prisoners` rows (notes, national ID, DOB) | **Narrowed 2026-09-20**, legacy path still live: `SnapshotRow` carries only what HQ's counts read; HQ ignores anything else a sender includes and migration 0140 scrubs rows already held. Retire fully with tiered exchange (S5/S6) |
| X5 | HQ listener starts only at launch | **Fixed** |
| X8 | Legacy `register_facility_self` | **Fixed** |
| X9 | `sync_token`, `cloudflare_config.api_token`, `remote_device_token`, tunnel `run_token` in plaintext | **Fixed at rest 2026-09-20**: `domain/secrets.rs`, sealed under `secrets.key` in the data folder. A DB copy alone is safe; the whole data folder is not (D14). A database restored from another machine cannot open them and must be paired again |
| X10 | Database and vault plaintext; absolute `stored_path` in vault | **Open** — D14 designed |
| X14 | Hard release gates | **Fixed** — OIC-authorized exception (D13) in `releases.rs` |
| X15 | Contradictory docs | Addressed by this restructure |
| — | Packaged Tauri app never run in this environment | **Open** — stage 2 verify |
| — | Cloudflare Tunnel never provisioned (`provision()` has no caller) | **Wired 2026-09-20**: `POST /api/hq/network/cloudflare/provision`, `domain/tunnel_connector.rs`. Not run against Cloudflare; X9 now also covers the run token |

See `SECURITY.md` for the two blockers that gate any real facility use.