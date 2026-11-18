# Legal review sheet: Pleadli Police (Uganda), rules pack version 3

For a legal officer. Each row is a rule the app applies today. Please mark each **Confirmed**, **Change to ...**, or **Remove**, add the citation where one is missing, and sign at the bottom. The reviewed version is then loaded from Settings > Legal rules (administrator), where it is marked reviewed with your name and the date.

| # | What the app does with it | Rule as written | Citation now | Status now | Your decision |
|---|---------------------------|-----------------|--------------|------------|---------------|
| 1 | Counts down the custody clock everywhere; flags "past limit" | A person may be held 48 hours before being brought to court | Constitution 1995 Art. 23(4); Police Act Cap. 303 s. 25(1) | Sourced, unreviewed | |
| 2 | Allows extra days to transfer someone arrested in another police area | 7 days | Police Act Cap. 303 s. 25(2) | Sourced, unreviewed | |
| 3 | Refuses a police bond when the charge sheet offence matches | Murder, treason, rape, aggravated robbery, aggravated defilement, terrorism (an "attempt" is not matched) | None | Working rule, no citation | |
| 4 | Treats a person under this age as a juvenile, shows a notice in custody | Under 18 | Constitution 1995 Art. 257(1)(c) (recalled, not checked) | Working rule | |
| 5 | Notice shown when a juvenile is booked in | "Keep the child apart from adults. Tell a parent or guardian. Inform the Probation and Social Welfare Officer. Confirm with a legal officer which time limit and court apply." | None | Working rule | |

## Questions we cannot answer ourselves

1. Is the list in row 3 complete and correct, and is the "attempt" exception right? Which offences should police be able to bail, and under what conditions?
2. Does a different custody limit or court apply to a child? (Row 5 currently defers to a legal officer.)
3. Is a weekend or public holiday handled differently for the 48 hours?
4. Which offences must be treated as sensitive (restricted case) by default?
5. Who may a restricted case be shared with in the station?

Reviewer: ______________  Rank / office: ______________  Date: ____________  Signature: ____________

Where the rules live: `apps/police/src-tauri/rules/uganda.json`; how to load a reviewed version: `docs/police/RULES.md`.
