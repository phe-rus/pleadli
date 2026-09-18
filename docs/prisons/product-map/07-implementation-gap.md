# 07. Current implementation gap

Method: every claim below was checked against the source in `apps/prisons` on 2026-09-18 (working tree, including uncommitted changes), not against the documents. Where a document and the code disagree, the code is stated and the disagreement is recorded.

The pipeline requested in the brief, per capability:

```
INTENDED  ->  BUILT  ->  PARTIAL  ->  NOT BUILT  ->  REQUIRES RESEARCH
```

Status vocabulary: `BUILT` verified working shape in code; `PARTIAL` exists but incomplete, disconnected or misdirected; `NOT BUILT`; `NEEDS RESEARCH` cannot be specified yet; `EXCLUDED` deliberately not built.

---

## 0. Build status (updated as implementation proceeds)

**2026-09-19, build phase 1 (foundation) complete and verified.** Phase 2 (facility operational core) has not started.

| Phase | Slice | State | Verified by |
|---|---|---|---|
| 1.1 | Security boundary: one authenticated `/api/**` node API, sign-in and server-side sessions, per-route permissions, role templates, attributed writes with same-transaction hash-chained audit, debug-only loopback, network listener on `/api/network/v1/**` | **BUILT** | Rust tests including a walker that hits every registered route anonymously and without permission, an allow-list of routes open by design, audit-rollback and chain-tamper tests; 14-step end-to-end run of the real frontend `data.ts` layer against the real node |
| 1.2 | Backup, verification, restore, startup integrity check, snapshot before migration, recovery mode | **BUILT** | Round trip, tamper refusal, restore-at-startup, retention, corrupt-database and migration-snapshot tests; end-to-end restore across a restart and recovery from a corrupted file |
| 1.3 | Facility Node LAN listener (TLS, pinned certificate), device enrolment, workstation client mode, explicit connection state, honest sync status | **BUILT** (Head Office side of transport abstraction and Cloudflare lifecycle are phase 6) | TLS pinning, single-use enrolment, device-bound sessions, workstation forward and "unreachable" tests over a real socket |

**Defects from section 1 below, current state:**

| # | State |
|---|---|
| X1, X2 | **Fixed.** `dev_server.rs` is deleted. There is no per-domain Tauri command. The desktop shell reaches the node in process through one `api_request` command; the only loopback listener is compiled into debug builds and requires sign-in. |
| X3 | **Fixed.** One API surface, one frontend client (`src/lib/api.ts`). |
| X5 | **Fixed.** The network listener supervisor starts the moment an installation becomes Head Office. |
| X8 | **Fixed.** `register_facility_self` and its routes are gone. |
| X11 | **Mostly fixed.** Every write is attributed and audited with before and after state. Attribution lives in the audit trail, not as columns on each record. |
| X12 | **Fixed.** Authorisation is enforced by the node on every request. |
| X13 | **Fixed.** Encrypted backups, verification, restore, recovery mode. |
| X14 | Open, phase 2 (discharge with the OIC-authorised exception, D13). |
| X4, X6, X7 | Open, phase 6 (tiered exchange, Cloudflare lifecycle, real verification delivery). The full-row snapshot now runs at `/api/network/v1/legacy/snapshot`, is marked legacy in code, and still over-discloses. |
| X9 | Partly open. Device and enrolment secrets are stored hashed; `sync_token`, `cloudflare_config.api_token` and the workstation's `remote_device_token` are still plaintext columns. |
| X10 | Open, phase 3 (vault and at-rest encryption, D14). |
| X15 | Addressed by the supersession pointers. |

**Decisions taken while building** (recommendations from README accepted by the build brief, plus these): facility workstations require sign-in; accounts and staff remain one table until phase 3; backup encryption uses a passphrase-derived key; browser workstation clients and the node-served SPA (D11) are deferred until the Tauri workstation is proven; pairing with Head Office is optional at first launch and available later from Settings, because a facility must be usable with no Head Office.

**Preserved and migrated:** migrations 0001 to 0020 untouched; 0021 rebuilds `officers` (legacy `admin` becomes `oic` plus `is_admin`, verified against a real prior-schema database), replaces the singleton `hq_session`, and adds sessions, devices, audit and node configuration; 0022 adds the backup key. All domain SQL and structs, Argon2 accounts, activation, onboarding, pairing, search and the UPS-shaped report queries are unchanged in behaviour.

**Not yet exercised:** the Tauri desktop window itself. Everything is verified against the same router and the same frontend data layer through the headless node and tests, but the packaged app has not been run in this environment. `cargo test` runs in the debug profile (the activation tests use a debug-only signing key); the release profile is verified to compile.

## 1. Defects and contradictions found in the code

These are separate from feature gaps. Ordered by severity.

| # | Finding | Evidence | Consequence | Priority |
|---|---|---|---|---|
| X1 | **The "dev-only" API runs in release builds, unauthenticated.** `dev_server.rs` header says "compiled out of release builds entirely". `lib.rs:50` spawns `dev_server::serve` with no `cfg(debug_assertions)`. It binds `127.0.0.1:47922` with `CorsLayer::new().allow_origin(Any)` | `src-tauri/src/lib.rs:50`; `transport/dev_server.rs` `serve()`; only `set_dev_role` and `mint-dev-code` are cfg-gated | Any local process, or any web page open in a browser on that machine, can read and write prisoner records, list and create officers, and call pairing routes | **P0, fix before any real use** |
| X2 | **Facility-management routes on that server skip the HQ session check** that the equivalent Tauri commands enforce | `generate_pairing_code_handler`, `verify_facility_handler`, `revoke_facility_handler`, `resend_verification_code_handler`, `save_peer_credentials_handler` in `dev_server.rs`, versus `require_hq_session` in `commands/facilities.rs` | An unauthenticated caller can mint pairing codes, verify or revoke facilities, and overwrite a peer's credentials | **P0** (same fix as X1) |
| X3 | Two parallel API surfaces (70 frontend call sites branch `isTauri() ? invoke : fetch`; every command is duplicated as an axum handler) | `features/*/data.ts`; `dev_server.rs` (649 lines) | Drift is already visible (X2). Any authorisation or audit change must be made twice | P1, addressed by D2 |
| X4 | Sync over-discloses: whole `prisoners` row (including `notes`, `national_id`, `date_of_birth`) is pushed every 5 minutes and Head Office stores it in its own `prisoners` table | `domain/sync.rs` `push_snapshot`, `ingest_snapshot` | Contradicts P3 and P4; HQ statistics derive from copies of rows | P1, addressed by tiers |
| X5 | Head Office's ingest server starts only at launch if `is_head_office` is already true | `hq_server.rs` `serve()` | An install activated as Head Office during onboarding will not listen until restart | P2 |
| X6 | The Cloudflare Tunnel is never provisioned or run by Prisons. `cloudflare_tunnel::provision` has no caller; only config get and save are wired | `domain/cloudflare_tunnel.rs:277`; `commands/cloudflare.rs` | Pairing codes are built as `https://{station}.{domain}` for a tunnel that nothing creates. The production path has only been exercised against `127.0.0.1:47923` | P1 |
| X7 | The verification "email" does not exist: the code is stored in plaintext and shown in the HQ UI | `facilities.rs`, migration 0018 | The human-verification safeguard reduces to a click by the Head Office officer | P1 |
| X8 | Legacy `register_facility_self` still registered as a command and route | `lib.rs:149`, `dev_server.rs` `/facilities/register` | A second, unaudited path to a `facilities` row | P2 |
| X9 | Secrets at rest in plaintext | `peer_sync_config.sync_token`; `cloudflare_config.api_token` | Disk theft or local read exposes credentials | P1 |
| X10 | Database and vault are plaintext; vault under `~/Documents/Pleadli Prisons` with absolute `stored_path` values | `lib.rs` setup; migration 0004; `domain/attachments.rs` | A backup or restore on another machine breaks links; documents visible to any user of the machine | P1 |
| X11 | No audit or attribution: no `created_by`, `updated_by`, or change history anywhere. `BadgeAttributionInput` exists but no domain uses it | grep of migrations and `src`; `features/officers/badge-attribution-input.tsx` has no consumer outside `features/officers` | Cannot answer "who did this" for any facility record | P0 |
| X12 | Facility authorisation is UI-only. Only HQ management commands and officer administration check a session; every domain command trusts the caller | `commands/*.rs` | Any client of the API or Tauri IPC can act as anyone | P0 (tied to X1, X11) |
| X13 | No backup, restore, export or recovery of any kind | grep for backup, restore, export in `src-tauri` returns none | A disk failure loses the facility | P0 for deployment |
| X14 | Release gates are hard blocks with no exception (spec 0002 decision) | `domain/releases.rs` `assert_releaseable` | A court-ordered discharge can be blocked by an unreturned property line, risking unlawful detention. Recommend an OIC-authorised exception (D13) | P1 |
| X15 | `PRODUCT.md` still says "no sync engine" and carries "never build" verdicts while spec `0001` reverses part of that | docs | Contradictory guidance for future sessions | Addressed by the supersession pointers added in this phase |

---

## 2. Capability ledger

### 2.1 Facility

| ID | Capability | Documented intention | Verified in code | Status |
|---|---|---|---|---|
| F1.1 | Population and occupancy | Overview stats; "Unlock" vocabulary decision (B1) | `FacilityOverview` derives in-custody, remand, admissions charts from prisoner rows. No approved capacity, no count, no "Unlock" label | PARTIAL |
| F1.2 | Obligation queue | Not documented (Overview "attention cards" only) | Mandatory-bail and hospitalised banners; native alerts (`use-mandatory-bail-alerts`, `use-hospitalised-alerts`). No general obligation model | PARTIAL |
| F1.3 | Watch log and handover | UNKNOWN, do not build | Nothing | NOT BUILT, NEEDS RESEARCH |
| F1.4 | Exceptions and integrity | Not documented | Documents-pending state only | PARTIAL |
| F2.1 | Reception | "Admission" workflow proposed | One create form (`prisoner-form.tsx`, `create_prisoner`). Instrument type as a field; documents-pending flag. No verification decision, search, injuries, next of kin, disclosure, health screen, placement, clocks | PARTIAL |
| F2.2 | Legal authority chain | Instrument as a field; documents in Vault | `admission_instrument_type`, `admission_authority`, attachments generic. No instrument entity, versions, verification or authentication record | PARTIAL |
| F2.3 | Sentence and remand administration | Mandatory-bail flag; s.118 needs derived last appearance | `high_court_only_offence` boolean drives bail-eligibility view. **No sentence length, start date, remission, entitlement date, parole or review dates** | PARTIAL (remand), NOT BUILT (sentence) |
| F2.4 | Court diary | Court Production and Remand; s.118 list; physical or virtual | `court_productions` (date, purpose, method), `list_remand` (s.118 list). No obligation created ahead of time, no outcomes, no next date, no list printout | PARTIAL |
| F2.5 | Discharge | Release with property and documents gates | `create_release` with gates and release types; status update. No authorisation capture, before-noon rule, documents, entitlement | PARTIAL |
| F2.6 | Transfers, two-ended | Two-ended flagged as follow-up | Sender-side closure (`transferred_out`) and same-record re-entry (`in`). Free-text `other_prison_name`. No order, dispatch or in-transit, dossier, receiver, confirmation | PARTIAL |
| F2.7 | Correction and re-arrest | Not documented | Edit form only; no reason, no preservation | NOT BUILT |
| F2.8 | Review, parole, licence | s.88 bundle documented as HQ-routed duty | Nothing | NOT BUILT |
| F3.1 | Prisoner file | Person = Prisoner record; profile fields added | Identity fields, DOB, sex, education, nationality, offence (migration 0019). No next of kin, family, children, emergency contact, injuries. Prisoner workspace with tabs | PARTIAL |
| F3.2 | Accommodation | Free-text location; hierarchy excluded | `current_location` free text. No units, capacity, placement history, separation checks | PARTIAL |
| F3.3 | Property ledger | Admission record plus returned marker; release gate | `property_records`, return marker, release gate. No witness, mid-stay entries, transfer statement | PARTIAL |
| F3.4 | Welfare conditions | Not modelled | Nothing (no infants, women-prisoner flags) | NOT BUILT |
| F4.1 | Health movements | Referral and return pairs | `health_events`, `list_hospitalised`. No notification records, no s.74 magistrate confirmation obligation | BUILT (movements), PARTIAL |
| F4.2 | Visits and legal access | Authorisation plus attendance, six categories | `visits` domain and `/visits` route. No prison-minister category, no scheduling | BUILT |
| F4.3 | Letters | Named entitlements | Not modelled | NOT BUILT |
| F4.4 | Requests and grievances | Plain complaint log | `requests`, resolve, anonymous-capable; `/requests` route. One channel; no escalation | BUILT (single channel) |
| F4.5 | Rehabilitation and work | Participation with certification | `programme_participations`, certify | BUILT |
| F5.1 | Incidents | Excluded, escape "decision" pending | Nothing; the reports source notes there is no escape or death domain | NOT BUILT, NEEDS RESEARCH |
| F5.2 | Discipline and confinement | s.85 hook only | Nothing | NOT BUILT, NEEDS RESEARCH |
| F5.3 | Gate | Not documented | Nothing | NOT BUILT, NEEDS RESEARCH |
| F5.4 | Prohibited articles | Directive list is HQ-owned | Nothing | NOT BUILT |
| F6.1 | Instruments | Generic Vault | `attachments` add, list, delete, data URL (entity type and id) | PARTIAL |
| F6.2 | Generated documents | Print planned | Browser print of Reports only; no admission slip, release order or s.118 printout | NOT BUILT |
| F6.3 | Registers | Names documented | Nothing | NOT BUILT |
| F6.4 | Dispatch and receipt | Not documented | Nothing | NOT BUILT |
| F6.5 | Prisoner record access | Not documented | Nothing | NOT BUILT, NEEDS RESEARCH |
| F7.1 | Monthly return | UPS-shaped export planned | `Reports` route: population breakdowns, trends, CSV of population profile, print. No return, validation or attestation | PARTIAL |
| F7.2 | VJ Book extract and observations | HQ receipt deferred | Nothing | NOT BUILT |
| F7.3 | Incident notification | Not documented | Nothing | NOT BUILT |
| F7.4 | s.88 bundle | Documented duty | Nothing | NOT BUILT |
| F8.1 | Facility profile and capacity | Facility identity at pairing | Registration fields (name, number, location, region, head officer). No capacity, units, config, profile screen | PARTIAL |
| F8.2 | Staff and posts | Establishment as read-only context | `officers` (badge, name, role officer or admin). No rank, post, establishment | PARTIAL (account only) |
| F8.3 | Accounts, roles, devices | Officer identity and sign-in | Argon2 accounts, badge lookup, HQ session (singleton row), last-admin guard, bootstrap. Two roles. No devices, per-request sessions, permissions | PARTIAL |
| F8.4 | Node operations | Not documented | None | NOT BUILT |
| F8.5 | Connectivity centre | Settings Network and Sync | Read-only `peer_sync_config` status and manual `sync_now`. No states, queue, transports | PARTIAL |
| F8.6 | Directives inbox | Not documented | Nothing; no HQ-to-facility channel exists | NOT BUILT |
| F8.7 | Stores and resources | Not documented | Nothing | NOT BUILT, NEEDS RESEARCH |
| S | Search | Cross-domain | `domain/search.rs` covers nine entity types; command menu; `/search` | BUILT (facility) |
| S | Audit | Scope 19 planned | None | NOT BUILT |
| S | Obligation engine | This phase | None | NOT BUILT |
| S | Event log and outbox | This phase | None (snapshot push) | NOT BUILT |
| S | Backup, restore, update | This phase | None (updater artifacts enabled in `tauri.conf.json`) | NOT BUILT |

### 2.2 Head Office

| ID | Capability | Documented intention | Verified in code | Status |
|---|---|---|---|---|
| HA | Network administration | Pairing code, verification, revoke, roster | `facilities` table; `generate_pairing_code` (`<host>#<secret>`); `/peers/register`; `verify_facility` with 8-digit code; resend; revoke; roster route. See X5 to X8. No suspend, decommission, versions, keys, transports | PARTIAL |
| HB | Estate awareness | Aggregate stats across facilities | HQ overview links to the roster; by-facility counts from synced rows. No contact health or congestion analysis | PARTIAL |
| HC | Coordination | H4 transfer coordination | Nothing | NOT BUILT |
| HD | Oversight | H6, H7 | Nothing | NOT BUILT |
| HE | Decisions register | Not documented | Nothing | NOT BUILT |
| HF | Directives | H3 rule layer | Nothing | NOT BUILT |
| HG | Consolidation | H2 aggregated statistics | Counts from synced full rows | PARTIAL |
| HH | Locate | H9 cross-network search | Search over synced `prisoners` rows where `facility_id` is set | PARTIAL |
| HI | HQ administration | Officer identity, activation | Offline-verifiable activation code (Ed25519; `domain/activation.rs`), HQ sign-in gate, Settings gate, dev role switcher | BUILT |
| HJ | Personnel inputs | H5 | Nothing | EXCLUDED for now |

### 2.3 Infrastructure and transport

| Item | Intention | Verified in code | Status |
|---|---|---|---|
| Local SQLite, offline-first | Fully local | sqlx SQLite in the app data directory; migrations 0001 to 0020 run at startup; no network for ordinary work | BUILT (subject to X1, X10) |
| Local development server | Dev only | Runs in release builds (X1) | PARTIAL, defective |
| Facility LAN | Not documented | No listener for other machines; nothing beyond loopback | NOT BUILT |
| HQ network server | Two routes behind a tunnel | `hq_server.rs`: `/peers/register`, `/sync/prisoners` on `127.0.0.1:47923`, 10 requests per minute per IP, 50 MB limit, uniform 401 | BUILT (locally exercised) |
| Cloudflare Tunnel | HQ tunnel, no facility inbound port | Config stored; provisioning function never called (X6) | PARTIAL |
| Other transports | Not documented | None | NOT BUILT |
| Sync | Full snapshot, then "torrent-like" | Full `prisoners` snapshot, 5-minute loop, manual trigger, status tracking | PARTIAL (core record only, X4) |
| Pairing | Code plus email verification | Pairing code built; peer registers by browser `fetch` to `/peers/register`; email absent (X7) | PARTIAL |
| Activation | Offline signed code | Built; single-use is not enforced (depends on `www`); `www` generation not built | BUILT (Prisons side) |
| Onboarding | Role choice, facility or HQ | Welcome, role choice, facility pairing flow, HQ activation gate | BUILT |

---

## 3. What is genuinely good and should be preserved

Tauri v2 and offline-first SQLite; the sqlx domain layer separated from command and transport code (the seam a shared node library needs); Argon2 officer accounts and last-admin guard; offline-verifiable HQ activation with a monotonic clock guard; the uniform-failure and hashed-credential stance on the network surface; per-IP rate limiting; the pairing-code idea that carries the hostname so nothing is typed; the 19-region constraint; the built domains as data foundations (visits, requests, programmes, property, health movements, court productions, search); the release gates as logic (softened, D13); the UPS-shaped breakdown queries; the framer-motion onboarding and add-record panel patterns as UI assets; the design system and forms and tables packages; the research corpus and evidence labels.

## 4. Recommended sequencing (for approval, nothing started)

1. **Safety and foundations.** Close X1 and X2 by removing the unauthenticated surface and introducing the single authenticated `/api/**` service; real sign-in with server-side permissions; audit trail with attribution; backup and restore; encrypted secrets. These precede any new feature and any real facility use.
2. **The custody spine.** Custody episode and stays; instruments; sentence and remand administration; obligation engine; reception and discharge as guided procedures; court diary. Field validation R-05, R-06 in parallel.
3. **Facility Node and LAN.** Node mode, device enrolment, workstation client, downtime and back-entry.
4. **Exchange.** Event outbox, tiered payloads, inbox, signatures, file carrier; real Cloudflare provisioning; retire the snapshot sync and the full-row HQ copy.
5. **Head Office institutional workspaces.** Estate, coordination and two-ended transfers, oversight, decisions, directives, consolidation.
6. **Returns, documents and registers.**
7. **Provisional modules** (count, duty log, incidents, discipline, accommodation, gate) as pilot deployments, with the field validation kit running against a real facility.

Each step keeps the app usable; none requires a rewrite of working infrastructure.
