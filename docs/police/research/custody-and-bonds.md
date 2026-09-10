# Uganda Police Custody & Bonds — Research Notes

> **Preamble**
> - This is the first entry in what may become a `docs/police/research/` directory. There is no pre-existing research-notes convention in this repo; this document establishes one (structure: one H2 per topic, each ending in a "Confidence and gaps" subsection, plus a final "Sources consulted" log).
> - Research date: **2026-09-09**.
> - This document was produced by an AI agent using web search and web fetch against public sources. It has **not** been reviewed by a Ugandan legal professional (advocate, judicial officer, or serving police officer). Treat every claim here according to its stated confidence label, and have a qualified Ugandan legal professional verify anything load-bearing before it drives production legal-workflow decisions (custody deadlines, bond eligibility, form content, etc.). Where primary text could not be reached or a claim could not be corroborated, that is stated plainly rather than filled in with plausible-sounding invention, per `docs/police/PRODUCT.md`.

---

## 1. The 48-hour rule

### The constitutional text

Article 23 of the **Constitution of the Republic of Uganda, 1995** ("Protection of personal liberty") contains the anchor provision. The clause commonly cited as "the 48-hour rule" is Article 23(4):

> "A person arrested or detained—
> (a) for the purpose of bringing him or her before a court in execution of an order of a court; or
> (b) upon reasonable suspicion of his or her having committed or being about to commit a criminal offence under the laws of Uganda,
> shall, if not earlier released, be brought to court as soon as possible but in any case not later than forty-eight hours from the time of his or her arrest."

**Confidence: Verified against primary source.** This is a direct quote of the constitutional text (fetched via a legal-reference site reproducing the Constitution; cross-referenced against ULII's listing of the 1995 Constitution and against the operative statutory echo of the same rule in the Police Act, see below, which independently corroborates the wording and effect).

**What the 48 hours is measured from**: explicitly "from the time of his or her arrest" — not from booking, arrival at the station, or first police contact short of arrest. **Verified against primary source** (Article 23(4) text above).

### The statutory implementation: Police Act, Cap 303, Section 25

The Constitution's 48-hour rule is operationalised for police officers in the **Police Act (Cap 303)**, Section 25, "Disposal of a person arrested by a police officer" (fetched directly from the Ministry of Internal Affairs' own hosted copy, mia.go.ug):

> "(1) A police officer on arresting a suspect without a warrant shall produce the suspect so arrested before a magistrate's court within forty-eight hours unless earlier released on bond.
> (2) Subsection (1) shall not apply to a person who is arrested in one police area and is not to be questioned within the area in which he or she was arrested until he or she is transferred to the area where the offence was committed within seven days.
> (3) If subsections (1) and (2) are not being complied with, any person may apply to the magistrate within twenty-four hours who shall order his or her release unless charged.
> (4) Where a complaint of torture of a suspect in custody is made to a magistrate, the magistrate shall order an investigation into the allegation; and if the allegation is proved to be true, the magistrate shall order for the examination and treatment of the person affected at the expense of the State, and any person responsible for the torture shall be charged."

**Confidence: Verified against primary source** (Police Act, Cap 303, s.25 — read in full from the official Ministry of Internal Affairs PDF).

### Exceptions — what the law actually says vs. commonly repeated claims

- **The real, statutory exception** is the **cross-jurisdiction/questioning exception** in s.25(2): if a person is arrested in one police area but needs to be questioned in the area where the offence was committed, the 48-hour clock does not apply until they are transferred there — and that transfer itself must happen within **seven days**. This is about *investigative jurisdiction*, not raw geographic distance to a courthouse. **Verified against primary source.**
- **The commonly cited "distance to the nearest court" exception**: this task was asked to specifically verify this claim rather than assume it. No primary source found (Constitution or Police Act) states a general "distance from the nearest court" exception to the 48-hour rule. What secondary commentary and advocacy sources actually describe as a practical problem is *lack of judicial officers sitting over weekends/holidays* and *long travel times in rural areas making same-day production impractical* — these are described as **practical obstacles to compliance**, not as **legal exceptions** that suspend the clock. The Refugee Law Project's advocacy commentary explicitly argues the 48-hour wording is unambiguous and should be read to include weekends and public holidays (i.e., it argues *against* treating these as exceptions). **Confidence: the 7-day cross-jurisdiction exception is Verified against primary source; a general "distance to nearest court" or "weekends/holidays" legal exception is Not found in the primary text — treat any such claim as folklore/practice-drift unless a further primary source surfaces it** (e.g. a Practice Direction from the Judiciary was not found addressing this specifically; see Sources Consulted for the Judiciary's 2022 Bail Guidelines Practice Direction, which is about court bail conditions, not the 48-hour custody deadline, and did not address this question in the material actually read).
- Uganda Police Force leadership has, as recently as 2018 and periodically since, publicly lobbied Parliament to **amend** the Constitution to extend or add exceptions to the 48-hour rule (e.g. for cross-border offences, offences requiring nationwide investigation, capital offences). This confirms, by implication, that **no such exceptions currently exist** — if they already existed, there would be no need to lobby for them. **Confidence: Corroborated by credible secondary source** (Parliament of Uganda's own news page reporting on the police's proposal, and VOA/New Vision reporting on the same).

### What is supposed to happen as the deadline approaches or is missed

- Before the deadline: the officer must either release the suspect (unconditionally, or on police bond), or produce them before a magistrate's court. **Verified against primary source** (Police Act s.25(1)).
- If the deadline (48 hours, or 7 days in the cross-jurisdiction case) is missed: **any person** (not just the suspect) may apply to a magistrate **within 24 hours** of the breach, and the magistrate **shall** order release unless the person has been charged. This is a real, specific, named remedy — not a vague constitutional aspiration. **Verified against primary source** (Police Act s.25(3)).
- If torture is alleged during the custody period, a magistrate receiving such a complaint must order an investigation, and — if proved — order state-funded medical treatment and require that the person responsible be charged. **Verified against primary source** (Police Act s.25(4)).
- Secondary/advocacy commentary states that compliance is poor in practice (one source claims roughly 80% of detainees are held past 48 hours), and that missed deadlines are linked to a higher risk of torture, coerced confessions, and unremedied constitutional violations because the s.25(3) remedy is rarely invoked by suspects who may not know of it or have no way to reach a magistrate independently. **Confidence: Corroborated by credible secondary source only** (advocacy/legal-aid commentary, not a government statistical publication) — treat the 80% figure as an illustrative claim, not a verified statistic.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| Article 23(4) exact text and effect | Verified against primary source |
| Clock starts "from the time of arrest" | Verified against primary source |
| Police Act s.25 operationalises the 48h rule for arrests without warrant | Verified against primary source |
| 7-day cross-jurisdiction exception (s.25(2)) | Verified against primary source |
| 24-hour magistrate-release remedy on breach (s.25(3)) | Verified against primary source |
| Torture-complaint procedure (s.25(4)) | Verified against primary source |
| "Distance to nearest court" as a *legal* exception | **Not found** — do not model this as an exception; if anything, treat weekend/holiday/rural-distance friction as an *operational risk factor* the product should surface (e.g. a countdown/derived-compliance view), never as a rule that legally extends the deadline |
| UPF lobbying to add exceptions (cross-border, capital offences) | Corroborated by credible secondary source |
| Real-world non-compliance rate | Corroborated by credible secondary source only, treat any specific percentage as illustrative, not authoritative |
| Whether an arrest *with* a warrant (Art. 23(4)(a) case) has different mechanics from arrest without warrant (s.25) | **Not found** / not fully reconciled — the Constitution's 48h rule covers both categories (4(a) court-order arrests and 4(b) reasonable-suspicion arrests) but the Police Act's operative machinery in s.25 is phrased specifically for "arresting a suspect without a warrant." This gap should be flagged to a legal reviewer before assuming the same clock/remedy structure applies identically to warrant arrests. |

---

## 2. The real custody lifecycle

Ugandan police custody, as documented across the Police Act (primary) and corroborating secondary/government-adjacent sources (Justice Centres Uganda — a Judiciary/JLOS-affiliated legal-aid body; Avocats Sans Frontières; the Legal Aid/human-rights commentary site MCJL), works roughly as follows. This is stated as **the actual documented flow**, not an idealised or invented one — gaps are marked.

1. **Arrest.** A police officer may arrest without a warrant on reasonable suspicion that an "arrestable offence" (Police Act s.1: an offence carrying ≥1 year imprisonment or a fine ≥100,000 shillings, or both) has been or is about to be committed (Police Act s.23). **Verified against primary source.**
2. **Booking / lock-up.** The arrested person is taken to a police station and held in a "lock-up" (a place maintained by a district or police force for temporary detention pending court production). Cell/lock-up registers exist as part of the station's custody records — a documented human-rights inspection finding at Muyenga Police Station specifically cited an arrest that was *not* recorded in either the station diary or the lock-up register as a documentation failure, implying that recording in both is the expected norm. **Confidence: Corroborated by credible secondary source** for the existence and expected use of a lock-up register; the *exact official name, form number, and prescribed fields* of this register were **not found** in any primary UPF or Ministry publication reached during this research — do not assume a specific schema for it without further sourcing (e.g. UPF Standing Orders, which were not accessible to this research).
3. **Rights on arrival.** The suspect must be informed, in a language they understand, of the reason for arrest and of their right to legal counsel; statements are taken; a PF3 medical examination is available/administered where injury is alleged or relevant (see Topic 3/4). **Confidence: Corroborated by credible secondary source** (Justice Centres Uganda glossary; ASF).
4. **Before the 48-hour mark, the officer in charge faces real decision points:**
   - **Release without charge** — where insufficient evidence exists or investigation clears the suspect. **Corroborated by credible secondary source.**
   - **Release on police bond** — with or without surety (Police Act s.24 explicitly for preventive detention; s.25(1) references bond as the alternative to court production for ordinary arrests; s.38 confirms bonds/recognisances taken by police attract no fee). See Topic 3. **Verified against primary source** for the bond mechanism itself; **Corroborated by credible secondary source** for it being the standard "buy time" tool officers use when investigation won't finish inside 48 hours.
   - **Produce the suspect in court** — required by the 48-hour deadline unless already released. **Verified against primary source** (Police Act s.25(1)).
   - **Refer to the DPP / ODPP for a charging decision** — the case file is compiled by the Investigating Officer and submitted for a "decision to charge" under the ODPP's own published Decision to Charge Guidelines (2023). The ODPP's constitutional mandate (Article 120(3)(a)) explicitly includes **directing the police to investigate** and requiring police to report "expeditiously." The Guidelines describe a **Two-Stage Test** (Evidential Test, then Public Interest Test) applied once "all outstanding reasonable lines of enquiry have been pursued," and a narrower emergency **Threshold Test** for serious cases (murder, sexual/gender-based violence, election violence, corruption, terrorism) where an immediate charge is needed and there are grounds to object to bail — used only after supervisor consultation, reviewed again within 14 days. **Verified against primary source** (ODPP "The Decision to Charge Guidelines," 2023, fetched in full from dpp.go.ug).
   - **Hold pending further investigation** — bounded hard by the 48-hour/7-day statutory ceiling above; there is no lawful "hold without any of the above" option once the deadline arrives.
5. **After charge**, a court file is opened with its own case number distinct from the ODPP's internal file number; custody status thereafter becomes a **court bail/remand** question under the Magistrates Courts Act (ss.75–79 in the current consolidation: release on bail, restriction on period of pretrial remand — a source found a 180-day pretrial remand ceiling referenced for capital/death-eligible offences) — this is a distinct legal regime from police bond and was **not** researched in depth here since it falls outside police custody proper, but is flagged so the Custody/Bonds domain models don't conflate "police bond" with "court bail." **Confidence: Corroborated by credible secondary source for the general shape; the exact current text of Magistrates Courts Act ss.75–79 was not fetched and read in full during this research — a future pass should read `https://ulii.org/akn/ug/act/1970/13` or the consolidated Cap 16 PDF directly before relying on remand-period specifics.**

### Confidence and gaps

| Claim | Confidence |
|---|---|
| Arrest → lock-up → investigation → decision-point structure | Corroborated by credible secondary source (Justice Centres Uganda, ASF, MCJL) + Verified statutory backbone (Police Act) |
| Police retain 5 real decision points (release, bond, court, DPP referral, hold-to-deadline) | Verified against primary source (Police Act s.24/25) + Verified (ODPP Guidelines) |
| DPP's Two-Stage Test / Threshold Test for charging decisions | Verified against primary source (ODPP Decision to Charge Guidelines 2023) |
| Exact schema/fields of a station's lock-up register | **Not found** — do not invent a specific register schema |
| Court bail/remand mechanics post-charge (Magistrates Courts Act ss.75–79) | Corroborated by credible secondary source only; primary text not fully read — reverify before modeling |
| UPF Standing Orders content on custody procedure | **Not found / inaccessible** — UPF Standing Orders are referenced by the Police Act (s.6) as the Inspector General's instrument for detailed operational rules, but no publicly accessible copy was found during this research. This is very likely where much of the granular custody procedure actually lives, and its absence is a real gap, not an oversight to paper over. |

---

## 3. Police bond

Police bond is procedurally and legally distinct from court bail: it is granted **by the police themselves**, during the investigation phase, **before** any charge is filed in court, and is explicitly **free of charge**.

### Statutory basis

Police Act s.24(2)–(4) (in the context of preventive arrests) and s.25(1) (in the context of ordinary arrests without warrant) both reference bond as the mechanism for releasing a person before court production:

> "(2) A person detained under subsection (1) shall be released— (a) once the peril... has been sufficiently removed; (b) on the execution of a bond with or without surety where provision is made for him or her to appear at regular intervals before a senior police officer, if so required; or (c) upon any other reasonable terms and conditions specified by the inspector general in writing.
> (3) If the person detained under this section is not resident in Uganda, the bond referred to in subsection (2) may be secured by a surety resident in Uganda."
> — Police Act, Cap 303, s.24(2)–(3)

> "No fee or duty shall be charged on... a bail bond in a criminal case... issued or taken by a police officer... [and it] shall not be required to be sealed."
> — Police Act, Cap 303, s.38

**Confidence: Verified against primary source** for the existence, no-fee nature, and with-or-without-surety structure of police bond.

### Who has authority to grant it

The Police Act text read during this research specifies bond appearance is made "before a senior police officer" (s.24(2)(b)) in the preventive-detention context. The Act's interpretation section (s.1) defines "senior police officer" as an officer **of or above the rank of assistant superintendent of police**. **Confidence: Verified against primary source that "senior police officer" (≥ Assistant Superintendent) is the rank referenced in s.24's bond mechanism.**

However: **the exact rank/office empowered to *grant* an ordinary criminal-suspect's police bond under s.25 (the general arrest-without-warrant case, as opposed to s.24's preventive-detention case) was not explicitly stated in the primary text read.** Secondary sources (Justice Centres Uganda) describe the right to *apply* for bond ("any suspect... or their relative... has a right to apply for Police Bond") without naming the granting rank. Common secondary/practitioner commentary (not independently verified here against a primary source) associates this with the Officer in Charge of a station or of the CID unit, which aligns with — but is not identical to — the Police Act's general concept of "officer in charge of police" (s.1: an officer not below the rank of inspector, appointed by the IGP to head a station or unit). **Confidence: Plausible but unconfirmed** that OC Station/OC CID (rank ≥ Inspector) is the granting authority for an ordinary criminal police bond; this should be verified against UPF Standing Orders or a further primary source before being encoded as a hard business rule (e.g. "only users with rank ≥ Inspector may record a bond decision").

### Conditions and sureties

- A bond may be **with or without surety** (Police Act s.24(2)(b)).
- If the person bonded is **not resident in Uganda**, the surety must be **resident in Uganda** (s.24(3)) — the only explicit surety *qualification* rule found in primary text.
- A surety, per the official PF18 form structure (see Topic 4) and secondary description, provides **identity/contact information** (telephone, address) and undertakes responsibility for ensuring the suspect reports as required; if the suspect absconds, they are liable to re-arrest, and the form/commentary references surety liability for "defaulting on the terms and conditions of the bond" without specifying a financial forfeiture mechanism in what was read. **Confidence: Corroborated by credible secondary source** (Justice Centres Uganda; ChimpReports/UPF public-relations coverage of the PF18 relaunch) — whether a surety is ever required to make a **cash deposit** (as opposed to standing as a person of accountability) was **not confirmed** in any source read; this should be treated as an open, unverified question rather than assumed either way.
- Reporting conditions: the bonded person may be required to report "at regular intervals" to a senior police officer (s.24(2)(b)); the PF18 form has a "reporting schedule activity ladder" field per the UPF's own description of the redesigned form. **Confidence: Verified against primary source** (Police Act) for the reporting mechanism in principle; **Verified against primary source** (UPF's own upf.go.ug page) for the PF18 form having a reporting-schedule field.

### The named form: PF18 "Release on Bond"

Uganda Police Force officially names and uses **Police Form 18 (PF18)**, titled "Release on Bond," as the standard police bond form. UPF piloted a redesigned/amended PF18 in 20 districts starting February 2022, specifically to reduce corruption/extortion risk. The redesigned form:
- Is a booklet with three self-carbonated copies: original to the suspect, duplicate to the case file, triplicate retained in the bound book (chain-of-custody / anti-tampering design).
- Captures: district, station, case reference number, lock-up serial number, custody date, suspect's ID and contact info, surety details and contact info, officer's rank and name, and a reporting-schedule field.
- Carries a watermark stating "POLICE BOND IS FREE" and toll-free/Professional Standards Unit contact numbers for reporting extortion attempts.

**Confidence: Verified against primary source** — this is drawn directly from UPF's own official site (upf.go.ug), both a dedicated announcement page about the PF18 pilot and the official downloads/forms page listing PF18 by name and number.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| Police bond exists, is free, with-or-without-surety, granted before charge | Verified against primary source (Police Act ss.24, 25, 38) |
| PF18 is the official named/numbered bond form | Verified against primary source (upf.go.ug) |
| PF18's booklet/carbon-copy structure and captured fields | Verified against primary source (upf.go.ug) |
| "Senior police officer" (≥ Assistant Superintendent) is named in the Act for the s.24 preventive-bond context | Verified against primary source |
| Exact granting rank/office for an *ordinary* (non-preventive) criminal police bond | **Plausible but unconfirmed** — do not hard-code a specific rank gate without further verification |
| Surety residency requirement when suspect is a non-resident | Verified against primary source |
| Whether a surety is ever a cash deposit vs. purely a person of accountability | **Not found** — do not model a cash-surety data field as confirmed fact |
| Any numeric limit on number of sureties required | **Not found** |

---

## 4. Custody/bond record-keeping conventions — named registers and forms

This research specifically looked for actual, named Ugandan forms and registers rather than generic descriptions.

### Official Uganda Police Force forms (Police Forms / "PF" series)

Fetched directly from the Uganda Police Force's own official forms page (upf.go.ug/police-public-forms/), which is as close to a primary institutional source as exists publicly for this. **Confidence: Verified against primary source** for the existence and stated titles of each of the following:

| Form | Title (per UPF) | Relevance to Custody/Bonds |
|---|---|---|
| **PF2A** | Case File Number (case file initiation) | Case file identity/registration |
| **PF2B** | Case File Number (alternate/related) | Case file identity/registration |
| **PF3** | Medical Examination of an Injured Person | Injury documentation (victim or suspect) |
| **PF3A** | Medical examination — sexual assault | Injury/medical documentation, specialised |
| **PF16** | Crime Report (full) | The formal crime-report form — likely the CRB's underlying document (see Topic 5) |
| **PF16A** | Crime Report (abbreviated) | Lighter-weight crime report variant |
| **PF17 / PF17A** | Toxicological/Forensic Examination; exhibit/chain-of-custody documentation | Evidence, not custody directly, but station record-keeping generally |
| **PF18** | Release on Bond | The police bond form (see Topic 3) |
| **PF24 / PF24A** | Medical examination — accused of serious crime / sexual offence | Medical documentation of an accused/suspect |
| **PF28** | Vehicle particulars / driving permit documentation | Not custody-relevant |
| **PF48A / PF48B** | Request for Post-Mortem / Post-mortem findings | Death-in-custody or homicide-adjacent, not routine custody |
| **PF53** | Charge formulation document | Charging, adjacent to custody's end-state |
| **PF69** | Identification Parade Report | Investigation, not custody directly |
| **PF94** | **Detention Order** | Directly custody-relevant — but its exact legal function/trigger (who issues it, when, what it authorises beyond ordinary arrest) was **not** documented in any source read beyond its name and form number. **Confidence: form's existence and title — Verified against primary source; its procedural function — Not found.** This is a concrete, named gap worth flagging: a "Detention Order" distinct from ordinary arrest documentation implies there may be a formal step this research did not surface (e.g., something akin to extending custody, or authorising detention beyond the point of arrest itself). Do not guess at its trigger conditions. |

Commonly referenced elsewhere as "PF3" is confirmed as the **medical examination of an injured person** form (used for both crime victims and, per PF24/24A, for accused persons where relevant) — filled in two parts, by a police officer and then by a government doctor/clinical officer. **Confidence: Verified against primary source** (upf.go.ug) and **corroborated by multiple independent secondary sources** (Studocu, ugfacts.net, Berkeley Law's hosted copy of a related PF24A template) describing consistent content.

### Cell / lock-up register

A "lock-up register" is referenced as an actual police station record — corroborated specifically by a documented finding that an arrest was not recorded in either the "station diary or lock-up register" at Muyenga Police Station, treated in that source as a compliance failure (implying both records are the expected norm). **Confidence: Corroborated by credible secondary source** for its existence and expected use as a norm. Its **official form/register number, prescribed columns, and any UPF standing-order specification were not found** in this research. Do not invent a schema for it.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| PF2A/2B, PF3, PF3A, PF16, PF16A, PF17, PF17A, PF18, PF24, PF24A, PF28, PF48A, PF48B, PF53, PF69, PF94 exist and are named/numbered as above | Verified against primary source (upf.go.ug official forms page) |
| PF3 = medical exam of injured person, two-part (officer + doctor) | Verified against primary source + corroborated by multiple secondary sources |
| PF18 = police bond form, booklet/carbon-copy structure | Verified against primary source |
| PF94 = "Detention Order" | Form's existence/title verified against primary source; its actual procedural trigger/function **not found** anywhere in this research — flag explicitly to a human reviewer before assuming it maps to any custody-workflow concept in the product |
| A "cell/lock-up register" exists as a station-level custody record | Corroborated by credible secondary source |
| Exact schema of the lock-up register | **Not found** |
| Whether there is a distinct, named "cell register" separate from a "lock-up register," or these are the same thing under two names | **Not found / ambiguous** — sources used both terms without clearly distinguishing them; do not assume they are two separate records without further verification |

---

## 5. Station Diary (SD) conventions and the SD → CRB (Crime Report Book) question

This topic was explicitly flagged in `docs/police/PRODUCT.md` as an open question ("Do not assume... there's a defined rule for which entries escalate. That rule is real police procedure that hasn't been established here — do not invent it"). This research found a specific, named, and reasonably credible answer, though it is corroborated rather than verified against a primary written procedural document.

### What was found

The Uganda Police Force's own Deputy Director of the Criminal Investigations Directorate (CID), Beata Chelimo, is quoted (in a Daily Monitor investigative piece on Uganda's annual crime statistics) describing the actual mechanism in named terms:

> All complaints logged at police stations go first into the **Station Diary (SD)**. These SD entries are compiled and counted toward the annual crime report. Cases that are **criminal in nature are extracted from the SD and transferred into the Criminal Record Book (CRB)** — and it is the cases that make it into the CRB that constitute the volume reported in the Uganda Police Force's Annual Crime Report. The same reporting notes that many criminal-natured cases remain stuck in the SD rather than being promoted to the CRB, attributed to follow-up delays, insufficient investigative manpower, file mismanagement, and corruption.

**Confidence: Corroborated by credible secondary source.** This is a named UPF official quoted in a mainstream Ugandan newspaper (Daily Monitor) describing an internal UPF process in specific terms (SD → CRB, "extracted," "transferred") — stronger than generic commentary, but it is still journalism quoting an official verbally, not a UPF Standing Order, Instruction, or other primary written procedural document. No such primary written document specifying the SD→CRB conversion rule was found or was accessible during this research (UPF Standing Orders are referenced by the Police Act itself as the Inspector General's instrument for this kind of operational detail, but no public copy was found).

### What this implies for the "when does an SD entry become a formal incident" question

- There **is** a real, named target state: an SD entry that is determined to be "criminal in nature" gets **extracted/transferred into the CRB** — this is the actual Ugandan-procedure analogue of "SD entry becomes a case file."
- The **decision rule for what counts as "criminal in nature"** (i.e., the actual trigger/threshold an officer applies) was **not found** in any source reached during this research. This remains exactly the kind of undefined procedural judgment call `docs/police/PRODUCT.md` warned against inventing. The product should **not** encode a specific automated rule for this — it is properly modeled as a human decision an officer makes, with the SD→CRB transition being the record-level action that follows that decision, not a system-computed one.
- The **CRB (Crime Report Book)** itself is corroborated as a real, named UPF record distinct from the SD, and its content appears to correspond to what gets filed on **PF16 (Crime Report)** — though this specific SD/CRB/PF16 linkage is an inference from combining two separately-sourced facts (the Monitor's SD→CRB description, and UPF's own PF16 "Crime Report" form listing) rather than a single source stating the linkage explicitly. **Confidence: Plausible but unconfirmed** for the specific claim that PF16 is literally the document used to make a CRB entry, even though each half of that claim is independently well-sourced.

### Categories of SD entries

No official UPF document enumerating standard SD entry categories was found or reached. Generic policing literature (mostly Kenya/India-sourced, and explicitly *not* usable as Uganda-specific evidence per this task's instructions) describes an Occurrence-Book/Station-Diary style record covering: incident reports, complaints, officer movements/patrols, shift handover notes, and visits from senior officers — but none of this is Uganda-sourced and per the task's own instructions, non-Uganda procedure must not be substituted in. The one Uganda-specific fragment found (via a Human Rights Network-Uganda/British High Commission document reference that could not ultimately be fetched/read in full) suggested station diaries are expected to "display an updated list of all those arrested in the last 24 hours" — this is a single unread secondary reference and should be treated as **essentially unconfirmed** pending the document actually being read.

`docs/police/PRODUCT.md`'s own working description of SD scope — "incident reports, lost property, public inquiries, officer movement, shift handover, other occurrences" — was not independently contradicted by anything found, but nor was it independently verified against a Uganda-specific primary source; it appears to be a reasonable, generically-informed placeholder rather than something this research can now certify as procedurally accurate.

### Confidence and gaps

| Claim | Confidence |
|---|---|
| SD and CRB are both real, distinct, named UPF records | Corroborated by credible secondary source (named UPF official, quoted in Daily Monitor) |
| Criminal-nature SD entries are "extracted and transferred" into the CRB | Corroborated by credible secondary source |
| CRB entries are what comprise the UPF Annual Crime Report | Corroborated by credible secondary source |
| The specific decision rule / threshold for "criminal in nature" (SD → CRB trigger) | **Not found** — do not invent an automated or rule-based trigger; model as a human decision |
| PF16 is literally the document used for a CRB entry | **Plausible but unconfirmed** (inference from two separately-sourced facts) |
| Standard categories of SD entries in actual Uganda Police practice | **Not found** in any Uganda-specific primary or corroborated secondary source actually read; do not port in Kenyan/Indian Occurrence-Book conventions as if they were Uganda's |
| SD must display a rolling 24-hour arrested-persons list | **Not found / unread source only** — flag as unconfirmed, do not encode as a requirement |
| Existence and content of UPF Standing Orders governing SD/CRB procedure | **Not found / inaccessible** — this is very likely where the real, precise procedure is written down, and its absence from this research is a genuine gap, not a settled "no such rule exists" |

---

## Sources consulted

Primary / official sources (fetched and read):

- Constitution of the Republic of Uganda, 1995, Article 23 — text reproduced and read via [juruga.org/constitution/article/23/protection-of-personal-liberty](https://juruga.org/constitution/article/23/protection-of-personal-liberty); cross-checked for existence/currency via ULII's Constitution listing at [ulii.org/en/akn/ug/act/statute/1995/constitution/eng@2023-12-31](https://ulii.org/en/akn/ug/act/statute/1995/constitution/eng@2023-12-31). Direct ULII/media.ulii.org PDF fetches of the Constitution returned HTTP 403 and could not be read directly in this session — a future pass should retry these with a different fetch method.
- **Police Act, Cap 303** — full text read directly from the Ministry of Internal Affairs' own hosted PDF: [mia.go.ug/sites/default/files/resources/THE_POLICE_ACT.pdf](https://mia.go.ug/sites/default/files/resources/THE_POLICE_ACT.pdf). This was the single richest primary source in this research (arrest powers, disposal-within-48-hours, preventive-detention bond, no-fee bail bonds, disciplinary code, etc.).
- **ODPP "The Decision to Charge Guidelines" (2023)** — full text read directly from [dpp.go.ug/wp-content/uploads/2024/03/THE-DECISION-TO-CHARGE-GUIDELINES.pdf](https://dpp.go.ug/wp-content/uploads/2024/03/THE-DECISION-TO-CHARGE-GUIDELINES.pdf). Confirms Article 120 DPP powers, the Two-Stage/Threshold Test framework, and file-submission/case-numbering conventions.
- **Uganda Police Force official forms page** — [upf.go.ug/police-public-forms/](https://upf.go.ug/police-public-forms/), listing PF2A/2B, PF3, PF3A, PF16, PF16A, PF17, PF17A, PF18, PF24, PF24A, PF28, PF48A, PF48B, PF53, PF69, PF94 by number and title.
- **UPF announcement on the PF18 pilot** — [upf.go.ug/police-pilots-amended-pf18-police-bond-in-20-districts/](https://upf.go.ug/police-pilots-amended-pf18-police-bond-in-20-districts/), describing the redesigned bond form's structure and anti-corruption features in detail.

Corroborating secondary sources (fetched/read, clearly government-adjacent or reputable):

- **Justice Centres Uganda** (a Judiciary/JLOS-affiliated legal-aid body) — "What is Police Bond and who has the mandate to grant it?" [justicecentres.go.ug/what-is-police-bond-and-who-has-the-mandate-to-grant-it/](https://justicecentres.go.ug/what-is-police-bond-and-who-has-the-mandate-to-grant-it/); and glossary entry "police custody" at [justicecentres.go.ug/glossary/police-custody/](https://justicecentres.go.ug/glossary/police-custody/). The "police-and-detention-facilities" page returned HTTP 404 and could not be read.
- **Daily Monitor** — "Do police crime reports reflect the situation on ground?" [monitor.co.ug/uganda/news/national/do-police-crime-reports-reflect-the-situation-on-ground--4957132](https://www.monitor.co.ug/uganda/news/national/do-police-crime-reports-reflect-the-situation-on-ground--4957132) — source of the SD→CRB mechanism description (a named UPF Deputy Director CID quote). This specific URL returned HTTP 403 on direct fetch in this session; the content above is drawn from the search-result summary of that article rather than a full direct read — flag for re-verification by fetching it through an alternate method.
- **Parliament of Uganda** — "Police want 48 hour rule scrapped" [parliament.go.ug/news/1450/police-want-48-hour-rule-scrapped](https://www.parliament.go.ug/news/1450/police-want-48-hour-rule-scrapped) — returned HTTP 404 on direct fetch; content used is from the search-result summary only, not a full direct read.
- **Refugee Law Project (Makerere University-affiliated)** — "The 48-hour rule: A cornerstone of Justice!" [refugeelawproject.org/media-center/blog/a2j-blog/the-48-hour-rule-a-cornerstone-of-justice](https://www.refugeelawproject.org/media-center/blog/a2j-blog/the-48-hour-rule-a-cornerstone-of-justice) — advocacy commentary, used only for the "weekends/holidays are not a legal exception" argument and the illustrative non-compliance-rate claim, both explicitly marked as secondary/unverified.
- **MCJL (Media Centre / legal commentary site)** — "Police Custody" [mcjl.ug/uncategorized/police-custody/](https://mcjl.ug/uncategorized/police-custody/) — used for general custody-lifecycle corroboration; author/institutional authority behind this specific site was not independently established, treated as ordinary secondary commentary.
- **Avocats Sans Frontières (ASF)** — "What is police custody under Ugandan law?" — page returned HTTP 403 on direct fetch; content used is from the search-result summary only.
- **ChimpReports** — "New Features on Police Bond Form to Minimize Corruption, Extortion – Enanga" — Uganda Police spokesperson quote corroborating the PF18 redesign, consistent with the UPF's own page.

Searched but not usefully fetchable, or explicitly out of scope (dead ends, noted so a future researcher doesn't repeat them):

- Direct ULII/media.ulii.org PDF fetches (Constitution, Magistrates Courts Act) — consistently returned HTTP 403 in this session. The content exists and is indexed (confirmed via search snippets) but a different fetch approach (e.g. a different tool, or downloading rather than in-line fetching) would be needed to read it directly. This affects: full verification of the Magistrates Courts Act ss.75–79 (court bail/remand) text, and an independent from-source re-read of the Constitution's Article 23 full text beyond the juruga.org mirror used.
- `humanrightsinitiative.org/programs/aj/police/intl/docs/ea/101_THINGS_YOU_WANTED_TO_KNOW.pdf` (Human Rights Network-Uganda / British High Commission) — returned HTTP 404; only a single unread search-snippet fragment (re: SD listing arrested persons) survives from this source, marked unconfirmed above.
- Uganda Police Force **Standing Orders** — referenced by the Police Act itself (s.6) as the Inspector General's instrument for detailed operational rules on custody, discipline, and station procedure, but **no publicly accessible copy was found** via web search. This is likely the single biggest remaining gap in this research — most of the granular "how it actually works station-to-station" procedure probably lives here and was not reachable.
- Kenyan, Nigerian, Indian, and UK police-procedure sources (Occurrence Book conventions, "General Diary" terminology, etc.) turned up repeatedly in generic searches for "station diary" / "occurrence book" but were **deliberately excluded** from this document's factual claims per this task's explicit instruction not to substitute other countries' procedure for a Uganda-specific gap — they are noted here only so a future researcher knows these were seen and rejected, not missed.
- `justicecentres.go.ug/police-and-detention-facilities/` — HTTP 404, dead link as of this research date.
- General searches for "PF94 detention order" content beyond its title/number — did not surface any description of its actual triggering conditions or legal effect; this remains an open item for a future pass (possibly answerable via UPF Standing Orders or a Criminal Procedure Code Act reading, which was referenced but not independently fetched in this research).
- Criminal Procedure Code Act, Cap 116 — referenced multiple times as a cross-reference in the Police Act and ODPP Guidelines (e.g. in relation to search powers and to CPCA generally) but was **not independently fetched or read** in this research; a future pass on custody/remand mechanics should read it directly.
