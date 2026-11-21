# CI

Every pull request to `main`, and every push to `main`, runs `.github/workflows/ci.yml`. The reasoning is in `docs/specs/_root/0002-ci-pipeline.md`.

## The one manual step

A workflow cannot protect a branch, so you do this once in GitHub:

1. Open Settings, then Branches (or Rules), and add a rule for `main`.
2. Require a pull request before merging.
3. Require the status check named `ci`. Mark only that one.
4. Block force pushes.

`ci` sums up every other job, so adding an app later never means editing this rule.

## What runs

| Job | Runs when | What it checks |
|---|---|---|
| `changes` | always | Which workspaces and Rust apps the change touches |
| `typecheck` | TypeScript changed | `turbo run check` for the affected workspaces |
| `rust` | a Rust app, or a crate it uses, changed | `cargo test` and the clippy ratchet, one job per app |
| `size` | a workspace's web files changed | Gzipped JS and CSS against its budget |
| `ci` | always, last | Passes only when the jobs above passed or were skipped on purpose |

A change that touches only `docs/` finishes after `changes` and `ci`.

## Files you will edit

All in `toolings/ci/`:

* `budgets.json` holds one number per workspace: the most gzipped JS and CSS bytes its build may have. A value of `null` means not measured yet, so the size is printed and nothing fails. The failure message shows the app, the measured size, the budget and the difference. Raising a number is a normal, reviewed edit.
* `clippy-baseline.json` holds the clippy and compiler warnings that already exist, as a count per lint. A new lint, or a bigger count, fails the run. A smaller count passes and the log asks you to lower the number. Never raise one to make a run green.
* `changes.sh` decides what runs. Its tests are in `changes.test.ts`. Run them with `bun test toolings/ci`.

Rust is not pinned. CI uses current stable, the same as `ci.yml`. A new Rust release can bring new clippy lints and turn the ratchet red. Fix them or add them to the baseline in a reviewed edit.

## Measuring a budget or a baseline

Sizes: build a workspace (`cd apps/police && bunx vite build`), then `bun toolings/ci/size.ts police`. It prints the number to commit, which is the measured size plus 10 percent.

Clippy: for each app, `cargo clippy --manifest-path apps/<app>/src-tauri/Cargo.toml --all-targets --message-format=json > <app>.jsonl`, then `bun toolings/ci/clippy.ts counts <app>.jsonl > <app>.json`, and finally `bun toolings/ci/clippy.ts merge *.json`. The merged result is the highest count per lint across the apps, which is what the baseline stores.

## Known limits

* CI runs on Ubuntu only. A Windows only Rust problem shows up at release time, in `ci.yml`.
* Size counts gzipped JS and CSS only, not images, fonts or the installer.
