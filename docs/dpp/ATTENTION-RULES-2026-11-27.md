# What each file needs next (2026-11-27)

One place decides it: `apps/dpp/src-tauri/src/domain/attention.rs`. API: `GET /api/attention`. Nothing stores it; every answer is derived from the records when asked.

## Why

The app had two fields that could disagree. `current_status` (under review, declined, returned…) and `stage` (receive, review, decide, prepare, handover, follow up, concluded). Each screen read one of them, so Okello's file was "Declined", "Prepare" and "awaiting a decision" at once. Today, the Files list, the Inbox, the status bar, the sidebar count and Diary now read the same answer.

## The answer, per file

`action` (allocate, read, decide, prepare, send, await_police, follow_court, closed), `holder` (office, officer, director, police, nobody) with the holder's name, `heldByMe`, `needsMe`, `dueAt`, `overdue`. The summary counts (`needsYou` on the workload, `summary` on attention) are sums of those rows. A test asserts they can never differ.

"What the file needs" and "what I need" are different on purpose: a colleague's file needs a decision but not from me; a file in court is held by me but needs me only when something is due.

## Rules (in order)

1. Concluded: Closed, owed by no one (unless a review reopening a decision is open: then Decide).
2. A decision recorded but the stage never advanced (receive, review, decide): treated as Prepare. The decision is made; its papers and answer are next.
3. Status returned for investigation: waiting on Police. Needs the responsible officer only once the reply date they set has passed.
4. Receive or review and nobody holds it: Allocate, held by the office.
5. Receive or review, held: Read. Decide: Decide, or waiting on the Director when a Director-only decision (discontinue, nolle prosequi) is proposed. Prepare: Prepare. Handover: Send.
6. Follow up (in court): needs the officer only with a hearing within two days, or a time limit past due.
7. Nobody signed in: nothing is mine.

## Not decided by the law or the office yet (do not guess)

- Who gives files out. `give_out` has no permission check. Treated as: the Director, the administrator and the clerk. Confirm with a practitioner.
- Whether an officer may work a file given to a colleague. Nothing stops it today; this only decides whose list it is on.
- A file nobody holds past the allocation stage counts as the signed-in person's (a solo office decides without giving out).
- Two days for "hearing soon" is a working choice, not a rule from a standard.
- Approvals other than the Director-only decisions are not modelled, so none are shown.

## Where it is used

Today (Needs you, Waiting on others, header count, Continue chips, Deadlines no longer repeat a due date already on a line), Case files (Mine, Stage, Next step, holder, sidebar count), Incoming (which rows need me), the status bar, the Case tab (one line), Diary header count (now equals the tab), Assist (one line of context, it describes and never decides).

## Tests

`cargo test --lib`: 97 pass. 12 rule tests in `attention.rs` (declined but at prepare, unassigned, colleague's file, Director-only, with Police before and after the date, concluded wins, in court, reopened, off-stepper decision, nobody signed in, summary is the sum). 5 API tests in `api/tests.rs` check attention, workload and the file list agree through the real router. Role tests use constructed actors; no API test signs in a second person (needs sign-in protection).

## Also changed

Native `<select>` replaced by the design-system Select through `components/choice-select.tsx` (13 files, 42 selects, same `<option>` children). Wording: Case files, Incoming, "Check this step", "Continue to…", Assist suggestions say nothing is decided until accepted. Registry columns no longer crush.

## Not done

Tab strip and file-tree feel (shared shell, five apps); stacked tab rows on the file page; ULII's Unconstitutional provisions and Subsidiary legislation tabs (need law data the app does not hold); Police and the other apps; the design canvas could not be fetched in this session (network), so screens were judged against the running app.
