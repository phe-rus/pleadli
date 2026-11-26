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

## Revision (same day, later): obligations, not one next action

The first version answered "what does this file need next" with one value, which could hide a hearing tomorrow behind a paper still to prepare. A file now has four separate answers, all from `attention.rs`:

| Answer | Field | Meaning |
|---|---|---|
| Overall state | `state` | Where the file is: unallocated, reading, deciding, preparing, sending, with Police, in court, closed. |
| Outstanding obligations | `obligations[]` | Everything owed at once. Each has `kind` (allocate, read, decide, director_decision, prepare, send, police_reply, hearing, time_limit, task), `dueAt`, `overdue`, `mine`, `detail`. |
| Most relevant next action | `primary` | The first obligation of the person signed in (mine first, past due first, nearest date, the stage's own step before undated extras). A pointer into the list, never a replacement. `action` stays as the stage's step. |
| The signed-in person's part | `heldByMe`, `needsMe`, `canTake` | `needsMe` is true when any obligation is theirs. |

Sources of obligations: the stage step; every hearing from a day ago onward on any open file (not only files in court); each open time limit (the allocation limit is the date of the give-out step, not a second duty); each open task, which belongs to whoever it is assigned to. A hearing inside the notice period is owed by the holder; the next later hearing is listed but is nobody's yet.

Summary: `total` counts files, once each. Its parts are `toAllocate + toRead + toDecide + toSend + toFollowUp` (a file needing the person only for a hearing, limit, task or chase). `withSeveral` counts files where the person owes more than one thing. A test asserts the sum.

### The two-day hearing threshold

It was a constant in code. Nothing in the project requirements sets it, so it is no longer fixed: it is the office's `hearing_notice` time limit (days, default 2, Settings > Who does what), read on every call. The default is a working choice and is documented as one.

## Who may do what (capabilities)

`domain/capabilities.rs`, table `role_capabilities` (migration 0044), screen Settings > Who does what, API `GET/PUT /api/capabilities`, `GET /api/capabilities/mine`.

Administering the application (people, sign-in, backups, settings; the administrator role) is separate from prosecuting. Five powers, each granted to a role on its own: register files, give files out, move files between people, take a file for oneself, review and decide. Plus two that do not come from the table: approving Director-only decisions (Director flag on the person; Constitution Art. 120(3)(d), Trial on Indictments Act s.135) and administering (administrator role). The Director holds every file power.

Enforced in the API: registering a file and receiving it need register; give-out needs allocate (file nobody holds, to another), self-assign or allocate (to oneself), reassign (any file someone holds); the person receiving a file must be able to review, so an administrator cannot be given one; starting a review, recording a decision and changing a file's stage need review. Attention respects the same set: an administrator holding a file does not "need" anything on it, a clerk gives out but is not offered files to take, only a person who may self-assign sees `canTake`.

Seeded defaults (starting point only): administrator none; prosecutor take + review; clerk register + give out. With sign-in off there is one person, who holds every power.

### Unresolved: the client's allocation policy

Not confirmed, so nothing here is an institutional rule: who gives files out (clerk, Director, a senior prosecutor, all of them), whether prosecutors may take files themselves, whether anyone but the Director may reassign. The table is the place to set it; the defaults must be confirmed with a practitioner. Also open: an officer can still open and work a file given to a colleague (only whose list it is on changes); decisions other than the Director-only ones have no approval step because none is modelled.

## Multi-user API tests

`api/tests.rs`, section "A shared office": setup with an administrator, the Director, two prosecutors and a clerk, each with a PIN; the tests sign in as each in turn through `/api/session/sign-in`. Covered: the administrator cannot register, review, decide, move a stage or hold a file; clerk registers and gives out but cannot take, review or reassign; prosecutor takes but cannot give out or move; only the Director reassigns; per-person counts and holder names isolate correctly and workload equals attention for each person; a Director-only proposal waits on the Director for everyone else; one file owing a paper, a hearing and a colleague's task at once, seen differently by two people; an administrator changes the grants and nobody else can; solo mode.
