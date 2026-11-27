# Case 7: grievous harm, Police to DPP and back (2026-11-27)

Run on copies of the case 1 data (`~/.pleadli-accept/c7`), both apps' debug builds from this commit, over the local API (Police 47821, DPP 47921), already paired and trusted. Scripts: `c7a.ts` (Police), `c7b.ts` (DPP and return).

## What was done
Police: complainant, suspect and witness; CRB 612/2026; two statements; a completed PF3 (Gulu Regional Referral Hospital); exhibit EX-1 (panga); arrest; charge sheet (Penal Code Act s. 219); referral to the DPP; sealed file.
DPP: import, accept (ODPP/GULU/0612/2026), file read as "State vs. Ojara: grievous harm", charging review with 13 notes, both tests passed, sanction, notice back.
Police: imported the receipt then the notice.

## Result
Passes end to end. Police's case read carries the PF3 (`medicalExams: 1`). After the referral the case stands in the DPP folder awaiting a reply; after the notice it is `sanctioned` in the DPP folder and the referral status reads `sanctioned`. DPP: 2 statements, 3 people, 1 charge arrived; the file moved to `prepare` on the sanction.

## Findings
1. **The PF3 did not reach the DPP. Fixed the same day.** `MedicalClaim` added to the shared referral format (optional, older readers ignore it); Police exports the case's medical exams; the DPP stores each as expert evidence (the ODPP's own category) with the doctor's findings. Test `a_trusted_station_sends_a_referral_that_waits_until_a_person_accepts_it` extended and passing; re-run live as CRB 613/2026: the DPP file lists the panga (exhibit) and the PF3 (expert) with the findings. A PF3 for someone not on the case still travels (the person is named in text). Not done: a scanned PF3 attached to the exam does not travel yet (`fileIds` is empty), and the DPP screen was not seen in a window.
2. The DPP incoming list shows `kind: null` for every entry; the case is found by package id.
3. Not run in a window: the DPP screens for this file, and Police's screens after the notice.
