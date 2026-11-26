# DPP simplification review (2026-11-25)

Why: the client said the DPP app is perfect but over complicated. The aim is the DPP's real daily work with less structure. Design canvas: https://claude.ai/artifact/KJAx2ikBmsyv3csszqfn1F (private, six boards). No code changed.

## How the DPP really works (sources, newest first)

- ODPP Decision to Charge Guidelines 2023 (already in RESEARCH.md): two-stage test (evidence, then public interest), threshold test, sanction by signature, date and stamp on the charge sheet, copy kept in the ODPP PROCAM file, court number written back on the DPP copy, review after 3 prosecution adjournments.
- ODPP Prosecution Performance Standards and Guidelines 2014 (dpp.go.ug, read in full this session):
  - Files from Police arrive with a forwarding minute or letter that gets a received stamp. A PROCAM stamp goes on the charge sheet, first information and file cover.
  - Registered in the master register and PROCAM the same day, then allocated to an action officer (allocation within 3 days, headquarters registry within 2).
  - Cover colours: pink = perusal and trial, yellow = miscellaneous applications, green = appeals, blue = revisions.
  - Suspect in the cells: handle the same day. Perusal files should be handled and returned the same day. Nobody held in a cell past 48 hours. Action officer: 30 days for files not yet in court, 10 days if registered in court.
  - Legal opinion rests on facts, law, the charge, ingredients of the offence, and a reasoned recommendation. The decision to prosecute turns on sufficiency of evidence, public interest, no abuse of process.
  - A file needing a charge amendment goes back to Police with a draft amended charge sheet. Capital offence reduced to a lesser one: a written opinion goes to the DPP, then a signed withdrawal.
  - Police files should be sanctioned by a DPP action officer before registration in court.
  - Committal papers: summary of the case plus indictment, signed by a state attorney for the DPP (state prosecutors may not sign them). The summary ends with the fixed words that the DPP contends the accused has no valid defence.
- Street Law Uganda guide: police send the file "for further professional advice". If it discloses an offence the DPP directs Police to produce the suspect in court, called sanctioning. Otherwise the file is closed. The DPP can also ask for more investigation.
- News 2026: ODPP is rolling out its own PROCAMIS case system (slowly, blamed partly on NITA-U). No screen-level detail published. Do not assume a live feed to or from it.

## What comes back to Police

No single named "form" was found in public sources. In practice it is (a) the charge sheet (Police Form 53) sanctioned with signature, date and stamp, or (b) the file returned with a written legal opinion or advice minute, with a draft amended charge sheet when a charge changes. Treat the exact name and wording as UNKNOWN until a real sample is obtained from the client. The app already has these papers (charge sheet, directions to police, decline reasons).

## Findings on the current app

About 20 sidebar places, 13 file folders mixing status and stage, 11 decision types, about 45 tables, 7 pipeline stages. The same file is reachable from Cases, Tasks, Files and the board. Decisions live in three places. Police stations, Courts, Postbox and Connections are four doors to one idea. Workload and Statistics are the same numbers twice.

## Recommendation

Four places (Inbox, Files, Calendar, Settings) and one file screen with three steps (Read, Decide, Send). Three everyday outcomes in front (sanction, return, decline), the rest one click away, discontinue and nolle prosequi kept Director-only. Merge screens into those steps and remove the old routes, not hide them. Keep audit, sealed vault, backup and licence, under Settings. Quick review lets Assist propose an outcome per file, accepted one file at a time by a named person.

## Assist: what it must know

Country pack, the two-stage and threshold tests, the decision set and who may take each, the section texts, the file's own papers, the office's past decisions. It must quote only stored law text and never decide, send or sign. It works with any provider; free keys first (Gemini, OpenRouter, Groq, Mistral). Free tiers may keep prompts, so use fictional or stripped data until a private endpoint exists.

## Open, needs the client or a practitioner

1. A real blank or sample of: DPP advice or minute to Police, sanctioned charge sheet, file registers and covers, committal summary.
2. Whether the DPP file number or the CRB number is the working key (both are kept; the DPP number is assigned at registration).
3. Which outcomes a state attorney uses weekly beyond sanction, return, decline.
4. Whether PROCAMIS is in use at the client's station and how files are reconciled with it.

## Version 2 (same day, after client feedback that v1 cut real work)

The 2014 standards show DPP work is five kinds of case, which the registry separates by cover colour: perusal and trial (pink), applications such as bail (yellow), appeals (green), revisions (blue), plus written complaints. Court work is most of a state attorney's week: fixing hearings, summoning witnesses, securing exhibits, opposing bail, minuting the police file after each adjournment, sentencing submissions, notice of appeal in 14 days and memorandum within 2 weeks of the record, juvenile cases first, Director-only decisions, allocation within 3 days.

v2 structure: Today, Inbox, Cases, Diary, Office, Settings, plus Search and Assist always present. "Cases" replaces "Files" (a file arrives; it becomes a case). Every list shows cases, and every line opens the same case, so the places are windows, not separate pieces. Eleven boards in the canvas (map, Today, Inbox, Cases, perusal Read/Decide/Send, Quick review, Case in court, Diary, Office).
