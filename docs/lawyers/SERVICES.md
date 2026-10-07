# Walk-in services: what a client comes for, and leaves with

Status: 2026-10-04. Built into Pleadli Lawyers as **Services** (the walk-in desk). Each service opens a matter, drafts its papers from the client's details, and lists the steps with the office or registry each goes to. Every paper then leaves through the matter's **Give** step (print, PDF for email or WhatsApp, Word) with the handover recorded.

Why: the developer, relaying the client (2026-10-04), said the app was "input only, no output": a lawyer's work is what they hand to a client, a court, the police, a registry. "If a client comes for a name change, what is done?" This file answers that per service, from sources, so the app does not guess. `[P]` primary source read, `[S]` secondary source (news, guides); fees are `[S]` and change: the app shows them as a guide, never as a tariff.

## 1. Change of name (deed poll)

Law: Oaths Act (Cap. 19), Registration of Documents Act (Cap. 81), Births and Deaths Registration Act; NIRA under the Registration of Persons Act. `[S]`

| Step | Where | Paper | Fee (guide) |
|---|---|---|---|
| 1. Draft the deed poll; client signs and swears it before a Commissioner for Oaths | The practice | Deed poll (with the declaration) | practice fee |
| 2. Register the deed poll | URSB | Deed poll, cover letter | about Shs 55,000 `[S]` |
| 3. Publish the change | Uganda Gazette, UPPC | Gazette notice text | about Shs 450,000, about two weeks `[S]` |
| 4. Update the National ID | NIRA | Gazette copy, birth certificate, other IDs, NIRA form | about Shs 200,000 `[S]` |

Client leaves with: the signed and commissioned deed poll, the registration receipt, the Gazette notice, a letter listing what to take to NIRA.

Sources: Pulse Uganda, "A step-by-step guide to changing your name on a National ID in Uganda" (2026); nymynet, "How to change name on national ID in Uganda with NIRA (deed poll, URSB, Uganda Gazette)".

## 2. Police bond (a relative held at a police station)

Law: Constitution Art. 23(4)(b): produced in court within 48 hours; Police Act s.25: release on bond, with or without a surety; police bond is free. `[S]`

| Step | Where | Paper |
|---|---|---|
| 1. Find where the person is held, the reference (CRB/SD) and the allegation | Police station | Note of attendance |
| 2. Ask the officer in charge to release on police bond | Police station | Letter to the OC requesting police bond, surety's details and ID copy |
| 3. If refused and 48 hours pass | Court | Application for bail or habeas corpus |

Client leaves with: the letter to the OC (and a copy), the bond form once given, a note of the next reporting date.

Sources: Refugee Law Project, "The 48-hour rule: a cornerstone of justice"; Daily Monitor and AllAfrica reporting on police bond (2025).

## 3. Letters of administration (a person died without a will)

Law: Succession Act (Cap. 162), Administrator General's Act. `[S]`

| Step | Where | Paper |
|---|---|---|
| 1. Family meeting agrees who applies | Family | Minutes of the family meeting |
| 2. Report the death; ask for a certificate of no objection | Administrator General (or local representative) | Letter to the Administrator General, death certificate, minutes |
| 3. Petition the High Court | High Court (Family Division / circuit) | Petition for letters of administration, affidavit |
| 4. Notice published; grant if no caveat within 14 days | High Court, Gazette | Notice |

Client leaves with: the minutes, the letter to the Administrator General, the petition, then the grant.

Sources: Judiciary of Uganda, "Domestic relations" (judiciary.go.ug); ULII High Court administration causes.

## 4. Others already covered by templates

Land purchase (search letter, agreement for sale of land), debt recovery (notice of demand, plaint), suing Government (notice of intention to sue, 45 days), affidavits and statutory declarations (oaths register), bail, appeals: see the template set in `apps/lawyers/src/features/templates`.

## Not yet researched

Marriage (civil, customary registration), divorce, adoption, company registration with URSB, tenancy disputes, employment complaints to the labour officer. Each gets a row here from a source before it becomes a service.
