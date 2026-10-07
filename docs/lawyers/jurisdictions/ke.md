# Kenya: what Pleadli Lawyers counts, and from where

Read 2026-10-07 from the primary texts on Kenya Law. [P] = read in the text this
session. [U] = not settled by what was read. Code: `apps/lawyers/src-tauri/src/domain/clocks.rs` (`KENYA`).

## Sources

- Civil Procedure Rules, 2010 (L.N. 151/2010), revised to 31 December 2022: https://new.kenyalaw.org/akn/ke/act/ln/2010/151/eng@2022-12-31
- Court of Appeal Rules, 2022 (L.N. 40/2022, in force 8 July 2022): https://new.kenyalaw.org/akn/ke/act/ln/2022/40/eng@2022-12-31
- Limitation of Actions Act (Cap. 22): https://new.kenyalaw.org/akn/ke/act/1968/21
- Public Authorities Limitation Act (Cap. 39): https://new.kenyalaw.org/akn/ke/act/1974/5
- Government Proceedings Act (Cap. 40): https://new.kenyalaw.org/akn/ke/act/1956/47/eng@2022-12-31

## Counted

| Deadline | Starts | Period | Provision |
|---|---|---|---|
| Serve the summons while valid | summons issued | 12 months | CPR O.5 r.2(1) [P] |
| File the defence | appearance entered | 14 days | CPR O.7 r.1 [P] |
| Reply to the defence | defence served | 14 days | CPR O.7 r.17(1) [P] |
| Reply to the counterclaim | counterclaim served | 15 days | CPR O.7 r.11 [P] |
| Case management checklist | pleadings closed | 14 days | CPR O.11 r.2(1); close of pleadings O.2 r.13 [P] |
| Notice of appeal (civil) | decision | 14 days | CA Rules 2022 r.77(2) [P] |
| Notice of appeal (criminal) | decision | 14 days | CA Rules 2022 r.61(1) [P] |
| Memorandum and record of appeal | notice lodged | 60 days | CA Rules 2022 r.84(1) [P] |
| Sue Government | notice served | not before 30 days | Government Proceedings Act s.13A(1) [P] |
| Limitation: contract | cause of action | 6 years | Limitation of Actions Act s.4(1)(a) [P] |
| Limitation: tort (incl. injury) | cause of action | 3 years | s.4(2) [P] (libel/slander 12 months, not counted) |
| Limitation: land | right accrued | 12 years | s.7 [P] |
| Limitation: Government, contract | cause of action | 3 years | Public Authorities Limitation Act s.3(2) [P] |
| Limitation: Government, tort | cause of action | 12 months | s.3(1) [P] |
| Enforce a judgment | judgment | 12 years | Limitation of Actions Act s.4(4) [P] |

## Not counted, and why

- Appearance: "within the time prescribed in the summons" (O.6 r.1), never under ten days (O.5 r.1(4)) [P]. It varies by summons, so it is not counted.
- Opposing an application: papers filed and served "not less than three clear days before the date of hearing" (O.51 r.14(2)) [P]. It counts back from the hearing day; the deadline engine only counts forward. Backlog.
- Appeals from subordinate courts to the High Court (Civil Procedure Act s.79G) and Employment and Labour Relations Court periods: not yet read. Backlog.
- Whether a period ending on a weekend or holiday moves: [U]; flagged, not moved (as for Uganda).
