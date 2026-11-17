# 0004. One shared shell package for all five apps

**Date**: 2026-11-17
**Status**: Built, not yet verified in windows

## Summary

Police, DPP, Courts, Lawyers and Prisons each carry their own copy of the window frame: the tabs, the sidebar, the header and the shortcuts. This decision moves that frame into one package, `@pleadli/shell`, and each app gives it only its own navigation, words, tab rules and a few slots. A fix to the tab strip or the window controls is then made once and shows in every app and on the website. Apps keep their own words, and people keep their saved tabs. The move is done one app at a time, Police first, with a look at the real window between each.

## Requirements

<!-- BUILD SPEC -->

**User stories**:
- As an officer, clerk or advocate, I want every Pleadli app to open, tab, search and close the same way so that learning one teaches me the rest.
- As the owner, I want one place to fix the frame so that a bug found in Police is fixed in all five apps in one change.
- As a developer, I want an app to describe itself as data (navigation, words, tab rules) so that a new screen cannot quietly drift from the shape of the others.
- As a visitor to pleadli.com, I want the product tour to show the real frame so that what I see is what I get.

**Acceptance criteria**:
- **AC-1**: `packages/shell` exists as a source only TypeScript package named `@pleadli/shell`. It has two layers: a view layer of pure components that take props and import no Tauri code and no router, and a live layer that connects them to the store, the router and the window.
- **AC-2**: Each app's `features/workspace` holds only its config (navigation as data, labels, tab identity resolver, quick add list, slot wiring) and the files for its own slot content. The config files total at most 350 lines per app, checked by a script in CI. The tab strip, tabs store, tab actions, center header, left pillar, navigator, quick add menu, window controls, sidebar toggle and platform helper are no longer copied in any app.
- **AC-3**: Tab behaviour is the same in every app: at most 5 tabs with the first one (Today) pinned and fixed, opening a sixth replaces the unpinned tab worked on longest ago, pinned tabs cannot be closed until unpinned, tabs can be dragged to reorder but never ahead of the first, the Recent list holds at most 3, and a saved tab whose location no longer resolves is dropped on load.
- **AC-4**: Saved workspaces survive the move. The same storage key shape is used (the app passes its own key), existing saved tabs and folded sections load unchanged, and the Prisons fields saved today (`sidebarView`, `rightOpen`, `rightMode`, `rightWidth`, `rightLocked`, `areasTouched`) still load from their present names.
- **AC-5**: The shortcuts are the same everywhere: Ctrl K (⌘K on a Mac) opens search, Ctrl W closes the tab in view, Ctrl Tab and Ctrl Shift Tab move along the tabs, Ctrl 1 to 9 jump to a tab (9 is the last), Ctrl T opens the + menu, and Ctrl S sends a save event to the focused form. None fires while search is open. Ctrl K does nothing in an app or mode where search is switched off.
- **AC-6**: The package reads no app's message files. Every word it shows comes from a typed `ShellLabels` object that the app builds from its own translations, with every key required. A language change redraws the shell in the new language.
- **AC-7**: These slots work the same in every app: licence bar, status bar, right panel (open, closed, resizable between 320 and 720 pixels, lockable), header end widgets, and the area above the page (such as the DPP ribbon). The status bar and the right panel exist in all five apps, even where an app puts nothing in the right panel yet.
- **AC-8**: A `RecordTabs` frame always shows the four reserved tabs Overview, Papers, People, History in that order, each with a calm empty state (what goes here, one button), and lets an app add its own tabs after them. All five record pages use it.
- **AC-9**: One `RouteError` (what happened in plain words, what to do, a Retry button) and shaped loading skeletons (list, record, panel) exist in the package and are the router defaults in all five apps. No bare spinner remains as a page loading state.
- **AC-10**: Named motion values (page, tab, panel, hover, with the reduced motion fallback) and the phone, tablet and desktop breakpoints are defined once in `packages/shell` styles and imported by all five apps and by the website replicas.
- **AC-11**: `useDisableDevtools` lives in the package and is called in every app. In a release build F12, Ctrl Shift I and Inspect are off. In development they stay on.
- **AC-12**: The website replicas (`www/src/components/replica`) draw the sidebar rows, tabs, header and status bar from the view layer. No second copy of that markup remains in `app-shell.tsx`.
- **AC-13**: After each app moves, it is opened in a real window and looked at (scrolled screenshots of the sidebar and a long page) before the next app moves. The result is written in that app's scope.
- **AC-14**: CI runs pure logic tests for the model layer (open, close, pin, move, evict, load, shortcuts) and the line budget check from AC-2. The typecheck passes for all five apps and the website.
- **AC-15**: Each app keeps its own words. No app reads another app's messages, and the package holds no vocabulary of its own beyond the label keys.

## Decision

<!-- BUILD SPEC -->

**Chosen option**: Option 1: One package, with a config object plus slots, built in two layers, adopted by a strangler migration (Police, DPP, Courts, Lawyers, Prisons, then the website).

Build `@pleadli/shell` as a source only workspace package. An app renders `<WorkspaceShell config={shellConfig} storageKey={key}>` and describes itself with data, hooks and slots. The same package also exports the pure view components so the website draws the real thing.

**Implementation skills**: `impeccable` (`.claude/skills/impeccable/`) only if a window check shows a visual regression. The `tanstack` skill is installed for your user only (`~/.claude/skills/tanstack/`), not in this repo.

## Package design

<!-- BUILD SPEC -->

### Layout

```
packages/shell/
  package.json            exports map to .ts and .tsx source, like @pleadli/ui
  src/
    model/                no React, no router: types, tabs reducer, persistence, shortcut map
    view/                 pure components, props only: TabStripView, TabView, SidebarRow,
                          SidebarSection, PillarView, HeaderView, StatusBarView, RightPanelFrame,
                          RecordTabsView, RouteErrorView, Skeletons
    live/                 WorkspaceProvider, WorkspaceShell, useWorkspace, useTabActions, useGo,
                          shortcuts hook, QuickAdd, Controls, SidebarToggle, useDisableDevtools
    lib/platform.ts       isMac, shortcut()
    styles/shell.css      motion values, breakpoints
  test/                   bun tests for model/
```

Dependencies: `@pleadli/ui`, hugeicons, `@tauri-apps/api` (live layer only). Peer: `react`, `@tanstack/react-router`, `@tanstack/react-query` is not used by the package. The view layer must not import from `live/` (checked by a path rule in the line budget script).

### The config an app supplies

```ts
export type ShellConfig = {
  labels: () => ShellLabels                       // a hook, built from the app's own Paraglide
  brand: () => { product: string; office: string; crest: ReactNode }
  nav: () => NavModel                             // a hook, so it can depend on mode or role
  counts?: () => Record<string, { value: number; urgent?: boolean }>  // keyed by nav row id
  identity: {
    resolve: (loc: { pathname: string; search: Record<string, unknown> }) => TabIdentity | null
    icon: (tab: { kind: string; to: string }) => IconSvg
    label?: (tab: { kind: string; to: string; title: string }) => string  // areas follow the language
    useRecordTitle?: (identity: TabIdentity | null) => string | undefined  // loaded record names
  }
  search: () => { enabled: boolean; menu: ComponentType<{ open: boolean; onOpenChange(v: boolean): void }> }
  quickAdd: () => QuickAddItem[]                  // { id, label, icon, panel: { title, description, render(ctx) } }
  footer: () => { person?: { name: string; sub: string; initials: string; to?: string }
                  languageSelect: ReactNode; settingsTo: string; onSignOut?: () => void }
  persistedExtras?: string[]                      // top level saved fields the app keeps (see AC-4)
  slots?: { licenceBar?; statusBar?; rightPanel?; headerEnd?; aboveContent? }
}
```

The config object is a module level constant. The functions marked as hooks are called in a fixed order inside the shell, so they follow the normal rules of hooks. Section ids come from `nav()`; the store keeps a fold state per id and uses `true` (open) for any id it has not seen.

`NavModel` is `{ today: NavRow; sections: { id, label, rows: NavRow[] }[] }` with `NavRow = { id, to, label, icon, count?, match? }`. The first row is always Today, so the CI rule R1 can read it without running the app. Case folders (Police) and Prisons views are rows with `to` carrying a `?view=` query and a `match` function.

### What the package owns, what stays

| Package owns | App supplies |
|---|---|
| Window frame, left pillar, tab strip, tabs store, header, quick add button and menu, search button and Ctrl K, status bar frame, right panel frame, shortcuts, window controls, sidebar toggle, devtools guard, error and loading views, record tabs frame, motion and breakpoints | Navigation rows, labels, crest, office name, tab identity resolver and record titles, search results (command menu contents), quick add items and their forms, signed in person and sign out, language select, licence bar content, status bar content, right panel content, ribbon content |

### Tab state (kept from today's apps, now written once)

State: `tabs`, `recents`, `leftOpen`, `sections`, plus right panel fields `rightOpen`, `rightWidth` (320 to 720, default 384), `rightLocked`, plus the app's declared `persistedExtras`. The active tab is never stored; it is derived from the location. Limits are fixed constants (`MAX_TABS = 5`, `MAX_RECENTS = 3`), not config. The reducer is pure and lives in `model/`.

### Value sourcing

| Action or display | Value | Source |
|---|---|---|
| Draw a tab | Title | `identity.resolve` for areas, then `useRecordTitle` once a record has loaded, saved in the tab |
| Draw a tab | Icon | `identity.icon` |
| Draw a tab | Label in the current language | `identity.label` (areas), else the saved title |
| Open a tab | `key`, `kind`, `to` | `identity.resolve(location)` |
| Active tab | `activeKey` | Derived from the router location, never stored |
| Draw a sidebar row | Label, icon, target | `nav()` |
| Draw a row count | Value and urgency | `counts()` keyed by row id |
| Search button and Ctrl K | Whether search is on, the menu to show | `search()` (Police: station mode only; Prisons: permission) |
| Save workspace | Storage key | `storageKey` prop (Police: `pleadli:police:workspace:v1:<mode>:<name>`) |
| Save workspace | Extra fields | `persistedExtras` names, read and written at the top level |
| Footer | Person, language select, settings target, sign out | `footer()` |
| Any shell word | Text | `labels()` |
| Crest and names | Crest, product, office | `brand()` |
| Ctrl S | Which form saves | The focused form listens for the `pleadli:save` window event |
| Release build check | Devtools off | `import.meta.env.PROD` |

### Key invariants

- The first tab is always Today, pinned, fixed, and never closes or moves.
- A tab is only ever one the router can resolve. Unresolvable saved tabs are dropped on load.
- The package never imports from an app, and an app never imports another app.
- The view layer has no Tauri, router or query import.
- No shell word is hard coded in the package.

### Security model

No new data, permissions or network calls. The shell reads nothing from the database. Search and menu access stay the app's decision (`search().enabled`); the shell only shows or hides the button. The devtools guard reduces what a person at an installed machine can inspect (NT1).

### Critical test scenarios

- Opening a sixth tab replaces the unpinned tab with the oldest `lastActiveAt`, never Today, never the tab opening, verifies **AC-3**
- A pinned tab ignores close, Ctrl W and middle click, verifies **AC-3**
- Dragging a tab ahead of Today is refused, verifies **AC-3**
- A saved tab whose path no longer resolves is dropped on load, verifies **AC-3**, **AC-4**
- A saved Prisons workspace with `rightLocked: true` and `rightWidth: 560` loads with the panel open at 560, verifies **AC-4**
- Ctrl K with search off does nothing; with search on, a second press closes it, verifies **AC-5**
- Ctrl W, Ctrl Tab, Ctrl 1 to 9 do nothing while search is open, verifies **AC-5**
- Missing a label key fails the typecheck of an app, verifies **AC-6**
- A config file over 350 lines fails the CI budget, verifies **AC-2**

## Build plan

<!-- BUILD SPEC -->

The project builds thin end to end threads first and thickens them (Tracer Bullet), and APP-SHAPE.md already orders this work. The thin thread here is the three most alike pieces in Police.

1. Scaffold `packages/shell` (package.json, tsconfig, exports, workspace entry), write `model/` (types, tabs reducer, persistence with the load rules, shortcut map) and its bun tests, and add a `bun test` job to `.github/workflows/ci.yml`, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-14**
2. Add `lib/platform`, `Controls`, `SidebarToggle`, and the view layer for tab strip and header, with the live provider, `useTabActions`, `useGo`, `WorkspaceShell` and `ShellConfig` types. Move Police's tab strip, store and center header onto them. Open the Police window and look, satisfies **AC-1**, **AC-3**, **AC-6**, **AC-13**
3. Add the navigator, left pillar, quick add, status bar frame, right panel frame, shortcuts hook (with Ctrl T and Ctrl S), and the slots. Move the rest of Police. Delete its copies. Add `shell.css` motion and breakpoints, and call `useDisableDevtools`. Look at the window, satisfies **AC-2**, **AC-5**, **AC-7**, **AC-10**, **AC-11**, **AC-13**
4. Add `RouteError`, the skeletons and `RecordTabs`, and use them in Police as router defaults and on its record page. Look at the window, satisfies **AC-8**, **AC-9**, **AC-13**
5. Move DPP (its status bar and ribbon become slots), then look at the window, satisfies **AC-2**, **AC-7**, **AC-8**, **AC-9**, **AC-11**, **AC-13**
6. Move Courts (add the missing platform helper, first run is feature 27), then Lawyers, one at a time with a look between, satisfies **AC-2**, **AC-8**, **AC-9**, **AC-11**, **AC-13**
7. Move Prisons last: right panel, assistant and context panel as slot content, `sidebarView` and `rightMode` through `persistedExtras`, Head Office rows as nav data. Look at the window, satisfies **AC-2**, **AC-4**, **AC-7**, **AC-13**
8. Repoint `www/src/components/replica/app-shell.tsx` to the view layer and the shared motion values, keep the animated tour as the website's own code around it, satisfies **AC-10**, **AC-12**
9. Add `toolings/ci/shell-budget.ts` (config line budget, view layer import rule, no copy of moved files), run all five typechecks and the website check, update APP-SHAPE.md and the audit scores for SH7, SH8, SH9, PG2, PG8, PG9, TK4, MO1, MO3, NT1, NT5, satisfies **AC-2**, **AC-14**, **AC-15**

## Migration plan

**Strategy**: strangler. The package is built beside the apps. Each app switches in its own change, keeps working at every step, and loses its copy only after it passes a look in the real window.
**Phases**:
1. Package and tests, no app touched (task 1).
2. Police, thin thread then full (tasks 2 to 4).
3. DPP, Courts, Lawyers, one at a time (tasks 5 and 6).
4. Prisons (task 7), then the website (task 8), then the CI budget (task 9).
**Rollback**: each app's move is one change, so reverting that change returns the app to its own copy. The package stays, unused by that app.
**Risks**: (1) A subtle difference between copies is lost. Mitigation: diff each app's copy against the package before deleting it, and keep the app's difference as data or a slot. (2) Saved tabs reset. Mitigation: AC-4 and its tests. (3) Prisons has the most extras and moves last for that reason. (4) Window checks are manual and Chromium plus a second Vite is heavy. Mitigation: one app server at a time, as already agreed.

## Consequences

<!-- BUILD SPEC -->

**Positive**:
- About 6,300 lines of shell reduce to roughly 1,500 in the package plus a config of at most 350 lines per app.
- A change to tabs, shortcuts or window controls is made once.
- Clears or moves toward most open shape gaps: SH7, SH8, SH9, PG2, PG8, PG9, TK4, MO1, MO3, NT1, NT5, and the dead `use-disable-devtools` in all five apps.
- The website tour shows the same markup the apps ship.

**Negative / tradeoffs**:
- The package becomes a shared dependency of all five apps. A bad change there reaches all five. The CI tests and the window check per app are the guard.
- An app can no longer reshape the frame on its own. It must use a slot or record a Deviation line in its scope (exceptions rule AC-7 of spec 0003).
- Five tabs and three recents are law. An app that needs more must record a deviation.
- The config uses hooks, so config authors must know the rules of hooks.

**Neutral**:
- Shell label keys exist in each app's catalog, translated by that app (about 25 strings each).
- `@tauri-apps/api` becomes a dependency of the package (live layer only), which the website does not import.

## Follow-up

- [ ] Feature 27 (settings, brand, onboarding) can reuse the same package layout and the `ShellLabels` pattern.
- [ ] `.github/workflows/ci.yml` has uncommitted changes in the working tree. Task 1 adds a job there, so merge or commit those first so the two do not collide.
- [x] The save event is `pleadli:save`: a bubbling `CustomEvent` on `window` with no `detail`. The focused form listens for it and saves itself (`SAVE_EVENT` in `packages/shell/src/live/shortcuts.ts`).
- [ ] Courts has no `messages/` catalog (feature 14 audit). Its `labels()` can start in English and be translated by feature 15 or 27. Record that as a known gap, not a deviation.
- [ ] After task 9, rerun the checklist in `docs/platform/APP-SHAPE-AUDIT.md` by hand and update the scores.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Deviations from this spec (build, 2026-11-17)

- Config gained `createFrame`, `maxRecents`, `slots.rightPanelHeader`, `rightPanelTemporary`, `rightToggle` and `onShortcut`.
- DPP keeps 24 recents and Lawyers 20, because their `/recent` pages need more than the 3 that AC-3 fixes.
- The per-app "Pinned" section is gone everywhere. Courts also lost its Recent section and its Work menu group.
- DPP and Lawyers assist-panel open state moved into the shell's `rightOpen`.
- All apps got a right-panel toggle and an always-present status bar.

## Not done

- AC-8: `RecordTabs` is wired into all five record pages (Lawyers matter, Prisons prisoner, DPP file, Courts case, Police investigation). All five typecheck; none has been seen in a window. Empty-state text is only set where the tab can really be empty (Lawyers, Courts, Police papers).
- Courts labels are English only, and Police has no `fr` file.
- Features 14 and 26 are not marked done until verified with `bun run tauri` per app and `/check verify`.
