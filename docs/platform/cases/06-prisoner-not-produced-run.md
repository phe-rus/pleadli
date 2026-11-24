# Case 6 run: prisoner not produced (Courts, Prisons, Lawyers)

Run 2026-11-24, real Tauri windows (debug builds, test copies), files carried by hand, fictional names. Script: `06-prisoner-not-produced.md`. Procedure NOT checked by a practitioner. Courts and Prisons were driven through their windows' own API calls (their sessions); only Lawyers was looked at on screen.

| Step | Result |
|---|---|
| Pair Courts and a remand prison (invite, answer, fingerprint, confirmation) | Pass |
| 1. Court issues a remand order for Okumu David and sends it | Pass |
| 2. Prison has no such person and **returns** the order with a reason | Pass. The court's delivery list shows "returned" with the prison's words: "No person of this name is held here. Admit him on the warrant first, or send the warrant to the prison that holds him." |
| 3. Prison admits him (real reception route, on the warrant) | Pass |
| 4. Court sends the order again; prison records it | Pass. Court sees both deliveries: recorded, and the earlier return |
| 5. Court fixes a mention for 17 December | Pass |
| 6. Prison reports "not produced" with a reason (no vehicle) | Pass. Court imports it and the case shows the report; it does not change the case by itself |
| 7. Court adjourns: reason "prisoner not produced", responsible "prisons", next date 7 January; tells the firm | Pass. The sitting is "adjourned", a new mention exists for 7 January |
| 8. Lawyer finds out | Partly: the matter holds a note "Court record of the mention on 17 December 2026 ... Adjourned. Reason: prisoner not produced. Responsible: prisons. The prison reported no transport... Next date: 7 January 2027". After the court also notified the new date, the firm's hearings list shows the 7 January mention |

Findings:
1. **The 17 December hearing never appears in the firm's hearings list.** The court only sent the outcome after the fact, because I never sent a hearing notice for that date first, so the firm had no hearing to attach the court's record to and the adjournment lives only in a note. In real work the court notifies the date first, but an outcome notice for a hearing the firm does not have should probably still show up as an event, not only a note. Not fixed (needs a decision: create a hearing row, or show unmatched court records on the matter).
2. **The next date (7 January) does not reach the firm with the adjournment.** The firm's diary only gets it when the court sends a separate notice for the new sitting. The adjournment's record names the date in its words, but nothing puts it in the diary by itself. Not fixed.
3. **The prison's returned order shows only in the court's delivery list.** It was not checked whether the registrar sees it on the order or the sitting page in the window (screens of Courts and Prisons not looked at).
4. The firm's earlier bail hearing is still "scheduled" with Attended/Adjourned, by design.

Not run: Prisons window screens, the prison inbox as an officer would see it, the court's order screen, the two-machine route, the advocate being told before the day (a warning when a remand prison reports a transport problem).

## Update: unmatched court record fixed (2026-11-24, last)

Findings 1 and 2 are fixed. When the firm files the court's record of a sitting and has no hearing for it, the sitting is now **listed in the hearings** from the record (still "scheduled", so counsel closes it as attended or not, with the court's words on the row and a note "Listed from the court's record of the sitting"). And the date the court fixed when it adjourned goes into the diary too, unless the firm already has a hearing then ("Date fixed by the court when it adjourned the sitting"). To carry the date, the notice payload gained an optional `nextAt` (`packages/interchange/src/messages.rs`, serde default, so older packages still read). Courts fills it from the adjournment (`firm_exchange.rs`); Lawyers uses it (`court_notices.rs`).

Tests: Lawyers 74 and Courts 63 pass (an assertion in the Lawyers court-notice test covers the listed sitting and the next date). Seen in the Lawyers window on CR 340/2026: a new witness-absent adjournment of 21 January with next date 4 February filed as two hearing rows, 21 Jan with "Court record: Adjourned. Reason: witness absent. Responsible: prosecution...", and 4 Feb "Date fixed by the court when it adjourned the sitting".

Not changed: the 17 December sitting from the original run was filed before this fix, so it is still only a note; a listed past sitting shows as an open hearing the advocate must close; the row text runs long (the court's whole record plus the "Listed from" line). Not checked: a returned-to-the-same-day adjournment, and the firm having two matters on the same court number.

## Update: hearing row trimmed (2026-11-24, last)

The hearing row now shows the court's record as whole sentences up to about 110 characters, with an ellipsis when more was left out ("Court record: Adjourned. Reason: witness absent. Responsible: prosecution. The State witness was not in court…"), and drops the note the app wrote when it listed the hearing ("Notice from ...", "Listed from ...", "Date fixed by ...") once the record is there. The full wording stays on the matter as a note (Attendance notes). A first version cut the next date in half ("Next date: 4..."); fixed to cut at sentence ends. Seen in the Lawyers window; tsc clean. Not done: a way to open the full record from the row's "..." menu (the wording is only on the note).
