# Pleadli Police: how it works (first user guide)

For an officer at a station who has just installed the app. Plain language, in the order you meet things.

## 1. First time
1. Open Pleadli Police. The first screen sets up the station: name, then the first administrator
   (the in-charge). That person signs in with a badge number and password.
2. Add the other officers (Station > Officers). Each gets a badge number and a role.
3. You land on **Today**. It is empty on purpose: it fills as work is recorded.

## 2. The daily rhythm
- **Today** shows what cannot wait (someone near the 48-hour limit, a backup call), the figures,
  referrals waiting for a reply, and what just happened.
- **Station diary**: every event of the day, in order. Use "New entry".
- The **+** beside Search creates anything from anywhere. **Ctrl K** searches everything.

## 3. A case from start to finish
Follow the order of the sidebar; each step is one button.
1. **People**: add the complainant, suspects and witnesses once. They are reused everywhere.
2. **Incidents**: "Report an incident" records what was reported.
3. **All cases**: "Open a case" gives it a CRB number (CRB 7/2026) and adds the people with their roles.
4. **Statements**: "Take a statement". The officer taking it is you by default.
5. **Exhibits**: "Record an exhibit" with where it was found and where it is kept.
6. **In custody**: "Book someone in". The 48-hour clock starts and shows on Today.
7. **Police bonds**: "Grant bond" when the offence allows police bond.
8. **Charge sheets**: "Draw up a charge sheet": case, accused, offence, section, particulars.
9. **Referrals**: "Refer a case" to the DPP, a court or another station. The case moves to "With the DPP".

Every form can be closed and reopened; nothing is lost until you press the save button.

## 4. What the app does not do yet
Medical forms (PF3), post-mortem, warrants, ID parades, juvenile rules and ages, restricted
records, remand. See `CASES-50.md`. Until they exist, record these in the case notes and diary.

## 5. First-run guidance (built 2026-11-18)
A short tour card at the top of Today for each officer, skippable, remembered on this machine, and restartable from Settings > About ("Show me around"). Code: `apps/police/src/features/overview/first-run-tour.tsx`. Steps:
1. Welcome: "This is Today. It fills as you work." (highlight Today)
2. "Add people first" (highlight People > Add person)
3. "Open a case from an incident" (highlight All cases)
4. "Book someone in, and watch the 48-hour clock" (highlight In custody)
5. "Press Ctrl K to find anything" (highlight Search)

Plus, on every empty page, one sentence saying what goes here and a single button (the empty
case page already needs this: finding F8). Tour text goes through Paraglide in en, sw and fr.
A "Show me around" item in Settings restarts it.
