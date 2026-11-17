# 0003 rationale: one shape contract for all five apps

## Context

> Premise note: this topic could split into several decisions (the contract, the shared shell code, the settings and onboarding code, the plain language flows). This spec decides only the contract and how it is checked. The shared shell package is scope feature 26, the shared settings, brand and onboarding is feature 27, and the plain language guided flows are feature 15. Each gets its own design.

Pleadli is five desktop apps built one after another, each with its own copy of the window shell, settings, brand handling and translation wiring. The copies started the same and drifted. Staff who use more than one app, and every new person learning one, meet a slightly different frame each time. The owner has asked for the apps to be uniform, simpler and more plain for people who barely operate a phone, and for the desktop apps to behave like desktop apps and not like web pages.

Without a written standard, the next app or the next screen drifts again, and the copies cost five times the work for every fix.

Workspace: repo wide (`_root`). Platform: Tauri desktop apps (React, TypeScript, Rust) and the website replicas. No data is stored by this decision.

## Options considered

### Option 1: Document the contract, enforce it with types and a CI script, migrate app by app

Write the contract once. Put the structural parts in a shared package as types so an app that skips a part cannot build. Run a short script in CI for the rules types cannot express (inline typography, tokens, comfort minimums). Score each app with a checklist. Move apps over one at a time.

**Pros**:
- Strongest enforcement that is feasible: the compiler plus a CI check plus a human checklist for plain language.
- App by app moves are small and checked in a real window.
- Exceptions are allowed but visible.

**Cons**:
- Depends on building the shared shell package first.
- Until then the enforcement is only the checklist.

### Option 2: Document the contract and fix every app in one migration

Write the contract and change all five apps in one coordinated change.

**Pros**:
- Everything is uniform on one day.

**Cons**:
- Large blast radius across five apps that were never all run together, and the project has only a handful of TypeScript tests.
- Hard to review and hard to roll back.

### Option 3: Document only

Write the contract and rely on review.

**Pros**:
- Cheap and quick.

**Cons**:
- No enforcement. Drift returns quietly, as it did before.

## Rationale

Option 1. The apps already differ only in small ways (measured below), so a shared package is realistic and it is also what makes the contract enforceable. A document alone is the weakest form and the history of the five copies shows it would not hold. A single migration is too risky for apps that have been tested so little. Moving one app at a time, starting with Police and checking each in a real window, matches the owner's rule to build visible things and check them in a real window.

The owner's answers fixed the main calls: the contract covers shell structure, page patterns, plain language, visual tokens, motion and native behaviour; sidebar order is the same while row names stay each app's own; record pages share core tabs with room for extras; one motion spec; an optional right panel slot; fixed comfort numbers; deviations allowed if written down; a checklist plus a small CI script; all five apps are scored; the contract lives as a document plus types in the shell package; states share one pattern; light and dark are required and breakpoints are defined now with phone layouts later; and native desktop rules cover developer tools, browser behaviours, text selection, right click and shortcuts.

## Audit evidence (measured 2026-11-17)

**Shell copies.** Lines per file in `apps/*/src/features/workspace`:

| File | Police | DPP | Courts | Lawyers | Prisons | Changed lines between two apps |
|---|---|---|---|---|---|---|
| `tab-strip.tsx` | 118 | 117 | 114 | 115 | 116 | 15 to 42 |
| `tabs-store.tsx` | 245 | 256 | 254 | 254 | 365 | 18 to 31 |
| `center-header.tsx` | 58 | 58 | 47 | 56 | 73 | 20 to 46 |
| `workspace-shell.tsx` | 106 | 103 | 93 | 101 | 135 | not measured |
| `navigator.tsx` | 222 | 223 | 187 | 198 | 223 | 133 to 187 |

The whole `features/workspace` folder is 995 to 1,983 lines per app. When two copies were compared, the changed lines were mostly translation key names and one helper name.

**Settings.** DPP, Courts, Lawyers and Prisons have a `$section` route. Police has only `index.tsx`. Sections differ per app.

**Onboarding.** Police has `features/session/onboarding.tsx` and Prisons has a multi step facility onboarding. DPP has an `app-gate`. No onboarding was found in Courts or Lawyers.

**Native behaviour.** Each app has one match for a context menu handler and one for a no selection rule. `packages/ui/src/styles/workspace.css` sets `overscroll-behavior: none`. No app's `Cargo.toml` or `tauri.conf.json` mentions `devtools`. This was searched, not tested in an installed build.

## Not verified

- Whether the context menu handler in each app blocks the browser menu everywhere or only on some elements.
- Whether Ctrl wheel zoom and F5 reload are blocked in each app.
- Whether release builds expose developer tools. The expected default is that they do not, but it was not tested.
- Settings sections, onboarding steps and list and record pages are not yet compared in detail. That is what the audit itself does.
