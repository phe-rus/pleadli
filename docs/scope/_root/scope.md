# Scope: _root (shared packages & monorepo tooling)

Repo wide infrastructure the four apps and `www` all depend on: the Turborepo/Bun workspace setup, and the three shared packages (`@pleadli/ui`, `@pleadli/forms-tables`, `@pleadli/rich-text`). Nothing here is institution specific.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** Beta · override (inherits GA project default everywhere else, but tooling and config work here isn't compliance sensitive the way custody or charge records are. `/check verify` then `/test` is enough rigor, no fresh model review needed).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Design system (`@pleadli/ui`) | Existing | existing |
| 2 | Data tables & forms (`@pleadli/forms-tables`) | Existing | existing |
| 3 | Rich text (`@pleadli/rich-text`) | Existing | existing |
| 4 | Root & nested AGENTS.md | Foundation | planned |
| 5 | CI pipeline | Foundation | planned |
| 6 | Turbo task definitions for lint/format/typecheck | Foundation | planned |

## Existing

### 1. Design system (`@pleadli/ui`) · existing
~39 shadcn style primitives (Button, Card, Dialog, Drawer, Sidebar, DataTable's Table, Combobox, Select, etc.) plus the oklch light/dark theme and `typeset.css`. Consumed by all four apps and `www`. code in `packages/ui/src/`

### 2. Data tables & forms (`@pleadli/forms-tables`) · existing
`DataTable` (sorting, filtering, pagination, row selection, bulk actions) plus the shared `useAppForm` field registry (text/select/checkbox/multiselect/textarea). code in `packages/forms-tables/src/`

### 3. Rich text (`@pleadli/rich-text`) · existing
Tiptap based `RichTextInput`/`RichTextPreview` + toolbar, the package that replaced an earlier Lexical based `packages/lexical-text` (fully migrated, zero references left). code in `packages/rich-text/src/`

## Foundation

### 4. Root & nested AGENTS.md · needs a decision
No root `AGENTS.md` exists at all. `www/AGENTS.md` is the only one present, and it currently holds nothing but an auto generated tool listing, no authored conventions. `apps/dpp`, `apps/police`, `apps/prisons`, and `packages/*` have none. Every later `/architect`/`/develop` run in this repo is working from `docs/*/PRODUCT.md` alone rather than a captured stack/convention doc.
**Done when:** a root `AGENTS.md` records the shared stack (Bun workspaces, Turborepo, Tauri + sqlx pattern, TanStack Start) and each workspace has a nested `AGENTS.md` with its own real conventions, `www/AGENTS.md` rewritten from a bare tool listing into actual authored content.
- [ ] Capture it: `/audit`

### 5. CI pipeline · needs a decision
No `.github/workflows` exist. Nothing gates a PR on build, lint, typecheck, or test today.
**Done when:** a PR against `main` runs build + typecheck (and lint/test once they exist) for every touched workspace, and a red check blocks merge.
- [ ] Design it (spec): `/architect CI pipeline`

### 6. Turbo task definitions for lint/format/typecheck
Root `package.json` scripts call `turbo lint`, `turbo format`, and `turbo typecheck`, but `turbo.json` only defines `dev`, `build`, `check`, and `deploy` tasks. These three either fall through to uncached, unconfigured behavior or silently do nothing per workspace, not verified which.
**Done when:** `turbo.json` has explicit `lint`/`format`/`typecheck` task entries with correct `dependsOn`/`outputs`, and `bun run lint`/`format`/`typecheck` from the root actually run something real in every workspace that defines the matching script.
- [ ] Build it: `/develop turbo task definitions`
