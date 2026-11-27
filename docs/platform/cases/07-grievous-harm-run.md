# Case 7: grievous harm, Police to DPP and back (2026-11-27)

Run on copies of the case 1 data (`~/.pleadli-accept/c7`), both apps' debug builds from this commit, over the local API (Police 47821, DPP 47921), already paired and trusted. Scripts: `c7a.ts` (Police), `c7b.ts` (DPP and return).

## What was done
Police: complainant, suspect and witness; CRB 612/2026; two statements; a completed PF3 (Gulu Regional Referral Hospital); exhibit EX-1 (panga); arrest; charge sheet (Penal Code Act s. 219); referral to the DPP; sealed file.
DPP: import, accept (ODPP/GULU/0612/2026), file read as "State vs. Ojara: grievous harm", charging review with 13 notes, both tests passed, sanction, notice back.
Police: imported the receipt then the notice.

## Result
Passes end to end. Police's case read carries the PF3 (`medicalExams: 1`). After the referral the case stands in the DPP folder awaiting a reply; after the notice it is `sanctioned` in the DPP folder and the referral status reads `sanctioned`. DPP: 2 statements, 3 people, 1 charge arrived; the file moved to `prepare` on the sanction.

## Findings
1. **The PF3 does not reach the DPP.** The referral payload (`ReferralPayload` in `exchange.rs`) carries people, statements, exhibits and charges, not medical exams. For grievous harm the medical form is the proof of the harm, so the prosecutor reads the file without it. Needs a payload change in `packages/interchange` on both sides.
2. The DPP incoming list shows `kind: null` for every entry; the case is found by package id.
3. Not run in a window: the DPP screens for this file, and Police's screens after the notice.
