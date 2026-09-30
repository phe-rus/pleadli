# DPP: the case pipeline and Assist (decided 2026-09-29)

The client's direction after trying Phase 2: the DPP must carry a file to its end, not stop at editing; Assist prepares every step from the country's law and the office's own past handling, and the prosecutor reads, accepts and moves on, like a project board. Decisions below were accepted by the user on 2026-09-29.

## Decisions

| # | Decision | Chosen |
|---|---|---|
| P1 | Where the AI runs | The desktop's Rust backend. It holds the keys and calls the provider. The screen uses TanStack AI's `useChat` through a `stream()` connection adapter that turns the backend's answer into AG-UI chunks. No Pleadli server needed. |
| P2 | Providers | Gemini, OpenRouter, Anthropic (Claude), and any OpenAI-compatible server (Ollama, a government endpoint). One active provider per office. |
| P3 | Model choice | Automatic by default: the backend reads the provider's official model list and picks by a ranked preference (newest general "flash/sonnet" class; OpenRouter's own `openrouter/auto`). The list is shown for anyone who wants to choose. Busy or retired models fall through to the next. |
| P4 | Spine | Seven stages per file: Receive, Review, Decide, Prepare, Hand over, Follow up, Concluded. The office board shows every case in these columns. |
| P5 | Accepting | One stage at a time. Assist's proposal for a stage is accepted, edited or rejected by a named person; accepting records it (a decision, a document, a hand-over) and moves the case on. No accept-all. |
| P6 | Law | Laws.Africa Content API (institution's token) for the countries it covers, stored in the app with an "as at" date and refreshed when online; hand-kept texts for DR Congo until a source is confirmed. Assist quotes only stored text and names its date. |

## Structure (simplified)

- Sidebar: Today, Cases (board or list), Calendar, Documents, Statistics. Ribbon: Home, Search, Add, Assist.
- A file: three tabs. **Case** (cover, the stage stepper, the current stage with Assist's proposal), **The file** (every document, in the country's order), **Activity** (everything that happened: decisions, hearings, hand-overs, documents).
- Assist is one panel, opened from the ribbon anywhere, aware of where it is (a file, the board, the office).

## Stages and what accepting does

| Stage | Assist proposes | Accepting |
|---|---|---|
| Receive | The file arranged; people and proposed charges found in the papers | Confirms the index, adds people and charges |
| Review | The brief: facts, gaps, contradictions, evidential and public-interest view | Saves it as the review note, in the prosecutor's name |
| Decide | One decision with reasons, from the country's decision set | Records the decision (DPP-only decisions still refused to others) |
| Prepare | The documents the decision needs (charge sheet, directions to Police, reasons for declining) | Creates them as drafts to edit and sign |
| Hand over | Who gets what, how (connected station, email, print, collection), and the covering note | Records the hand-over; the organised file is exported as one PDF |
| Follow up | Next dates, reminders, the next move when Police or the court answers | Adds the tasks and dates |
| Concluded | The outcome and a closing note | Records the outcome and closes the file |

## What Assist is told

The platform itself (this document's stages), the country pack (references, file order, courts, time limits, decisions), the stored law text relevant to the offences, the file, and the office's own history: how similar offences were decided here, and which past proposals prosecutors changed or rejected and why. Nothing is used to train a model.

## Output

The organised file: a cover, the index with sheet numbers, then every document in order (scans copied page for page, typed documents set as pages), as one PDF built on the desktop. It can be saved, printed, or attached to an email; a connected station receives it through the exchange.
