# Scope: Pleadli monorepo

Pleadli is a family of purpose built apps for Uganda's justice system (Police, DPP, Courts, Lawyers, Prisons), plus Pleadli Cloud (`www/`), the multi tenant admin platform that manages institutions across all of them. Each workspace plans separately below; shared packages and monorepo tooling plan in `_root`.

**Build approach:** Tracer Bullet (each feature ships end to end through every layer before the next starts). The project default across every workspace.
**Workflow:** GA (after `/develop`: `/check verify`, `/test`, a fresh model `/check review`, then `/document`; most features treated as needing a spec first). The project default, since this platform handles real custody, charge, and prisoner records.

_These are recommendations to keep the build orderly, not requirements. A workspace or feature can override either (see its own scope file)._

## Workspaces

| Workspace | Status | Features (existing / planned / total) | Scope |
|---|---|---|---|
| `apps/police` | fully caught up with its own product doc, no planned next slice | 23 existing / 0 planned / 23 | [police/scope.md](police/scope.md) |
| `apps/dpp` | built, 3 real gaps vs its product doc queued as the next slice | 14 existing / 3 planned / 17 | [dpp/scope.md](dpp/scope.md) |
| `apps/prisons` | a 2026-09-18 audit found 2 features claimed done that weren't (Reports, Search); 7 features queued to fix that plus real government adoption gaps | 14 existing / 7 planned / 21 | [prisons/scope.md](prisons/scope.md) |
| `www` (Pleadli Cloud) | built, one feature mid way, several candidate gaps deferred pending a decision | 6 existing / 1 in-progress / 7 | [www/scope.md](www/scope.md) |
| `_root` (shared packages + monorepo tooling) | packages stable; foundational tooling (AGENTS.md, CI) missing entirely | 3 existing / 3 planned / 6 | [_root/scope.md](_root/scope.md) |

## Not yet started

`docs/courts/RESEARCH.md` and `docs/lawyers/RESEARCH.md` exist (domain and legal research only), but neither has a `PRODUCT.md` and neither has an `apps/*` workspace yet. There is nothing built to enroll and no product model to plan against yet. Note: `www`'s own `/docs/applications` marketing copy currently describes Courts and Lawyers as "Designed, not yet built," which overstates where they actually are (research only, not designed). Worth a copy fix, flagged here rather than silently corrected. Planning either as a real workspace is a `/scope <workspace> <idea>` run of its own, once a `PRODUCT.md` exists (or as part of writing one).

| Workspace | Status |
|---|---|
| `courts` | research only, no product doc, no code |
| `lawyers` | research only, no product doc, no code |

## Legend

- `existing`: built before this workflow existed; `/develop` and `/sync` leave these alone.
- `in-progress`: partially built; finish via `/develop`.
- `planned`: not started; the next slice queued in that workspace's scope.
- Every workspace here is brownfield: no root `AGENTS.md` exists yet (only `www/AGENTS.md`, and that file is currently just an auto generated tool listing with no authored conventions). See `_root/scope.md` feature 1. Run `/audit` before deep `/architect`/`/develop` work if you want real project context captured first.
