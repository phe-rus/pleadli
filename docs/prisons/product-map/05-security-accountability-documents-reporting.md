# 05. Security and accountability, document model, reporting

---

## M. Security and accountability

### M.1 Identity

Two different things are currently one table (`officers`):

- **Staff**: an institutional person with a rank (21-step ladder [P]), a facility, a posting. Needed for establishment context, attribution of who did a thing, and later rosters and promotion inputs.
- **Account**: a login with a role and enrolled devices. Some staff never log in (a warder counted in the establishment); some account holders are not UPS staff (a Ministry of Health medical officer under s.26, a social worker).

Recommendation (D7): separate them, link one to zero-or-one of the other. Deactivation (never deletion) applies to accounts; staff records keep history.

Authentication. Keep Argon2 password hashing (built, sound). Add: an explicit sign-in on every workstation session (the current facility "badge-only lookup" identifies but does not authenticate); session lifetime and idle timeout; re-authentication for sensitive actions (discharge authorisation, correction of a legal instrument, confinement, access grants); lockout with backoff; a password policy; server-side session invalidation on deactivation, checked on every request.

### M.2 Roles and permissions

Model **permissions**, then group them into **role templates** per function. The vocabulary is provisional (R-07) and a facility can adjust its templates.

| Template | Basis | Illustrative permissions |
|---|---|---|
| Officer in Charge | s.30 [P] | All facility permissions plus `authorise.discharge`, `authorise.admission`, `authorise.confinement`, `attest.return`, `grant.access`, `declare.escape` |
| Records and reception | Registers [P], [H] | `custody.admit`, `instrument.record`, `register.read`, `document.generate` |
| Custody and duty | Rank ladder [P], [H] | `count.record`, `occurrence.record`, `movement.dispatch`, `incident.report` |
| Gate | Gate register [P], [H] | `gate.record`, `visit.attend` |
| Health liaison | s.26 [P] | `health.movement.record`, `health.summary.read` (no clinical store) |
| Welfare | s.88(c) [P] | `welfare.assess`, `review.contribute` |
| Court production | [H] | `court.diary.manage`, `production.record` |
| Facility administrator | System role | `accounts.manage`, `devices.enrol`, `backup.run`, `config.edit`. No access to records by default |
| HQ roles | Directorates [P], [H] | `network.manage`, `coordination.order`, `oversight.triage`, `decision.record`, `directive.publish`, `locate.search`, `access.request`; region-scoped read for Regional and District Commanders |

Rules: deny by default; a permission is checked by the node for the acting account and the enrolled device; scope (facility, or region for a commander) is part of the check; an administrator role cannot read prisoner records merely by administering accounts.

### M.3 Authority versus performer

Statutory authority attaches to the OIC, with delegation practice unknown (R-07). Every authorised action therefore records **two** identities: `performed_by` and `authorised_by` (OIC or a delegate acting under an OIC-recorded delegation).

| Action | Authority evidence | Records |
|---|---|---|
| Accept or refuse admission | OIC verifies warrant, s.58 [P] | authoriser, decision, reasons |
| Authorise discharge | OIC responsible, s.83 [P] | authoriser, basis, exceptions |
| Cell confinement | OIC, s.81 [P] | authoriser, reason from statutory four, end date |
| Property held in OIC custody | s.62, s.30(2)(a) [P] | authoriser and witness [H] |
| Amend a legal instrument or entered fact | Record integrity, Sch.2 [P] | authoriser, reason, before and after |
| Declare an escape | s.79 and regulation summary [P/S] | authoriser |
| Attest a return | [H] | authoriser |
| Grant HQ access to a record | Structural (T4) | authoriser, scope, expiry |
| Transfer, parole, licence | External decision (CG) [P] | decision reference, not a local authoriser |

Where two officers are needed (a witness, a verifier), the second account must differ from the first. Which actions need two officers in real practice is unknown (R-07); the structure supports it, and configuration decides.

### M.4 Enforcement point

The **node** enforces authorisation on every request, deny by default, with a route-to-permission map. The UI hides what a user cannot do as a courtesy. Every state-changing request carries actor, device, and, where applicable, workflow id and reason. Audit is written in the same database transaction as the change, so a change without an audit entry cannot commit.

### M.5 Audit model

Two layers, both append-only.

1. **Domain event log.** Business facts (admitted, transferred, discharged, incident recorded). This is also the source of the exchange outbox (03).
2. **Audit trail.** Field-level history of every change: who, when, what changed, previous value, the workflow and action that caused it, whether approval was required, who approved, and a **sensitive-read log** for T0 categories (health, discipline, complaints, next of kin) and for every T4 access.

Integrity: entries are hash-chained per node. The chain head digest is reported to HQ in exchange sessions (T2), so truncation of a facility's log is detectable. Nothing is deleted. A correction is a new entry that supersedes an earlier one, with a mandatory reason. This matches the statutory reality that omitting an entry and destroying or mutilating a record are disciplinary offences (Sch.2 [P]) and the international requirement of "a secure audit trail" and prevention of unauthorised modification (r6 [I]), and it is what DPPA ss.20 to 23 accountability and breach detection need [P].

**The eight questions in the brief and where each is answered.**

| Question | Answered by |
|---|---|
| Who did this? | `performed_by` on the audit entry |
| When? | `recorded_at` (node time) and, for back-entry, `occurred_at` |
| What changed? | Field-level diff |
| Previous state? | Prior version, preserved |
| What workflow caused it? | `workflow_id` and action |
| Was approval required? | The action's gate definition |
| Who approved? | `authorised_by` |
| What happened afterward? | Linked events and obligations |

### M.6 Trust between installations

- Each node holds an Ed25519 key, generated at initialisation, registered at pairing. Packages are signed; HQ and receiving facilities verify.
- The uniform-failure principle for unauthenticated callers is kept (nothing distinguishes wrong credential from unknown or revoked node). A node that proves possession of a valid key may safely be told its trust state, because it already holds a real credential.
- Revocation takes effect at the ingress immediately. Facility trust can be suspended and resumed. Facility, device and officer lifecycles are in 04 J.3.
- Key rotation: a node may rotate its key with a package signed by the old key. A compromised node key is handled by revocation and re-verification; data received since the suspected compromise is flagged for oversight.
- T3 and T4 payloads are encrypted to the recipient. HQ relays ciphertext it cannot read for facility-to-facility dossiers.

### M.7 Encryption and secrets

| Item | Recommendation |
|---|---|
| In transit | TLS on the LAN (pinned self-issued certificate) and on every transport; package encryption for T3 and T4 |
| At rest | Encrypted database (SQLCipher) with vault files encrypted under a key derived from the node master key. If that is too heavy for the first release, require and verify OS full-disk encryption at initialisation. Either way, a stolen node disk must not expose records (decision D14 below) |
| Secrets | Node private key, database key, backup key, Cloudflare token, pairing secrets in the OS keystore, never in plain SQLite tables |
| Backups | Encrypted with a key held by the OIC and a recovery custodian; escrow to HQ, if used, is ciphertext HQ cannot open |
| Logs | Diagnostic logs contain no personal data |

Today the sync token and Cloudflare API token sit in plaintext columns (`peer_sync_config.sync_token`, `cloudflare_config.api_token`), and the database and vault are plaintext.

### M.8 Threats considered

| Threat | Mitigation |
|---|---|
| Web page or local process calls the local API (present today in release builds) | Loopback credential, no wildcard CORS, Host validation; single API surface (04 I.2) |
| Curious insider reads sensitive records | Deny by default, sensitive-read log, role templates |
| Officer alters a legal instrument | Reasoned amendment, preserved original, hash-chained audit |
| Stolen or lost workstation | Workstations hold no records at rest; device revocation |
| Stolen node disk or backup | Encryption at rest, encrypted backups |
| Rogue or mistaken facility | Human-verified pairing, signature per node, revocation |
| Compromised HQ officer | Scoped roles, HQ audit, T4 access always logged on both sides, facility-approved reads |
| Interception on a transport | TLS plus package encryption and signatures |
| Forged or replayed package | Signature, sequence, epoch, `package_id` dedupe |
| USB carrier tampering | Signature verification at import |

**Data protection (DPPA 2019)** [P]: registration as a data processor and a documented security policy (ss.20 to 29); breach notification (s.23); cross-border transfer rule (s.19), unresolved for Cloudflare transport and mitigated by package encryption; access and correction rights, which for prisoners align with r9 (a prisoner may access their records and receive an official copy on release, subject to redaction under domestic law) [I], Uganda position [U] (R-20).

**Decision D14** (new): at-rest encryption method (SQLCipher versus verified full-disk encryption). Recommendation: SQLCipher for the node database and encrypted vault, because a prison workstation is a shared machine.

---

## N. Document model

A prison system is not complete if files are attachments. Documents are institutional records with a place in a workflow, a lifecycle, and a destination.

### N.1 Kinds

| Kind | What it is | Examples | Origin |
|---|---|---|---|
| **Instrument** | A received legal document that authorises or changes custody | Commitment, remand warrant, order of detention, warrant of conviction or committal (s.58); production order (s.67); court release order; transfer order; parole and licence decisions; re-arrest warrant (s.79) | Imported: scanned, verified |
| **Supporting document** | Received, not authorising | Medical reports, letters, legal correspondence, hospital notification of end of care (s.76) | Imported |
| **Generated document** | Rendered from structured data by the system | Admission slip, property inventory and receipt, reception letter, transfer letter (s.78(2)), transfer dossier, release order or discharge certificate, official copy of record, s.118 list, production sheet, visiting pass, count sheet, handover, incident report, notification, monthly return, s.88 bundle, VJ extract | Generated |
| **Register** | A statutory book as a view | Admission, release, property, transfer-of-detainees, gate, exhibits, medical [P names]; Visiting Justices' Book (s.110), visitor's book (s.111) [P] | Generated view over records |
| **Approval** | A recorded authorisation | OIC authorisation, attestation, witness | Structured record with identity and time |
| **Dispatch and receipt** | Proof that a document left or arrived | s.118 list to High Court; notification to police; Form B support to coroner; dossier to receiver | Structured record |
| **Directive** | Rule or template from HQ | Standing order revision, prohibited-articles list (s.101), form template | Inbox |

### N.2 Lifecycle and metadata

Every document carries: kind and type; issuing authority and reference; date issued and received; authentication (seal or authorised signer, s.58) and who verified it; owner and workflow; linked entities (episode, stay, obligation); content hash and page count; version and supersession; retention class; sensitivity tier (T0 default); dispatch state.

- **Instruments are immutable.** A corrected or replacement instrument is a new version that supersedes the earlier one; both remain.
- **Generated documents are snapshots**: the template version and a hash of the source data are stored; a reprint is marked duplicate; an amendment produces a superseding document.
- **Approval and signatures.** First release records authenticated identity and time; wet-ink signed scans are attached as instruments where the law requires them; digital signatures are deferred (JLOS direction [P]).
- **Missing instruments** are a first-class state (`documents pending`, with the type and a timer), not an error. This is already modelled and stays.

### N.3 Documents by workflow

| Workflow | Received | Generated | Dispatched |
|---|---|---|---|
| W1 Reception | Instrument, identity documents | Admission slip, inventory and receipt, reception letter, rules information (s.58(5)) | None |
| W3 Court | Production order, outcome instrument | Production sheet, s.118 list | s.118 list to High Court |
| W4 Discharge | Release authority | Release order or discharge certificate, property receipt, official copy of record on request | Notice to police if applicable |
| W5 Transfer | CG order | Transfer letter, dossier | Dossier to receiver |
| W6 Health | Hospital notification | Referral note | None |
| W7 Visit | Visitor ID copy (if kept) | Visiting pass | None |
| W11 Incident | Police report, Form B | Incident report, notifications | Police, coroner, HQ |
| W14 Returns | VJ Book remarks | Monthly return, VJ extract, s.88 bundle | HQ |

### N.4 Registers as views

The digital record **is** the register. A register is generated in chronological order, printable in book form, with page and line numbering so it can stand where a "registration book with numbered and signed pages" is acceptable (r6 [I]). Actual UPS register formats are unread (R-04); until they are obtained, the register views use a neutral layout and are labelled provisional. Where a physical book remains authoritative during transition, **back-entry** (03 L.3) loads it into the record with source marked.

### N.5 Vault

Content-addressed storage: a hash-named file store under the application data directory, a manifest table with relative paths, hash and size, integrity verified on read and on backup. Included in every backup. No absolute paths in the database. Attachments today follow a per-prisoner folder scheme in the user's Documents folder; that is replaced, and existing files are imported by hash on migration.

### N.6 Local versus sent

| Rule | Effect |
|---|---|
| Documents are T0 by default | They never leave without a workflow |
| Legal correspondence with a prisoner's own lawyer | Privileged; never in any package or T4 grant |
| Medical and disciplinary documents | T0, restricted permission, sensitive-read logged |
| Dossier contents | T3, encrypted to the receiver |
| HQ directives | Stored at the facility as received, version-pinned |

### N.7 Retention and archival

Records are never deleted by users. Retention classes and periods are configuration, awaiting Ugandan records and DPPA storage-limitation rules (R-20). Discharge closes the stay and episode into an archive; access remains permission-controlled. Decommissioning exports the archive.

### N.8 What this is not

Not a generic file manager, not OCR, not a document editor beyond structured rich text for narrative fields. Search over document metadata, not over scanned image content.

---

## O. Reporting model

### O.1 Classes

| Class | Purpose | Audience |
|---|---|---|
| Operational | What management needs to run the facility now | OIC, duty officers |
| Register output | The statutory books | Facility, inspectors |
| Statutory submissions | s.118 list, VJ extracts, s.88 bundle, incident reports | Courts, HQ, Minister |
| Attested returns | Monthly return to HQ | HQ |
| HQ consolidation | National and regional picture | HQ, Regional Commanders |
| Oversight reports | Trends in complaints, deaths, escapes, overstay | HQ |

### O.2 Facility reporting

| Report | Source | Cadence | Format evidence |
|---|---|---|---|
| Population now (Unlock) by category, sex, unit; occupancy | Custody and count | Continuous | "Unlock" [P] |
| Due list (discharges, courts, reviews, thresholds) | Obligations | Daily | Structural |
| s.118 list of prisoners awaiting trial | Court diary | Before each High Court session | Content [P], layout [U] |
| Monthly return | Records, validated against events | Monthly | UPS abstract shape [P]: population by convict, remand, civil; occupancy; admissions and releases by reason (13 court-release reasons); productions; escapes; recaptures; deaths; staff by rank; children with mothers. Facility-to-region form [U] (R-13) |
| Registers | Records | On demand | R-04 |
| VJ extract, observations report, s.88 bundle | Records and documents | Event-driven | Content [P], form [U] |
| Incident report | Incident record | Event-driven | R-09 |
| Management analysis: trends, remand overstay, workload | Records | On demand | Structural |

### O.3 Head Office reporting

| Report | Source | Notes |
|---|---|---|
| Monthly statistical abstract (national, regional) | Attested returns, verified against events | UPS's own published shape [P] |
| Congestion and occupancy by unit and region | Returns, locator | Headline national concern [P] |
| Remand overstay across the network | Locator and thresholds | UPS reports 6,417 petty offenders beyond the mandatory period [P] |
| Oversight register (VJ, observations, incidents, s.88) | Oversight cases | s.110, s.111, s.88 [P] |
| Transfer pipeline | Transfer orders | s.73 [P] |
| Contact health and data currency | Exchange | Not a statistic about prisoners |
| Complaint trends by category | T2 | Mukutano categories [P] |

### O.4 Attestation and validation

The system builds the return; it does not ask an officer to type numbers already held. Validation checks the return against the event log (admissions and releases add up to the change in population; category totals sum) and lists discrepancies for the OIC to resolve or explain. The OIC attests; the attestation, time and identity are audited. HQ acknowledges, queries, or accepts; HQ also cross-checks the attested return against its T1 event stream, and disagreement becomes an oversight item rather than a silent overwrite.

### O.5 Export

Print-ready PDF and CSV, generated locally, with facility letterhead and language configuration (English, with vernacular notices where the Act requires, s.101(3)). Report definitions are versioned so a return can be reproduced exactly as it was submitted.

### O.6 Evaluation of current reporting

What exists (`domain/reports.rs`, `routes/_public/reports/index.tsx`, `features/reports`): summary counts and time series, six UPS-shaped population breakdowns (age group, sex, education, nationality, offence type, sentence category), a population-profile CSV export, browser print, and Head Office by-facility counts derived from synced full rows.

Verdict: **keep the breakdown queries** and re-home them as inputs to the returns builder; **rebuild the surface** as Returns (build, validate, attest, submit) rather than an analytics page. Missing: the monthly return in UPS's shape (court-release reasons, admissions from court, escapes, recaptures, deaths, staff by rank, children with mothers), validation against events, attestation, submission, HQ consolidation, and the escape and death data the source header comment itself notes are absent. The current HQ reports derive counts from copies of prisoner rows, which the disclosure tiers replace.
