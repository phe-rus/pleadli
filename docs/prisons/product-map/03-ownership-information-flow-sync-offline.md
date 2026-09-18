# 03. Data ownership, information flow, sync, offline and failure

Principles P1 to P5, P7 and P8 (README) are the constraints here. Nothing in this file is implemented; 07 states what exists.

---

## G. Data ownership

### G.1 The custody model that makes ownership workable

Today one `prisoners` row is the person, the custody and the location, per installation. Ownership across a transfer cannot be expressed that way. The model:

- **Person identity facts**: name, sex, date of birth, national ID, family and next of kin. Recorded by a facility; a copy travels in a transfer dossier.
- **Custody episode**: one continuous period of imprisonment, with a global identifier created at first reception. A later, unrelated re-arrest starts a new episode (the earlier product decision, RESEARCH.md §9, stands). A transfer does **not** start a new episode (s.73(5), s.73(6) treat transfer as one continuing custody relationship) [P].
- **Stay**: the episode as held by one facility, from reception or transfer-in to discharge or transfer-out. **A stay is owned forever by the facility whose stay it was.** It is the record of what happened there.
- **Live record**: the current working file of the episode. It is owned by the facility currently holding the person. It moves to another facility **only** through a confirmed transfer (W5).

Consequences: HQ never owns a stay or a live record. A facility's record of its own stay survives the prisoner's departure as a read-only archive. Continuity is provided by the episode identifier and the dossier, not by a shared row.

### G.2 Ownership by record class

`Owner` is the institution accountable for the record. `Authoritative copy` is where the source of truth lives. `HQ tier` refers to G.3.

| Record class | Owner | Authoritative copy | Ownership change | HQ tier |
|---|---|---|---|---|
| Person identity facts | Holding facility | Facility node | Moves with the live record at transfer | T1 subset |
| Custody episode header, legal state | Holding facility | Facility node | Transfer | T1 |
| Stay (history at one facility) | That facility, permanently | That facility's node | Never | None (T4 on request) |
| Instruments (received documents) | Facility that received and verified them | Facility vault | Copies travel in dossier; the sender keeps its originals | T4 |
| Sentence, remand clocks, entitlement dates | Holding facility (derived) | Facility node | Recomputed at receiver from dossier | T2 aggregates, optional T1 entitlement date |
| Court diary and productions | Holding facility | Facility node | Open obligations re-home at transfer | T1 for outcomes changing custody |
| Discharge | Discharging facility | Facility node | None | T1 event |
| **Transfer order** | **Head Office** | HQ node, copy in facility inbox | None | Own record |
| Transfer dispatch and arrival | Sending and receiving facility respectively | Each node | None | T1 events |
| Health movements | Holding facility | Facility node | Transfer summary only | T2 counts |
| Visits, letters | Facility | Facility node | None | T2 counts |
| Property ledger | Facility | Facility node | Statement travels in dossier; sender ledger closes with "transferred with prisoner" | None |
| Requests and grievances | Facility | Facility node | None | T2 counts; escalations T3 |
| Incidents | Facility | Facility node | None | T1 for escape, recapture, death; T3 report |
| Oversight case about an incident | Head Office | HQ node | None | Own record |
| Discipline and confinement | Facility | Facility node | Summary in dossier | T2 counts |
| Count, duty log, gate, accommodation | Facility | Facility node | None | T2 population and occupancy |
| Generated documents | Author's institution | Author's vault | None | As their workflow requires |
| Registers | Facility | Facility node (views over records) | None | None |
| Monthly return | Facility authors; HQ owns the received copy and consolidation | Both, distinct records | None | T2 |
| VJ extract, observations, s.88 bundle | Facility authors; HQ owns the oversight case | Both, distinct | None | T3 |
| Directives | Head Office | HQ node, copy in facility | None | HQ to facility |
| Decisions | Head Office | HQ node | None | Instruction to facility |
| Facility registry and trust state | Head Office | HQ node | None | HQ to facility |
| Facility accounts, roles, devices | Facility | Facility node | None | Status only |
| HQ accounts, scopes | Head Office | HQ node | None | n/a |
| Audit log | Each node for its own actions | That node | None | Chain head digest only |
| **Locator entries** | **Head Office, as a derived read model** | HQ node | Rebuilt from facility events | T1 |
| Backup escrow blob (optional) | The facility | HQ stores opaque ciphertext | None | Opaque |

### G.3 Disclosure tiers

Connection does not mean visibility. Every field that crosses the boundary has a tier, a business reason, an authority, and a retention rule, recorded in a versioned **Disclosure Register**. A facility can open a screen called "What Head Office can see about us" that renders that register with live counts.

| Tier | Name | What crosses | Reason | Default retention at HQ |
|---|---|---|---|---|
| **T0** | Facility-local | Nothing. Notes, health and injury detail, complaint text and identity, disciplinary detail, visitor personal data, property detail, next of kin, family, documents, count detail, duty log, gate events | Facility owns operations | n/a |
| **T1** | Locator and institutional events | A minimal locator entry and events: `admitted`, `released(type)`, `transfer dispatched`, `transfer arrived`, `escaped`, `recaptured`, `died`, `category changed`. Default locator fields (policy list, **to be confirmed by the Prison Service and legal review**): episode id, facility, name, sex, date of birth, legal category, custody status, admission date, capital or High-Court-only flag, national ID as a match key (a keyed hash, with display of last digits only) | Cross-network search; national statistics; transfer coordination; recovery aid | Life of episode plus a statutory period (R-20) |
| **T2** | Attested aggregates | Returns computed at the facility: population by dimension, occupancy, admissions and releases by reason, productions, escapes, deaths, complaints by category, staff by rank. No rows | Consolidation the Service already does monthly [P] | Permanent |
| **T3** | Workflow packages | Purpose-bound, addressed to a named recipient, receipt tracked: transfer dossier (facility to facility), transfer request, VJ extract, observations report, s.88 bundle, incident report, complaint escalation | A defined process needs the content | Per workflow |
| **T4** | Access on request | HQ asks for a specific record or document. The holding facility approves (or a standing policy pre-approves for a scoped role such as a Regional Commander), and a time-boxed sealed read is delivered. Both sides log it | Investigation, inquiry, inspection (r84 [I]) | Time-boxed |

The current sync pushes the full `prisoners` row (including `notes`, national ID and date of birth) as T1-plus-T0 combined every five minutes. This design separates it.

**Statistics without rows.** Head Office statistics come from attested T2 returns and the T1 event stream. HQ does not need the facility's rows to count them. Where the event stream and the attested return disagree, HQ raises a discrepancy for oversight. This turns the return into an audit check rather than a copy.

**HQ recovery aid.** Because HQ holds locator entries, a facility restoring from an old backup can ask HQ which episodes it should hold. That restores identity and status skeletons, not files.

---

## H. Information flow

### H.1 Overview

```
                        EXTERNAL INSTITUTIONS
   Courts   Police   Hospitals   Coroner   Visiting Justices   Legal aid   UVTAB
     ^  |      ^  |      ^  |       ^  |          |  ^              |  ^      |
     |  v      |  v      |  v       |  v          v  |              v  |      v
     documents in and out (instruments, orders, notifications, extracts)  <-- dispatch and receipt records
     |          |          |          |
  +--+----------+----------+----------+------------------------------------------+
  |                        FACILITY (one node, N workstations)                     |
  |   workstation --+                                                             |
  |   workstation --+--> LAN --> Facility Node: SQLite, vault, audit, outbox      |
  |   workstation --+                        |            ^                         |
  +------------------------------------------|------------|-------------------------+
                                             | up         | down
          T1 events, T2 returns, T3 packages |            | inbox: directives, orders,
          (signed exchange packages)         |            | decisions, requests, acks
                                             v            |
                     controlled transport: Cloudflare Tunnel | VPN | private or
                     government network | removable media (file)
                                             |            ^
  +------------------------------------------v------------|-------------------------+
  |                        HEAD OFFICE (one node, N workstations)                   |
  |   ingress: /api/network/**  -->  registry, locator, returns, oversight,        |
  |                                   coordination, decisions, directives, relay    |
  +----------------------------------------------------------------------------------+
                 relay of sealed T3 dossiers  ==>  other facility's inbox
```

### H.2 Flows

| Flow | From to | Trigger | Content | Tier | Carrier | Acknowledged by | Offline behaviour |
|---|---|---|---|---|---|---|---|
| Within facility | Workstation to node | Any officer action | Commands and reads | T0 | `/api/prisons/**` on LAN | HTTP result, audit | Node down: paper procedure and back-entry |
| Custody events | Facility to HQ | Admission, discharge, transfer, escape, death | T1 event | T1 | Exchange | HQ ack of contiguous sequence | Queues in outbox |
| Attested return | Facility to HQ | Month end | Aggregate return | T2 | Exchange | HQ ack, optional query | Prepared offline, sent on contact |
| Oversight submission | Facility to HQ | VJ visit, s.111 entry, s.88 due, incident | Extract, bundle, report | T3 | Exchange | Oversight case created | Queues |
| Transfer order | HQ to facility | CG order | Order document, instruction | HQ record | Inbox | Facility receipt | Waits in inbox |
| Expected arrival | HQ to receiving facility | Order issued | Minimal notice, no file | HQ record | Inbox | Facility receipt | Waits |
| Transfer dossier | Facility to facility | Dispatch | Sealed dossier | T3 | Exchange relay, or file | Receiver confirmation | Carried by hand as a file if no network |
| Directive | HQ to facility | Publication | Versioned directive | HQ record | Inbox | OIC acknowledgment | Waits; HQ sees non-acknowledgment |
| Decision | HQ to facility | CG or Minister act recorded | Instruction with document | HQ record | Inbox | Facility execution record | Waits |
| Access request | HQ to facility | HQ needs a record | Request | T4 | Inbox | Grant, refusal with reason | Waits |
| Access grant | Facility to HQ | Approval | Sealed time-boxed read | T4 | Exchange | Read receipt | Queues |
| Locator reconcile | Both | Periodic | Digest and, on mismatch, locator snapshot | T1 | Exchange | Digest match | Deferred |
| Backup escrow (optional) | Facility to HQ | Schedule | Opaque encrypted blob | Opaque | Exchange | HQ store ack | Queues |
| Documents to external institutions | Facility to court, police, coroner, hospital | Workflow | s.118 list, notices, Form B support | External | Print, hand, later email or integration | Dispatch record with proof | Full (paper) |
| Instruments from external institutions | Court, police to facility | Order, warrant | Instrument | External | Paper, scan | Receipt record | Full |

### H.3 Between institutional applications

Pleadli Police, DPP and (future) Courts and Lawyers are separate products. The interoperability stance, consistent with the earlier root scope note and the JLOS E-Justice aim of "open standards and APIs for secure data sharing" [P]:

- No shared database and no live sync between applications.
- **Referenceability without visibility.** Applications may carry opaque references to each other (a court reference number on a production order, an episode identifier on an outbound notice). A reference resolves only through a defined, authorised query.
- The Prisons boundary today is **documents in, documents out** with dispatch and receipt records. A future JLOS adapter would be an additional exchange transport for defined package kinds, not a redesign.
- Status: `DEFERRED`; research items R-31 (Judiciary and JLOS interfaces) and R-13 (PMIS).

---

## K. Sync model

Called the **Exchange**. It replaces the snapshot push.

### K.1 Design stance

No distributed database, no multi-writer replication, no conflict resolution. Every record has exactly one writer (P1, G.2). Consequently:

- Facility to HQ is an **append-only ordered event stream** with cumulative acknowledgment, plus periodic **attested returns**, plus **workflow packages**.
- HQ to facility is an **inbox** of immutable messages.
- Disagreement is **detected** (digest mismatch, discrepancy), never auto-merged.

### K.2 The exchange package

Every unit that leaves a node is a signed, versioned package. The same package can travel over any transport or as a file.

| Field | Purpose |
|---|---|
| `package_id` | Unique; deduplication key |
| `kind` | `events`, `return`, `dossier`, `oversight`, `access_grant`, `locator_snapshot`, `escrow`, `inbox_ack` and, downward, `directive`, `order`, `decision`, `request`, `trust_update` |
| `from`, `to` | Node identifiers |
| `stream`, `seq`, `epoch` | Ordering within a stream; epoch increments after an attested restore |
| `created_at` (sender clock), `schema_version` | Diagnostics and compatibility |
| `payload` | Content, encrypted to the recipient for T3 and T4 |
| `signature` | Ed25519 by the sender's node key |
| `prev_digest` | Optional hash chain link for tamper evidence |

### K.3 Session

Facility-initiated, outbound only, one round trip. No inbound port is ever needed at a facility.

**Facility sends:** identity and signature; protocol and app versions; the highest inbox sequence it has processed; outbox packages in order (bounded batch); a health summary (backup age, queue depth, node clock).
**Head Office replies:** acknowledgment of the highest contiguous sequence applied per stream; a NACK with the expected sequence on a gap; inbox messages after the facility's cursor; server time and skew warning; trust state; any required-update notice.

Properties: **idempotent** (dedupe on `package_id`); **atomic per package**; **resumable** (the facility re-sends from the last acknowledged sequence); **explicit** (the UI shows the result of every session).

### K.4 Retry, failure and recovery

| Situation | Behaviour |
|---|---|
| No route or timeout | Exponential backoff with jitter; state `paired, offline`; queue depth shown; manual "try now" |
| HQ 5xx | Same, state `HQ unavailable` |
| Rejected package (validation) | Quarantined, visible to facility admin with reason; later packages continue only if independent, otherwise the stream halts with a clear message |
| Sequence gap | HQ NACKs with expected sequence; facility resends |
| Version too old | State `update required`; local work continues; exchange paused |
| Clock skew beyond threshold | Warning to admin; timestamps are still node-stamped |
| Trust revoked or expired | State `rejected`; local work continues; exchange stops |
| Facility restored from backup | Epoch increments after an OIC-attested restore; HQ reports the last sequence it holds; the node identifies events lost since the backup and prompts back-entry; HQ locator restores identity and status skeletons |
| Duplicate delivery | HQ returns "already applied", counted as success |

### K.5 Reconnect

Drain outbox in order; then process inbox; then compare the **locator digest** (count and rolling hash of the facility's locator entries at HQ). A mismatch triggers a locator snapshot (the only bulk transfer, minimal fields) to repair drift. A facility offline for months reconnects the same way; nothing is time-limited.

### K.6 Per-domain synchronisation classes

Every rule has a business reason and an authority.

| Domain or record | Class | Reason | Authority |
|---|---|---|---|
| Person and custody header | Facility to HQ, T1 event | Locate, count, coordinate | Facility |
| Instruments and documents | Local; T3 in dossier; T4 on request | Prove authority without disclosing files | Facility |
| Sentence and clocks | Local; T2 aggregates | Overstay analysis without rows | Facility |
| Court diary | Local; T1 only when custody changes | Operational detail is local | Facility |
| Discharge | Facility to HQ, T1 event | National statistics, locator | Facility |
| Transfer order | HQ to facility | s.73 authority is HQ's | HQ |
| Transfer dispatch and arrival | Facility to HQ, T1; dossier facility to facility, T3 | Two-ended workflow | Each facility |
| Health movements | Local; T2 counts | Coordination, not clinical | Facility |
| Visits, property, rehabilitation | Local; T2 counts | Operational | Facility |
| Requests and grievances | Local; T2 counts; escalation T3 | Oversight by process | Facility |
| Incidents | T1 for escape, recapture, death; T3 report; rest local | Statutory and statistical | Facility |
| Discipline and confinement | Local; T2 counts | Sensitive, not needed upward | Facility |
| Count and accommodation | Local; T2 population and occupancy | Congestion management | Facility |
| Gate and duty log | Local | Operational | Facility |
| Returns | Facility to HQ, T2 | Consolidation | Facility attests |
| VJ, observations, s.88 | Facility to HQ, T3 | Statutory upward duties | Facility produces |
| Directives, decisions, trust | HQ to facility | Institutional authority | HQ |
| Accounts | Local; status only | Facility manages its people | Facility |
| Audit | Local; chain head digest T2 | Detect log truncation | Facility |
| Backup | Optional opaque escrow | Off-site recovery | Facility |
| General stores, farms, staff rosters | Not synchronised yet | Unresearched | n/a |

### K.7 What changes from the current implementation

Replace the five-minute full-`prisoners` snapshot (`domain/sync.rs`, `transport/hq_server.rs`) with the event outbox, the inbox and tiered payloads. Keep: the pairing idea, the per-facility credential, hashed credential storage, the uniform-failure principle for unauthenticated callers, and the rate limit. Add: signatures, sequence and epoch, acknowledgment, inbox, file carrier. Routes move under `/api/network/**` (04).

---

## L. Offline model and failure states

### L.1 What works when

| Layer | Fully works offline | Needs a peer | Explicit when unavailable |
|---|---|---|---|
| Single node, no LAN clients | Everything ordinary: reception, discharge, court diary, visits, health, property, requests, incidents, counts, registers, returns preparation, printing, search, backup to removable media | Sending anything to HQ; receiving orders, directives, dossiers; cross-network locate; HQ-dependent validation | Connectivity strip and queue depth |
| Workstation on LAN | Everything the node offers | The node | "Cannot reach the facility server", with the paper procedure |
| Facility with HQ unreachable | All facility work | Exchange only | State `paired, offline` or `HQ unavailable` |

### L.2 Connectivity states (always visible to officers)

`standalone` (never paired) → `paired, connected` → `paired, behind` (queue > 0) → `paired, offline` (no route) → `HQ unavailable` (route, no response) → `update required` → `rejected` (trust revoked or expired) → `suspended`. Each state names what it means and what the officer can do next. Nothing shows success unless the last session completed and was acknowledged.

### L.3 Downtime and back-entry

Statutory registers are physical books today [P]. The system therefore provides **downtime forms** (printable, matching each procedure) and a **back-entry** mode: records entered after the fact carry `occurred_at` (declared), `recorded_at` (node time), `source = paper back-entry` and the recording officer. Back-entered records are marked in audit and never pass as contemporaneous.

**Workstation capture queue.** A workstation that loses the node may capture only a whitelist of append-only, low-conflict facts (occurrences, count sheets, gate events, visit attendance) into an encrypted local queue with client-generated identifiers, replayed on reconnect. **Commands that change legal state** (admission, discharge, transfer, status change) always require the node and fail closed. This keeps one authority and avoids offline divergence of legal state.

### L.4 The fifteen failure states

| # | State | Detected by | Officer sees | Still possible | Blocked or queued | Recovery |
|---|---|---|---|---|---|---|
| 1 | No internet | No route on any configured transport | "Head Office not reachable since [time]. Records are safe on this server. N items waiting." | All local work | Exchange queues | Automatic retry; "try now" |
| 2 | No LAN | Workstation cannot reach node | "Cannot reach the facility server." Paper procedure link | Whitelisted captures queue; nothing else | Every command | Restore LAN; replay queue; back-enter paper |
| 3 | HQ unavailable | Route exists, no valid response | "Head Office did not respond." | All local work | Exchange | Backoff; admin sees last error |
| 4 | Facility unavailable (HQ view) | No contact beyond threshold | "No contact for N days. Data as of [date]." Oversight item | HQ actions that queue in inbox | Reads of fresh data; nothing is inferred as zero | Contact resumes; digest reconcile |
| 5 | Sync failed | Session error classified | Plain cause: network, authorisation, version, server, rejected package | Local work | Affected stream | Fix cause; retry; quarantine review |
| 6 | Partial sync | Ack lower than sent | "N of M packages confirmed." | Local work | Unacknowledged packages remain queued | Resend from last ack |
| 7 | Duplicate request | `package_id` already applied | Nothing to the officer; counted once | n/a | n/a | n/a |
| 8 | Machine failure | Node or workstation loss | Workstation: enrol a replacement. Node: restore wizard | Workstations continue on paper if node lost | Node-dependent work | W17 |
| 9 | Database recovery | Startup integrity check fails | "The database needs recovery." Lists verified backups | Nothing until resolved (paper) | Everything | Restore; verify audit chain; back-enter the gap |
| 10 | Expired or revoked trust | Signed status response to a valid key | "Head Office has revoked or expired this installation. Local work continues." | All local work | Exchange | Head Office re-verifies or re-issues |
| 11 | User deactivated | Session check on every request | Session ends; drafts preserved for another officer | Others continue | That user's actions; obligations reassigned | Admin reassigns |
| 12 | Document unavailable | Missing file or hash mismatch | "Document unavailable: integrity check failed." Metadata and hash remain | Rest of the record | The document | Restore from backup; obligation to re-obtain |
| 13 | Incomplete legal documentation | Instrument missing or pending | "Documents pending: [what], since [date]" | Custody continues | Gate on discharge (see D13), warning on transfer and production | Record the instrument; timer escalates |
| 14 | Pending transfer confirmation | In-transit beyond period | "Dispatched [date], not confirmed." Alert to sender and HQ | Custody state `in transit` | Closure of the stay | Confirmation; or incident if not arrived |
| 15 | Pending release requirements | Discharge checklist | Each unmet requirement with its owner | Preparation continues | Execution without either completion or an authorised exception | Complete, or OIC exception with reason |

**Design note on state 15 (decision D13).** Spec 0002 made property handback and documents-pending **hard blocks with no override**. That is safe against wrongful release, but s.83 makes the OIC responsible for discharge "immediately upon becoming entitled to release" [P], and a court-ordered release cannot lawfully wait on an inventory. A hard block can therefore cause unlawful detention. Recommendation: replace the hard block with a **gate that requires either completion or an OIC-authorised exception with a recorded reason**, reported in the return and surfaced as an obligation to regularise afterward. This preserves the integrity intent without making the software an obstacle to a court order.
