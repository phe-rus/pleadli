# Uganda Police Case File — Physical Structure & Numbering — Research Notes

> **Preamble**
> - Companion document to `docs/police/research/custody-and-bonds.md` (same repo, same conventions). Read that document first — it already establishes the SD (Station Diary) → CRB (Crime Record Book) mechanism, the PF-series form list, and several open gaps this document does not repeat.
> - Research date: **2026-09-11**.
> - Produced by an AI agent using web search and web fetch against public sources, prompted by two people using the software saying the current build feels like "a database row in a drawer" rather than real Ugandan police file work. The brief: find out what an actual Uganda Police case file looks like as a physical/organizational object — folder, cover, index, numbering — not just the legal procedure around it.
> - Not reviewed by a Ugandan legal or serving police professional. Confidence labels: **[Primary]** = read directly from the actual official document/page fetched in full. **[Secondary]** = a named non-UPF source, or a UPF-adjacent source (e.g. a court judgment title) not independently fetched in full. **UNKNOWN** = not established by anything found; stated plainly, not invented.

---

## 1. The CRB number — format

### What was found

Three independent Ugandan High Court judgments, indexed and titled by the Judiciary of Uganda's own case-law repository (ULII — Uganda Legal Information Institute), cite the police file reference in their own case titles:

- *Uganda v Madaya Benard and Others* — cited as **"SIRONKO CRB-566/2023"**
- *Uganda v Amondi Jacob and Others* — cited as **"JINJA CRB 314/2019"**
- *Uganda v Mayamba James alias Wamayi* — cited as **"BUSIU-CRB-38/2022"**

**Confidence: Secondary — search-result snippet only, not independently fetched in full.** ULII's own page (ulii.org) returned an HTTP 403 "Just a moment..." Cloudflare bot-check on every fetch attempt in this session (both via WebFetch and via curl with a browser user-agent, and via a third-party reader proxy), exactly as `docs/dpp/RESEARCH.md` and `custody-and-bonds.md` both independently report for the same site. The three citations above are therefore taken from a search-engine index of ULII's own case-title metadata, not from a directly-read judgment page. Treat the *pattern* below as reasonably well corroborated (three independent, differently-named cases all follow it) but not verified against ULII's raw page text.

### What this confirms/corrects

- **Pattern confirmed**: `{STATION OR PLACE NAME} + "CRB" + sequential number + "/" + year` — e.g. `SIRONKO CRB-566/2023`, `JINJA CRB 314/2019`, `BUSIU-CRB-38/2022`. Punctuation varies (hyphen vs. space vs. none between the parts) across the three examples, suggesting the hyphenation/spacing is a citation-formatting convention applied by the Judiciary's registry/ULII rather than a fixed printed format on the police side — do not treat the punctuation itself as load-bearing.
- **The station/place identifier is a full name, not an abbreviated code.** "SIRONKO", "JINJA", "BUSIU" are place names spelled out, not a 2-4 letter station code. This directly bears on the question the brief asked: there is no evidence of a "station code" scheme (e.g. a numeric or alphabetic station ID prefix) in the CRB number itself — the station is identified by name.
- **This corrects the illustrative example already flagged as unconfirmed in prior repo research.** The existing `docs/dpp/RESEARCH.md` used "CRB 221/2026" as an illustrative example while flagging that its structural rule "wasn't independently confirmed." The three real examples found here confirm the `CRB {number}/{year}` core is right, but show the illustrative example was **missing the station-name prefix** that appears in every real example found — a bare `CRB 221/2026` without a station name attached does not match the pattern actually observed in Ugandan case law citations. **A future numbering scheme in the product should include the station/place name as part of the reference, not just a number and year.**
- **Sequence reset**: whether the sequential number resets to 1 each calendar year per station (implied by the year suffix, and consistent with how "annual crime report" statistics are compiled per the CRB per `custody-and-bonds.md` §5) is a reasonable inference but **not explicitly stated** in any source read — **UNKNOWN** as a confirmed rule, plausible as an inference.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| CRB number = station/place name + "CRB" + sequential number + "/" + year | Secondary — corroborated across 3 independent judgment citations, but only via search-index snippets, not a directly-read primary page |
| Station identified by full name, not a coded abbreviation | Secondary, same basis |
| Whether the sequence resets yearly per station | **UNKNOWN** — plausible inference from the year suffix, not confirmed |
| Whether CRB numbers are unique nationally or only unique per station | **UNKNOWN** — the station-name prefix strongly implies per-station uniqueness (two different stations could each have a "CRB 38"), but no source states this as an explicit rule |
| Exact printed format on a real physical CRB register page/cover (e.g. is it hand-written or pre-printed) | **UNKNOWN** — not found |

---

## 2. Police Forms 2A and 2B — what they actually are (a correction to prior research)

This research fetched and directly examined the actual PDF forms behind Uganda Police Force's own official forms page (upf.go.ug), not just their listing titles.

**What was found**: PF2A and PF2B are titled **"Case File No."** at the top, but the forms themselves are **continuation-of-statement sheets**, not file-opening/registration documents:

- **PF2A**: a blank ruled continuation sheet headed "UGANDA POLICE / Case File No. _____ / Police Form 2A / Sheet No. _____ / CONTINUATION OF STATEMENT OF ________________________." Below the header it is entirely blank ruled space — i.e., it is the generic "next page" sheet used when any statement or document in the file runs longer than one page. Footer: "Printed by Police Quartermaster."
- **PF2B**: the same "Case File No." / "Sheet No." header, but pre-printed with a structured particulars block: **DATE / TIME / PLACE**, then **FULL NAME**, **OCCUPATION / APPROX. AGE**, **SEX / NATIONALITY OR TRIBE**, **PLACE OF LOCAL RESIDENCE**, **ADDRESS – POSTAL OR TRIBAL**, followed by a **"STATES:-"** heading beginning the narrative statement. This is specifically the opening sheet for taking a witness or suspect's statement (name/particulars first, then the free-text statement under "STATES:-").

**Confidence: Primary** — both forms were downloaded directly from upf.go.ug (via the site's own download-manager links) and visually examined page-by-page; they are image-scan PDFs with no text layer, so they were rendered to images and read directly.

**Correction this makes to `custody-and-bonds.md` §4**: that document's forms table (sourced from the upf.go.ug forms *listing* page only, not the underlying PDFs) describes PF2A/PF2B as **"Case File Number (case file initiation)"** — i.e., implying they are the mechanism by which a file number is assigned/registered. Having now read the actual forms, this is **not accurate**: PF2A/PF2B do not assign or register anything. They are blank/semi-printed statement-continuation stationery that carries a **"Case File No."** blank field at the top of every sheet, to be filled in **by hand**, so that any loose page can be matched back to its file if separated. The real implication for file identity is the opposite of "initiation": **the case file number is written by hand on every individual sheet added to the file**, not generated or printed by a form. This is a concrete, primary-sourced physical-file convention worth keeping: a Pleadli Police "print a statement" or "print a continuation sheet" feature should reproduce a "Case File No." / "Sheet No." header field, not treat file numbering as something a specific form event triggers.

**What remains unconfirmed**: which form (if any) among the wider PF series actually functions as the file-opening/registration document that assigns the CRB number in the first place. PF16 ("Crime Report," per `custody-and-bonds.md` §4) is the most likely candidate by inference (it is the formal crime-report form, and `custody-and-bonds.md` already flags the PF16↔CRB link as "plausible but unconfirmed") but this research did not find or fetch the actual PF16 PDF to check, and no source read states explicitly "this form assigns the CRB number." **UNKNOWN.**

### Confidence and gaps

| Claim | Confidence |
|---|---|
| PF2A = blank continuation sheet, PF2B = witness/suspect particulars + statement opening sheet | Verified against primary source (forms fetched and read directly) |
| PF2A/PF2B do NOT themselves assign/register a case file number — the number is hand-written per-sheet | Verified against primary source |
| Which form actually assigns/generates the CRB/case-file number in the first instance | **UNKNOWN** — PF16 is a plausible candidate by inference only, not confirmed |
| Whether PF2A/PF2B are single sheets or part of a bound/carbon-copy booklet like PF18 | **UNKNOWN** — not stated on the forms or their download pages |

---

## 3. Physical folder, cover sheet, and index of contents

**No Uganda-specific primary or credible secondary source was found describing**: the physical folder itself (material, color, printed cover design), a dedicated "docket cover sheet" distinct from the CRB register entry, or a formal "index of contents" convention for a Ugandan police case file.

**A genuinely Uganda-adjacent lettered sub-file convention was found — but for Kenya, not Uganda, and is explicitly excluded here.** A document titled "Police Case File Compilation Guide" (hosted on Scribd, uploaded by a Kenyan-named user) describes a detailed lettered sub-file scheme: Sub-File A (initial crime report), Sub-File B (uncertified documentary evidence), Sub-File C (expert reports), Sub-File D (witness/suspect statements), Sub-File E (accused's statements, marked E1/E2/E3...), Sub-File F (investigation diary, marked F1/F2/F3..., "clearly set[ting] the time, date and place"), and further sub-files for charge sheets, suspect records, correspondence, and a "minute sheet." Cross-checking, this scheme is corroborated by multiple other search hits explicitly labeled **"Police Case File Preparation in Kenya"**, **"Kenya Police Case File Template"**, and **"Police File Compilation Standards: National Orders Explained"** (a Kenya School of Law document) — i.e., it is a **Kenyan** National Police Service standing-order convention, not a Ugandan one. Per this document's own stated instruction (see `custody-and-bonds.md`'s own precedent of flagging and excluding Kenyan/Indian/Nigerian material rather than silently porting it in), **this lettered A–G / E1-F1-style sub-file scheme is explicitly NOT confirmed as Uganda Police Force practice and must not be treated as a Uganda fact.** It is recorded here only so a future researcher knows it was seen and deliberately rejected, not missed — and because it is a concrete illustration of the *kind* of convention (lettered/numbered sub-file tabs within one physical folder) that a similar East African common-law police force might plausibly use, which is exactly why it would be dangerous to assume Uganda copies it without a Uganda-specific source.

**UPF Standing Orders** — again referenced (per Police Act s.6, per `custody-and-bonds.md`'s own prior finding) as the Inspector General's instrument for this kind of operational detail, and again **not publicly locatable** in this research pass. This remains, as the prior document already said, very likely where the real answer lives.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| A physical folder with a printed cover/index exists for a Uganda Police case file | Plausible (a "case file" is repeatedly referred to as a real physical thing across all sources, e.g. UPF's own PF2A/PF2B forms exist specifically to be placed inside one) but **no source describes the cover/index itself** — do not invent a design |
| Lettered sub-file structure (A-G, e.g. investigation diary = Sub-File F) | **Found, but for Kenya only — explicitly not confirmed for Uganda, do not port in** |
| Order/tabs of documents within a Uganda police file (charge sheet first? statements first?) | **UNKNOWN** — no Uganda-specific source found |
| UPF Standing Orders content on file compilation | **Not found / inaccessible**, consistent with `custody-and-bonds.md`'s prior finding |

---

## 4. Colloquial nicknames/short codes for police files

No source — official or secondary — was found describing officers, investigators, or (on the DPP side, see the companion ODPP document) prosecutors using a colloquial nickname or shorthand distinct from the CRB number itself (e.g. no equivalent of English-language courtroom slang like "the file," "the docket," etc. specifically attested for Uganda). The word "file" is the term consistently used across every source read (UPF's own forms, news reporting, JLOS material). **UNKNOWN** whether any informal shorthand exists in station-level speech; this is the kind of detail unlikely to surface in written sources at all and may require a practitioner interview rather than further web research.

---

## References

All URLs below were fetched (via WebFetch or curl) during this research and either resolved with real, readable content, or are explicitly marked as a search-index-only result.

1. **Uganda Police Force official forms page**, download links for **Police Form 2A** (https://upf.go.ug/download/case-file-no-police-form-2a/) and **Police Form 2B** (https://upf.go.ug/download/case-file-no-police-form-2b/) — the download-page HTML was fetched to locate each form's underlying `wpdmdl` download-manager link, then the actual PDF was downloaded directly (e.g. `https://upf.go.ug/download/case-file-no-police-form-2a/?wpdmdl=3955`), rendered to an image with Ghostscript, and read in full. Accessed 2026-09-11.
2. **ULII (Uganda Legal Information Institute)** case-title metadata for three High Court judgments, found via web search and not independently fetched (ULII blocks automated fetches with a Cloudflare challenge, consistent with `docs/dpp/RESEARCH.md`'s and `custody-and-bonds.md`'s own prior findings): *Uganda v Madaya Benard and Others*, cited "SIRONKO CRB-566/2023" ([ulii.org/en/akn/ug/judgment/ughc/2026/294/eng@2026-03-30](https://ulii.org/en/akn/ug/judgment/ughc/2026/294/eng@2026-03-30)); *Uganda v Amondi Jacob and Others*, cited "JINJA CRB 314/2019" ([ulii.org/en/akn/ug/judgment/ughc/2025/1543/eng@2025-03-31](https://ulii.org/en/akn/ug/judgment/ughc/2025/1543/eng@2025-03-31)); *Uganda v Mayamba James alias Wamayi*, cited "BUSIU-CRB-38/2022" ([ulii.org/en/akn/ug/judgment/ughc/2026/306/eng@2026-03-31](https://ulii.org/en/akn/ug/judgment/ughc/2026/306/eng@2026-03-31)). Accessed via search 2026-09-11, direct fetch attempted and blocked (HTTP 403 both via WebFetch and via curl with a browser user-agent, and via the r.jina.ai reader proxy, which itself hit ULII's Cloudflare challenge page).
3. **"Police Case File Compilation Guide"** (Scribd, https://www.scribd.com/document/749011273/Case-File-Compilation, uploaded by user "bensonmwendwa4") — identified via cross-referencing search results as **Kenyan** National Police Service case-file-compilation practice (corroborated by [scribd.com/presentation/366904397/criminal-prep-of-case-files-ppt "Police Case File Preparation in Kenya"](https://www.scribd.com/presentation/366904397/criminal-prep-of-case-files-ppt), [scribd.com/document/931824463/Initial-Cover-p2 "Kenya Police Case File Template"](https://www.scribd.com/document/931824463/Initial-Cover-p2), and [studocu.com "Police File Compilation Standards: National Orders Explained" (Kenya School of Law)](https://www.studocu.com/row/document/kenya-school-of-law/criminal-litigation/contents-of-police-file/102770312)) — explicitly excluded as a Uganda source per this document's own discipline; recorded only to flag it as seen-and-rejected. Accessed via search 2026-09-11.
4. **`docs/police/research/custody-and-bonds.md`** (this repo) — read in full as the pre-existing companion document and citation-convention reference; its findings on SD/CRB, the PF-series form list, and the UPF Standing Orders gap are relied on here rather than re-derived.

**Sources searched but not usable, or reachable only as inaccessible binary**: the UPF forms-listing page for PF16 (Crime Report) itself was not fetched in this pass — a future researcher should fetch the actual PF16 PDF (not just its listing) to check whether it states anything about CRB-number assignment. A UNODC-hosted "Wildlife Offences in Uganda: Points to Prove" document (hawen.info) was fetched expecting file-structure content but turned out to be an unrelated Adobe Illustrator banner-design file with no relevant text. Direct ULII fetches remain blocked in every attempted mode (WebFetch, curl+UA, r.jina.ai proxy) — this is the single most consequential access gap for this topic, since ULII is the only public window into how Ugandan courts actually cite police file numbers in real litigated cases.
