# ODPP File Structure & Regional Jurisdiction — Research Notes

> **Preamble**
> - Companion document to `docs/dpp/RESEARCH.md` (same repo) and to `docs/police/research/file-structure-and-numbering.md` (the police-side counterpart to this same research pass). Read `docs/dpp/RESEARCH.md` first, especially §1 (institutional structure, 19 Regional Offices / 127 RSA/RSP stations) and §2 (terminology — "file" vs "case," the ODPP registration number flagged there as unconfirmed) — this document extends both without repeating them in full.
> - Research date: **2026-09-11**.
> - Produced by an AI agent using web search and web fetch against public sources, prompted by two people using the software saying the current build feels like "a database row in a drawer" rather than real prosecution file work. The brief: (1) what does an actual ODPP file look like as a physical/organizational object — folder, cover, index, registration-number format; (2) is ODPP regional/RSA jurisdiction strictly bound by geography, and how are police-station-to-RSA-station referrals actually mapped.
> - Not reviewed by a Ugandan legal professional. Confidence labels follow `docs/dpp/RESEARCH.md`'s own convention: **[Primary]** = verified against the actual document/page fetched and read in full. **[Secondary]** = a named secondary source, or a primary-institution source not independently fetched in full (e.g. a search-index snippet). **UNKNOWN** = not established by anything found; stated plainly.

---

## 1. The ODPP registration number — still unconfirmed, now double-checked

`docs/dpp/RESEARCH.md` §2 already established that ODPP assigns a **"ODPP registration number"** to a file, that charges not founded on the same facts/character must be split into separate files "each with a different ODPP registration number," and that the number's **exact format was not found** — flagged UNKNOWN.

This research re-fetched ODPP's own **"Guidelines on the Decision to Charge, 2023"** PDF directly from dpp.go.ug and, this time, successfully extracted its full text (via Ghostscript's `txtwrite` device, since the PDF has a proper text layer — unlike some of ODPP's other hosted PDFs, e.g. the Plea Bargain Rules, which are image scans). The complete 36-page text was searched specifically for: "registration number," "file index," "index of," "cover sheet," "checklist," "folder," "tab," "arrange," "order of documents," "physical file," "region," "jurisdiction," and "transfer."

**Result: nothing new.** The only hit for "registration number" is the same sentence already quoted in `docs/dpp/RESEARCH.md` (§3.2.3: charges not linked "will need to be separated, each with a different ODPP registration number"). There is **no annex, appendix, checklist, or file-index requirement anywhere in the document** — the full Table of Contents was also read directly and confirms the Guidelines consist of five chapters (Introduction; The Decision to Charge; Determining the Appropriate Charge(s); Accepting a Guilty Plea and Plea Bargaining; Alternatives to Prosecution) plus a Foreword, Acknowledgments, Definitions, and Abbreviations section — no appendix or annex of any kind. **Confidence: Primary** (full text read, not just a search) **for the negative finding**: ODPP's own most detailed public procedural document does not state the registration number's format, and does not contain a file-index/cover-sheet/document-checklist requirement of the kind the brief asked about. This should be read as a genuine, confirmed gap in what ODPP publishes — not as evidence that no such convention exists internally (it likely lives in an internal PROCAM/PROCAMIS manual or Prosecutors' Manual not publicly available, in the same way UPF Standing Orders are referenced-but-unavailable on the police side).

**Still UNKNOWN**: the exact digit/prefix/region-code structure of the ODPP registration number; whether it embeds the assigned RSA station or region (by analogy to the police CRB number's station-name prefix found in the companion document, this would be a reasonable design guess — but it is a guess, not a finding, and should not be hardcoded as fact).

---

## 2. Physical file — folder, cover, index

**No source found in this pass adds anything concrete beyond what `docs/dpp/RESEARCH.md` §2 already established**: that the "ODPP PROCAM file" is a real, physically distinct object from the police file ("The ODPP file itself should remain with the Prosecutor and under no circumstances may a file be left unattended in the court or office"), and that this is stated in ODPP's own Guidelines. No description of the folder's cover design, a printed index-of-contents convention, or a tabbed/sectioned internal order (e.g. "charge sheet first, then statements, then exhibit list") was found for the ODPP file specifically, in this pass or in the original research. **UNKNOWN.**

**A general "case file" description surfaced repeatedly in search results** (unattributed to a specific fetchable Uganda-specific primary source, appearing as an AI-search-summary paraphrase rather than a quotable passage): that a police/prosecution file is "a record of case papers pertaining to a case duly reported to the police and registered," containing (in some generic ordering) "an initial crime report, incident report, and situational report... uncertified documentary evidence, completed expert reports, and witness and suspect statements... an investigation diary, charge sheets, suspect records, correspondence, and a minute sheet," with "a file index" described as "a minimum requirement for files submitted in Uganda's criminal justice system." **This could not be traced back to one specific, fetchable, quotable Uganda primary or secondary document** — the underlying documents this search summary was drawn from (a UNODC banner-design PDF, a Scribd upload) did not, on direct inspection, actually contain this text; see the companion police-side document's §3 for the parallel finding that a similarly-shaped lettered-sub-file scheme is real but is **Kenyan**, not Ugandan. Given that the specific quote "a file index... is listed as a minimum requirement for files submitted in Uganda's criminal justice system" could not be verified against any document this research could actually open and read, it is recorded here only as an **unverified lead**, not a finding — a future researcher with access to ODPP's internal Prosecutors' Manual (referenced by ODPP's own site navigation as "PROSECUTION PERFORMANCE STANDARDS AND GUIDELINES 2014" and a "Prosecutors Manual," neither of which this research could access the full text of) should check it directly rather than trust this secondhand paraphrase.

---

## 3. ODPP regional/jurisdictional scope — confirmed with a real primary source

### What was found

Uganda's Ministry of Finance publishes ODPP's own **Ministerial Policy Statement (budget performance) documents** — official government budget submissions, written and submitted by ODPP itself as the "Vote 133" spending agency — as public PDFs on budget.finance.go.ug. **[Primary — fetched and full-text-extracted via Ghostscript]** The **FY 2023/24** edition states:

> "...additional offices that are already on PROCAMIS & E-Services. Field Operations established **3 Regional Offices in Luwero, Moroto and Tororo**."

and separately, in its performance-indicator table:

> PIAP Output: ODPP Regional Offices Constructed — Number of ODPP Regional Offices: 2019 baseline figure given as 2.

Separately, this research located and fetched a **Wayback Machine (web.archive.org) capture, dated 2023-12-03, of ODPP's own official website** at its former URL structure (`www.dpp.go.ug/index.php/dpp-stations`, the pre-redesign Joomla-based site — the current WordPress-based dpp.go.ug no longer serves this page at the same path, and a direct fetch of the live site 404s). **[Primary — this is an archived snapshot of ODPP's own site, not a third-party paraphrase]** The archived page is titled "ODPP Stations" and contains a full table headed **"LIST OF REGIONAL OFFICES AND STATIONS"**, listing (as of December 2023) **16 numbered regions**, each with a named Regional Officer and an enumerated list of RSA (Resident State Attorney) stations and RSP (Resident State Prosecutor) stations under it:

| # | Region | RSA stations | RSP stations |
|---|---|---|---|
| 1 | Arua | Arua, Koboko, Yumbe, Moyo, Paidha, Adjumani, Nebbi | — |
| 2 | Fort Portal | Bundibugyo, Bwera, Fort Portal, Kamwengye, Kasese, Kyenjojo | — |
| 3 | Gulu | Amuru, Patongo/Agago, Gulu, Kitgum, Pader | — |
| 4 | Jinja | Bugiri, Iganga, Mayuge, Jinja, Kaliro, Namayingo, Kamuli | — |
| 5 | Kabale | Kabale, Kanungu, Kisoro, Rukungiri | — |
| 6 | Kampala | Buganda Road, City Hall, LDC, Luwero, Katikamu/Wobulenzi, Makindye, Mwanga II, Nakaseke, Nakasongola | — |
| 7 | Lira | Amolatar, Alebtong, Apac, Dokolo, Lira, Otuke | — |
| 8 | Masaka | Masaka, Kalangala, Lyantonde, Rakai, Kalisizo, Sembabule, Matete | — |
| 9 | Masindi | Hoima, Kibaale, Kagadi, Kiryandongo, Masindi | — |
| 10 | Mbale | Busia, Malaba, Butaleja, Kapchorwa, Manafwa, Mbale, Paliisa, Budaka, Tororo | — |
| 11 | Mbarara | Bushenyi, Sheema, Ibanda, Isingiro, Kiruhura, Mbarara, Mitooma, Ntungamo | — |
| 12 | Nakawa | Entebbe, Kajjansi, Kasangati, Kira, Nabweru, Nakawa, Luzira, Wakiso | Kakiri, Matugga |
| 13 | Soroti | Kaberamaido, Kotido, Abim, Kumi, Bukedea, Moroto, Nakapiripirit, Soroti | Ngora, Serere, Katakwi |
| 14 | Mukono | Mukono, Njeru, Lugazi, Kayunga | Nakifuma |
| 15 | Mubende | Mubende, Bukomero, Kiboga, Busunju | Mityana |
| 16 | Mpigi | Mpigi, Buwama, Butambala, Nsangi | — |

**Confidence: Primary** for the table's existence and content as of the December 2023 snapshot — this is ODPP's own official website content, archived by a third party (Wayback Machine) but not altered by it.

### Reconciling this with the "19 Regional Offices" figure

`docs/dpp/RESEARCH.md` §1, sourced from the **current** live dpp.go.ug/directorate page, states ODPP now has **19 Regional Offices covering 127 RSA/RSP stations**. This document's 2023-12-03 snapshot shows only **16** regions. The FY2023/24 budget document's statement that "Field Operations established 3 Regional Offices in Luwero, Moroto and Tororo" **exactly closes this gap**: Luwero, Moroto, and Tororo all appear in the 2023 snapshot as ordinary **RSA/RSP stations** nested under, respectively, the Kampala, Soroti, and Mbale regions — i.e., these three stations were upgraded from subordinate stations to their own full Regional Offices during FY2023/24, taking the count from 16 to 19. **Confidence: Primary** — this reconciliation is drawn from two independently-fetched ODPP-authored primary documents (the archived ODPP website table and ODPP's own budget submission) that corroborate each other's numbers and timeline without either one stating the reconciliation explicitly; the arithmetic (16 + 3 = 19) and the specific station names matching in both directions is what makes this a confirmed inference rather than a coincidence.

**This is the strongest, most concrete finding of this research pass**: ODPP's prosecutorial stations are **not** an unstructured flat list — they are organized into a fixed, named, hierarchical Region → RSA/RSP-station structure, published by ODPP itself, and the structure has changed over time in a documented, traceable way (16 regions in Dec 2023, growing to 19 by the time of `docs/dpp/RESEARCH.md`'s research in Sept 2026).

### What is still NOT confirmed: strict jurisdictional binding and cross-region transfer

Despite the strong evidence that ODPP organizes its stations geographically, **no source found (ODPP's own site, its budget documents, its Decision to Charge Guidelines, or Justice Centres Uganda's public glossary) explicitly states a rule that**:

- a Resident State Attorney/station may **only** handle matters referred from police stations within its own assigned region (as opposed to this being merely the ordinary/default practice implied by the geographic structure); or
- there is a **specific, named escalation/transfer process** for moving a matter between ODPP regions (e.g. for an accused who relocates, or a case needing a specialized unit based elsewhere).

What **was** found, and should not be confused with an ODPP-specific rule, is **court** territorial jurisdiction under the **Magistrates Courts Act** — already partly covered in `docs/dpp/RESEARCH.md` (§5, §167 "Power to transfer case to superior court," which is about trial-court level, not region) — and, newly found here, **MCA §37(b) and (d)**, which governs which *court* may try an offence when it straddles more than one local area: "where an offence is committed partly in one local area and partly in another," or "consists of several acts done in different local areas," the offence "may be inquired into or tried by a court having jurisdiction over any of those areas." **[Primary — this section is quoted in a 2018 High Court criminal-revision ruling found via search, itself citing the Magistrates Courts Act text; the MCA's full text was independently read in `docs/dpp/RESEARCH.md`'s original research, though that pass did not specifically extract §37]** This is a **court-venue** jurisdiction rule, not a statement about ODPP's internal RSA-station assignment — it establishes that *courts* have jurisdictional flexibility across local-area boundaries where an offence spans more than one area, which would plausibly extend in practice to which RSA/prosecutor appears in that court, but no source directly connects this MCA provision to an ODPP administrative transfer procedure. **Conflating "which court may try this" with "which RSA station administratively owns this file" would be an unverified leap — flagged explicitly so it is not made silently in product design.**

**Bottom line: UNKNOWN** whether ODPP jurisdiction is strictly, formally bound to the referring police station's region, or whether it is simply the default/ordinary practice with no hard rule against routing elsewhere; and **UNKNOWN** whether a documented, named cross-region transfer/escalation process exists internally. A product should not hardcode either "strictly regional, no exceptions" or "freely routable" as a business rule — both are unconfirmed. The safest posture: model the Region → RSA/RSP-station assignment as the *default* expected path (since it is clearly real and clearly geographic), while leaving room for a human override, since no source rules out exceptions and none confirms a hard boundary either.

### A distinct institution that must not be confused with ODPP's regional offices

Search results surfaced a **separate** set of "Regional Offices" (Arua, Fort Portal, Mbarara, and others) hosted at **justice.go.ug** — the **Ministry of Justice and Constitutional Affairs (MoJCA)**, which per general constitutional structure runs the Attorney General's Chambers and handles the government's **civil** litigation and legal-advisory work, a **different institution** from ODPP (which, per Article 120, is specifically the **criminal**-prosecution authority). Direct fetch attempts on the specific MoJCA regional-office pages returned HTTP 404 in this session, so their content could not be independently verified here — but the search-result summaries describe them in terms of "High Court Circuits" and "support[ing] Magistrates' Courts," civil/legal-services language distinct from ODPP's RSA/criminal-prosecution framing. **Confidence: Secondary / flagged as a risk, not a finding** — this is recorded specifically as a naming-collision warning: a future researcher (or a product's data-import step) searching for "Uganda regional office [district name]" could easily pull MoJCA's regional-office structure and mistake it for ODPP's, since both use the same "Regional Office" language and overlapping town names (Arua, Fort Portal, Mbarara appear in both institutions' structures for the obvious reason that they are major regional towns). **Do not merge these two institutions' regional structures into one dataset without explicitly confirming which institution a given source describes.**

---

## 4. Police-station-to-RSA-station mapping — partially answered, not fully

The Region → RSA/RSP-station table in §3 above **is** a real, fixed, ODPP-published mapping — but at the **station-to-region** level, not at the finer **individual-police-station-to-RSA-station** level the brief specifically asked about (e.g., "does Kira Road Police Station always refer to a specific named RSA station").

**A specific, concrete risk of confusion found in this research**: the Nakawa region's station list includes an RSA station simply named **"Kira."** This is very likely **Kira Town Council in Wakiso District** (a distinct municipality bordering Kampala, with its own RSA station, grouped alongside Entebbe, Kajjansi, Kasangati, Nabweru, Wakiso, etc. — all Wakiso-district/Nakawa-region locations) — **not** the well-known **"Kira Road Police Station"** in Kampala's Central Division (a specific CID-heavy station on Kira Road street, inside Kampala city, unrelated administratively to Kira Town in Wakiso beyond sharing a name derived from the same road/area). This research could not confirm which RSA station Kira Road Police Station (Kampala Central) itself refers matters to — plausibly one of the Kampala-region stations (Buganda Road, City Hall, or Makindye are the Kampala-region RSA stations listed) given it sits within Kampala city, but **no source states this explicitly**, and the name collision with "Kira" (Wakiso) makes this exactly the kind of assumption that should not be hardcoded without confirmation. **UNKNOWN**, flagged as a named, concrete example of the general gap rather than left abstract.

**General finding**: no source found states a formal, universal rule of the form "police station X always refers to RSA station Y." What is confirmed is the coarser region/station list in §3, which strongly implies referrals follow geographic proximity in the ordinary case, but the actual granular mapping (which of potentially dozens of police stations within, say, Kampala city routes to which of the three Kampala-region RSA stations — Buganda Road, City Hall, or Makindye) is **UNKNOWN** and was not discoverable in this research pass.

---

## 5. Colloquial nicknames/short codes for ODPP files

As with the police-side companion document: no source found describes prosecutors using an informal shorthand for a file distinct from "file" itself, the ODPP registration number, or the court case number. **UNKNOWN.**

---

## References

1. **ODPP, "Guidelines on the Decision to Charge, 2023"** — https://dpp.go.ug/wp-content/uploads/2024/03/THE-DECISION-TO-CHARGE-GUIDELINES.pdf — re-downloaded and full text re-extracted via Ghostscript `txtwrite` in this research pass (36 pages, complete), specifically searched for file-index/registration-number/jurisdiction-transfer language; confirmed no such content exists beyond what `docs/dpp/RESEARCH.md` already quotes. Accessed 2026-09-11.
2. **Uganda Ministry of Finance, Planning and Economic Development** — "Vote 133: Directorate of Public Prosecutions" Ministerial Policy Statement, FY 2023/24 — https://budget.finance.go.ug/sites/default/files/Sector%20Spending%20Agency%20Budgets%20and%20Performance/Directorate%20of%20Public%20Prosecution_2.pdf — downloaded and full text extracted via Ghostscript `txtwrite`; source of the "3 Regional Offices in Luwero, Moroto and Tororo" FY2023/24 statement and the "2019 baseline: 2 Regional Offices" performance-indicator line. Accessed 2026-09-11.
3. **ODPP's own official website, archived** — "ODPP Stations" page, https://www.dpp.go.ug/index.php/dpp-stations, captured by the Wayback Machine on **2023-12-03** (https://web.archive.org/web/20231203200210/https://dpp.go.ug/index.php/dpp-stations) — fetched directly and its HTML parsed for the "LIST OF REGIONAL OFFICES AND STATIONS" table, reproduced in full in §3 above. The equivalent page could not be located on ODPP's current (redesigned, WordPress-based) live site — attempts at `dpp.go.ug/odpp-stations/` and the original Joomla path both returned HTTP 404 in this session. Accessed 2026-09-11.
4. **Ministry of Justice and Constitutional Affairs (MoJCA)** — regional office pages referenced via search (e.g. "Arua Regional Office," "Mbarara Regional Office," "Fortportal Regional Office" at justice.go.ug) — direct fetch of a specific page (justice.go.ug/arua-regional-office-2/) returned HTTP 404 in this session; content used here is from search-result summaries only, flagged explicitly as a **different institution from ODPP** and not independently verified beyond that search summary. Accessed via search 2026-09-11.
5. **Justice Centres Uganda** glossary, "State Attorney" — https://justicecentres.go.ug/glossary/state-attorney/ — fetched in full; confirms only that "Every Court has a Prosecutor or State Attorney attached to it," with no jurisdiction-scope or transfer detail. **[Secondary]** Accessed 2026-09-11.
6. **A 2018 Uganda High Court criminal-revision ruling** (found via search, citing Magistrates Courts Act §37(b) and (d) on cross-local-area offence jurisdiction) — search-result summary only, not independently fetched in full; the underlying Magistrates Courts Act text itself was separately read in full during `docs/dpp/RESEARCH.md`'s original research (see that document's Reference #7), though §37 specifically was not called out there — this document is the first to specifically surface and quote §37(b)/(d)'s cross-local-area rule, via the secondary case citation. Accessed via search 2026-09-11.
7. **`docs/dpp/RESEARCH.md`** and **`docs/police/research/file-structure-and-numbering.md`** (this repo) — read in full / cross-referenced as this document's companions; not re-cited by URL since they are repo-internal.

**Sources searched but not usable or not independently verifiable**: an unattributed AI-search-summary describing a Uganda-specific lettered sub-file / file-index requirement (§2 above) could not be traced back to any document this research could actually open and read — the candidate source documents it appeared to be drawn from (a UNODC banner-design PDF; a Scribd upload later confirmed Kenyan) did not, on direct inspection, contain this text. This lead is recorded as unverified, not as fact. ODPP's own site references a "Prosecutors Manual" and "PROSECUTION PERFORMANCE STANDARDS AND GUIDELINES 2014" in its navigation menu (visible in the archived ODPP Stations page's sitemap listing) — neither was fetched/read in this pass and both are likely candidates for where file-structure and registration-number detail actually lives; a future research pass should locate and read these directly.
