# Jurisdictions — core vs. jurisdiction packs

The product model (`PRODUCT.md`) splits into a jurisdiction-neutral **core** and **jurisdiction packs**. This note is the canonical map of that split and the boundary of each research target.

## The split

**Core** (built once, jurisdiction-neutral): person and identity, facility, custody spine (episode/stay/transfer/discharge), officer/account/device, legal authority (instrument as a *kinded* document), court appearance, health movement, visit, property, release, audit, institution, workflow, document/register object types, obligation engine.

**Jurisdiction pack** (data + rules + terminology, per jurisdiction): instrument kinds and their categories, legal categories (convicted/unconvicted/civil or equivalent), sentence computation and remission rules, remand rules and deadline thresholds, release rules, statutory registers and returns, terminology and citation style, identity documents, hierarchy (regions/districts/units), statutory citations.

Rules live in the pack; the engine computes. Since 12 October 2026, `domain/jurisdiction.rs` holds Uganda's implemented remand, remission, parole and review parameters. Sentence clocks, legal queues, prisoner files and discharge assessments receive the rules selected from the installation profile. An unsupported jurisdiction or a country mismatch stops these calculations. Uganda remains the only operational pack.

## The rule that governs every page below

> A real prison runs under the law of a **particular** jurisdiction. Nothing is a "generic prison". A capability is *core* only if a prison of any of these jurisdictions needs it; anything specific to one law is a pack.

## Uganda — first production jurisdiction

The one normative jurisdiction for current implementation. Statutory basis and evidence: `research/findings.md` (the Prisons Act research corpus, contamination rule at §11.0). Registers/returns that attach here are read from Uganda's Act; other jurisdictions do not inherit them.

## Rollout order, 12 October 2026

1. Uganda, default for new installations and the current operational jurisdiction.
2. Democratic Republic of the Congo, code `cd`. Planned, with its own legal research, court instruments, terminology, regional structure and time zones. French language selection does not activate this jurisdiction.
3. Kenya, code `ke`. Planned, with separate statutes, case law, custody procedures and acceptance cases. Swahili language selection does not activate this jurisdiction.
4. Other countries later.

The settings page, Law and jurisdiction, shows this order. Planned entries cannot be selected or used for computation. The frontend refuses unknown stored ids instead of silently substituting Uganda. Setup and profile writes validate country against the operational pack. Facilities and Head Office remain usable offline; this does not require cloud connectivity.

## Source versions and release work

Current in-app Prisons Act citations follow the original 2006 numbering in the [Ministry of Internal Affairs text](https://www.mia.go.ug/sites/default/files/resources/Prisons%20Act%20Uganda%202006.pdf). The [Judicial Service Commission handbook](https://www.jsc.go.ug/publications/citizens-handbook-english-version/) describes constitutional mandatory bail. The [2023 consolidated text](https://ulii.org/en/akn/ug/act/2006/17/eng%402023-12-31) uses different section numbers. A release needs a reviewed mapping of source edition, amendments and applicable judgments; source links do not establish complete legal compliance. Local source metadata is available offline, while opening source websites needs a connection.

Remission eligibility now compares the term end with one calendar month after the start, rather than 30 days. Fractional remission, multiple sentences, remand credit, life imprisonment, trial commencement and the discharge holiday calendar remain legal validation work. A calculated threshold or date is not an order to release.

## Research targets, pages are a boundary, not a config

- Kenya: start from the official [Prisons Act, Cap. 90](https://new.kenyalaw.org/akn/ke/act/1962/49) and verify current amendments, subsidiary legislation and applicable judgments. Earlier notes naming a Prisons and Correctional Services Act, 2024 have not been verified and are not an implementation basis. Research state: `research`.
- DR Congo: obtain current authoritative penitentiary and criminal procedure texts and amendment history before implementing rules. The historic Ordonnance 344 of 17 September 1965 is a research lead, not a verified current rule pack. Research state: `research`.
- `jurisdictions/tanzania`, `jurisdictions/rwanda`, `jurisdictions/south-sudan` — named targets; no law has been read; `research`.
- `jurisdictions/germany` — **not one uniform Strafvollzug**: prison law is largely *Land* (16 states) law on a federal frame. There is no "German config". The page documents the boundary so nothing invents a single German penal statute.
- Any pack stops being `research` and becomes `designed` only when the specific statutes are read and cited in that jurisdiction's page (evidence rule: same contamination discipline as `research/findings.md` §11.0).

## Localization is not jurisdiction

A locale (UI language via `LOCALIZATION.md`) is orthogonal to a jurisdiction pack (law). Swahili in the interface does not mean Tanzanian law; German chrome does not mean German law. Statute names stay in the language of the source until a jurisdiction pack translates them.