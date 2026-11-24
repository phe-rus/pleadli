# Real case runs: plan, stages and needs

Written 2026-11-24 so a fresh session can start here. Owner's rule: the five institutions (Police, DPP, Courts, Lawyers, Prisons) are tested by running real cases through them, back and forth, the way people actually work, in the real desktop windows. Pairing, trust and revoke on fictional records is plumbing and does not count as tested.

## Where we are

**Proven in real windows (2026-11-24), Courts and Lawyers only, file route, fictional names:** a Ugandan theft case (CRB 214/2026) with a sitting, adjournment to a next date, hearing notice to the firm, refusal of a notice filed on the wrong matter, filing on the right matter (hearing lands in the firm diary, receipt back to the court), a bail application filed and accepted, then the firm ending the link and both directions refusing.

**Not proven:**
- Police to DPP to Courts to Prisons to Lawyers as one case. Police to DPP referral was run earlier in windows (2026-11-21 to 24); DPP to Courts, Courts to Prisons and Prisons orders were only unit tested.
- Any refusal or rejection travelling back to the sender and being understood by the person (court returns a filing, DPP declines a file, Prisons cannot produce a person).
- How a person held in police custody gets a lawyer. I found no feature for this in Police or Prisons code (the only "counsel" hits in `apps/police` and `apps/prisons` domain code are a test string in `rules.rs`). Lawyers has `plea.rs` and a custody status on clients ("remanded"), but nothing links a Police custody record to a lawyer. Treat as not built until checked again.
- Postbox delivery between two computers (every file so far was carried by hand), and two real machines.
- Different court levels, civil and family work, and different kinds of lawyer.

## Stage 0: close known gaps first (small, before the runs)

From the 2026-11-24 run. Each is a real finding, not speculation.
1. Courts and Lawyers: a notice or filing is matched by case number only. Case numbers repeat across courts. Match on court identity as well as number.
2. Refusal wording after a link is ended (Courts: "That firm has not confirmed this registry yet"; Lawyers: "No court registry has confirmed this firm yet") should say the connection was ended and by whom.
3. Lawyers court-notices "End connection" waits for the native save dialog before reloading, so the row stays "Trusted". Reload first, save the file after. Same pattern on invite and trust buttons.
4. Check Prisons and DPP responder screens for the same missing "Ended" label and dropped reason that was fixed in Courts (`firm-links.tsx`, `prison-links.tsx`).
5. A custody-to-lawyer path (see Stage 1, case 2) needs a design decision before it can be run. Do not invent it silently.

## Stage 1: write the cases (under ten) before running any

Each case gets a one page script in `docs/platform/cases/NN-name.md`: who the people are, the real procedure step by step, which app each step happens in, what each person sees, and what must be refused. **The procedure must be checked against a real source** (Uganda criminal and civil procedure, the owner, or a practitioner) before running. The list below is a proposal from general knowledge, not verified procedure.

| # | Case | What it proves |
|---|------|----------------|
| 1 | Simple theft, magistrate court, accused has his own advocate, bail granted | Baseline chain Police, DPP, Court, Lawyer, with adjournments |
| 2 | Suspect held at a police station, no lawyer, within the 48 hour limit | How a person in custody gets a lawyer: own advocate called by a relative, legal aid or state brief, duty counsel. The missing feature |
| 3 | Capital offence (murder), committal to the High Court, state brief, remand at Prisons | Court level change, state-appointed lawyer, remand order to Prisons, production warrants |
| 4 | DPP declines to sanction, or returns the file for more investigation | Refusal travelling back to Police and being understood |
| 5 | Lawyer's bail application refused by the court | How the lawyer learns of the refusal, reason shown, what they can do next (re-file, appeal) |
| 6 | Adjourned because the prisoner was not produced | Prisons failure reaching the court, responsible party recorded |
| 7 | Civil commercial suit between two firms | Courts and Lawyers only, plaint, defence, scheduling, judgment, no Police/DPP/Prisons |
| 8 | Child in conflict with the law (juvenile court, remand home, not prison) | Different structure: different court, different custody, guardian involved |
| 9 | Appeal or revision from a magistrate to the High Court | Notice of appeal, record moves up, different court identity |

Later, outside the first ten: the same shapes for Kenya and DR Congo (civil-law procedure, French), and a second firm so one court talks to two firms at once.

Lawyer types to cover across the cases: private advocate (sole), firm with an associate and a clerk, state-appointed or legal aid counsel, DPP state attorney (inside the DPP app), and a firm acting for a company in the civil case. Court levels: grade one magistrate, chief magistrate, High Court (criminal and commercial divisions), juvenile or family, and the appellate step.

## Stage 2: make running cases cheap

Needed so each case is a script, not an afternoon.
- A generic harness in `~/.pleadli-accept` (extend `pf.ts` and `pair.ts`): start any pair of apps, sign in, pair, and call routes by app name instead of window port. Five windows at once will not fit in memory (about 4.5 GB free), so each case runs in the order of its steps with at most two or three windows open, one pair at a time. Never run a second app server unless needed.
- Clean data per case (copy a base data folder, never reuse a link that has been ended). Lawyers has a debug-only PIN reset (`PLEADLI_DEV_RESET_PINS`); Courts has none, so keep a Courts data folder without a PIN or add the same debug hook.
- A run log per case, `docs/platform/cases/NN-name-run.md`: each step, pass or fail, a screenshot name, and what a registrar, advocate, officer or prison officer would see.
- Decide file route versus postbox. The postbox needs a licensed office on each computer and www running locally. Start every case on the file route, then repeat one case end to end on the postbox.

## Stage 3: run, one case at a time

Order: 1, then 4 and 5 (refusals), then 2 (needs the custody design), then 3, 6, 7, 8, 9. For every case:
1. Read the script, open only the windows needed.
2. Act as each person: use the real screens where a person would click, and the routes only for steps the screens cannot do in this environment (the Wayland setup hides native dialogs).
3. Record every place a real person would be stuck, confused or misled, not only crashes.
4. Fix what is small and clear, log what is not, and re-run the case.

## What is needed from the owner

1. Confirm or correct the nine cases and the real procedure for each, or name who can (an advocate, a registrar, a police officer).
2. Decide how a person in custody reaches a lawyer in the product: a request recorded in Police custody that goes to a lawyer or a legal aid body, a duty counsel list, or only a record of who the person asked for. Police and Prisons are not allowed to talk directly to each other by design, so say which institution holds the lawyer link.
3. Say whether the first run should stay on fictional names or use realistic Ugandan ones (courts, case numbers, offences), and whether Kenya and DR Congo come in the first ten.
4. Decide whether the notice and filing court identity check (Stage 0, item 1) should be built before the runs or found again in them.

## Constraints that stay

No commits and no push. No CI, no release or deploy. Test in the real Tauri window, not only Chrome or unit tests. One app server at a time, kill by process id, never a whole-disk search. Never Python. No em-dashes in product text. Everything is judged by what a real person doing real work would see.
