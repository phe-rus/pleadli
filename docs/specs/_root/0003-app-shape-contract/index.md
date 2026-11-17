# 0003. One shape contract for all five apps

**Date**: 2026-11-17
**Status**: In Progress

## Summary

All five Pleadli desktop apps (Police, DPP, Courts, Lawyers, Prisons) will follow one written contract for how they are built and how they feel: the same window frame, the same sidebar order, the same record pages, the same Settings and first run steps, the same plain language and comfort rules, the same motion, and the same native desktop behaviour. The contract lives in a document for people and, once the shared shell package exists, as types that make an app fail to build if it skips a required part. A short script in CI checks the mechanical rules, and every app is scored Missing, Partial or Matches against a checklist. An app may differ only when the reason is written down.

## Requirements

<!-- BUILD SPEC -->

**User stories**:
- As a clerk, officer or advocate who knows WhatsApp and not much else, I want every Pleadli app to work the same way so that learning one teaches me the rest.
- As the owner, I want a written, checkable standard so that a new app or a new screen cannot drift away from the shape of the others.
- As a developer, I want the contract as types and a CI check so that I find out about a drift when I build, not when a user complains.

**Acceptance criteria**:
- **AC-1**: `docs/platform/APP-SHAPE.md` holds the contract and covers six areas: shell structure, page patterns, plain language and comfort rules, visual tokens and density, motion, and native desktop behaviour.
- **AC-2**: Every rule in the contract is a checklist item with an id, written so that a person can mark it Missing, Partial or Matches without guessing.
- **AC-3**: All five apps are scored against the checklist, each with a percentage, and the scores are recorded in `docs/platform/APP-SHAPE-AUDIT.md`.
- **AC-4**: Each app's gaps are queued as rows in that app's own scope file, in priority order, so none of them is only a note in a report.
- **AC-5**: The comfort minimums are written as numbers that match the look the owner approved: content text at least 14px, sidebar and tab chrome 13px, small captions no smaller than 11px, buttons at least 36px tall, dense sidebar and tab rows 30px, phone tap targets at least 44px, icons always paired with words for main actions, and text contrast at WCAG AA.
- **AC-6**: The native desktop rules are written as checks: no developer tools in release builds, no browser page behaviours, chrome is not selectable while content is, right click shows app menus on records and the native menu only in text fields, and standard desktop shortcuts and window behaviour exist.
- **AC-7**: The exceptions rule is written: an app may deviate from a rule only if the deviation and its reason are written in that app's scope file, and the CI script lists every recorded deviation.
- **AC-8**: The list of rules the CI script checks is fixed in this spec (see Standard definition), so the script can be built once the shared shell package exists.

## Decision

<!-- BUILD SPEC -->

**Chosen option**: Option 1: Document the contract, enforce it with types and a CI script, and migrate app by app.

One contract, written once, enforced by the compiler where possible and by a script where not, adopted app by app starting with the shared shell package.

## Standard definition

<!-- BUILD SPEC -->

### 1. Shell structure (the frame)

- One window frame in every app: full height left sidebar with the window controls and sidebar toggle on top, then the crest and the product and office names, then search with a quick add button, then the grouped places, then the signed in person at the foot (name, role, language, settings, sign out).
- The centre has a tab strip with previous and next buttons, then an optional licence bar, then the page.
- **Sidebar order is fixed, names are the app's own:** Today first, then the person's daily places, then the registers, then the office. Each app writes its own row names (Cells, Cause list, Bring ups). Rows have an icon and a word, counts on the right, and an urgent count shows as a red pill.
- **A right panel is an optional slot.** Every app can show it the same way for details or the assistant. None must.
- The tab strip, tabs store, header, quick add menu, licence bar and status bar come from the shared shell package (scope feature 26), not from each app.

### 2. Page patterns

- **List pages** use one table or one row list, with a plain header, one primary action at the top right, and the same filter and empty behaviour.
- **Record pages** (a case, a prisoner, a matter, a file) share a core set of tabs in this order: Overview, Papers, People, History. The four names are reserved and always shown: a tab with nothing in it shows a calm empty state that says what would go there and offers one button to add it, so the layout is always the same. An app may add its own tabs after those. The header and the place of the actions are the same everywhere.
- **Settings** has these sections in this order in every app: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Apps may add sections after these. Connections always exists: where an app has no connection yet (today Courts and Lawyers) it shows "Not connected" and what the connection will do, so the postbox and the same building network plug in later without moving anything.
- **First run onboarding** has these steps in this order in every app: Language, Who is this office (name and crest), First person and sign in, Backup choice, Recovery option.
- **Empty, error and loading states** use one shared pattern built once in the shell package. Empty says what the place is for and gives one button. Error says what happened in plain words, what to do, and offers a retry. Loading shows a calm placeholder shaped like the content and never a bare spinner.

### 3. Plain language and comfort rules

- Words come from the work of that office, never from the database. One main action per screen. Common jobs are guided step by step. Undo or a clear confirmation before anything that cannot be reversed.
- Minimums, set to match what the apps look like today (the owner chose to keep it): content text at least 14px. Sidebar and tab chrome 13px. Small captions no smaller than 11px, and never for anything a person must read to act. Buttons at least 36px tall. Dense sidebar and tab rows 30px with a mouse or trackpad. Phone tap targets at least 44px. Icons are always paired with words for main actions. Text contrast at WCAG AA.
- Each app keeps its own vocabulary. No app reads another app's words.

### 4. Visual tokens and density

- One accent colour per app, set only in that app's styles. Everything else comes from `@pleadli/ui`: colours, spacing, type scale, radius and density.
- Light and dark themes are required in every app.
- Content text size and weight come from the global type. Only the toolbar and chrome may set their own.
- The shell package defines the responsive breakpoints now (phone, tablet, desktop), so the Stage 7 phone layouts fit the frame without a rework. Phone layouts are built later.

### 5. Motion

- One motion spec, kept in the shared package: page change is a fade with a 10 px upward move (240 ms, ease out), a new tab slides 10 px and fades in (280 ms, cubic bezier 0.22, 1, 0.36, 1), a panel slides (220 ms), hover and press feedback is 120 ms. These are named tokens, not numbers copied into each app.
- Everything respects the system reduced motion setting by dropping to instant or a plain fade.
- The website replicas use the same motion values, so the website and the apps feel the same.

### 6. Native desktop behaviour

- **No developer tools in release builds.** F12, Ctrl Shift I and Inspect are off in installed apps and stay on in development builds.
- **No browser page behaviours:** no browser zoom by Ctrl wheel or pinch, no pull to refresh or rubber band overscroll, no dragging of images or links, no caret browsing, no link address bar at the bottom, no F5 reload.
- **Selection:** the chrome (sidebar, tabs, buttons, headings) is not selectable or highlightable. Content (papers, table cells, notes, reference numbers) is selectable and copyable.
- **Right click:** records, rows and tabs show the app's own menu. The minimum is Open, Open in new tab, and Print or Export where that object has it. Apps add their own actions after those. The full list per object type is settled when the shared shell package is designed. Text fields show the native cut, copy and paste menu. The browser's Inspect, Back and Reload menu never appears.
- **Desktop shortcuts and window:** standard shortcuts (Ctrl K for search, Ctrl W to close a tab, Ctrl T for a new tab, Ctrl S to save), a real window drag region, minimise, maximise and close, and the window size is remembered.

### Canonical pattern (the type an app must satisfy)

```ts
// packages/shell/src/contract.ts  (written when scope feature 26 builds the package)
export interface AppShape {
  product: string                     // "Pleadli Police"
  accent: string                      // the one accent, as an oklch value
  nav: [Today, ...Daily[], ...Register[], ...Office[]]  // Today first, then grouped places
  recordTabs: ['overview', 'papers', 'people', 'history', ...string[]]
  settings: ['profile', 'language', 'backup', 'licence', 'connections', 'setup', ...string[]]
  onboarding: ['language', 'office', 'first-person', 'backup', 'recovery']
  words: AppWords                     // the app's own labels, no cross app reads
}
```

An app that leaves out a required part fails to type check.

**Replaces**:
- Five copies of the shell in `apps/*/src/features/workspace` that drift by small differences.
- Settings and onboarding that exist in one app and not another (Police has no settings sections, Courts and Lawyers have no real onboarding).
- Per app choices about context menus, selection and developer tools.

**Enforcement**:
1. Compile time types in the shared shell package (the strongest, and only possible once scope feature 26 builds it).
2. A script `toolings/ci/app-shape.ts` (TypeScript on Bun) run in CI that fails on: a required navigation section, Settings section or onboarding step that is missing; inline text size or weight in content; hard coded colours or odd spacing outside the shared tokens; text or tap sizes below the comfort minimums where they can be found statically. It also prints the list of recorded deviations.
3. A checklist scored by a person per app at each release for what the script cannot see, mainly plain language.

**Rollout**: Gradual, app by app, starting once the shared shell package exists (scope feature 26): Police first, then DPP, Courts, Lawyers and Prisons last. Existing violations are tracked as gaps in each app's scope file, not fixed in one big change.

**Exceptions**: Allowed only when the deviation and its reason are written in that app's scope file, as a line `**Deviation:** <rule id>, <reason>`. The CI script lists them. No other exceptions.

## Rationale

Reasoning, the options, and the measured audit of the five apps: see `rationale.md`.

## Consequences

**Positive**:
- One thing to learn for staff who move between offices or use more than one app.
- Drift becomes visible: a missing part fails a type check or a CI check instead of being found by a user.
- The contract and the shared shell package make each other real: the package is how the contract is kept.

**Negative / tradeoffs**:
- The comfort numbers keep today's compact sizes, so a first time user on a small laptop sees smaller text and rows than a larger, friendlier design would give. Phone targets are the larger size.
- The contract is only as good as its enforcement. Until scope feature 26 builds the shell package, enforcement is the checklist and a person.
- Prisons has extras (Head Office, three pillars, connectivity) and will need recorded deviations or an optional slot.
- Strict order for Settings and onboarding means Police and Prisons need rework to match.

**Neutral**:
- Each app keeps its own words, so the contract fixes structure and not vocabulary.
- Native behaviour rules touch Rust configuration in every app, not only the web layer.

## Follow-up

- [ ] Confirm what the owner meant by "settings, license, setup first screen, and setup" in the Settings answer. This spec reads it as: Licence is its own Settings section, the first setup screen is the onboarding, and Setup is a section where the office identity can be changed later.
- [ ] Verify that no installed app enables the Tauri `devtools` feature in release. A search of each `Cargo.toml` and `tauri.conf.json` found no mention of it, which should mean it is off, but this was not tested in an installed build.
- [ ] The steps that carry out this decision (write the checklist, score the five apps, queue the gaps) are derived when feature 14 is built with `/develop`, not written here. A sensible order is: Police first as a thin thread, then the other four.
- [ ] Scope feature 26 (shared shell package) must create `packages/shell/src/contract.ts` and the optional right panel slot.
- [ ] Scope feature 27 (one settings, brand and onboarding) builds the Settings sections and onboarding steps listed here.
- [ ] Scope feature 15 (plain language and guided tasks) builds the guided flows the plain language rules call for.
- [ ] Build `toolings/ci/app-shape.ts` after feature 26, as a CI job beside the existing checks in `.github/workflows/ci.yml`.
