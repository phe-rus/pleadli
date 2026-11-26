# DPP review 2: files, paper, scans, Assist, wording (2026-11-25)

Written before any further design or code. Tags: [Primary] = read in an ODPP or statute document, [Secondary] = student, NGO or news source, [Mine] = my inference, [Unknown] = needs a real sample or a practitioner.

## 1. There is no single file

One matter produces several files, held by different bodies, with different numbers. [Primary] 2014 standards and 2023 guidelines, [Secondary] court cause lists.

| File | Held by | Number | Notes |
|---|---|---|---|
| Police file | Station (CID), travels to the DPP | Station CRB / reference, form unknown | Comes with a forwarding minute or letter. Goes back to Police after perusal. |
| ODPP file | Action officer | ODPP registration number, entered in the master PROCAM register and the PROCAM system | In a coloured cover. Stays with the prosecutor, "under no circumstances left unattended in court". |
| Court file | Court registry | Court case number, e.g. cause lists show codes like KLA-00-CR-CO-0162-2025 (station, criminal, serial, year) | Opened when the charge sheet is filed. The number is written back on the ODPP copy and file. |
| Related ODPP files | Same office | Each its own registration | Bail and other applications (yellow cover), appeals (green), revisions (blue). Perusal and trial share pink. |

Further rules: charges not founded on the same facts are separated, each with its own ODPP registration number [Primary]. One police file can therefore become several ODPP files, and files moving between stations are re-registered using the origin station's PROCAM reference [Primary].

Finding about the app: it has one record with three number fields (ODPP number, police reference, court number). That is right for one ODPP file. Missing: several police references, several court files over time (magistrate then High Court), and links to related files (bail, appeal, revision). The v2 design wrongly put the appeal inside the trial case; the registry gives it its own file and cover.

## 2. Paper that arrives and leaves

Arrives [Secondary, to verify with a real sample]: forwarding minute or letter (a source names Police Form 16(a)), first information (a source names Police Form 86), charge sheet (Police Form 53), witness statements, statement of the accused, exhibit list and slips, investigation diary, medical forms (Forms 3, 24A named by other sources), custody papers. The file cover carries the case number and station.

Registry steps on arrival [Primary]: received stamp on the forwarding minute; PROCAM stamp on the charge sheet, first information and file cover; entry in the master register and the system; entry in the officer's incoming register; entry in the internal movement register signed for by the action officer; allocation. Same day at RSA stations; 2 working days at headquarters; allocation within 3 days.

Leaves: sanctioned charge sheet (signature, date, stamp) [Primary]; written advice and direction to Police on what to investigate [Primary]; draft amended charge sheet when the charge changes [Primary]; written opinion to the Director to reduce a capital charge, then a signed withdrawal [Primary]; committal papers, summary of the case and indictment, signed by a state attorney not a state prosecutor, with a fixed closing sentence [Primary]; minute on the police file after each adjournment with next date and witnesses to summon [Primary]; notice of appeal in 14 days and memorandum within 2 weeks of the record [Primary]; reply to a complaint within a week [Primary].

The app already makes: charge sheet, directions to Police, decline reasons, indictment, summary of the case. Not made: withdrawal, notice and memorandum of appeal, complaint reply, bail opposition record, hearing minute for the police file, and the three registers (incoming, outgoing, movement). The hearings table holds court, kind, time, outcome and note only: no witnesses, no summons status, no adjournment cause. [Verified in code.]

## 3. Scanned documents

Police files are mostly paper, often handwritten, so scanning is the main way a file enters, not an extra. The app already seals scans in the vault and indexes a file as rows pointing at page ranges, with Assist-placed rows marked until a person confirms them. [Verified in code.] Recommendations:
1. Receiving a paper file is: scan or photograph pages, then mark where each paper starts and ends, pick its kind. All by hand, fast (tap the first page of each paper), no AI required.
2. Assist may propose the splits and kinds, shown as suggestions until confirmed.
3. Never rely on reading handwriting by machine. Search works on typed papers only. Handwritten statements are read by the prosecutor; Assist reading them is a convenience that must show the page it read from. [Mine; test with real scans before promising anything.]
4. The scan itself stays the document of record. Typed or extracted text is a convenience copy.

## 4. Assist without taking over

Rules for every screen: it works fully with Assist off. Assist sits in a side panel or small "suggest" chips, never in the middle of the screen. Anything Assist wrote or placed is marked and stays marked until a named person confirms it (already built for index rows). It never decides, signs or sends. A local model (an OpenAI-compatible server on the office computer) is supported and needs no internet; hosted free tiers may keep prompts, so fictional or stripped data until a private endpoint exists. When offline or without a key, the screen shows nothing broken: the suggest chips are simply absent. Quick review is an optional list, not the front door.

## 5. Wording

Their own words [Primary]: file, peruse and perusal, sanction, action officer, allocating officer, registry, received stamp, minute, further inquiries, withdraw, committal papers, summary of the case, indictment, charge sheet, cause list, complaint.

Corrections to my earlier advice: I said prosecutors say "cases". The ODPP's own documents call everything a file, including files under trial, and use "case" loosely. So the recommended name is **Files** (the user's instinct), not Cases. Computer files then become **Papers** (the scans and typed documents inside a file). Court side: "in court" is a stage of a file.

| Place | Name | Why |
|---|---|---|
| Home | Today | Plain, already used. |
| Arrivals | Inbox | Plain, understood from email. The registers behind it are Incoming and Outgoing. |
| All work | Files | Their own word. Kinds shown by cover colour: Perusal and trial, Applications, Appeals, Revisions, Complaints. |
| Courts | Diary | Prosecutors keep a diary and read the court's cause list. |
| Supervisors and registry | Registry | The real name of the part that receives, registers, allocates and keeps the registers. Replaces "Office". |

Step names inside a perusal file: Peruse, Decide, Send. Decisions: Sanction; Return for further inquiries; Close the file (no prosecution); then more: amend the charge, committal to the High Court, divert, plea bargain, take over, withdraw. "Discontinue" and "nolle prosequi" stay as the Director-only legal terms. Avoid: Charging review, Police material, Capacity and workload, Reopened reviews, Board, Reports. Language: English first. Swahili and French exist in the app; legal terms stay in the language of the court, and the French pack for DR Congo needs its own procedure review, not a translation.

## 6. Roles decide what each person sees

Registry clerk: receive, stamp, register, dispatch. Allocating officer or RSA: give out files, same day or within 3 days. Action officer: perusal, court, appeals. Supervisor: reviews, quality. Director: discontinuance, nolle prosequi, capital charge reductions. The sidebar should show a person only what their role does. [Mine; confirm with the client.]

## 7. Open, need the client

1. A real police file cover, forwarding minute, charge sheet, an ODPP file cover and one page of each register.
2. Real examples of the advice minute and the hearing minute on a police file.
3. Whether the office keeps PROCAM or PROCAMIS alongside, and what must match.
4. Which roles exist at their station, and who stamps and registers.
5. Whether a scan arrives from Police at all, or the paper file is carried to the DPP and scanned by the DPP.

## 8. Answers found without asking the client (v3 canvas)

1. Police file contents: from a practitioner manual, three police file types (Minor Contravention Book, Criminal Report Book, Traffic Accident Report, Form 57). The CRB cover holds the police case number, the court case number, complainant, accused, station, arrest details. Inside: investigating officer, expert and medical reports, first information (usually with the charge sheet). Exhibits get a slip and a book entry. [Secondary]
2. Charge sheet layout, Police Form 53, from two real samples in the same manual: heading "Police Form 53", station, date, CRB number, "UGANDA VERSUS", accused as A1, A2 with sex, nationality, age, occupation, residence, then COUNT n: STATEMENT OF OFFENCE and PARTICULARS OF OFFENCE, then officer preferring charge and magistrate lines. Offences with sections seen: theft ss. 254 and 261, grievous harm s. 219, actual bodily harm s. 236, breaking into a building ss. 295 and 297, criminal trespass s. 302, conspiracy s. 390. [Secondary, real documents]
3. Court case numbers on cause lists look like KLA-00-CR-CO-0162-2025, or show a police reference in a CRB column. [Secondary]
4. Still not found publicly: a real DPP advice minute, a real ODPP file cover, a real register page, the ODPP registration number format. Registers are described in the 2014 standards (individual action officer registers for incoming and outgoing files, master PROCAM register, internal movement register). The design builds them from that description and the office edits the columns.
5. Whether Police send scans: unknown. The design takes both routes (postbox package, or a paper file scanned at the DPP's registry).
6. Police side: the referral message has no arrest or custody time, no due date on a return, and no hearing minute or witness-service report back. Police navigation has about 20 places and also calls its list Files, so the two apps can share one vocabulary.

## 9. What the v3 canvas adds

Files and Papers vocabulary; Registry with the three registers; related files strip; role-based views; Papers board (scan, index by hand, Assist optional); real PF 53 layout in Send; Today with Continue and tabs for working on several files; Legal guide the office edits (wording, what must be proved, papers usually needed, what is often missing, words the offence uses, restore the starter text, who changed what); Assist modes (off, this computer, online) with hide-names and may / may not rules; Flows board of who gives what to whom; Police one-referral board and a simpler Police sidebar.
