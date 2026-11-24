# Case 1 run log: simple theft, own advocate, bail granted

Run 2026-11-24 in real Tauri windows (debug builds, rebuilt that morning), file route, fictional names. Script: `01-theft-own-advocate.md`. The procedure is still NOT checked by a practitioner, so this proves the software does what the script says, not that the script is real Ugandan practice.

How it was driven: Police and DPP through their local API port (the same router the window uses), Courts and Lawyers through `api_request` inside their real windows, with screenshots of the Courts and Lawyers windows. Police's window stayed on its PIN screen (PIN unknown), so Police was checked through its API only. Two or three windows at a time: Police+DPP, then DPP+Courts, then Courts+Lawyers. Scripts and data: `~/.pleadli-accept/c1/` (`a1`..`a6`, `b1`..`b5`).

## Result by step

| # | Step | App | Result |
|---|---|---|---|
| 1 | Pair Police and DPP (invite, answer, typed fingerprint, confirmation) | Police, DPP | Pass |
| 2 | Case CRB 417/2026: complainant and suspect, two statements, arrest, release on police bond, charge sheet | Police | Pass |
| 3 | Referral sealed and carried to DPP | Police to DPP | Pass. DPP built the file with accused, complainant, charge and both statements |
| 4 | DPP accepts referral (ODPP/GULU/0417/2026), receipt back | DPP to Police | Pass. Police shows the referral "accepted" |
| 5 | Sanction without a charging review | DPP | Correctly refused: "Start the review and record its findings first." |
| 6 | Charging review (two-stage test, 13 criteria with notes), then sanction, notice to Police | DPP to Police | Pass. Notice imported by Police |
| 7 | Pair DPP and Courts, file at magistrate level | DPP, Courts | Pass |
| 8 | Registrar accepts, types court number CR 301/2026, receipt back | Courts to DPP | Pass. DPP file shows court number and "sanctioned". Courts case shows court, offence, parties, DPP reference and police CRB in the notes (seen in the window) |
| 9 | Pair the firm and the registry | Lawyers, Courts | Pass |
| 10 | Firm opens client and matter CR 301/2026, and a second matter CR 305/2026 | Lawyers | Pass |
| 11 | Plea sitting scheduled, notice sent to the firm | Courts to Lawyers | Pass |
| R1 | Clerk files the CR 301 notice on the CR 305 matter | Lawyers | Refused: "This notice is for case CR 301/2026, but that matter is CR 305/2026." |
| 12 | Notice filed on the right matter, hearing lands in the diary, receipt to court | Lawyers to Courts | Pass (seen in the window) |
| 13 | Court adjourns the plea sitting to a bail hearing, notice to the firm | Courts to Lawyers | Pass |
| 14 | Firm files a bail application, registrar accepts, firm sees "accepted" | Lawyers, Courts | Pass |
| 15 | Bail hearing held, order granting bail issued, order and the new hearing date sent to the firm | Courts to Lawyers | Pass. Order wording is a note on the matter; diary has plea, bail hearing, 15 Dec hearing (seen in the window) |

## Not proven

- **R2 (notice from another court with the same case number)** was not run in windows. It is covered by a unit test only. It needs a second registry install.
- Police window not seen (PIN). Police's decision notice and the referral status were read through its API, not looked at as an officer would.
- Every file was carried by hand. Postbox delivery was refused ("needs a Pleadli licence for an office"), and the relay route was not used.
- Prisons, custody-to-lawyer, refusal travelling back to Police/DPP: not part of this case.

## What a real person would find confusing or wrong (findings)

1. **The firm is never told what happened at a sitting.** The court held the plea and the bail sittings, but in the firm's diary both still say "scheduled" with Attended and Adjourned buttons. The firm learns only of new dates and orders. An advocate who was not in court has no record the plea was taken.
2. **"Accepted" is ambiguous for a bail application.** The registrar's acceptance means the filing was taken in, not that bail was granted. The firm's matter says only "accepted". The bail decision reached the firm only as an order note. A lawyer could read "accepted" as "granted".
3. **A magistrate-level filing was accepted by a registry named "High Court Registry"**, and the Courts sidebar names the court "Restart Test Court". The registry has two names and no level. (Test data, but a real registry could be misnamed the same way.)
4. **The DPP file stays at stage "receive"** after it is sanctioned and filed at court. The stage never moves.
5. **DPP's charging review records the profile name ("R. Prosecutor")** as starter, not the state attorney named on the decision. Two names on one decision.
6. **The firm's refusal in R1 names the case numbers but not the court**, which is fine here and would not help when two courts share a number (the new check covers that case, see the 2026-11-24 court identity change).
7. **Court number is a typed field at the registry.** If the registrar mistypes it, the firm's matter will not match. No check at DPP or at the firm that the number was the one issued.

## Not changed

No code was changed during this run. The only code changes today are the earlier Stage 0 items (ended-link wording, End connection reload, DPP "Ended" label and reason, court identity on matters). Nothing is committed.
