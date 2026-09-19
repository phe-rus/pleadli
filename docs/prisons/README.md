# Pleadli Prisons

This folder is the Prisons **vault**: product truth, research, craft, and the staged plan. Open it as a vault in Obsidian if you like. Git is still the source of truth.

Police, DPP, Courts, and Lawyers will use the same vault shape later. **This vault is Prisons only.** Do not fold other institutions into these notes.

## Start here

1. [[PLAN]] — what we do next, in what order, and what “done” means for each stage.
2. [[PRODUCT]] — what the product is. Authoritative product model.
3. [[product/principles|Product principles]] — principles P1 to P12, decisions, operating-model contract.
4. [[product/status|Status]] — what is actually built (single source of truth).
5. [[ARCHITECTURE]] and [[UX]] — how the app is written and how it should feel.

If a note and the code disagree, the code is what ships. Fix the note in the same change.

## Map of content

```
docs/prisons/
  README.md                 this home
  PLAN.md                   stages, not a backlog dump
  PRODUCT.md                what the product is (canonical)
  UX.md                     how it feels (Obsidian-like)
  ARCHITECTURE.md           how it is written
  LOCALIZATION.md           Paraglide languages
  AI.md                     AI seam and boundaries
  SECURITY.md               threat model and blockers
  JURISDICTIONS.md          core vs jurisdiction packs
  product/                  operating model (canonical): principles, capability map,
                            custody spine, status, registers, documents, 01–09
  research/                 evidence: findings, backlog, capabilities-*.md
  ux/                       navigation and screen notes
  ai/                       AI deep detail
  jurisdictions/            one folder per jurisdiction (uganda norm, others research)
```

### Product

| Note | Use it for |
|---|---|
| [[product/principles]] | Principles P1–P12, decisions D1–D14, operating-model contract |
| [[product/01-product-and-operating-models]] | Obligations, facility rhythm, HQ role |
| [[product/02-capabilities-domains-workflows]] | What to build, what is provisional |
| [[product/custody-spine]] | Canonical custody model (episode, stays, instruments, sentence, clocks, transfer, discharge) |
| [[product/registers]] | Registers as first-class objects |
| [[product/documents]] | Document object model (instruments vs generated documents) |
| [[product/08-application-structure]] | Navigation and screen patterns |
| [[product/status]] | Intended vs built (single status authority) |
| [[research/findings]] | Evidence, statutory citations, contamination rule |

### Craft (how we work)

| Note | Use it for |
|---|---|
| [[ARCHITECTURE]] | Cleanliness, routes, features, TanStack |
| [[UX]] | Obsidian-like UX, motion, simpler tasks |
| [[LOCALIZATION]] | Paraglide: English, Swahili, German, Chinese, French |
| [[AI]] | AI later, TanStack AI, own key or account |
| [[ux/navigation]] | Navigation and screen proposals (history) |

### Scope and specs (outside this vault, still linked)

- [Scope](../scope/prisons/scope.md) — feature rows the pipeline reads
- [Specs](../specs/prisons/) — load-bearing build decisions

## One idea that holds the vault together

A prison file is a **linked legal notebook**, not a CRM. The officer finds a person, follows links (warrant, court date, property, visit), finishes the obligation in front of them, and leaves a record that another officer can trust.

That is why the docs look like a vault, and why the app should feel closer to Obsidian than to a form builder.

## Languages of this vault

Notes are written in English. The running app’s officer-facing strings will go through Paraglide ([[LOCALIZATION]]). Statute names stay in the language of the source until a jurisdiction pack translates them.
