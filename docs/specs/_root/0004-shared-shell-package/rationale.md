# 0004 rationale: One shared shell package

## Context

Pleadli is five desktop apps (Police, DPP, Courts, Lawyers, Prisons) built on TanStack Router, React 19 and Tauri, in one Bun workspace with a shared `@pleadli/ui`. Each app grew its own `features/workspace` folder by copying the last one. Measured on 2026-11-17 (see `docs/platform/APP-SHAPE.md`): about 6,300 lines in total, with the tab strip differing by 15 to 42 changed lines between two apps, and the differences almost all translation key names, tab kind names and a helper name, not behaviour. `Controls` (about 49 lines) and `SidebarToggle` (about 24) are also copied five times.

What I read in the code on this pass:
- Police `tabs-store.tsx` (245 lines) holds tabs, recents, folded sections, the left pillar state and the palette flag, saved to local storage under a per app key. It keeps its context on `globalThis` so a hot update cannot split provider and consumer. Prisons (365 lines) is the same store plus a right pillar (open, mode, width, locked), a sidebar view (workspace or inbox) and an "areas touched" flag.
- `tab-identity.ts` turns a path into a tab key, kind and target. `tab-actions.ts` holds navigate, close, cycle and jump, and a hook that renames a tab once its record has loaded from the query cache.
- `workspace-shell.tsx` wires the route to the tabs, owns the shortcuts and draws the frame. Police only turns on search in station mode; Prisons turns it on by permission and adds Ctrl J for the assistant.
- DPP has a status bar and a ribbon. Prisons has a right panel, assistant and context panel. Courts has no platform helper and no message catalog.
- The website replica (`www/src/components/replica/app-shell.tsx`) is a hand drawn copy of the same markup (Row, SidebarToggle, traffic lights) with its own motion, so a fix in the apps does not reach it.

The cost of not deciding: five copies keep drifting (feature 14 scored the apps from 56 to 63 percent against the contract), a bug found in one app is fixed by hand five times, and the Stage 1 goal of one shape stays a document.

## Options considered

### Option 1: One package, config object plus slots, two layers, strangler migration (chosen)

`@pleadli/shell` exports `WorkspaceShell` and a typed `ShellConfig`. A pure view layer sits under a live layer so the website can reuse the markup.

**Pros**:
- One place to learn and to fix. The config is data, so a CI script can read it (rule R1 reads the first nav row).
- The website can import the view layer and show the real thing.
- Each app's wiring file shrinks to a config of at most 350 lines.

**Cons**:
- A frame that every app depends on: one bad change reaches five apps.
- Slots and config fields must anticipate what apps need (Prisons right panel, DPP ribbon). A missing slot means a package change.
- Config uses hooks, which needs care.

### Option 2: Separate parts that each app assembles

Export `TabStrip`, `LeftPillar`, `CenterHeader` and friends. Each app keeps a small `workspace-shell.tsx` that wires them.

**Pros**:
- More freedom per app. Smaller first step.

**Cons**:
- Each app keeps a 60 to 100 line wiring file that can drift again, which is the problem being solved.
- The CI script cannot easily tell whether an app wired the parts in the contract order.

### Option 3: Fix in place, keep five copies and add a CI diff check

Leave the copies and add a script that fails when the copies differ too much.

**Pros**:
- No migration risk. Cheap.

**Cons**:
- It measures drift and does nothing to the 6,300 lines. Every fix is still made five times.
- Does not give the website the real markup.

### Option 4: Replace all five apps in one pass

Build the package complete and switch every app together.

**Pros**:
- Fastest on paper.

**Cons**:
- Five apps change at once with no window check in between. A big bang rewrite of working software. Rejected.

## Rationale

Option 1 fits the forces in Context. The copies already agree on behaviour, so the shared version is not a redesign: it is the Police store and strip with the app specific words, tab kinds and extras moved to the edges. Option 2 keeps exactly the thing that drifted, the wiring. Option 3 leaves the line count and the website copy alone. Option 4 is the failure pattern of replacing a production system all at once.

The engineer chose each of these seam questions: config and slots over parts; a resolver function for tab identity (it matches `tab-identity.ts` and `useSyncActiveTabTitle` already in all five apps, and Prisons Head Office tabs depend on runtime state a static route table could not hold); labels built by each app from its own Paraglide so no app reads another app's words; fixed limits of 5 tabs and 3 recents; and unchanged storage keys so nobody loses open tabs.

The engineer first picked both "config fields with defaults" and "fixed in the shell" for the limits. I asked which wins and they chose fixed. Where an app truly needs a different number, spec 0003 already gives the way out: a written Deviation line in that app's scope.

The split into a view layer and a live layer is the one place I pushed past a plain move. Without it the website would have to import Tauri and a router to show the frame, or stay a lookalike (which is what scope feature 26 says must end). The cost is one more folder and one import rule, which the CI budget checks.

I put the "arrives with feature 26" gaps (error and loading views, record tabs, motion and breakpoints, Ctrl T and Ctrl S, the devtools guard) into the same package at the engineer's choice. They share the same layer, labels and CSS, and doing them in the same pass costs less than five separate adoptions later.

Day 1: Police works on the package and the other four are untouched. Day 180: a tab strip fix is one change. Day 730: a sixth app adopts the package with a config and no frame code.

## References

Not requested (References level: none).

## Evidence: inventory of what is copied today

| File | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|
| `tab-strip.tsx` | 118 | 117 | 114 | 115 | 116 |
| `tabs-store.tsx` | 245 | 256 | 254 | 254 | 365 |
| `center-header.tsx` | 58 | 58 | 47 | 56 | 73 |
| `workspace-shell.tsx` | 106 | 103 | 93 | 101 | 135 |
| `navigator.tsx` | 222 | 223 | 187 | 198 | 223 |
| `components/toolbar/controls.tsx` | 49 | 49 | 48 | 49 | 49 |
| `components/toolbar/sidebar-toggle.tsx` | 24 | 24 | 23 | 24 | 24 |
| `lib/platform.ts` | 7 | 7 | none | 7 | 7 |
| `components/command-menu.tsx` (stays in each app) | 115 | 150 | 101 | 100 | 316 |

Extras that become slots or extras: DPP `statusbar.tsx` and `ribbon.tsx`; Prisons `right-panel.tsx`, `context-panel.tsx`, `assistant/*`, `sidebarView`, `rightMode`, `areasTouched`; Police station and command modes (different nav and search availability).
