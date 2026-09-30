# Scope: Pleadli monorepo

Pleadli is a family of purpose built apps for Uganda's justice system (Police, DPP, Courts, Lawyers, Prisons), plus Pleadli Cloud (`www/`), the multi tenant admin platform that manages institutions across all of them. Each workspace plans separately below; shared packages and monorepo tooling plan in `_root`.

**Build approach:** Tracer Bullet (each feature ships end to end through every layer before the next starts). The project default across every workspace.
**Workflow:** GA (after `/develop`: `/check verify`, `/test`, a fresh model `/check review`, then `/document`; most features treated as needing a spec first). The project default, since this platform handles real custody, charge, and prisoner records.

_These are recommendations to keep the build orderly, not requirements. A workspace or feature can override either (see its own scope file)._

## Workspaces

| Workspace | Status | Features (existing / planned / total) | Scope |
|---|---|---|---|
| `apps/police` | fully caught up with its own product doc; the small security bug found via a cross check is fixed; a real, unstarted gap (attachment vault sealing, no audit chain) is on the SQLCipher work now uncommitted in the tree | 24 existing / 24 | [police/scope.md](police/scope.md) |
| `apps/dpp` | built, 3 real gaps vs its product doc queued as the next slice | 14 existing / 3 planned / 17 | [dpp/scope.md](dpp/scope.md) |
| `apps/prisons` | a 2026-09-18 audit found 2 features claimed done that weren't (Reports, Search, now in progress); a Head Office and peer prison sync network was added as a deliberate scope reversal from the engineer, now blocked on `_root`'s officer identity decision | 14 existing / 1 in-progress / 7 planned / 22 | [prisons/scope.md](prisons/scope.md) |
| `apps/courts` | far past "research only" (that status here was stale): register through returns all built and tested, sectioned Settings added 2026-09-22; the real open items are DPP/Prisons interchange, roles, and D10 field validation with a real magistrate and clerk | 14 existing / 24 | [courts/scope.md](courts/scope.md) |
| `apps/lawyers` | app lock built end to end (spec 0001), Settings resectioned, notes on rich text; per-matter access control and OS native auth explicitly deferred | 3 existing / 3 | [lawyers/scope.md](lawyers/scope.md) |
| `www` (Pleadli Cloud) | built, one feature mid way, several candidate gaps deferred pending a decision | 6 existing / 1 in-progress / 7 | [www/scope.md](www/scope.md) |
| `_root` (shared packages + monorepo tooling) | packages stable; foundational tooling (AGENTS.md, CI) missing entirely; officer identity and sign in designed and spec captured, ready to build | 3 existing / 1 in-progress / 3 planned / 7 | [_root/scope.md](_root/scope.md) |

## Legend

- `existing`: built before this workflow existed; `/develop` and `/sync` leave these alone.
- `in-progress`: partially built; finish via `/develop`.
- `planned`: not started; the next slice queued in that workspace's scope.
- Every workspace here is brownfield: no root `AGENTS.md` exists yet (only `www/AGENTS.md`, and that file is currently just an auto generated tool listing with no authored conventions). See `_root/scope.md` feature 1. Run `/audit` before deep `/architect`/`/develop` work if you want real project context captured first.
