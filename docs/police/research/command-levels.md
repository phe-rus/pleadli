# What a police command (district, region, HQ) does: research notes

Gathered 2026-10-07 because the user found the Command side of Pleadli Police "too basic, like not even an app, missing a lot of things". It was built to one rule only ("HQ aggregates, never records": figures and a roster). These notes are what the force's own law and published sources say a command does, to design from. Not yet turned into a design; the HQ redesign waits until after the Prisons/Courts/www pass (user's order, 2026-10-07).

## Sources read

- Police Act, Cap. 303 (Ministry of Internal Affairs copy, https://mia.go.ug/sites/default/files/resources/THE_POLICE_ACT.pdf), read in full text.
- Uganda Police Force, Management Levels (https://upf.go.ug/management-levels/).
- APCOF, *Common Standards for Policing in East Africa: Uganda* (https://apcof.org/wp-content/uploads/cs-for-policing-ea-study-uganda.pdf), citing the Police Standing Orders (7th ed., 1984) and UHRC annual reports.
- Search leads not yet read in full: UPF Annual Crime Report 2024 (https://upf.go.ug/wp-content/uploads/2025/02/ACR2024-Web.pdf); UPF "Police develops Crime Records Management System" (https://upf.go.ug/police-develops-crime-records-management-system/); Monitor, "Do police crime reports reflect the situation on ground?" (https://www.monitor.co.ug/uganda/news/national/do-police-crime-reports-reflect-the-situation-on-ground--4957132).

## What the law and sources say

1. **Command.** "Subject to the direction of the inspector general, the command of the force in a region or a district shall be vested in the regional commander or the district commander" (Police Act s.7; "district" includes a police division). The RPC is the officer through whom the IGP's orders reach the region. Ranks: an ACP commands a region, an SSP a district, an SP a division (UPF Management Levels).
2. **Discipline.** The "responsible officer" for senior officers is the regional police commander, and for subordinate officers the district police commander (s.2, definitions). Regional police courts sit at regional headquarters. Members of the public may lodge written complaints of police misconduct through the District Police Commander or the IGP (s.70(1), via APCOF). The Professional Standards Unit has regional offices (Mbale, Masaka, Hoima, Gulu, Arua, Jinja, Mbarara).
3. **Personnel.** A district police committee in each district, chaired by the DPC, with the district Special Branch officer, district CID officer, officer in charge of prosecutions and others; it advises on appointments, promotions and personnel matters (s.12).
4. **Custody oversight.** The Standing Orders require every station to keep a Station Diary Book (all occurrences, including arrests) and a Lock-up Register (every detainee and how long they have been held). Detention beyond 48 hours is the largest single complaint against the force: 323 of 936 UHRC complaints in 2018 (34.5%), 181 to 438 a year over ten years. The UHRC inspected 409 stations in 2018. A command that only sees "1 past the limit" cannot act on it: it needs who, where, since when.
5. **Crime figures.** Records officers at stations count cases and reports every month; complaints entered in the SD are counted, and criminal cases are taken from the SD into the Criminal Record Book (CRB). These monthly counts roll up into the Annual Crime Report by region and division (28 policing regions, 183 divisions or central police stations in the 2022 report).
6. **CID supervision.** Regional CID officers exist to manage and supervise cases; serious cases (murder, defilement and similar) are supervised above the station. The ODPP trains officers on case-file compilation.

## What this suggests for the Command side (not decided)

- A command's day is: who is held too long and where; what serious crimes came in; which stations are silent; complaints against officers; discipline; directives sent down; the month's crime return; officers and postings.
- Some of this needs more than figures to cross from a station (a detainee's name and time held; a serious case's reference and offence). That is a change to the "aggregates only" rule in docs/police/HQ-FACILITY.md and needs the user's decision before it is built.
- Still to research: the monthly crime return's actual form and offence categories; how directives and circulars reach stations; station inspection by the DPC; Kenya and DRC equivalents.
