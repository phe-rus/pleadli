# Assist harness: design for approval (2026-11-26)

Status: proposal. Nothing here is built except the three pieces marked BUILT.

## What the owner asked for

Assist should be a harness. DPP adds skills; whichever model runs them, the work fits DPP. It is contextual (not everything at once), it can be done by hand, and nothing it produces is applied until a person reviews and approves it.

## Principles

1. **Manual is the product, Assist is a shortcut.** Every skill's output lands on a screen the prosecutor could have filled in by hand. No skill unlocks a step that is locked without it.
2. **Propose, never decide.** A skill returns a proposal. Only a person's accept writes to the file. (BUILT: proposals table with accept/reject.)
3. **The harness carries the quality, not the model.** A small model must not be able to hand over a result the file contradicts. Checks run in our code after the model answers. (BUILT for review: elements with `against`; a disputed element can never be "shown".)
4. **Context is chosen, not dumped.** Each skill declares what it reads. Tokens go to that, nothing else.
5. **Cheap by default.** Each skill declares a tier. (BUILT: Routine = 500/day model first; Judgement = strongest first, one cheap fallback; two attempts at most on a free key.)

## A skill is one declared piece of work

```
Skill {
  id            "review.check_elements"
  title         shown to the prosecutor, in their language
  when          which stage / screen offers it (Peruse, Decide, Send, Inbox...)
  reads         what it needs: file papers, statements, charges, guide entry,
                office history, platform rules (each optional, each capped)
  tier          Routine | Judgement
  returns       a JSON schema, so output is structured, never free prose
  checks        functions run on the answer before it is shown
  lands_on      the screen and field a person would fill by hand
  manual        the by-hand route, named, so the button is never the only way
}
```

Skills are data plus small functions in `apps/dpp/src-tauri/src/domain/skills/`, one file each. Adding a skill means adding a file and registering it. The model is never named in a skill.

## First skills (all exist today as hard-coded code; the move is to give them this shape)

| Skill | Tier | Reads | Lands on | Check after answer |
|---|---|---|---|---|
| Brief the file | Routine | papers, charges | Peruse rail | none needed |
| Arrange scanned papers | Routine | scan pages | Papers sorter | page numbers inside the scan |
| Check elements against the guide | Judgement | papers, statements, guide entry | Peruse elements | disputed => unclear; no "passed" while any open |
| Propose a decision | Judgement | review result, guide, history | Decide | reasons must cite a paper and page |
| Answer a question about the file | Routine | papers asked about | chat | none |

## Model independence

- Output is schema-bound JSON; unknown fields dropped, missing required fields rejected, one retry.
- Per-model quirks live in one adapter (provider, JSON mode, vision), not in skills.
- A skill may declare a minimum capability (for example "reads scans"). If the chosen model lacks it, the harness says so and the manual route stays open.
- Free keys: the harness shows the day's remaining allowance for the strongest models and does not spend it on Routine work.

## What it will not do

- Run all stages in one go. Each skill is started from its own screen by a person.
- Write to the file, send, or close anything.
- Hide which model answered. The model name stays on the proposal (BUILT).

## Open questions for the owner

1. Should an office be able to add its own skills (for example its own checklist for a recurring offence), or only enable and disable the ones DPP ships?
2. Should a rejected proposal's reason be kept and fed back as context next time?
3. Which of the five skills above do prosecutors want first, if only one gets polished?

## Build order if approved

1. Define `Skill` and a registry; port the five skills without changing behaviour.
2. Move post-answer checks into the registry; add a test per check.
3. Show remaining free allowance in Settings.
4. Only then: office-authored skills (question 1).
