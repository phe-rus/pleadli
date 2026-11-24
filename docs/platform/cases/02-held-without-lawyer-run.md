# Case 2 run: held without a lawyer (Police window)

Run 2026-11-24, real Police window (debug build, test copy of data, officer PIN reset to a test value on the copy only). Script: `02-held-without-lawyer.md`. Procedure NOT checked by a practitioner. Police only; nothing leaves the station by design.

| Step | Result |
|---|---|
| 1-2. Book in Kato Ronald (theft of a motorcycle), lawyer "Not yet asked" | Pass (booked through the API, the form's person picker not driven). Board row reads "Arrested ... · Cell 2" and the printed paper shows "Lawyer: Not yet asked" |
| 3. He asks for legal aid: edit, Lawyer = Legal aid, name left empty | **Refused in the window, in plain words:** "Write down who the lawyer or the legal aid body is." Record unchanged |
| 3b. Same with the body named | Saved; **but only after a fix, see 1** |
| 4. His brother arranges an advocate: Lawyer = Own advocate, Adv. Namutebi Grace (via API) | The custody paper shows "Lawyer: Own advocate, Adv. Namutebi Grace" next to the 48-hour deadline |

Findings:
1. **Fixed: saving a lawyer on the edit form failed with "Invalid input: expected number, received undefined".** The form's validation did not include the two new hidden fields (`legalRequestedAt`, `legalNote`). The unit tests and the API could not see it; only the window did. Both fields are now optional in the form schema. Retried in the window: saved.
2. **Fixed: the lawyer line was missing where officers look.** I had added it to a board component that is not the one used; the real list is `routes/_public/search/custody.tsx` and the printed custody paper. Both now show it ("Lawyer: Own advocate, Adv. Nabirye" on the list, a "Lawyer" line on the paper, "Not recorded" when empty).
3. The "Person in custody" box in the edit form shows "Search for a person..." with no name although the record has a person; saving still works. Not investigated (looks like a display-only quirk).
4. First time the Police window was seen this session (signed in by resetting the test officer's PIN on the test copy).

Not run: the person picker and "Book someone in" typed through the form; the lawyer status in the DPP referral (not built); the 48-hour deadline running out (not forced).
