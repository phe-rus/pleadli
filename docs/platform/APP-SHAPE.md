# One shape for every app

Started 2026-11-17. This is the contract for scope feature 14 (the contract and the audit, scores in [[APP-SHAPE-AUDIT]]) and the plan for scope feature 26 (one shared shell). Plain language rules for feature 15 live in [[PEOPLE-AND-NETWORK-PLAN]] section 5.

## What is measured today

Every app carries its own copy of the shell. Measured in the repo on 2026-11-17:

| File | Police | DPP | Courts | Lawyers | Prisons | Changed lines between two apps |
|---|---|---|---|---|---|---|
| `tab-strip.tsx` | 118 | 117 | 114 | 115 | 116 | 15 to 42 |
| `tabs-store.tsx` | 245 | 256 | 254 | 254 | 365 | 18 to 31 (Prisons more) |
| `center-header.tsx` | 58 | 58 | 47 | 56 | 73 | 20 to 46 |
| `workspace-shell.tsx` | 106 | 103 | 93 | 101 | 135 | not measured |
| `navigator.tsx` | 222 | 223 | 187 | 198 | 223 | 133 to 187 |
| `left-pillar.tsx`, `quick-actions.tsx` | 160 | 140 | 116 | 133 | 158 | not measured |

The whole `features/workspace` folder is 995 to 1,983 lines per app, about 6,300 lines in all, and most of it says the same thing five times. When two copies were compared, the differences were almost all translation key names (`workspace.close_tab` against `workspace.tab.close_named`) and one helper name, not behaviour.

Beyond the shell: `features/brand`, `features/i18n` and `features/settings` repeat in the same way, and each app has its own `api/mod.rs` of 1,400 to 1,900 lines (see the audit).

## The plan: one `@pleadli/shell` package

Move the shell into one package and let each app supply only what is its own:

- **The package owns:** window frame, left pillar, tab strip, tabs store, center header, quick add menu, command palette hook, licence bar, status bar, page and panel layout. These are the parts a person learns once and expects everywhere.
- **Each app supplies:** its navigation as data (sections, rows, icons, counts), its words as a small labels object, its crest and accent, and its routes. No cross app reading of each other's words (the rule that each app owns its words stays).
- **Translation keys** become a labels prop, so the package has no dependency on any app's message files.
- **The website replicas** (`www/src/components/replica`) then import the same shell, so the website shows the real thing and not a lookalike.

Expected result: about 6,300 lines of shell reduced to roughly 1,500 in the package plus around 100 lines of navigation data per app, and a fix to the tab strip, the keyboard shortcuts or the window controls lands once.

## Order of work

1. Add `packages/shell` with the tab strip, tabs store and center header first (the three most alike). Move Police onto it, run it, then DPP.
2. Add the navigator as data driven, then the left pillar, quick add and the workspace frame.
3. Move Courts and Lawyers, then Prisons last (its shell has the most extras: connectivity, Head Office, three pillars).
4. Repoint the website replicas to the package.
5. Then the same for settings, brand and onboarding.

Each move is checked in a real window before the next app moves. CI runs the checks (the project rule is that heavy builds run in GitHub Actions, not on the laptop).

## The contract (checklist)

Decided in spec [0003](../specs/_root/0003-app-shape-contract/index.md). Every rule has an id. For each app you mark a rule as **Matches**, **Partial**, **Missing** or **Unchecked** (not looked at yet, mostly because it needs a person or a real window). Matches counts 1, Partial counts one half, Missing counts 0, and Unchecked is left out of the percentage so the score never pretends. Scores for today are in [[APP-SHAPE-AUDIT]].

Each app keeps its own words. The contract fixes structure, never vocabulary.

**How to read the "How to check" column.** "Code" means a search or a read of the source, which anyone can repeat. "Window" and "Person" mean you open the app and look, or watch someone use it.

### Shell structure

The frame around every page. A person should know where everything is the moment any app opens.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| SH1 | A full height left sidebar with window controls and the sidebar toggle on top, then the crest, product name and office name. | Code: left-pillar. Window: look. | Now |
| SH2 | Search sits at the top of the sidebar with a quick add button. | Code: quick-actions. | Now |
| SH3 | The foot of the sidebar shows the signed in person with language, settings and sign out. | Code: navigator foot. | Now |
| SH4 | Today is the first row, then the daily places, then the registers, then the office. | Window: read the sidebar top to bottom. | Now |
| SH5 | The tab strip has previous and next buttons. | Code: tab-strip. | Now |
| SH6 | A licence bar sits above the page. | Code: licence bar. | Now |
| SH7 | A status bar sits at the foot of the page. | Code: statusbar. | feature 26 (shared shell) |
| SH8 | An optional right panel slot works the same way in every app. | Code: right panel. | feature 26 (shared shell) |
| SH9 | The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. | Code: imports. | feature 26 (shared shell) |
| SH10 | Ctrl K opens search, Ctrl W closes a tab, Ctrl Tab moves along tabs, Ctrl 1 to 9 jump to a tab. | Code: workspace-shell. | Now |

### Page patterns

Lists, records, Settings and first run. Each app uses its own words, but the layout is the same.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| PG1 | Lists use the shared table and no hand built tables. | Code: count of `<table` in screens. | Now |
| PG2 | Record pages show the tabs Overview, Papers, People, History first, in that order. | Code: the record page of each app. | feature 26 (shared shell) |
| PG3 | A tab with nothing in it shows a calm empty state that says what goes there and offers one button. | Window: open a new record. | Now |
| PG4 | Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. | Code: settings. | feature 27 (settings, brand, onboarding) |
| PG5 | A Connections section always exists and says "Not connected" where there is no connection yet. | Code: settings. | feature 27 (settings, brand, onboarding) |
| PG6 | First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. | Code: first run. | feature 27 (settings, brand, onboarding) |
| PG7 | Empty states use the shared pattern: what this place is for, and one button. | Code: use of the shared empty component. | Now |
| PG8 | An error says what happened in plain words, what to do, and offers a retry. | Code: error component on the router. | feature 26 (shared shell) |
| PG9 | Loading shows a calm placeholder shaped like the content, not a bare spinner. | Code: use of skeletons. | feature 26 (shared shell) |
| PG10 | A missing page says so in plain words and leads back. | Code: not found component. | Now |

### Plain language and comfort rules

Written for a clerk, an officer or a village advocate who is comfortable with WhatsApp and not much else.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| PL1 | An app reads only its own words, never another app's. | Workspace boundaries. | Now |
| PL2 | English, Swahili and French are all complete. | Message catalogs. | Now |
| PL3 | Words come from the work, never from the database. | Person: read the screens aloud. | feature 15 (plain language) |
| PL4 | One main action per screen. | Person: count primary buttons. | feature 15 (plain language) |
| PL5 | Common jobs are guided step by step. | Person: try booking in, a statement, a charge. | feature 15 (plain language) |
| PL6 | Anything that cannot be reversed has undo or a clear confirmation. | Person: try to delete. | feature 15 (plain language) |
| CF1 | No text smaller than 11px. | Code: `text-[8px]` to `text-[10px]`. | Now |
| CF2 | 11px is used only for captions nobody must read to act. | Person. | Now |
| CF3 | Content text takes its size and weight from the global type, not inline sizes. | Code: count of `text-[Npx]`. | Now |
| CF4 | Buttons at least 36px tall, dense rows 30px, phone tap targets 44px. | Measure in a window. | Now |
| CF5 | Icon only buttons carry a label for screen readers and a hover title. | Code: `size="icon"` lines with `aria-label` or `title`. | Now |
| CF6 | Text contrast meets WCAG AA in light and dark. | Measure the palette. | Now |

### Visual tokens and density

Everything looks like one family. Only the accent colour differs.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| TK1 | One accent colour per app, set only in that app's styles. | Code: globals.css. | Now |
| TK2 | No hard coded colours in screens. | Code: hex and rgb in screens. | Now |
| TK3 | Light and dark themes both work. | Code: theme switch. | Now |
| TK4 | Phone, tablet and desktop breakpoints are defined once, in the shell package. | Code: shell. | feature 26 (shared shell) |

### Motion

One feel. A page changes, a tab opens, a panel slides, and it is the same everywhere.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| MO1 | Page, tab, panel and hover motion are named values in one shared place. | Code: shared styles. | feature 26 (shared shell) |
| MO2 | Reduced motion from the system is respected. | Code: `prefers-reduced-motion`. | Now |
| MO3 | The website replicas use the same motion values as the apps. | Code: www replica. | feature 26 (shared shell) |

### Native desktop behaviour

An installed app must not behave like a web page.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| NT1 | No developer tools in release builds: F12, Ctrl Shift I and Inspect are off. | Code and an installed build. | Now |
| NT2 | No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images. | Code. | Now |
| NT3 | Chrome is not selectable, content is. | Code and window. | Now |
| NT4 | Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows. | Code and window. | Now |
| NT5 | Ctrl T opens a new tab and Ctrl S saves. | Code: workspace-shell. | feature 26 (shared shell) |
| NT6 | The window size is remembered. | Code: window state plugin. | Now |
| NT7 | A real drag region with minimise, maximise and close. | Window. | Now |

### Code shape

From section 4 of the people and network plan. A fix is made once.

| Id | Rule | How to check | Arrives with |
|---|---|---|---|
| CS1 | The Rust API is split by domain and no `api/mod.rs` is over 600 lines. | Line count. | Now |

## Comfort numbers (rules CF1 to CF6)

Content text at least 14px. Sidebar and tab chrome 13px. Small captions no smaller than 11px, and never for anything a person must read to act. Buttons at least 36px tall. Dense sidebar and tab rows 30px with a mouse or trackpad. Phone tap targets at least 44px. Icons always come with words for main actions. Text contrast at WCAG AA.

## Motion values (rule MO1)

A page change is a fade with a 10px upward move, 240 ms, ease out. A new tab slides 10px and fades in, 280 ms, curve 0.22, 1, 0.36, 1. A panel slides in 220 ms. Hover and press feedback is 120 ms. Every one of these respects the system setting for reduced motion by dropping to instant or a plain fade.

## Native desktop rules (NT1 to NT7), in plain words

- Installed apps have no developer tools. They stay available in development builds.
- An installed app does not zoom with Ctrl and the wheel, reload with F5, pull to refresh, or let you drag a link or an image away.
- Menus, tabs, buttons and headings cannot be selected by accident. Papers, table cells, notes and reference numbers can be selected and copied.
- Right click on a record, a row or a tab opens the app's own menu. The smallest menu is Open, Open in new tab, and Print or Export where that thing has it. Text fields show the normal cut, copy and paste menu.
- The usual shortcuts work: Ctrl K, Ctrl W, Ctrl T, Ctrl S. The window can be dragged, minimised, maximised and closed, and it opens at the size you left it.

## Exceptions rule (AC-7)

An app may break a rule only when the break and the reason are written in that app's scope file, as one line:

`**Deviation:** <rule id>, <reason>`

The CI script lists every recorded deviation each time it runs. There are no other exceptions. Prisons will need a few, for Head Office, three pillars and connectivity, until the shell package has a slot for them.

## What the CI script checks (AC-8, fixed list)

The script is `toolings/ci/app-shape.ts`, written in TypeScript and run with Bun. It is built after feature 26, as a job beside the existing checks in `.github/workflows/ci.yml`. It looks only at things a program can see. It fails the build on these eight rules and prints the recorded deviations at the end.

| Rule | What it fails on | Checklist ids |
|---|---|---|
| R1 | An app's navigation data is missing Today as the first row. | SH4 |
| R2 | An app's Settings sections are missing one of the six, or are out of order. | PG4, PG5 |
| R3 | An app's first run steps are missing one of the five, or are out of order. | PG6 |
| R4 | A record page does not list Overview, Papers, People, History first. | PG2 |
| R5 | A screen sets its own text size or weight in content (the toolbar and chrome are allowed). | CF3 |
| R6 | A screen has a hard coded colour, or a text size under 11px. | TK2, CF1 |
| R7 | An icon only button has no `aria-label`. | CF5 |
| R8 | A release build can open developer tools, or `use-disable-devtools` exists and is never called. | NT1 |

Everything else in the checklist is scored by a person at each release. The first run of the script will fail today. That is the point: the list of failures is the list of gaps in [[APP-SHAPE-AUDIT]], and each one gets fixed or recorded as a deviation.
