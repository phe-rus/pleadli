# Pleadli Prisons — Product Model (Phase 1)

This is the **Phase 1 product model** for Pleadli Prisons, produced after the research phase (`docs/prisons/RESEARCH.md`) and before any schema or implementation work. It follows the same discipline as `docs/police/PRODUCT.md` and `docs/dpp/PRODUCT.md`: only claims grounded in verified research are treated as real requirements; everything else is marked as an open question, not invented.

**Status**: draft, pending approval — the same gate DPP went through, applied up front this time rather than after a correction. Do not scaffold `apps/prisons/` or write a schema until the user has reviewed this.

**Standing corrections from the DPP cycle, applied here from the start rather than retrofitted:**
- **Document-centric from day one** (see [[feedback_pleadli_document_centric_ux]]): Prisons is, if anything, more document-bound than DPP — admission requires an actual physical warrant/order (four named instrument types, RESEARCH.md §4), release is driven by court orders, and a "transfer letter" is a named artifact. Attachments (Vault-backed) and rich text must be first-class in the first vertical slice, not added after a UX complaint.
- **Scale model decided up front**: following DPP's corrected "one installation, one prosecutor, regionally scoped" model, a Pleadli Prisons installation is **one prison, run by its own Officer in charge** — not a national UPS system. This maps directly onto a real statutory role (Prisons Act s.30: an Officer in charge is appointed "for each individual prison"), so it isn't a guess the way DPP's single-prosecutor call initially had to be corrected into — it's the natural unit from the start.

Every claim below traces to a numbered finding in `docs/prisons/RESEARCH.md`.

## The fundamental idea

> **Pleadli Prisons is software for running one prison's custody, welfare, and release responsibilities — not a national UPS database, and not Police or DPP with different labels.**

## What Pleadli Prisons is NOT

- a national Uganda Prisons Service system (that's UPS's own PMIS/Prisons Information Management System, RESEARCH.md §2 — Pleadli Prisons is one prison's own working tool)
- a clone of Police's or DPP's domains
- a health-records system (health care is statutorily hybrid — RESEARCH.md §5 — Prisons doesn't own a health authority)
- a coronial/inquest-management system (that belongs to the coroner/police chain — RESEARCH.md §7)

## 1. Core record

**"Prisoner"** — the Act's own term (Prisons Act s.2), confirmed as the live statutory and statistical-reporting noun. "Inmate" is used informally in government prose (especially rehabilitation contexts) but has no statutory definition — do not use it as the entity name.

**Three statutory categories, all on the same entity, distinguished by a status field, not three separate tables** (RESEARCH.md §2):
- **Convicted prisoner** — "under a sentence of a court or court-martial."
- **Unconvicted prisoner** — the Act's own term for what UPS's own published statistics call "Remands" (a real terminology split: the Act uses "unconvicted," UPS's own statistics use "Remands" as the column header — model the field as the prisoner's current status, and it's fine for the UI to say "Remand" since that's UPS's own live usage, while the underlying category logic follows the Act's "unconvicted" framing: presumed innocent, physically separated from convicted prisoners, s.64).
- **Civil prisoner** — "an indebted person entitled to special treatment" (a debtor, not a criminal prisoner) — UPS's own statistics track this as a third category ("Debtors"), not a subtype of criminal remand or conviction.

**No official prisoner reference/registration number format was found** (RESEARCH.md §2) — same situation as ODPP's unconfirmed registration number. Treat as free text; do not invent a format. Section 61 requires particulars to be recorded on admission but doesn't enumerate the specific fields — those are left to rules/practice not located in this research pass.

**Admission requires one of four named legal instruments** (RESEARCH.md §4, s.58): a **commitment**, a **remand warrant**, an **order of detention**, or a **warrant of conviction/committal** — signed with a court seal or authenticated by an authorised person. This is the real "how does a prisoner record even get created" trigger — model admission as requiring a reference to one of these four instrument types, not a generic "intake form."

## 2. Major operational domains

### Admission
- **Supports**: receiving a person into custody under a real legal instrument, with the officer in charge's statutory verification duties.
- **Owns**: the admission event — instrument type (commitment/remand warrant/order of detention/warrant of conviction), issuing authority, admission date, particulars recorded (RESEARCH.md §4, s.58/s.61).
- **Grounded in**: s.58 (verification duty, refusal only for severe torture/bad health or juvenile-into-adult-facility, clerical errors don't block admission — they get corrected), s.61 (particulars recorded, fields unspecified).
- **Do not assume**: a specific prescribed particulars form — s.61 leaves this to rules/practice not located. Do not invent field names beyond what a warrant/order itself would carry (instrument type, issuing court/authority, date, prisoner particulars).

### Custody & Remand tracking
- **Supports**: the day-to-day fact of who is in custody, as what category, and — critically — the constitutional mandatory-bail clock.
- **Owns**: current status (convicted/unconvicted/civil), the s.118 "list of prisoners awaiting trial" fields — **admission date, the authority for detention (the warrant/order), and date last appeared in court** (RESEARCH.md §3, s.118) — and a derived mandatory-bail-eligibility flag.
- **A real, citable legal conflict must be modeled explicitly, not silently resolved**: the Constitution (Art. 23(6)(b)-(c)) sets mandatory-bail thresholds at **60 days** (offences triable by both High Court and a subordinate court) and **180 days** (offences triable only by the High Court), while the Prisons Act s.66 — enacted a year *after* that constitutional amendment — states unreformed **120-day/360-day** figures. The Constitution is supreme (Art. 2). **Use 60/180 days for any mandatory-bail-eligibility derived view; do not use the Prisons Act's 120/360-day text.** Surface this to the officer in charge as a derived flag (same pattern as Police's 48h custody-compliance view — derived from timestamps, never a manually-set status), and flag the discrepancy in the UI copy itself rather than picking a number silently.
- **Do not assume** a "capital offence" gets a separate constitutional threshold — it doesn't; capital offences are simply "triable only by the High Court" and fall under the 180-day clause (RESEARCH.md §3).
- **Court production**: s.67 — reactive, court-initiated. A court/competent authority issues an **order** to the officer in charge; no specific named form exists for it (unlike DPP's Police Form 53) — model as a plain record (date, requesting court, purpose) referencing the prisoner, not a templated document.

### Release
- **Supports**: every real release trigger, as its own auditable event type — **not a single "released" checkbox.**
- **Grounded in** (RESEARCH.md §4): bail (s.66, subject to the 60/180 vs. 120/360 conflict above), full remission (s.83, discharge before noon on the entitled date), partial remission (s.84, up to 1/3 sentence for good conduct, forfeitable per s.85), parole (s.89, 3+ years served, within 6 months of release date, up to 3 months, breach treated as escape), release on licence (s.87, mandatory for defined "habitual criminals," revocable), acquittal/court-ordered discharge (driven by the court's own order reaching the officer in charge, s.63(2)), and erroneous-release correction via re-arrest warrant (s.79).
- **Do not assume** a single generic "release" event covers all of these — each has different statutory preconditions and consequences (e.g. parole breach is itself an offence; erroneous release triggers a re-arrest, not a new admission).

### Transfers
- **Supports**: moving a prisoner between prisons, and the emergency/overcrowding-driven relocation power.
- **Grounded in** (RESEARCH.md §6): general transfer authority rests with the Commissioner General (s.73, "general or special order"), with a discretionary "if practicable" preference for keeping/releasing a prisoner in their home area. A **"transfer letter"** (s.78(2)) is a named artifact — framed in the Act as a prisoner-communication right (paired with an admission-time "reception letter"), not explicitly stated as an internal transfer *record*. No separate named "transfer register" was found beyond the officer in charge's general record-keeping duty (s.30(2)(d)).
- **Do not assume** a standardised transfer form/register exists beyond what's stated — model a transfer as an event (date, from/to prison, ordering authority) without inventing a specific form name.
- **Overcrowding-driven relocation** (s.28, "temporary prisons") is a distinct, congestion-specific power, separate from an individual prisoner's ordinary transfer — a facility-level event, not a prisoner-level one; likely out of scope for a single-prison installation's own record (it's a Commissioner-General-level, cross-prison decision).

### Health & Welfare
- **Supports**: tracking a prisoner's health-related events without pretending Prisons runs its own hospital system.
- **Grounded in** (RESEARCH.md §5): health care is **statutorily hybrid** — s.26 lets the Prisons Authority appoint dedicated medical officers, but the Act's own definition of "medical officer" falls back to the **district (Ministry of Health) health officer** when no dedicated appointment exists. There is no single Prisons-owned health service the Act mandates. Sick-prisoner hospital transfers (s.75-76) keep the prisoner "under detention" at the sending prison even while hospitalised, with a notification duty back from the hospital-side medical officer once care is no longer needed. Insane/mentally-abnormal prisoners must be moved to a mental hospital (s.74), with time there counting toward sentence.
- **Do not assume** a standardised health-record format — s.26(3)'s rules weren't located; no named "health register" was found beyond the general records duty.
- **Do not build** a Prisons-owned health-record system as if Prisons were the health authority — track health-transfer *events* (referred out, returned) as Prisons' own operational record, not clinical detail that belongs to the health service.

### Death in custody (cross-institutional — Prisons is a participant, not the owner)
- **Supports**: correctly representing Prisons' real, limited statutory role in a death-in-custody, without building a full inquest-management system.
- **Grounded in** (RESEARCH.md §7, Inquests Act Ch. 13): death in prison is a **mandatory automatic-inquest trigger** (s.4(2)(a)). The actual notification chain runs **prison → LC I chairperson or nearest police station → coroner** (s.9), with a simplified fast path (Form B, s.10(4)) when a medical practitioner confirms a natural, non-violent death. **DPP's involvement is indirect and conditional, never automatic**: only via the Inspector General of Police when a suspect can't be identified (s.24-25), or directly from the coroner when a stayed inquest isn't worth resuming (s.21(2)). Prisons' own statutory role is limited to being where the death occurred and (per s.9) a potential first person who must alert the LC I/police — not the coroner, not the DPP.
- **Do not build**: inquest scheduling, coroner findings, or DPP notification logic inside Prisons. Model only what Prisons itself is responsible for: recording the death event and that notification was made (to whom, when) — the inquest itself is Courts'/the coroner's process, referenced, not owned.
- **No statutory Prisons→DPP notification duty for escapes or general health issues was found** (RESEARCH.md §4, §7) — do not invent one.

### Documents
- **Supports**: the genuinely document-heavy reality of custody work, first-class from the first slice (see the standing correction at the top of this document).
- **Confirmed document/instrument types** (RESEARCH.md §4, §6): the four admission instruments (commitment, remand warrant, order of detention, warrant of conviction/committal), the s.118 list of prisoners awaiting trial, s.67 production orders, the "reception letter" (admission) and "transfer letter" (transfer) — both framed as prisoner-communication rights, not necessarily internal records, but worth attaching/scanning where a physical copy exists.
- **Owns**: structured metadata + Vault-stored bytes, same DB-owns-facts/Vault-owns-bytes split as Police and (now) DPP.

### People
- **Deliberately thin, unlike Police's/DPP's People domain.** A Prisoner record already *is* the person — Prisons' core record isn't a case or file that *references* people, it's the person's own custody record. A separate cross-cutting "People" domain the way Police/DPP have one is likely **not needed** here; next-of-kin/family contact details (relevant to the reception-letter right, s.78) may be a small related concept on the Prisoner record itself, not a first-class cross-cutting domain. **Flagged as a genuine architectural difference from Police/DPP, not an oversight** — don't force a "People" domain in just for consistency with the other two apps.

### Search
- One system-wide "Search Pleadli Prisons," same discipline as Police/DPP — no siloed per-domain search.

### Work Queues ("what needs my attention")
- **Grounded directly in confirmed statutory triggers, not invented** (RESEARCH.md §3, §4):
  - Prisoners approaching or past the constitutional 60/180-day mandatory-bail threshold
  - The s.118 pre-session list of prisoners awaiting trial, due before each High Court session
  - Pending/upcoming court production orders (s.67)
  - Parole-eligibility windows opening (3+ years served, within 6 months of release date, s.89)
  - Sick prisoners currently hospitalised, awaiting the return notification (s.75-76)
- **Do not invent** percentage changes or vanity metrics. UPS itself already publishes rich monthly statistics (population by category, occupancy vs. approved capacity, escape rate, mortality rate, productions-to-court, by region) — RESEARCH.md §8 found this is a genuinely well-established UPS discipline, unlike ODPP's absent public reporting. A single-prison installation's own Reports view should mirror the *shape* of these real, named metrics for its own prison, not invent new ones.

### Organizational responsibility
- **Scale model**: one installation, one prison, one Officer in charge (RESEARCH.md §1, s.30) — not a multi-prison or national deployment. This is the natural unit, not a retrofit.
- **Regional scope**: the prison's region is a fixed installation property (RESEARCH.md §1: 19 named UPS regions — Southern, Northern, Kigezi, Mid Central, Central, Kampala Extra, Eastern, North Central, Mid Western, Mid Northern, Mid Eastern, South Western, East Central, North Eastern, Iganga, Western, North Western, Kooki, South Eastern — a real, citable parallel to ODPP's own 19-region structure, though over ~266-270 individual prisons rather than ODPP's 127 stations).
- **Rank hierarchy** (RESEARCH.md §1, from UPS's own March 2025 payroll table, 21 ranks): Commissioner General of Prisons → Deputy Commissioner General → Assistant Commissioner General → Senior Commissioner → Commissioner → Assistant Commissioner → Senior Superintendent → Superintendent → Senior Assistant Superintendent → Assistant Superintendent → Cadet Assistant Superintendent → Principal Officer I/II → Cadet Principal Officer → Chief Warder/Wardress I/II/III → Sergeant Warder/Wardress → Corporal Warder/Wardress → Lance Corporal → Warder/Wardress. Relevant as profile-level context for the single officer using this installation, not a multi-officer administration surface.
- **Do not build**: a national rank/staff administration system, or any cross-prison assignment feature — that's UPS's own PMIS territory, not this installation's job.

## 3. Prisons ↔ Courts boundary

Prisons' formal, proactive duty toward Courts is real and specific: the s.118 pre-session list of prisoners awaiting trial. Court production (s.67) is reactive — the court initiates it. Prisons references the court/case reference on both, but does not own or duplicate Courts' own case record (same "referenceability is not visibility" principle as Police/DPP).

## 4. Prisons ↔ Police / DPP boundary

No general "Prisons must notify DPP" statute analogous to Police's referral duty was found (RESEARCH.md §7) — do not invent one. The one real cross-institutional workflow is death-in-custody, which routes through LC I/police and the coroner, reaching DPP only indirectly and conditionally (see Death in custody above) — Prisons is a participant in that chain, not its owner.

## 5. Person model

A Prisoner record is the person — no separate People domain wraps it the way Police's/DPP's do (see People above). Referenceability-is-not-visibility still applies to any next-of-kin/contact detail relative to other institutions' own records.

## 6. Document model

Database owns structured facts/metadata; Vault owns file bytes — same split as Police and DPP, but **built into the first slice**, not deferred, per the standing document-centric correction.

## 7. Search model

One system-wide search surface, composed across domains as they're built.

## 8. Work/queue model

See Work Queues domain above — every bucket traces to a specific statutory trigger.

## 9. Organizational responsibility

See Organizational responsibility domain above.

## 10. Navigation proposal

```
Pleadli Prisons

Overview                    (what needs my attention: remand thresholds, court sessions due,
                              parole windows, hospitalised prisoners awaiting return)

Search

Admission                   (receiving a prisoner under a real warrant/order — first-class,
                              same reasoning as DPP's Intake)

Prisoners                   (the core record + workspace: status, custody/remand tracking,
                              health/welfare events, transfer history, release history,
                              documents — all in one workspace, not scattered registers)

Court Production & Remand   (s.118 list, s.67 production orders — pulled out as distinct
                              because it's a real, named statutory duty, same reasoning as
                              DPP's Charging Review)

Reports                     (derived only — population by category, occupancy vs. capacity,
                              escapes, deaths, productions-to-court — mirroring UPS's own
                              real published metric shape, RESEARCH.md §8)
```

This is a starting proposal, not a locked structure. "Prisoners" carries the weight Police's "Cases" and DPP's "Files" do. Health, Transfers, and Release are folded into the Prisoner workspace as event types, not separate top-level nav — same "workspace over one core record" pattern DPP settled on for Decisions/Documents after its own correction.

## 11. What is explicitly out of scope (for now)

- A national UPS system (PMIS is UPS's own, not this app's job)
- A health-records/clinical system (hybrid Ministry-of-Health model — Prisons tracks events, not clinical detail)
- Inquest/coronial process management (Courts'/the coroner's domain — Prisons records the death event and notification only)
- Sync engine, offline conflict-resolution, multi-prison infrastructure
- Biometric identification, AI decision-making
- A hardcoded complete UPS national organizational hierarchy
- Billing, decorative analytics, invented metrics — UPS's own real published statistics (RESEARCH.md §8) are the model to mirror, not exceed
- Assuming a Prisons↔DPP notification duty exists for escapes/health issues — none found

## Uncertainties still open (require product clarification, not invention)

- Exact prescribed admission particulars (s.61 doesn't enumerate them — Prisons Regulations 2012 likely has this, not independently fetched).
- Whether a standardised transfer-record register or production-order form exists beyond what the Act names (the "transfer letter" is a communication right, not confirmed as an internal record).
- No official prisoner reference-number format — same open question as ODPP's registration number.
- Whether UPS Standing Orders (not publicly reachable, `prisons.go.ug` DNS failure — RESEARCH.md §8 ref #8) specify escape/health-issue notification duties to DPP or Courts.
- Whether the "266 custodial prison units" vs. World Prison Brief's "270 institutions" reflects a real count difference or just different snapshot dates.

## Final test

Before considering any implementation complete, ask:

**Does this feel like software for running one prison's custody and welfare responsibilities, or does it feel like Police/DPP with different labels?**
