# Jurisdictions — core vs. jurisdiction packs

The product model (`PRODUCT.md`) splits into a jurisdiction-neutral **core** and **jurisdiction packs**. This note is the canonical map of that split and the boundary of each research target.

## The split

**Core** (built once, jurisdiction-neutral): person and identity, facility, custody spine (episode/stay/transfer/discharge), officer/account/device, legal authority (instrument as a *kinded* document), court appearance, health movement, visit, property, release, audit, institution, workflow, document/register object types, obligation engine.

**Jurisdiction pack** (data + rules + terminology, per jurisdiction): instrument kinds and their categories, legal categories (convicted/unconvicted/civil or equivalent), sentence computation and remission rules, remand rules and deadline thresholds, release rules, statutory registers and returns, terminology and citation style, identity documents, hierarchy (regions/districts/units), statutory citations.

Rules live in the pack; the engine computes. Uganda's current numbers (60/180 mandatory-bail thresholds, one-third remission, s.88 cycle) are inline in the core engine today and move into the pack when packs exist (see `product/custody-spine.md`).

## The rule that governs every page below

> A real prison runs under the law of a **particular** jurisdiction. Nothing is a "generic prison". A capability is *core* only if a prison of any of these jurisdictions needs it; anything specific to one law is a pack.

## Uganda — first production jurisdiction

The one normative jurisdiction for current implementation. Statutory basis and evidence: `research/findings.md` (the Prisons Act research corpus, contamination rule at §11.0). Registers/returns that attach here are read from Uganda's Act; other jurisdictions do not inherit them.

## Research targets — pages are a boundary, not a config

- `jurisdictions/kenya` — real starting point is the **Prisons and Correctional Services Act, 2024**. Not "Uganda's Act with Kenyan labels". Research state: `research`.
- `jurisdictions/tanzania`, `jurisdictions/rwanda`, `jurisdictions/south-sudan` — named targets; no law has been read; `research`.
- `jurisdictions/germany` — **not one uniform Strafvollzug**: prison law is largely *Land* (16 states) law on a federal frame. There is no "German config". The page documents the boundary so nothing invents a single German penal statute.
- Any pack stops being `research` and becomes `designed` only when the specific statutes are read and cited in that jurisdiction's page (evidence rule: same contamination discipline as `research/findings.md` §11.0).

## Localization is not jurisdiction

A locale (UI language via `LOCALIZATION.md`) is orthogonal to a jurisdiction pack (law). Swahili in the interface does not mean Tanzanian law; German chrome does not mean German law. Statute names stay in the language of the source until a jurisdiction pack translates them.