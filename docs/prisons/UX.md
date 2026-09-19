# Interface (Obsidian approach)

Pleadli Prisons is a **legal notebook that runs a prison**, not a dashboard product. Obsidian is the closest widely known feel: local, linked, keyboard-first, quiet, dense when it needs to be.

This note is Prisons. The same craft can apply later to Police case files, DPP briefs, court cause lists, and lawyer matters. Do not build those UIs here.

Canonical screen list remains [[../product-map/08-application-structure]]. This note is **how those screens should feel**.

## What we take from Obsidian

| Obsidian | Here |
|---|---|
| Vault of notes | Facility node of files (people, instruments, events) |
| Wikilink `[[Note]]` | Typed links: person ↔ warrant ↔ court date ↔ property line |
| Graph (later, optional) | Timeline on the file is enough for v1 |
| Command palette | Already exists; it becomes the primary “go” |
| Quick switcher | Search route + palette, same index |
| Backlinks | “Appears in” on a prisoner: visits, productions, requests |
| Quiet chrome, editor first | File and Today first; nav is a thin map |
| Local by default, sync optional | P7: offline is normal |
| Markdown | Officer notes and generated documents; not a wiki editor for the whole record |
| Tabs / panes | One working pane. Split only if a procedure needs the file beside the step |

## What we do not take

- A blank markdown editor as the prison.
- Plugins.
- Daily notes as a substitute for count (count is still field-unknown).
- Graph view as a management toy.
- YAML frontmatter in the officer’s face.

## How a task should go

Obsidian users finish a thought without hunting menus. Officers should finish an **obligation** the same way.

1. **Today** or **palette**: “who is due”.
2. Open the **file** (the person) or the **procedure** (reception, discharge, court trip).
3. The screen already knows the next gate. The officer confirms, captures, or refuses.
4. The record is the leftover. They should not “fill a form named Transfer”.

Start (today’s add-record panel) becomes a **procedure launcher**: Receive someone, Discharge, Transfer, Court production, Visit, Request. Person-scoped procedures ask “who” with search, then the procedure shell.

## File (prisoner)

Header: name, number, category, status, where, next court, entitlement or remand clock. That is the YAML of the note, except it is structured and statutory.

Body:

- Overview = what is true now + recent timeline (backlinks).
- Legal, care, property, history = deep notes.
- Actions on the header start procedures, they do not open empty drawers of record types.

## Density and type

- Records officers get tables that print. Duty work gets queues and boards.
- One `h1` per page. Captions in muted text. Statute numbers in help, not in every tab label if the officer does not need them (keep s.118 on the legal list; drop it from casual chrome).
- Light and dark already exist. Prefer readable contrast over tinted stat tiles on Today.

## Motion

- Open file, open procedure, open palette: 150 to 250 ms, ease-out, fade + 8px.
- Same language as onboarding and `ProcedureShell`.
- Lists do not bounce.

## Keyboard

- Palette: already. Make every procedure and every person reachable.
- In a procedure: Enter advances a completed step, Escape is dirty-guarded close.
- In a table: existing DataTable patterns.

## Head Office

Obsidian’s “another vault” is the right metaphor: HQ is not a second copy of every note. It is an index (locate) plus institutional notes (returns, extracts). Overview is estate, not pairing.

## Copying this to other institutions later

Keep in this note only patterns: file, backlinks, palette, procedure, quiet chrome, local vault. Jurisdiction strings live in [[languages]] and in each product map.
