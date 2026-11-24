# Case 7 run: civil commercial suit (Lawyers only, one firm)

Run 2026-11-24, real Lawyers window (debug build, test copy), fictional names. Procedure NOT checked by a practitioner. Script: `07-civil-commercial-suit.md`. Only the plaintiff's side could be run, and only in Lawyers.

## What could not be run, and why

- **Courts is criminal-only** (decision D4). It has no civil case, no plaintiff or defendant, no plaint, no filing of a civil kind from a firm (the firm's filing kinds are application, notice of appeal, bail application, defence, submissions, other: no plaint). So steps 2 and the court's part of 3 and 4 do not exist. The second firm was not run (one Lawyers install; the defendant's firm would use the same app).
- Building civil in Courts is a scope decision, not something to add quietly. Per the owner's rule that unknown is not nonexistent: civil is not yet researched or built, not out of the product.

## What was run (plaintiff's firm, Lawyers)

| Step | Result |
|---|---|
| Open a civil suit for Kampala Fresh Foods Ltd (organisation client), HCCS 118/2026, Commercial Division, High Court, UGX 84,000,000 | Pass |
| Record cause of action (contract) 30 Sep 2025 | Limitation deadline starts: "File before limitation runs out, by 30 Sep 2031, Limitation Act s.3(1)(a)" |
| Summons issued 20 Nov, served 23 Nov | "Serve the summons, by 11 Dec" shown, marked Done on service |
| Defence with counterclaim received 24 Nov | Two deadlines start: reply to the defence and reply to the counterclaim, both 9 Dec, with their rules (CPR O.8 r.18(1), r.11(1)) |
| Record the reply filed | Both replies Done; a new deadline starts: "Take out summons for directions, by 22 Dec, 28 days, CPR O.XIA r.1(2) (2019)" |

Seen in the window (Deadlines section of the matter).

## Findings

1. **One "reply filed" event closes both the reply to the defence and the reply to the counterclaim.** They are separate filings with separate rules (O.8 r.18 and r.11). An advocate who files only one would see both marked Done. Not fixed.
2. A future date cannot be recorded for an event ("The day is not a valid date"), so a deadline cannot be previewed by pretending. By design, probably.
3. Client kind in the data is "organisation" (the screen says organisation); I first guessed "company". Not a defect.
4. No scheduling conference, trial date or judgment could be tied to a court because the court side does not exist. The firm's own hearings could be listed by hand.
