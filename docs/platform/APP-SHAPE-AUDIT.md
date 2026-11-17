# App shape audit

Run 2026-11-17, against the checklist in [[APP-SHAPE]] (spec 0003). This is a **static audit**: it reads the source, counts things in it and compares files. Nobody opened the five apps in a real window for it, so everything that needs a person or a window is marked Unchecked and left out of the percentage. Run it again after each app moves onto `@pleadli/shell`.

## Scores

| App | Matches | Partial | Missing | Unchecked | Score |
|---|---|---|---|---|---|
| Police | 15 | 10 | 11 | 11 | **56%** |
| DPP | 17 | 11 | 8 | 11 | **63%** |
| Courts | 18 | 6 | 12 | 11 | **58%** |
| Lawyers | 17 | 10 | 9 | 11 | **61%** |
| Prisons | 17 | 10 | 9 | 11 | **61%** |

Score = (Matches + half of Partial) divided by the rules that were looked at. 47 rules in all.

**What the scores say.** All five sit between 56% and 63%, so no app is far ahead. They are close on looks (colour, dark mode, motion, window size) and far apart on the parts that decide whether a nervous user succeeds: Settings, first run, error and loading states, record page tabs and French.

The plan expected Prisons to drift most. On this static check it does not. Police scores lowest (56%) because its Settings has no sections and its record page has the wrong tabs. Courts has the most Missing rules (12): no sign out in the shell, no first run, no message files. Prisons is middle on structure and weakest on comfort (text under 11px, 71 inline text sizes, unlabelled icon buttons). A window check may still show Prisons differs more than the code says, because its shell has three pillars and extras the checklist cannot see.

## Findings that matter most

1. **The developer tools guard is dead code in all five apps.** `apps/<app>/src/hooks/use-disable-devtools.ts` is identical in each and nothing imports it. Tauri keeps devtools off in release builds unless the cargo feature is on, and none of the five turns it on, so the risk may be small, but nobody has tested an installed build and the guard that was written to be the safety net does nothing.
2. **Courts has no message files.** `apps/courts/messages/` is empty, so every word is typed in English inside the code, including the Settings section names. English, Swahili and French cannot be offered until that is fixed.
3. **Only Prisons has an error screen.** Everywhere else a failure shows the router's default, which is a developer message.
4. **No app has a loading placeholder.** All five show the same small `Loaders` component.
5. **No record page follows the Overview, Papers, People, History order.** Nobody has a People tab.
6. **Courts has no first run and no way to sign out from the shell.**
7. **Prisons French is about a tenth done** (about 320 keys of 3,250). Police has no French at all.

## The full matrix

### Shell structure

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| SH1 | A full height left sidebar with window controls and the sidebar toggle on top, then the crest, product name and office name. | Matches | Matches | Matches | Matches | Matches |
| SH2 | Search sits at the top of the sidebar with a quick add button. | Matches | Matches | Matches | Matches | Matches |
| SH3 | The foot of the sidebar shows the signed in person with language, settings and sign out. | Matches | Matches | Partial | Matches | Matches |
| SH4 | Today is the first row, then the daily places, then the registers, then the office. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| SH5 | The tab strip has previous and next buttons. | Matches | Matches | Matches | Matches | Matches |
| SH6 | A licence bar sits above the page. | Matches | Matches | Matches | Matches | Matches |
| SH7 | A status bar sits at the foot of the page. | Missing | Matches | Missing | Missing | Missing |
| SH8 | An optional right panel slot works the same way in every app. | Missing | Missing | Missing | Missing | Matches |
| SH9 | The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. | Missing | Missing | Missing | Missing | Missing |
| SH10 | Ctrl K opens search, Ctrl W closes a tab, Ctrl Tab moves along tabs, Ctrl 1 to 9 jump to a tab. | Matches | Matches | Matches | Matches | Matches |

Evidence:

- **SH3.** Courts has no sign out or language control in the shell.
- **SH8.** Only Prisons has one, and it is its own.
- **SH9.** About 6,300 lines are repeated five times today.

### Page patterns

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| PG1 | Lists use the shared table and no hand built tables. | Partial | Partial | Matches | Partial | Partial |
| PG2 | Record pages show the tabs Overview, Papers, People, History first, in that order. | Missing | Partial | Missing | Partial | Partial |
| PG3 | A tab with nothing in it shows a calm empty state that says what goes there and offers one button. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| PG4 | Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. | Missing | Partial | Partial | Partial | Partial |
| PG5 | A Connections section always exists and says "Not connected" where there is no connection yet. | Partial | Partial | Missing | Matches | Matches |
| PG6 | First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. | Partial | Partial | Missing | Partial | Partial |
| PG7 | Empty states use the shared pattern: what this place is for, and one button. | Matches | Matches | Matches | Matches | Partial |
| PG8 | An error says what happened in plain words, what to do, and offers a retry. | Missing | Missing | Missing | Missing | Matches |
| PG9 | Loading shows a calm placeholder shaped like the content, not a bare spinner. | Missing | Missing | Missing | Missing | Missing |
| PG10 | A missing page says so in plain words and leads back. | Matches | Matches | Matches | Matches | Matches |

Evidence:

- **PG1.** Hand built tables: Police 5, DPP 1, Lawyers 4, Prisons 10, Courts 0.
- **PG2.** Police person page: Timeline, Photos, Files. DPP file: Case, Papers, Activity. Lawyers matter: Matter, Papers, Notes, Money, Activity. Prisons prisoner: Overview, Legal, Care, Property, History. Courts case page has no tabs. Nobody has People.
- **PG4.** Police Settings is one long page of 475 lines with no sections.
- **PG6.** DPP and Lawyers share `@pleadli/setup`. Police and Prisons have their own. Courts has no first run, only a profile card.
- **PG7.** Static check is rough. Prisons builds most of its own.
- **PG8.** Only Prisons sets an error component. The others show the router default.
- **PG9.** No app uses a skeleton. Every app shows its `Loaders` component.

### Plain language and comfort rules

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| PL1 | An app reads only its own words, never another app's. | Matches | Matches | Matches | Matches | Matches |
| PL2 | English, Swahili and French are all complete. | Partial | Matches | Missing | Matches | Partial |
| PL3 | Words come from the work, never from the database. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| PL4 | One main action per screen. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| PL5 | Common jobs are guided step by step. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| PL6 | Anything that cannot be reversed has undo or a clear confirmation. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| CF1 | No text smaller than 11px. | Matches | Matches | Matches | Matches | Missing |
| CF2 | 11px is used only for captions nobody must read to act. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| CF3 | Content text takes its size and weight from the global type, not inline sizes. | Partial | Partial | Matches | Partial | Missing |
| CF4 | Buttons at least 36px tall, dense rows 30px, phone tap targets 44px. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |
| CF5 | Icon only buttons carry a label for screen readers and a hover title. | Partial | Partial | Matches | Partial | Missing |
| CF6 | Text contrast meets WCAG AA in light and dark. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |

Evidence:

- **PL2.** Police has no French. Courts has no message files at all, its words are typed into the code in English. Prisons French has about 320 of 3,250 keys.
- **CF1.** Prisons has 7 uses below 11px.
- **CF2.** Prisons has 19 uses of 11px to review.
- **CF3.** Inline sizes: Police 41, DPP 39, Courts 6, Lawyers 40, Prisons 71. Chrome may set its own, so some are fine.
- **CF5.** Labelled on the same line: Police 19 of 24, DPP 18 of 21, Courts 5 of 5, Lawyers 13 of 15, Prisons 11 of 16.

### Visual tokens and density

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| TK1 | One accent colour per app, set only in that app's styles. | Matches | Matches | Matches | Matches | Matches |
| TK2 | No hard coded colours in screens. | Matches | Matches | Matches | Matches | Matches |
| TK3 | Light and dark themes both work. | Matches | Matches | Matches | Matches | Matches |
| TK4 | Phone, tablet and desktop breakpoints are defined once, in the shell package. | Missing | Missing | Missing | Missing | Missing |

Evidence:

- **TK2.** None found in any app.

### Motion

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| MO1 | Page, tab, panel and hover motion are named values in one shared place. | Missing | Missing | Missing | Missing | Missing |
| MO2 | Reduced motion from the system is respected. | Matches | Matches | Matches | Matches | Matches |
| MO3 | The website replicas use the same motion values as the apps. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |

Evidence:

- **MO1.** No named motion values were found in `packages/ui`.

### Native desktop behaviour

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| NT1 | No developer tools in release builds: F12, Ctrl Shift I and Inspect are off. | Partial | Partial | Partial | Partial | Partial |
| NT2 | No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images. | Partial | Partial | Partial | Partial | Partial |
| NT3 | Chrome is not selectable, content is. | Partial | Partial | Partial | Partial | Partial |
| NT4 | Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows. | Partial | Partial | Partial | Partial | Partial |
| NT5 | Ctrl T opens a new tab and Ctrl S saves. | Missing | Missing | Missing | Missing | Missing |
| NT6 | The window size is remembered. | Matches | Matches | Matches | Matches | Matches |
| NT7 | A real drag region with minimise, maximise and close. | Unchecked | Unchecked | Unchecked | Unchecked | Unchecked |

Evidence:

- **NT1.** Real finding: `use-disable-devtools.ts` exists in all five apps and nothing calls it. No app turns on the Tauri devtools feature, which should keep them off, but no installed build has been tested.
- **NT2.** Only overscroll is switched off, in the shared styles.
- **NT3.** Shared components set no selection one by one. There is no global rule.
- **NT4.** Only the tab strip has an app menu today.

### Code shape

| Id | Rule | Police | DPP | Courts | Lawyers | Prisons |
|---|---|---|---|---|---|---|
| CS1 | The Rust API is split by domain and no `api/mod.rs` is over 600 lines. | Missing | Missing | Matches | Missing | Matches |

Evidence:

- **CS1.** api/mod.rs lines: Police 1,885, DPP 1,463, Lawyers 1,402, Courts 549, Prisons 93.

## Gaps per app, in priority order

Each list is also queued in that app's own scope file under "Shape gaps". Order: anything about safety first, then Missing before Partial, then the order of the checklist. Items marked with a feature number are fixed by that shared feature and need no separate work in the app.

### Police

1. NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. SH7 (Missing): A status bar sits at the foot of the page. Fixed by feature 26 (shared shell).
3. SH8 (Missing): An optional right panel slot works the same way in every app. Fixed by feature 26 (shared shell).
4. SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
5. PG2 (Missing): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
6. PG4 (Missing): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
7. PG8 (Missing): An error says what happened in plain words, what to do, and offers a retry. Fixed by feature 26 (shared shell).
8. PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
9. TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
10. MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
11. NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
12. CS1 (Missing): The Rust API is split by domain and no `api/mod.rs` is over 600 lines.
13. PG1 (Partial): Lists use the shared table and no hand built tables.
14. PG5 (Partial): A Connections section always exists and says "Not connected" where there is no connection yet. Fixed by feature 27 (settings, brand, onboarding).
15. PG6 (Partial): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
16. PL2 (Partial): English, Swahili and French are all complete.
17. CF3 (Partial): Content text takes its size and weight from the global type, not inline sizes.
18. CF5 (Partial): Icon only buttons carry a label for screen readers and a hover title.
19. NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
20. NT3 (Partial): Chrome is not selectable, content is.
21. NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

### DPP

1. NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. SH8 (Missing): An optional right panel slot works the same way in every app. Fixed by feature 26 (shared shell).
3. SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
4. PG8 (Missing): An error says what happened in plain words, what to do, and offers a retry. Fixed by feature 26 (shared shell).
5. PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
6. TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
7. MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
8. NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
9. CS1 (Missing): The Rust API is split by domain and no `api/mod.rs` is over 600 lines.
10. PG1 (Partial): Lists use the shared table and no hand built tables.
11. PG2 (Partial): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
12. PG4 (Partial): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
13. PG5 (Partial): A Connections section always exists and says "Not connected" where there is no connection yet. Fixed by feature 27 (settings, brand, onboarding).
14. PG6 (Partial): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
15. CF3 (Partial): Content text takes its size and weight from the global type, not inline sizes.
16. CF5 (Partial): Icon only buttons carry a label for screen readers and a hover title.
17. NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
18. NT3 (Partial): Chrome is not selectable, content is.
19. NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

### Courts

1. NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. SH7 (Missing): A status bar sits at the foot of the page. Fixed by feature 26 (shared shell).
3. SH8 (Missing): An optional right panel slot works the same way in every app. Fixed by feature 26 (shared shell).
4. SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
5. PG2 (Missing): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
6. PG5 (Missing): A Connections section always exists and says "Not connected" where there is no connection yet. Fixed by feature 27 (settings, brand, onboarding).
7. PG6 (Missing): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
8. PG8 (Missing): An error says what happened in plain words, what to do, and offers a retry. Fixed by feature 26 (shared shell).
9. PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
10. PL2 (Missing): English, Swahili and French are all complete.
11. TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
12. MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
13. NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
14. SH3 (Partial): The foot of the sidebar shows the signed in person with language, settings and sign out.
15. PG4 (Partial): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
16. NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
17. NT3 (Partial): Chrome is not selectable, content is.
18. NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

### Lawyers

1. NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. SH7 (Missing): A status bar sits at the foot of the page. Fixed by feature 26 (shared shell).
3. SH8 (Missing): An optional right panel slot works the same way in every app. Fixed by feature 26 (shared shell).
4. SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
5. PG8 (Missing): An error says what happened in plain words, what to do, and offers a retry. Fixed by feature 26 (shared shell).
6. PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
7. TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
8. MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
9. NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
10. CS1 (Missing): The Rust API is split by domain and no `api/mod.rs` is over 600 lines.
11. PG1 (Partial): Lists use the shared table and no hand built tables.
12. PG2 (Partial): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
13. PG4 (Partial): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
14. PG6 (Partial): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
15. CF3 (Partial): Content text takes its size and weight from the global type, not inline sizes.
16. CF5 (Partial): Icon only buttons carry a label for screen readers and a hover title.
17. NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
18. NT3 (Partial): Chrome is not selectable, content is.
19. NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

### Prisons

1. NT1 (Partial): No developer tools in release builds: F12, Ctrl Shift I and Inspect are off.
2. SH7 (Missing): A status bar sits at the foot of the page. Fixed by feature 26 (shared shell).
3. SH9 (Missing): The tab strip, tabs store, header, quick add, licence bar and status bar come from `@pleadli/shell`, not a copy. Fixed by feature 26 (shared shell).
4. PG9 (Missing): Loading shows a calm placeholder shaped like the content, not a bare spinner. Fixed by feature 26 (shared shell).
5. CF1 (Missing): No text smaller than 11px.
6. CF3 (Missing): Content text takes its size and weight from the global type, not inline sizes.
7. CF5 (Missing): Icon only buttons carry a label for screen readers and a hover title.
8. TK4 (Missing): Phone, tablet and desktop breakpoints are defined once, in the shell package. Fixed by feature 26 (shared shell).
9. MO1 (Missing): Page, tab, panel and hover motion are named values in one shared place. Fixed by feature 26 (shared shell).
10. NT5 (Missing): Ctrl T opens a new tab and Ctrl S saves. Fixed by feature 26 (shared shell).
11. PG1 (Partial): Lists use the shared table and no hand built tables.
12. PG2 (Partial): Record pages show the tabs Overview, Papers, People, History first, in that order. Fixed by feature 26 (shared shell).
13. PG4 (Partial): Settings has these sections in order: Profile and sign in, Language and appearance, Backup, Licence, Connections, Setup. Fixed by feature 27 (settings, brand, onboarding).
14. PG6 (Partial): First run steps in order: Language, Who is this office, First person and sign in, Backup choice, Recovery option. Fixed by feature 27 (settings, brand, onboarding).
15. PG7 (Partial): Empty states use the shared pattern: what this place is for, and one button.
16. PL2 (Partial): English, Swahili and French are all complete.
17. NT2 (Partial): No browser page behaviours: Ctrl wheel zoom, F5 reload, pull to refresh, dragging links and images.
18. NT3 (Partial): Chrome is not selectable, content is.
19. NT4 (Partial): Right click on a record, row or tab shows the app menu. Text fields show the native menu. The browser menu never shows.

## What was not measured

Settings, first run, record pages and empty states were read in the source, not used. Rules marked Unchecked need a person with a window, and the plain language rules (PL3 to PL6) belong to feature 15, which asks five real people from Police and Prisons to do three jobs each. Nothing here says an app is pleasant to use, only whether it follows the shape.
