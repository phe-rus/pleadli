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
| 5 | CI pipeline | Foundation | in-progress |
| 6 | Turbo task definitions for lint/format/typecheck | Foundation | in-progress |
| 7 | Officer identity & sign in | Foundation | in-progress |
| 8 | Workspace styles in one place | Existing | existing |
| 9 | Code health pass | Stage 0 | planned |
| 10 | Performance and size budgets | Stage 0 | planned |
| 11 | Shared platform core | Stage 2 | planned |
| 12 | Roles and permissions | Stage 2 | planned |
| 13 | Command palette | Stage 2 | planned |

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

### 5. CI pipeline · Stage 0, do this first
Only `.github/workflows/release.yml` exists (it builds signed Windows installers). Nothing gates a pull request on typecheck, `cargo test`, clippy, or build size today. This is the cheapest fix with the widest effect, so it comes before every other stage.
**Done when:** a PR against `main` runs typecheck, `cargo test` and `cargo clippy` for every touched workspace, fails when a bundle passes its size budget, and a red check blocks merge.
- [x] Design it (spec): `/architect CI pipeline`
- [ ] Build it: `/develop CI pipeline`
  - [x] Thin thread: `ci.yml` with triggers, concurrency, typecheck and the aggregate `ci` gate (satisfies AC-1, AC-6, AC-7)
  - [x] Change detection in bash with its bun test, wired to typecheck (satisfies AC-1, AC-2, AC-8, AC-10)
  - [ ] Rust jobs: pinned toolchain, system packages, cache, `cargo test`, clippy ratchet and baseline (satisfies AC-2, AC-3)
    - Note: job and ratchet written, baseline seeded from real clippy runs of all 5 apps. Toolchain is NOT pinned (engineer's call, a pinned file could break release.yml), so CI uses stable. `cargo test` not yet run on a runner.
  - [ ] Size gate: `size.ts`, `budgets.json` measured on CI, size matrix job (satisfies AC-4, AC-5, AC-6)
    - Note: script, test and matrix job written. `budgets.json` values are `null` (not enforced) until a CI run measures them.
  - [x] Pin actions by SHA, document the branch protection step (satisfies AC-9, AC-10)
- [ ] Verify it: `/check verify CI pipeline`
- [ ] Test it: `/test CI pipeline`
Spec [0002](../../specs/_root/0002-ci-pipeline.md) · code in `.github/workflows/ci.yml`, `toolings/ci/`, `docs/CI.md`

### 6. Turbo task definitions for lint/format/typecheck
Root `package.json` scripts call `turbo lint`, `turbo format`, and `turbo typecheck`, but `turbo.json` only defines `dev`, `build`, `check`, and `deploy` tasks. These three either fall through to uncached, unconfigured behavior or silently do nothing per workspace, not verified which.
**Done when:** `turbo.json` has explicit `lint`/`format`/`typecheck` task entries with correct `dependsOn`/`outputs`, and `bun run lint`/`format`/`typecheck` from the root actually run something real in every workspace that defines the matching script.
- [x] Build it: `/develop turbo task definitions`
  - Note: `lint`, `format`, `typecheck` are declared in `turbo.json`; root `typecheck` runs the workspaces' existing `check` script (real, 11 of 11 pass). No workspace defines `lint` or `format` yet, so those two run nothing until a linter and formatter are chosen (owed to `/architect`).
- [ ] Verify it: `/check verify turbo task definitions`

### 7. Officer identity & sign in
Promoted from deferred 2026-09-18: Police, DPP, and Prisons are all no sign in, single officer desktop apps today. Two features now depend directly on a real answer here rather than a placeholder: the audit trail (`docs/scope/prisons/scope.md` feature 19, who changed a record and when) and, the immediate trigger, Head Office facility approval for the Prisons peer sync network (feature 22 in the same file) — the engineer explicitly chose to settle this first rather than record an approver as a free text name. Cross app on purpose: designing it three times, once per app, risks three incompatible answers to the same question.
**Done when:** an officer can be identified for real in at least Prisons (Police and DPP can adopt the same model afterward), and a Head Office approval action or an audit trail entry records a real identity, not free text.
- [x] Design it (spec): `/architect officer identity & sign in`
- [x] Build it: `/develop officer identity & sign in`
  - [x] Prisons officer identity backend: `officers` table, Argon2 hashing, `login`, per action admin credential checks, the last admin guard, and the session domain (satisfies AC-1 through AC-8)
  - [x] Prisons officer identity frontend: an Officer management screen, the badge only lookup component, and the Head Office sign in gate including the bootstrap first admin flow (satisfies AC-1, AC-2, AC-4 through AC-7)
  - [x] DPP prosecutor profile: migration, domain, settings screen, wired onto the printable Charge Sheet (satisfies AC-9)
  - [x] Migrations applied and confirmed live in both apps (satisfies AC-1, AC-9)
- [ ] Verify it: `/check verify officer identity & sign in`
- [ ] Test it: `/test officer identity & sign in`
Spec [0001](../../specs/_root/0001-officer-identity-sign-in/index.md) · code in `apps/prisons/src-tauri/src/domain/{officers,session}.rs`, `apps/prisons/src/features/{officers,session}/`, `apps/prisons/src/components/hq-sign-in-gate.tsx`, `apps/prisons/src/routes/_public/settings/`, `apps/dpp/src-tauri/src/domain/prosecutor_profile.rs`, `apps/dpp/src/features/prosecutor-profile/`, `apps/dpp/src/routes/_public/settings/`

## Existing, added 2026-11-17

### 8. Workspace styles in one place · existing
Page layout, side panels, paper and print rules now live once in `packages/ui/src/styles/pages.css`. Each app's `globals.css` holds only its accent (Courts also sets `--page-max`). Only the Police build was checked after the move. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` record the product and the look. code in `packages/ui/src/styles/`, `apps/*/src/styles/globals.css`

## Stage 0: hygiene and gates

### 9. Code health pass
Sort the roughly 1,000 `.unwrap()` calls outside tests (many sit in inline test modules), the 170 uses of `any`, and the four files over 1,000 lines (`police/api/mod.rs`, `dpp/api/mod.rs`, `lawyers/api/mod.rs`, `lawyers/settings/panes.tsx`). Remove the legacy cream palette, the colour transition on every element, and the global scrollbar hiding from `packages/ui`. Archive dated docs that are no longer current.
**Done when:** no production `.unwrap()` remains on a path a user can reach, `any` is gone from shared packages, no source file passes 600 lines without a reason written in the pull request, and the shared styles carry no legacy palette or `*` transition.
- [ ] Build it: `/develop code health pass`

### 10. Performance and size budgets
Set measured limits for cold start, route change, idle memory, installer size and JavaScript per route, then measure today's numbers on the lowest supported machine. The Police web bundle is 3.3 MB with chunks of 530 KB, 409 KB and 335 KB.
**Done when:** a budget file lives in the repo, CI reads it, and each app reports its current numbers against it.
- [ ] Design it (spec): `/architect performance and size budgets`

## Stage 2: shared platform core

### 11. Shared platform core · needs a decision
The five apps repeat the same shell, API skeleton, backup glue, settings and translation wiring. Move the common parts into shared packages and crates so a fix lands once. Do not start before Stage 0 and Stage 1 are done.
**Done when:** a security or behaviour fix to the shell, settings or API skeleton is made in one place and reaches all five apps.
- [ ] Design it (spec): `/architect shared platform core`

### 12. Roles and permissions · needs a decision
Who in an office can see, edit, sign and export. Police roles and vault sealing are known unfinished. Depends on feature 7 (officer identity).
**Done when:** a role can be set per person, enforced by the backend and not only the screen, and every denial is written to the audit record.
- [ ] Design it (spec): `/architect roles and permissions`

### 13. Command palette · needs a decision
One keyboard first search and command box with the same shortcut in every app, the way VS Code and Apple apps work.
**Done when:** one shortcut opens it in every app, it finds records and runs the main actions, and it never exposes anything the current role cannot open.
- [ ] Design it (spec): `/architect command palette`

## Deferred
Real, evidenced findings from a 2026-09-18 Uganda government adoption research pass (`docs/prisons/research/findings.md` §12), cross cutting across the desktop apps rather than owned by one workspace:
- **Police, DPP, Prisons interoperability seam**: JLOS (Uganda's real cross institution justice sector coordination body) runs a live "E-Justice" project whose stated goal is "open standards and APIs for secure data sharing across JLOS institutions," explicitly spanning Police, Judiciary, Prisons, and DPP. Prisons' own Head Office and peer sync network (feature 22 in its scope file) is a first, concrete step in this direction, scoped to inside Prisons only; the wider cross institution picture (Police, DPP, Courts all connecting, DPP and Lawyers staying individual practitioner tools) stays a documented future direction until Courts exists as a real app · needs a decision
- **NITA-U certification posture**: government MDAs reportedly may only use NITA-U certified IT products; unverified with certainty (two direct fetch attempts to NITA-U's certification pages failed) · needs a decision, worth confirming directly with NITA-U before treating as a hard gate
