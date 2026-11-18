# 50 Uganda police cases, and the gaps they expose (2026-11-18)

Purpose: not a test suite. Fifty different situations an officer at a Ugandan station meets, each
chosen because it needs something the others do not. Each is run by hand in the real Police desktop
window (see WALKTHROUGH-2026-11-18.md for the method). A case that needs something the app does
not have is not faked: that IS the finding.

Legend. Needs = what the officer must be able to do. Status: RUN (entered live), CHECK (screens
inspected, nothing entered), GAP (the app has no place for it).

## A. Property

| # | Case | Needs |
|---|------|-------|
| 1 | Shop break-in and theft, Kikuubo | statements, exhibits (phones), arrest, charge sheet, DPP referral |
| 2 | Boda boda (motorcycle) stolen at night | vehicle record, plate and chassis, circulate to other stations |
| 3 | Phone snatched on the street | victim only, no suspect, general description |
| 4 | Aggravated robbery with a firearm | armed suspect, firearm exhibit, ID parade, remand |
| 5 | Cattle theft, Karamoja border | many items, owner proof, cross-district transfer |
| 6 | Mobile money fraud (MTN, Airtel) | transaction records as evidence, telecom request |
| 7 | Obtaining money by false pretences (land sale) | documents as evidence, no violence, bond |
| 8 | Forged land title | document examiner, registrar, multiple accused |
| 9 | Employee embezzlement | company complainant (not a person), audit report |
| 10 | Arson, market stalls burnt | scene, fire brigade report, many victims |
| 11 | Malicious damage to property | low value, reconciliation possible |
| 12 | Land eviction and criminal trespass | civil/criminal boundary, refer out |
| 13 | Receiving stolen property | links to case 1, recovered exhibits |
| 14 | Online harassment (cybercrime) | screenshots, phone data, platform request |
| 15 | Counterfeit currency | exhibit notes, Bank of Uganda |

## B. Persons

| # | Case | Needs |
|---|------|-------|
| 16 | Simple assault in a bar | both parties, medical form (PF3) |
| 17 | Grievous harm with a panga | PF3, hospital, weapon exhibit, hospital referral |
| 18 | Domestic violence, wife reports husband | reconcile or charge, protection, sensitive record |
| 19 | Defilement of a 13-year-old | child victim, guardian, medical exam, strict privacy |
| 20 | Rape | medical exam, privacy, support referral |
| 21 | Child neglect or abuse | social worker referral, Child and Family Protection Unit |
| 22 | Murder, stabbing at a trading centre | scene, post-mortem, 48 hours, remand (police cannot grant bail) |
| 23 | Manslaughter in a fight | as above, different charge |
| 24 | Attempted murder | injured victim in hospital |
| 25 | Human trafficking | several victims, cross-border, other agencies |
| 26 | Missing child | no suspect, alert, open for weeks |
| 27 | Missing adult | public inquiry that becomes a case |
| 28 | Threatening violence | low severity, warning, bond |
| 29 | Mob justice, suspect lynched | many unnamed accused, death, protect scene |
| 30 | Suspected suicide, unnatural death | no suspect, post-mortem, family |
| 31 | Abortion-related death | medical records, sensitive |

## C. Traffic

| # | Case | Needs |
|---|------|-------|
| 32 | Fatal accident, boda boda against a lorry | two vehicles, scene sketch, post-mortem, driver arrest |
| 33 | Hit and run | vehicle unknown, witnesses, CCTV |
| 34 | Drunk driving | breath test, vehicle impounded |
| 35 | Vehicle without insurance | impound, fine, release |

## D. Drugs and public order

| # | Case | Needs |
|---|------|-------|
| 36 | Possession of cannabis | exhibit weight, government chemist |
| 37 | Drug trafficking at the border | large quantity, sealed exhibit, chain of custody |
| 38 | Illegal brewing | impounded property, destroy exhibits |
| 39 | Riot after an election | many arrests at once, bulk custody |
| 40 | Loitering and disorderly | minor, quick release |
| 41 | Illegal gambling | cash exhibit |
| 42 | Illegal firearm possession | armoury link, ballistic exam |

## E. Special situations

| # | Case | Needs |
|---|------|-------|
| 43 | Juvenile suspect, 16, theft | age proven, parent or guardian, separate custody, juvenile court |
| 44 | Foreign national without papers | immigration referral, interpreter |
| 45 | Bribery involving an officer | professional standards, no local file |
| 46 | Complaint against a police officer | complaint about own station |
| 47 | Wildlife crime, ivory | Uganda Wildlife Authority, expert exhibit |
| 48 | Terror tip-off from an informant | informant protection, no name on station file |
| 49 | Arrest on a court warrant | warrant record, produce in court |
| 50 | Bond jumped, accused fails to appear | bond forfeited, new warrant |

## Capability gaps already proven from the code (before running anything live)

Read from the option lists in the app (`features/*/schema.ts`). Still to confirm on screen.

| Gap | Evidence | Cases affected |
|-----|----------|----------------|
| No date of birth, sex, nationality, occupation, photo or fingerprints on a person | `people/schema.ts` has name, phone, address only | all, but 43 (juvenile), 19, 21, 26, 44 cannot work |
| Case has only Open and Closed | `cases/schema.ts` | 22, 26, 29, 50 (long-running, warrant out, etc.) |
| Case roles stop at complainant, suspect, witness, victim, accused | `cases/schema.ts` | 43 (guardian), 48 (informant), 9 (company) |
| Custody statuses: in custody, released no charge, released on bond, produced in court, referred to DPP | `custody/schema.ts` | 22 (remand), 43 (juvenile), 49 (arrested on warrant), 29 |
| Referral destinations: DPP, court, other station, other | `referrals/schema.ts` | 17, 19, 20, 21 (hospital, social worker), 36 (chemist), 47 |
| Exhibit statuses: in storage, released, disposed | `evidence/schema.ts` | 36, 37, 42 (sent to lab, produced in court) |
| No warrant records (arrest or search) | not in code | 49, 50, 4 |
| No medical form (PF3) or post-mortem record | not in code | 16, 17, 19, 20, 22, 30, 32 |
| No identification parade | not in code | 4, 22 |
| No informant handling | not in code | 48 |
| No occurrence book (OB) number | not in code | all, desk entry |
| No missing-person record | not in code | 26, 27 |
| Diary categories: incident report, lost property, public inquiry, officer movement, shift handover, other | `station-diary/schema.ts` | fine |

## Running log

Filled in below as each case is run live.

### Result: 20 cases run live (stopped at 20 by the owner, 2026-11-18)

Cases 1 to 20 below are the ones actually entered in the real window (the table above lists the
original 50 ideas; the 20 run were chosen for variety and numbered in the order they were entered,
CRB 1 to 20/2026). Totals after the run: 20 cases, 35 people, 20 incidents, 16 statements,
13 exhibits, 5 charge sheets, 10 in the cells, 2 referrals. Every save worked; nothing failed.

Run order: 1 shop break-in, 2 boda theft, 3 phone snatching, 4 armed robbery, 5 cattle theft,
6 mobile money fraud, 7 land-sale false pretences, 8 forged title, 9 embezzlement, 10 arson,
11 malicious damage, 12 trespass, 13 receiving stolen property, 14 cyber harassment,
15 counterfeit notes, 16 domestic violence, 17 defilement, 18 murder, 19 fatal road accident,
20 juvenile suspect.

Per-case gap notes are in `CASES-50-run.log`. **They were written before each case was entered, from reading the code, so every gap below is SUSPECTED unless the "Verified on screen" section says otherwise.** Grouped by what to build:

| Priority | Gap | Cases |
|----------|-----|-------|
| 1 (legal risk) | No date of birth or age on a person: a child victim or juvenile suspect cannot be recorded or proven; no juvenile custody rules | 17, 20 |
| 1 | No restricted view for sensitive cases (defilement, domestic violence, cyber intimate images) | 16, 17, 14 |
| 1 | Custody has no Remanded status; bond can be granted on screen for offences police cannot bail (murder) | 18, 4 |
| 2 | No medical form (PF3), post-mortem or scene record | 16, 17, 18, 19 |
| 2 | One accused per charge sheet | 4, 8 |
| 2 | Cases cannot be linked to each other; exhibits and vehicles cannot be shared or tied to a case | 13, 19 |
| 2 | Referral destinations too few (hospital, social worker, telecom, Bank of Uganda, chemist, probation) | 6, 14, 15, 16, 17, 20 |
| 3 | No money amount, quantity or livestock fields; amounts live in free text | 5, 6, 7, 9, 10 |
| 3 | A company cannot be a complainant; only people exist | 9 |
| 3 | No closure reasons (reconciled, civil matter), no unknown-offender marker, no repeat-offender flag | 3, 11, 12, 16 |
| 3 | No ID parade, no digital evidence handling, no ballistic/lab status on exhibits | 4, 14 |

Fixed during the run: person picker showed a raw ID after selecting (now shows the name); the
officer on statements, charge sheets, referrals and bonds now defaults to whoever is signed in.
Still open from the walkthrough: trial banner on day zero (F1), retyping the same facts across
forms (F6), empty case page gives no next step (F8).

### Verified on screen afterwards (2026-11-18)

Opened CRB 3, 7, 13, 17 and 18 in the real window and tried the murder bond.

Confirmed:
- Roles saved correctly (CRB 3 victim, 7 and 17 complainant, 13 suspect, 18 witness).
- Statement text saved in full (CRB 18) and prints on the statement page; charge sheet (PF 53 layout) and exhibit saved with the right case, accused and wording.
- **The murder accused was granted a police bond on screen with no warning** (CRB 18, Isaac Muhumuza). Bond is not tied to the custody record, so his profile shows "In the cells" and "Out on police bond" at the same time, and the cells count did not change.
- **A suspect booked through custody or named on a charge sheet does not appear under the case's People.** CRB 18 lists only the witness, though the accused has custody, a charge sheet and a referral. The case page has to be filled by hand or it under-reports who is involved.

Still only suspected (not tried on screen): juvenile and child-victim handling beyond the missing date of birth, sensitive-record visibility, one-accused-per-sheet limit, missing PF3 and post-mortem, referral destination lists, missing amount and quantity fields, and the rest of the table above.

### Fixed and re-verified on screen (2026-11-18, evening)

| Finding | Fix | Verified |
|---------|-----|----------|
| Murder accused granted a police bond | Backend refuses a bond when the person is charged on that case with murder, treason, rape, aggravated robbery, aggravated defilement or terrorism (attempts excepted). The screen shows the reason. The list is the app's working reading of the law and needs a legal officer's confirmation (`NOT_POLICE_BAILABLE` in `domain/bonds.rs`). | Aggravated robbery (CRB 4) refused with the reason shown |
| In the cells and out on bond at once | Granting a bond now marks the person's open custody record "released on bond" and links it | Bond for CRB 7: cells 10 to 9, profile shows only "Out on police bond" |
| Suspects missing from the case's People | Booking into custody adds the person to the case as suspect; a charge sheet makes them the accused | CRB 12: Odongo added as suspect, then accused |

Update: the offence list now lives in the rules pack (see `RULES.md`), shown in Settings > Legal rules as a working rule awaiting legal review.

Limit: the bond rule looks at charge sheets only. A case with no charge sheet yet is not checked.
The murder bond already granted in CRB 18 before the fix is still in the test data.

### Built after the live run (2026-11-18, night)

| Gap | What was built | Verified on screen |
|-----|----------------|--------------------|
| No remand status | Custody status "Remanded by a court" | Selectable in the booking form |
| Too few referral destinations | Hospital, Probation and Social Welfare, Government Analytical Laboratory, Cybercrime unit, Telecom, Bank | All listed in the referral form |
| 48-hour limit fixed in code | Now read from the rules pack (sourced rule, 48 hours; 7 day transfer window) | Custody shows 48.0h remaining |
| No PF3 or post-mortem | New "Medical records" page: kind, person, case, hospital, doctor, requested and examined dates, findings; the examined person is added to the case | PF3 recorded for CRB 17 and listed |
| No restricted view for sensitive cases | "Restricted case" switch. Administrators and the officer who restricted it see it; others see the reference number and a notice. Hidden from case lists, the case page, people, statements, exhibits, custody, charge sheets, referrals, bonds, medical records, a person's page and the Today feed | As a second, non-admin officer: list row hidden, case page refused with a clear message, medical list and feed empty of it |

Restricted cases also have a named access list: tick other officers in the case form to let them open it (administrators and the officer who restricted it always can). Verified as a second officer: with access he opens the case, exports it and finds it in search; with access removed, the case page, its access list, its export, whole-station exports (PDF, Word, Excel, Markdown) and its files all refuse or leave it out.

A person who appears only in restricted cases an officer may not open is hidden from that officer too: search, the people list, their page and their document export (verified as a second officer: 36 people became 35, the person's page returned nothing, the export was refused). A person who is in at least one open case stays visible. Files are checked by the record they are attached to, including the raw vault-file route. There is no separate DPP hand-over endpoint; the hand-over goes through the case and charge sheet exports, which are covered.

Limits that remain: whole-station exports are refused to a non-administrator whenever a restricted case they cannot open exists, rather than being filtered; a hidden person cannot be picked in forms by officers who may not open their case, so they could re-enter the same person under a second record.

Bug found and fixed on the way: editing a case before its people had loaded saved an empty people list and erased everyone on the case. The form now waits for the people before it can save.

Also fixed: a form whose own check refused to save (for example a completed medical record with no date) showed nothing. The save button now shows the reason underneath, for every form.
