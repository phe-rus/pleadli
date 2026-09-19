# Pleadli Prisons — Product Model (authoritative)

> **Canonical.** This is the one note that says what the product is. It supersedes the 2026-09-18 research-narrative `PRODUCT.md` and the search-and-replace history below it: that research, its statutory citations and its evidence labels are preserved in `research/findings.md` and are reused here by reference.
>
> **Allies in this vault.** `README.md` is the home; `PLAN.md` is the staging; `product/status.md` is the single source of truth for *what is built*; `product/01-…` and `product/02-…` hold the operating model, capability and domain maps; `product/principles.md` holds principles P1–P12 and decisions D1–D14; `product/custody-spine.md` holds the canonical custody model; `ARCHITECTURE.md`, `UX.md`, `LOCALIZATION.md`, `AI.md`, `SECURITY.md`, `JURISDICTIONS.md` are the craft.

The research finding that still anchors everything: **a prison facility is a continuously operating institution, not a place where people are stored and moved.** Pleadli Prisons is software for running one prison facility — the custody and welfare responsibility for each person, and the day-to-day coordination and record-keeping the institution itself requires. It is a facility tool first; Head Office is a second operating environment, never a second copy of the facility.

One custody episode is a thread. Each facility owns the record of its own stay. That is the whole spine.

## What Pleadli Prisons is NOT

- A national UPS database or a PMIS replacement (PMIS is UPS's own; Pleadli is one vendor's answer to the gap PMIS has not closed).
- Police or DPP with different labels.
- A health-records or clinical system; Prisons coordinates *around* health movements, it does not direct clinical care.
- A coronial/inquest-management system.
- A general calendar, task manager, or attendance app — scheduling exists only in service of a real workflow (court attendance).
- A disciplinary-tribunal system built from unverified regulation text.
- A claim that one jurisdiction's practice is another's. The shared core is jurisdiction-neutral; Uganda's law is a *pack* (see `JURISDICTIONS.md`).

## The fundamental structure

Two levels the product must always answer to:

- **Person level** — what is happening with this person: legal authority for their custody, the sentence/remand clocks, movements, visits, health, rehabilitation, property, requests, documents.
- **Facility level** — what is owed right now and what is due next: the obligation queue, the population as-of, court and review dates, movements crossing the wall today, returns and oversight duties.

The **unit of design is the obligation, not the record.** The interface leads with what is owed, by whom, by when, with what proof (`principles.md` P6). Records are produced as a consequence of performing real procedures, never as tables to be filled.

## The information model

The app is a **legal notebook** that runs a prison, not a CRM. It is *Obsidian-inspired*, meaning the information model, not the visuals: notes (documents) are first class; everything cross-references; search and a command palette are the primary way to get anywhere; a prisoner file reads as one page with backlinks, not a stack of CRUD forms. See `UX.md`.

### Documents are first class

- **Instruments** — legal documents that establish legal effect (commitment, remand warrant, conviction, order of detention, court outcome). First-class records with states: `verified`, `pending verification`, `rejected`, `expired`, `superseded`, `missing` (see `product/custody-spine.md` for the built subset). Instrument fields are editable only with a mandatory reason; the original is preserved and superseded, never overwritten.
- **Registers** — statutory institutional records, kept as *views over records*, printable. Registers are first-class object types with an identity of their own (name, legal basis, purpose, records, responsible role, retention, audit, and which reports read them). The register list is evidenced; most register *field schemas* are unknown and are not invented here (`product/registers.md`).
- **Generated documents** — admission, release order, s.118 list, transfer dossier and receipt, monthly return, produced from structured data and printable. Dispatch and receipt of documents is tracked.
- The vault is the attachment home for each of these.

### Sentence and remand are the load-bearing domain

The person's custody exists under continuous legal authority, and the app's duty is to keep that authority *true*: instrument received and verified, sentence term and start correctly held, clocks computed by calendar arithmetic (never a day count), remission earned and forfeited, entitlement and review dates derived, court productions discharged and outcomes applied, discharge executed on entitlement or court order — not a day late, because a prison that overholds detains unlawfully. This is `product/custody-spine.md` in full.

### Obligations drive everything

Every statutory duty with a due date is a typed obligation with a stable derivation key, evidence requirements, and an "action taken" response. Obligations are *derived from records*, never stored as a second copy of a fact; what is stored is the human response (acted on, waived with a reason). See `product/01-…` (A.3) and `product/status.md` (S4).

## Core and jurisdiction

The model is split so the same product runs in other jurisdictions without carrying Uganda's law into the core:

- **Core** — person, facility, custody spine, officer, legal authority, document, transfer, court appearance, health movement, visit, property, release, audit, institution, workflow. What a prison is anywhere.
- **Jurisdiction pack** — instruments and their categories, legal categories (convicted/unconvicted/civil vs equivalents), sentence computation and remission, remand rules and thresholds, release rules, deadlines, statutory registers and returns, terminology, identity documents, hierarchy, statutory citations. Legislation and forms live in the pack, not the core. See `JURISDICTIONS.md`.

Uganda is the first production jurisdiction. Kenya, Tanzania, Rwanda, South Sudan and Germany are research targets; their pages record a boundary, not a config.

## The two operating environments

- **Facility node** — one prison, offline-first, authoritative for its own operational records. Works on one machine or a facility LAN; connectivity extends it, nothing ordinary depends on it (P7).
- **Head Office** — a read-model aggregator. It never edits a facility's operational record and holds no prisoners of its own; it pairs, verifies, coordinates transfers, receives and attests returns, routes decisions and directives, audits the network. Connection is not visibility: a paired facility discloses only what a rule discloses (P3, tiers T0–T4 in `product/03-…`).

## Status authority

Nothing in `PRODUCT.md` claims a build state. For what is built, verified, or deferred, read `product/status.md`; it is checked against the code, and the code wins. `PLAN.md` stages change always happen against that authority.

## Final test

Before any piece of work is called done:

> Could a prison officer actually use this during their shift? Does it help them know what is happening, coordinate people and activities, and preserve the institutional record — using only what has actually been verified about how this institution works, not a plausible-sounding guess?