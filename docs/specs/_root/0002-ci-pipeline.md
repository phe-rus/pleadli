# 0002. Pull request CI pipeline

**Date**: 2026-11-17
**Status**: In Progress

## Summary

Today nothing checks a pull request: only `release.yml` exists, and it builds installers. This decision adds one GitHub Actions workflow, `ci.yml`, that runs on every pull request to `main`. It typechecks the TypeScript workspaces, runs `cargo test` and `cargo clippy` (Rust's built in linter) for the Rust apps that changed, and fails when an app's built web files grow past a stored size budget. One final job named `ci` sums up everything, and you mark only that job as required in GitHub, so a red result blocks the merge. The helper scripts we add are bash or bun.

## Context

The repo is a Bun and Turborepo monorepo with five Tauri desktop apps (each with its own `src-tauri/Cargo.toml`, no root Cargo workspace), one shared Rust crate (`packages/node-core`), `www` on Cloudflare Workers, and shared TypeScript packages. Nothing today stops a pull request that breaks typecheck, fails a Rust test, adds clippy warnings or bloats a bundle. Officers use these apps on modest hardware and slow links, so bundle growth is a real cost, not a style issue.

Constraints that shape the design: the repo is private, so branch protection is a GitHub setting the engineer applies by hand; Tauri on Linux needs the `webkit2gtk` system packages for Rust builds to link; the known debt (roughly 1,000 `.unwrap()` calls, many clippy warnings) means a strict clippy gate would be red on day one; the five Rust apps each take minutes to compile cold, so path filtering and caching matter for pull request speed.

## Requirements

**User stories**:
- As a maintainer, I want every pull request checked automatically so that a broken typecheck, test or lint never reaches `main`.
- As a maintainer, I want bundle growth caught in review so that officers on slow links are not hurt by silent bloat.
- As a maintainer, I want one required check so that adding an app never means editing branch protection.

**Acceptance criteria**:
- **AC-1**: A pull request to `main` runs `bunx turbo run check --filter=...[$BASE]` (the same task `bun run typecheck` runs, narrowed to affected workspaces and their dependents), and the run fails when typecheck fails.
- **AC-2**: For each Rust app whose files changed (its own `src-tauri/**`, any local crate its `Cargo.toml` lists with `path =`, `Cargo.lock`, or the toolchain file), the workflow runs `cargo test` and `cargo clippy` and fails when either fails.
- **AC-3**: Clippy runs with warnings denied. Lints with known debt are listed in a checked in baseline with a count per lint. A run fails when any lint outside the baseline appears, or when a baselined lint's count grows. Lowering a count is a reviewed edit.
- **AC-4**: For each app whose built web output changed, a bun script builds it, gzips the JS and CSS in `dist`, compares the total with that app's number in `budgets.json`, and fails the run when it is over. The failure message prints the app, the measured size, the budget and the difference.
- **AC-5**: `budgets.json` starts at the size measured on a CI run (Linux) plus 10 percent for each app and `www`, and raising a number is a visible edit in the pull request diff.
- **AC-6**: A single job named `ci` runs last with `if: always()` and needs `changes` and every other job. It passes only when `changes` succeeded and every other needed job succeeded or was skipped by the change filter. It fails if any job failed or was cancelled, or if `changes` did not succeed. It is the only job marked required in branch protection.
- **AC-7**: The workflow also runs on pushes to `main`. A new push to the same pull request cancels the older run, but runs on `main` are never cancelled.
- **AC-8**: A change that touches no code (for example only `docs/**`) runs the `changes` job and `ci` and finishes green in seconds.
- **AC-9**: The scripts we add for CI (change detection, size, clippy ratchet) are bash or bun TypeScript. Existing repo build steps run as they are, including `www`'s `i18n`, which calls `python3` (present on the Ubuntu runner).
- **AC-10**: Re running a pull request with no new commits gives the same result (checks are deterministic, no network dependent steps beyond installing pinned dependencies).

## Options considered

### Option 1: One workflow, change detection job, aggregate `ci` gate

A single `ci.yml`. A small `changes` job works out which TypeScript workspaces and which Rust apps are affected from the git diff, then typecheck, per app Rust, and size jobs run as matrices over only those. The `ci` job gates the result.

**Pros**:
- Fast pull requests, because untouched apps are skipped.
- One required check name that never changes as apps are added.
- Easy to read in one file.

**Cons**:
- The change detection script is code we own and must keep correct (a missed dependency edge skips a needed check).
- Skipped jobs need the aggregate job to treat them as passing.

### Option 2: Run every check for everything on every pull request

No filtering. All workspaces, all five Rust apps, every time.

**Pros**:
- Simplest to reason about, nothing can be missed.

**Cons**:
- Five cold Tauri compiles plus 11 typechecks on every push is slow and burns minutes.
- Slow checks get ignored or bypassed.

### Option 3: One workflow file per app

Each app owns its own workflow with `paths:` filters.

**Pros**:
- Native GitHub path filtering, no custom change script.

**Cons**:
- Workflows skipped by a path filter never report a status, which leaves required checks stuck "waiting" on unrelated pull requests.
- Five near duplicate files drift apart.

## Decision

**Chosen option**: Option 1: One workflow, change detection job, aggregate `ci` gate.

Add `.github/workflows/ci.yml` with a bash `changes` job, matrix jobs for typecheck, Rust and size, and a final `ci` job that is the only required check.

**Implementation skills**: none installed for this decision.

## Rationale

Option 1 meets the speed need without giving up the single required check. The path filter problem in Option 3 (a skipped workflow never reports, so a required check hangs) is exactly what the aggregate `ci` job solves, and it does so in one file instead of five. Option 2 is the safest but, with five cold Rust builds, would make every pull request slow, and a slow gate gets worked around.

The engineer chose Ubuntu for every check. Linux runners are the cheapest and fastest, and Windows is only needed at release time, where `release.yml` already builds the signed Windows installers. The tradeoff is that a Windows only Rust bug would surface at release instead of on the pull request. That is accepted for now and listed in Follow up.

Clippy is gated with a baseline instead of denying everything from day one. Denying all lints would make the very first run red because of existing debt, and nothing could merge until the Code health pass (feature 9) finished. A per lint count ratchet keeps CI green today, fails any new lint, and fails any growth of a baselined lint, so the debt can only shrink. A plain allow list was rejected because it would hide new instances of an allowed lint.

## Feature design

**Data model sketch**:
No database. Two config files in `toolings/ci/`:
- `budgets.json`: `workspaces` is an object keyed by workspace name (`courts`, `dpp`, `lawyers`, `police`, `prisons`, `www`), each value a number: the gzipped JS plus CSS byte budget for that workspace's built output. `measuredAt` is the ISO date the numbers were last re measured (informational). The size matrix is built from these keys, so adding an app is one edit.
- `clippy-baseline.json`: object keyed by lint name (for example `clippy::unwrap_used`), each value the number of occurrences allowed today. Built by `toolings/ci/clippy.ts` from `cargo clippy --message-format=json`.
- A `rust-toolchain.toml` at the repo root pins the exact Rust version (with the `clippy` component) used by CI and local builds.

**State transitions**: none. Each run is independent and stateless.

**Workflow surface** (the "API" of this feature):
| Job | Runs when | Key inputs | Key outputs | Fails when |
|---|---|---|---|---|
| `changes` | always | git diff against the base | `ts` (true or false), `rust` (single line JSON list of app names), `size` (single line JSON list of workspaces) | the diff cannot be computed |
| `typecheck` | `changes.ts` is true | the base sha | pass or fail | `bunx turbo run check --filter=...[$BASE]` fails |
| `rust` (matrix per app) | `changes.rust` is not `[]` | app name | pass or fail | `cargo test` or `cargo clippy` fails, or the clippy ratchet is broken |
| `size` (matrix per workspace) | `changes.size` is not `[]` | workspace name, `budgets.json` | measured, budget, diff | measured gzip bytes greater than budget |
| `ci` | always, last (`if: always()`) | `needs` result of every job above, including `changes` | one pass or fail | `changes` is not `success`, or any other job is `failure` or `cancelled` |

**Base and diff rules**: checkout uses `fetch-depth: 0` and, for pull requests, the merge ref. `BASE` is `github.event.pull_request.base.sha` on pull requests and `github.event.before` on pushes to `main`. The diff is `git diff --name-only $BASE...HEAD`. If `BASE` is all zeros or `git cat-file -e $BASE` fails (first push, force push), everything counts as changed. An empty diff means nothing changed and is a valid green. `BASE` is exported so the turbo filter uses the same sha.

**Change detection rules** (all in one bash script, `toolings/ci/changes.sh`; a bun test, `toolings/ci/changes.test.ts`, feeding sample file lists is required, not optional):
- TypeScript affected: any change under `apps/`, `www/`, `packages/`, `toolings/`, or root `package.json`, `bun.lock`, `turbo.json`, `tsconfig*`, `.github/workflows/ci.yml`, `toolings/ci/`. Turbo's filter narrows the typecheck to affected workspaces and their dependents.
- Rust app `X` affected: any change under `apps/X/src-tauri/`. Local crates are derived, not hand listed: the script greps `path =` entries in `apps/X/src-tauri/Cargo.toml` (today `packages/node-core` for all apps and `packages/interchange` for `dpp`) and treats a change under any of them as affecting `X`. Also affected: `rust-toolchain.toml`, `Cargo.lock` files, `.github/workflows/ci.yml`, `toolings/ci/`.
- Size workspace `W` affected: any change under `apps/W/`, any `packages/*` or `toolings/*` workspace that `W` depends on (taken from the turbo workspace graph, not a hand list; for `www` this includes `toolings/institution` and `toolings/templates`), `toolings/ci/`, `bun.lock`, or the workflow file.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `changes` | list of affected Rust apps | derived from `git diff --name-only <base>...HEAD`, the path rules above |
| `changes` | the diff base | `github.event.pull_request.base.sha` on pull requests, `github.event.before` on pushes to `main`; checkout uses `fetch-depth: 0` |
| `size` | measured size for an app | built web output: `apps/<app>/dist` for the five apps, `www/dist/client` for `www` (browser assets only, the server worker bundle is excluded). Sum of gzip (level 9) sizes of every `*.js`, `*.mjs` and `*.css` file, recursing into subfolders, excluding `*.map`. A missing output folder fails the job |
| `size` | how the build runs | `vite build` run directly in the workspace (not `bun run build`, which repeats `tsc`), after `bun run i18n`. No `.env` values are needed for a build; if one turns out to be, a safe placeholder is set in the workflow `env`, never a secret |
| `size` | budget for an app | `toolings/ci/budgets.json`, key by workspace name; the matrix list comes from these keys |
| `rust` | lints and their allowed counts | `toolings/ci/clippy-baseline.json`, compared by `toolings/ci/clippy.ts` against `cargo clippy --all-targets --message-format=json` output |
| `rust` | exact commands | `cargo test --manifest-path apps/X/src-tauri/Cargo.toml` and `cargo clippy --manifest-path apps/X/src-tauri/Cargo.toml --all-targets --message-format=json`, default features, rustc warnings denied |
| `rust` | web output the Tauri build script needs | `mkdir -p apps/X/dist` before cargo, because `frontendDist` (`../dist`) must exist for `tauri::generate_context` to compile |
| `rust` | system packages | `apt-get install` of `build-essential`, `pkg-config`, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libssl-dev`, plus whatever the first run shows `node-core`'s SQLCipher needs (check whether it vendors OpenSSL) |
| `rust` | Rust toolchain | the exact version in the repo's `rust-toolchain.toml`, installed with `rustup` (not `@stable`), so a new Rust release cannot turn CI red without a commit |
| `typecheck` | generated files tsc needs | `bun run i18n` runs inside each app's `check` script already. `www`'s `check` is plain `tsc --noEmit`, so CI runs `bun run i18n` in `www` first, and route trees and `wrangler types` output are generated by their own step if a clean checkout shows they are missing (verify on a clean clone in build plan step 1) |
| `ci` | overall result | `needs.<job>.result` for each job: `success` and `skipped` pass for the filtered jobs, `changes` must be `success`, `failure` and `cancelled` fail |
| all jobs | install command | `bun install --frozen-lockfile` |
| all jobs | Bun version | `1.4.2`, pinned once in the workflow, matching `packageManager` and `release.yml`. No separate Node setup, Bun only |

**Caching**: Bun package cache keyed on `bun.lock`. `Swatinem/rust-cache`, keyed per app (`workspaces: apps/<app>/src-tauri`), with `save-if` set to `main` pushes only so pull requests read but never write the cache. Third party actions are pinned to full commit SHAs, each at least two weeks old when written.

**Key invariants**:
- `ci` is the only job a human marks required. Its name never changes.
- Concurrency group is `ci-${{ github.ref }}` with cancel in progress only for pull requests, so a red `main` is never hidden. A run cancelled by a newer push shows red on the old commit, which is harmless.
- A skipped job never counts as a failure, and a cancelled or failed job never counts as success.
- A budget can only change by editing `budgets.json` in a pull request, so the increase is reviewed.
- No step fetches anything at run time beyond pinned dependencies and the system packages.

**Security model**:
- Workflow `permissions: contents: read`, nothing broader.
- No secrets are used. Pull requests from forks run with no secrets and cannot reach any, which is fine because none are needed.
- The repo is private, so who may push or open pull requests is already governed by repo access. Branch protection (require `ci`, require pull request before merge, no force pushes to `main`) is a one time manual setting by the repo admin.
- No regulated data. CI never touches the real app data directories or any case data.

**Configuration required**:
- None. No environment variables, no secrets. One manual prerequisite: in GitHub, Settings, Branches (or Rules), add a rule for `main` requiring the `ci` status check. This is not done by the workflow.

**Critical test scenarios**:
- Happy path: a pull request that only edits `apps/police/src/**` typechecks, runs the police size job, skips the Rust jobs, and `ci` passes, verifies **AC-1**, **AC-4**, **AC-6**.
- Rust path: a change under `packages/node-core/` triggers `cargo test` and `clippy` for all five apps, verifies **AC-2**.
- Clippy: a new warning not in the baseline fails the `rust` job, and removing it passes, verifies **AC-3**.
- Size: adding a large dependency to one app pushes it over budget and the `size` job fails with measured, budget and difference printed, verifies **AC-4**, **AC-5**.
- Gate: a docs only pull request gets a green `ci` with the other jobs skipped, verifies **AC-6**, **AC-8**.
- Gate failure: a deliberately failing typecheck makes `ci` red even though the rust jobs were skipped, verifies **AC-6**.
- Concurrency: pushing twice quickly cancels the first run, verifies **AC-7**.

## Build plan

Build approach is Tracer Bullet: stand up the thinnest end to end gate first, then thicken it.

1. Add `.github/workflows/ci.yml` with triggers (`pull_request` to `main`, `push` to `main`), `permissions: contents: read`, the concurrency rule, a `changes` job (stub that reports "everything changed"), a `typecheck` job running `bunx turbo run check --filter=...[$BASE]`, and the aggregate `ci` job. Verify typecheck passes on a clean clone (generated files, `www` i18n and route trees). This is the thin thread, and it already blocks a broken typecheck once `ci` is required. Satisfies **AC-1**, **AC-6**, **AC-7**, **AC-9**.
2. Write `toolings/ci/changes.sh` (bash) with the path rules, replace the stub, and add the required bun test (`changes.test.ts`) that feeds sample file lists, a zero base sha and an empty diff, and checks the outputs. Make the `typecheck` job use the turbo `--filter` form. Satisfies **AC-1**, **AC-2**, **AC-8**, **AC-10**.
3. Add `rust-toolchain.toml`, then the `rust` matrix job: system packages, `mkdir -p apps/X/dist`, `Swatinem/rust-cache` per app, `cargo test`, and `toolings/ci/clippy.ts` for the ratchet. Run one app first as a tracer and record whether `node-core` tests (SQLCipher, keystore) work on a headless runner. Measure real clippy counts once and write `toolings/ci/clippy-baseline.json` so the first run is green. Satisfies **AC-2**, **AC-3**.
4. Write `toolings/ci/size.ts` (bun) with the measuring rules above, compare to `budgets.json`, print measured, budget and difference, exit non zero when over. Run it once on a CI run for every workspace, then commit `toolings/ci/budgets.json` at measured plus 10 percent. Satisfies **AC-4**, **AC-5**.
5. Add the `size` matrix job (build, then run `size.ts`) and extend `ci` to need it. Satisfies **AC-4**, **AC-6**.
6. Pin third party actions (`actions/checkout`, `oven-sh/setup-bun`, `Swatinem/rust-cache`) to full commit SHAs, each at least two weeks old. Document the one manual step (require `ci` in branch protection) at the top of `ci.yml` and in `docs/RELEASING.md` or a short `docs/CI.md`. Satisfies **AC-6**, **AC-10**.
7. The engineer opens a throwaway pull request that exercises each critical test scenario (docs only, node-core change, over budget, failing typecheck), confirm `ci` is seen both red and green before branch protection is turned on, then delete it. Satisfies **AC-1** to **AC-8**.

## Consequences

**Positive**:
- A broken typecheck, failing Rust test, new clippy warning, or oversize bundle can no longer be merged once `ci` is required.
- One stable required check, so new apps never touch branch protection.
- Pull requests stay fast because untouched apps are skipped.
- The clippy baseline turns Code health debt into a visible, shrinking list.

**Negative / tradeoffs**:
- The change detection script is code we own, and a wrong rule can skip a needed check. Deriving local crates from `Cargo.toml` and dependents from the turbo graph, plus the required bun test, reduce this risk.
- Linux only CI will not catch a Windows specific Rust or webview bug before release.
- Third party action (`Swatinem/rust-cache`) is a dependency to keep pinned.
- Size is measured on gzip of JS and CSS only, not images, fonts or the installer, so it does not catch every kind of growth.
- The first run of the budget script bakes in today's sizes, even if they are already large.

**Neutral**:
- Branch protection is a manual GitHub setting. If it is never set, the workflow still reports but does not block.
- Budgets live in the repo, so changing one is a normal reviewed diff.

## Follow-up

- [ ] Engineer sets branch protection on `main` to require the `ci` check (manual, in GitHub Settings).
- [ ] After the Code health pass (feature 9), shrink `clippy-baseline.txt` toward empty and consider denying `clippy::unwrap_used` for production code.
- [ ] Consider a Windows Rust job on `main` pushes only (not pull requests) to catch Windows specific failures before a release.
- [ ] Add `cargo audit` or `bun audit` as a separate decision if dependency vulnerability checks are wanted.
- [ ] Root `AGENTS.md` (feature 4) should record that `ci` is the required check and where the budgets live.
- [ ] A root Cargo workspace for the five apps would give one lockfile, one target directory and one clippy run. Larger change, design separately.
- [ ] Consider printing the size delta against `main`, so budgets can be tightened when bundles shrink.
