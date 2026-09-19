# Pleadli Prisons

This folder is the Prisons **vault**: product truth, research, craft, and the staged plan. Open it as a vault in Obsidian if you like. Git is still the source of truth.

Police, DPP, Courts, and Lawyers will use the same vault shape later. **This vault is Prisons only.** Do not fold other institutions into these notes.

## Start here

1. [[PLAN]] — what we do next, in what order, and what “done” means for each stage.
2. [[product-map/README|Product map]] — what a prison is, how facility and Head Office operate. Implementation contract.
3. [[craft/README|Craft]] — how the app is written and how it should feel.

If a note and the code disagree, the code is what ships. Fix the note in the same change.

## Map of content

```
docs/prisons/
  README.md                 this home
  PLAN.md                   stages, not a backlog dump
  PRODUCT.md                research product model (partly superseded)
  RESEARCH.md               evidence
  craft/                    how we build and how it feels
  product-map/              operating model (canonical)
  capabilities-*.md         older capability notes, still useful for citations
```

### Product

| Note | Use it for |
|---|---|
| [[product-map/README]] | Canonical operating model, principles P1 to P12 |
| [[product-map/01-product-and-operating-models]] | Obligations, facility rhythm, HQ role |
| [[product-map/02-capabilities-domains-workflows]] | What to build, what is provisional |
| [[product-map/08-application-structure]] | Navigation and screen patterns |
| [[product-map/07-implementation-gap]] | Intended vs built (can lag the code) |
| [[PRODUCT]] | Statutory citations and research narrative |
| [[RESEARCH]] | Sources. Contamination rule lives here |

### Craft (how we work)

| Note | Use it for |
|---|---|
| [[craft/code]] | Cleanliness, routes, features, TanStack |
| [[craft/interface]] | Obsidian-like UX, motion, simpler tasks |
| [[craft/languages]] | Paraglide: English, Swahili, German, Chinese, French |
| [[craft/intelligence]] | AI later, TanStack AI, own key or account |

### Scope and specs (outside this vault, still linked)

- [Scope](../scope/prisons/scope.md) — feature rows the pipeline reads
- [Specs](../specs/prisons/) — load-bearing build decisions

## One idea that holds the vault together

A prison file is a **linked legal notebook**, not a CRM. The officer finds a person, follows links (warrant, court date, property, visit), finishes the obligation in front of them, and leaves a record that another officer can trust.

That is why the docs look like a vault, and why the app should feel closer to Obsidian than to a form builder.

## Languages of this vault

Notes are written in English. The running app’s officer-facing strings will go through Paraglide ([[craft/languages]]). Statute names stay in the language of the source until a jurisdiction pack translates them.
