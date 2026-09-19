# Custody spine — the canonical custody model

The spine is the load-bearing domain of `PRODUCT.md`. This note defines it in one place and reconciles it with the code (verified 2026-09-20). It supersedes scattered custody statements in `research/findings.md` and the 2026-09-18 ledger.

## Core idea

One person may be in custody across several facilities over time. The model keeps one **custody episode** per continuity-of-detention thread, and each facility keeps its own **stay** within that episode. A stay is the episode as held by this facility, owned by it forever. The live record moves between facilities only through a confirmed, two-ended transfer (`product/02` W5). Nothing else transfers ownership (P5, D3).

Migration `0023_custody_spine.sql` implements this: `prisoners.episode_id` added (back-filled), `stays` created with a unique open-stay constraint, `facility_profile` created.

## The spine in order

### 1. Reception — the procedure that starts a stay

Code: `domain/custody.rs` `receive()`; table `receptions`.

A reception is a decision, not a form. `receptions` holds `decision` (accept / refuse / accept-with-rectification-pending), `refusal_ground`, `reason`, `instrument_kind`, `search_done`, `injuries_note`, `complaints_note`, `health_screen_note`, `rules_information_given` (s.58(5) disclosure), `received_at`, `decided_by`. `prisoner_contacts` holds family / emergency contacts with `notify_on_imprisonment`. The resulting `stays` row is opened via `open_stay` with `entry_kind`.

An expected but not-yet-arrived reception (transfer or paperwork pending) is represented by the expected-transaction side of transfers, not by a premature prisoner row.

### 2. Instruments — the legal authority chain (F2.2)

Code: `domain/instruments.rs`; table `instruments`.

Every person held is held under an instrument. `instruments.status`: `verified` | `pending` | `rectification_pending` | `superseded`; plus `authenticated`, `verification_note`, `verified_by`, `superseded_by`, `supersede_reason`. Two entry points: `record_instrument` (received now) and `expect_instrument` (known outstanding, the honest "convicted without warrant" state UPS tracks); `sync_pending_flag` reconciles expected-and-now-received.

Jurisdiction-neutral rows in the core: `kind`, `issuing_authority`, `reference`, `issued_on`, received date, verification. The *enumeration of kinds* is a jurisdiction-pack matter (`JURISDICTIONS.md`); Uganda's are in `research/findings.md`.

An instrument is editable only by supersession with a reason (W18; P10). This is the base of the whole document model (`product/documents.md`).

### 3. Sentence and clocks — the computation domain (F2.3)

Code: `domain/sentences.rs`; table `sentences`.

- Term stored as pronounced: `term_years`, `term_months`, `term_days`, or `is_life` (no term). Release dates are computed by **calendar arithmetic, never a day count**.
- `starts_on`, `remission_forfeited_days` (s.85), `superseded_at` (corrections supersede; one active row per prisoner).
- `compute_clocks()` derives from prisoner state + active sentence + now: entitlement, review marks (`review_marks_passed` feeds the s.88 / parole cycle F2.8).
- Remand (no sentence yet) is handled through clocks tied to the court diary and the mandatory-bail thresholds in the obligations engine.

**Uganda-specific numbers live in the obligations engine, not the core.** `domain/obligations.rs` currently hardcodes the 60/180-day mandatory-bail thresholds (Art. 23(6)) inside its procedure derivation. When a jurisdiction pack exists, these become pack data; until then they stay in the engine and `product/status.md` marks them.

### 4. Court diary — production and outcome (F2.4)

Code: `domain/court_productions.rs`; table `court_productions` (0023 adds `state`, `outcome`, `outcome_notes`, `next_date`).

A production is scheduled ahead, then its outcome is applied. `state`: `scheduled` | `produced` | `not_produced` | `cancelled`. Outcomes (remand extended → new `next_date`; bail / acquittal / dismissal → discharge; conviction → new instrument and sentence) are applied to the spine, not just recorded. `list_remand` produces the s.118 list. Production method (physical / virtual) is a field, not a domain (../research/findings.md §11.2; 19+ prisons).

### 5. Transfer — the two-ended movement (F2.6, W5)

Code: `domain/transfers.rs`; table `transfers` rebuilt in 0023 (direction `out`/`in`, per-facility side).

Lifecycle: `prepare` (checklist, property packed, documents) → `dispatch` (`in_transit`; custody stays with the prison officer, s.73(5)) → sealed **dossier** (`export_dossier` / `import_dossier`, encryption + digest) → `confirm_arrival` on the receiving side with property check → both stays closed accordingly and `episode_id` carried on. Receipts (`export_receipt` / `import_receipt`) close the loop. Failure paths (no confirmation, arrival without dossier, refusal) are designed in `product/02` W5.

### 6. Discharge — entitlement with exception (F2.5, W4)

Code: `domain/releases.rs`; 0023 adds `basis`, `authorised_by`, `exception_reason`, `exception_gates`, `after_noon`.

`assess()` returns the gate assessment (property outstanding, documents pending, other holds; s.83 before-noon). A gate not met may be **waived by an OIC-authorised exception with a recorded reason** (D13, superseding the hard-block decision in spec 0002) because a hard block can cause unlawful detention; waived gates become obligations. The release closes the stay and episode (`exit_kind` discharge).

### 7. What connects the spine — obligations, audit, search

- **Obligations** (`obligations.rs`, table `obligation_resolutions`): derived per prisoner or per procedure, keyed by a stable derivation key; only the human *response* is stored. This is what the Today queue and the exception list surface.
- **Audit** (`audit.rs`): every write attributed, before/after state captured, hash-chained; `verify_chain()` gives tamper evidence. Nothing in the spine is deleted.
- **Search** (`search.rs`): a single cross-domain query covers person, visit, request, production, release, transfer, health, property, programme.

## State of the spine (authority: `product/status.md`)

| Part | State |
|---|---|
| episode + stays + one-open-stay | `implemented` (node) |
| reception procedure | `implemented` (node); guided ProcedureShell UI is stage 2–3 |
| instruments with verification/supersession | `implemented` (node) |
| sentence + clocks + review marks | `implemented` (node); statutory edge cases `research` R-05 |
| court diary with outcomes | `implemented` (node) |
| two-ended transfer + dossier + receipt | `implemented` (node) |
| discharge with exception | `implemented` (node) |
| jurisdiction-pack data (thresholds, kinds) | `research` — currently inline in core; `JURISDICTIONS.md` |

## Rule

The spine is forward-only and reconciled: a correction supersedes, never overwrites (W18; Second Schedule record offences). Any change to this model changes `0023`-era migrations by migration, records the contradiction publicly in `product/status.md`, and ships the doc and the code in the same change (vault rule).