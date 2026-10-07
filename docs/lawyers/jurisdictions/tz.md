# Tanzania (Mainland): what Pleadli Lawyers counts, and from where

Read 2026-10-07. [P] = read in the primary text this session. [S] = from a
secondary source (judgments quoting the text) because the primary was not
reachable. [U] = not settled. Code: `apps/lawyers/src-tauri/src/domain/clocks.rs` (`TANZANIA`).

## Sources

- Civil Procedure Code (Amendment of the First Schedule) Rules, G.N. 381 of 2019: https://commons.laws.africa/akn/tz/act/gn/2019/381/media/publication/tz-act-gn-2019-381-publication-document.pdf
- Tanzania Court of Appeal Rules, 2009 (G.N. 368/2009): https://media.tanzlii.org/files/legislation/tz-act-gn-2009-368-publication-document.pdf
- Tanzania Court of Appeal (Amendment) Rules, 2019 (G.N. 344/2019): https://tanzlii.org/akn/tz/act/gn/2019/344 (behind a bot check; not read directly) [S]
- Law of Limitation Act (Cap. 89), as at 30 November 2019: https://media.tanzlii.org/media/legislation/808/source_file/d8fbfb3c23ced333/1971-10.pdf
- Government Proceedings Act (Cap. 5), as at 31 December 2023: https://media.tanzlii.org/media/legislation/320701/source_file/6ddd31c4d253e0cc/1967-16.pdf

## Counted

| Deadline | Starts | Period | Provision |
|---|---|---|---|
| Written statement of defence | served with summons | 21 days | CPC O.VIII r.1(1), G.N. 381/2019 [P] |
| Notice of appeal (civil) | decision | 30 days | CA Rules 2009 r.83(2) [P]; unchanged by G.N. 344/2019 [S] |
| Notice of appeal (criminal) | decision | 30 days | CA Rules 2009 r.68(1) [P] |
| Memorandum and record of appeal | notice lodged | 60 days | CA Rules 2009 r.90(1) [P]; time for copies excluded by certificate of delay |
| Sue Government | notice served | not before 90 days | Government Proceedings Act s.6(2) [P] |
| Limitation: contract | cause of action | 6 years | Law of Limitation Act, Sch. Pt I item 7 [P] |
| Limitation: tort (incl. injury) | cause of action | 3 years | Sch. Pt I item 6 [P] |
| Limitation: land | right accrued | 12 years | Sch. Pt I item 22 [P] |
| Enforce a judgment | decree | 12 years | Sch. Pt III item 20 [P] |

## Not counted, and why

- Reply to the written statement of defence and the first pre-trial conference (21 days after pleadings close, held by the court): the amended Order VIII leaves the reply to dates the court fixes (r.17) [P]; not a fixed period.
- Item 1 of the Schedule ("compensation for doing or omitting to do an act alleged to be in pursuance of any written law", one year) can apply to claims against public officers [U]; not applied automatically.
- Zanzibar has its own civil procedure and courts: not covered. Backlog.
- The 60-day memorandum period excludes the time certified for obtaining copies (certificate of delay); the app counts the plain 60 days and the advocate records the certificate.
