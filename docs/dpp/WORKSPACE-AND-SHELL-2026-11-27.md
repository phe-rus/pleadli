# Workspace hierarchy, the tab strip and ULII tabs (2026-11-27)

Canvas recovered: `docs/dpp/canvas-2026-11-25/` (16 `.dc.html` boards and `canvas.json`, copied from an earlier session's scratchpad; the claude.ai artifact itself could not be read by tool). It remains the visual reference. Its file page has one header (title, one line of facts, a three step progress and one primary button), the papers on the left, the page in the middle, Assist on the right. No strip, no stacked tab rows.

## The strip, reviewed

What it was: every area the person visited (Today, Case files, Registry, Police stations, Incoming) became a tab, up to five, beside the sidebar that already names those places; the oldest was dropped silently when a sixth opened; tabs could be pinned and dragged. For a prosecution officer that is two navigation systems saying the same thing, plus editor vocabulary (pin) and tabs vanishing.

What it is now (shared shell, opt-in): `ShellConfig.strip` with `shows`, `pinning`, `accessory`, and `maxTabs`. DPP draws only the case files being worked on, with no pin, up to eight, and a small amber dot on a file that needs the person signed in (red when a time limit has passed). Areas are not tabs: the sidebar shows where you are. Areas still go into Recent. The previous/next buttons cycle only the files drawn. The visual identity of a tab (pill, ring, hover, close) is unchanged. The other four apps pass no `strip` and behave exactly as before. Open question for the owner: Ctrl+Tab still cycles every saved tab including undrawn areas.

## Hierarchy

1. Application navigation: the sidebar (Today, Incoming, Case files, Diary, Registry, lower account controls and Assist).
2. Files being worked on: the strip, only when files are open.
3. Case level: the record tabs (Case, The file, People, Activity) and, on the Case tab, the step bar (Peruse, Decide, Send, In court) with the one primary button. The sub-stages of a step (Receive, Review) are now a segmented control on the step's header rather than a further row of tabs.
4. Document level: the papers list and the paper itself.
5. Actions: one primary action per surface. On a paper, Print; Open in Word, Save as Word and Save as PDF are one "Save a copy" menu (they were three buttons beside it).

What the Case tab says about work: one line (what is next, who has it, a Take button when the person may take it) and a list of everything else owed with its date and whose it is. See ATTENTION-RULES.

## ULII tabs

Document detail and History belong to any paper. Related documents and Citations are shown on a prosecution file's own papers only when they have something (`PaperTabs showEmpty` is false by default; a legal authority passes true). The names stay as the owner asked. Unconstitutional provisions and Subsidiary legislation are not added to prosecution papers and not built: they need law data the app does not hold, and no provision is invented. They are an integration requirement for the legal guide and the laws module, to appear only on legal authorities once the data exists.

## Not done here (honest list)

Case tab still stacks the stage bar above the step card; the file header block is tall (title, facts, then tabs begin about 300px down); Decide, Send and Court screens were not restructured further; the paper dropdown changes the other four apps' paper toolbar too (English "Save a copy" until each supplies its own word); Ctrl+Tab behaviour above; Select checks were done by hand on a sample, not all 42.
