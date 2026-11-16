# Country integration research — 12 October 2026

Scope: official primary sources for Uganda, Kenya and **Democratic Republic of the Congo (DRC)**. “Congo” is assumed to mean DRC; Republic of the Congo needs a separate assessment. This is roadmap research, not deployment authorisation or a legal opinion. No identity records or biometric datasets were accessed. Published services, strategic aspirations and available technical interfaces are distinguished below.

## Conclusions for the roadmap

1. Deliver Pleadli as an offline operational companion with controlled exchanges into existing national systems. Do not promise replacement of Uganda ECCMIS or Kenya e-filing/CTS.
2. Treat identity and passport connectors as country-specific, authorised institutional integrations. A plugin interface does not grant access to a government register.
3. Separate court recording, transcription, remote attendance and public streaming. They have different permission and privacy requirements. Draft AI transcription must never silently become a certified court record.
4. Ship versioned legal content with source links, effective dates, last checked dates and update history. “Live updates” should mean reviewed, traceable updates, not silently changing the rules used for a historical case.
5. Begin Uganda workflow pilots first. Pursue Kenya integration discovery in parallel; establish DRC institutional partners and French legal/workflow validation before claiming country readiness. This sequencing is a recommendation, not evidence of government purchasing intent.

## Uganda

### Justice systems and media

The Judiciary describes ECCMIS as covering the case lifecycle, e-filing and fee/fine payments. Its benefits page also describes intended cross-institution integration; this is not proof that each integration is operational or available to Pleadli. A 2022 Chief Justice speech identifies existing video conferencing and digital recording/transcription systems. Pleadli should therefore investigate compatibility, usable offline capture and document exchange before duplicating national functions. [ECCMIS description](https://www.judiciary.go.ug/data/smenu/143/1/About%20ECCMIS.html), [benefits](https://www.judiciary.go.ug/data/smenu/144/2/Benefits%20of%20ECCMIS.html), [Chief Justice speech](https://www.judiciary.go.ug/files/downloads/Speech%20of%20the%20Hon.%20The%20Chief%20%20Justice%20on%20ECCMIS%20Go-Live%20on%2001.03.2022.pdf).

No general Uganda court permission covering Pleadli public livestreaming was established in this research. Require a Judiciary/court-approved policy, session authorisation, private hearing controls and an authorised publication workflow before activating public broadcasts. This is a proposed product gate; an official public stream does not establish a third party's right to capture or republish it.

### Identity and passports

NIRA's published PKI partner notice envisages vetted providers, signed MOUs and security testing for services around the National Identification Register, including electronic consent and document verification. Its REST/EST interface references concern certificate/device lifecycle services; they must not be described as a public national ID lookup API. Actual lookup fields, access eligibility, fees, sandbox and production interface remain unconfirmed. [NIRA partner notice](https://www.nira.go.ug/publications/call-for-provision-of-pki-secured-services).

Immigration publishes passport application/status services and an e-immigration document verification page. Those are public user interfaces, not evidence of an open partner API or permission to automate lookup. Engage the competent immigration authority separately from NIRA. [Passport services](https://www.immigration.go.ug/passports/ordinary-passport), [status instructions](https://www.immigration.go.ug/node/226), [verification interface](https://verify.immigration.go.ug/).

### Governance and law updates

PDPO administers the data protection regime. Confirm controller/processor roles, registration, legal basis, retention, transfer arrangements and institution-specific permissions for each deployment; local storage does not remove these obligations. [PDPO](https://pdpo.go.ug/), [officially hosted Data Protection and Privacy Act](https://fia.go.ug/sites/default/files/downloads/Data-Protection-and-Privacy-Act-2019.pdf).

UPPC publishes the official Uganda Gazette archive. ULII is a Judiciary Law Reporting Unit service publishing judgments, legislation and gazettes. Use gazette publication and commencement evidence plus reviewed consolidated text; a webpage's latest timestamp alone is insufficient evidence that a rule is in force. [UPPC eGazettes](https://www.uppc.go.ug/egazettes/), [ULII](https://ulii.org/en/).

## Kenya

### Justice systems and media

Kenya's Judiciary has nationwide e-filing, a Case Tracking System and cause list services. Its 2023–2024 report describes court and agency case mapping and other CTS improvements. Design Pleadli exports and exchanges around these systems; this research found no general publicly documented third-party write API. [Chief Justice nationwide launch](https://ocj.judiciary.go.ke/launch-of-e-filing-for-all-courts-countrywide-a-data-tracking-dashboard-and-causelist-portal/), [Judiciary report](https://judiciary.go.ke/wp-content/uploads/2024/11/SOJAR-2023-2024.pdf).

Supreme Court virtual-session directions say the Court records sessions, parties/advocates need leave to record, and certified transcripts constitute the official record. The Court's virtual access page prohibits audio/video/screenshots without express permission. General Judiciary media guidance requires recording/transcription requests before hearings. These sources do not establish identical rules for every court; approval must be obtained for the actual deployment. [Supreme Court directions](https://supremecourt.judiciary.go.ke/wp-content/uploads/2024/07/Supreme-Court-Virtual-Session-Practice-Directions-2023.pdf), [virtual access](https://supremecourt.judiciary.go.ke/4874-2/), [media guidelines](https://www.judiciary.go.ke/wp-content/uploads/2023/07/MEDIA-GUIDELINES-Reporting-the-Judiciary.pdf).

### Identity and passports

The State Department now describes **National Population Data Management (NPDM), formerly IPRS**, operating the Maisha Integrated Population Register. Its identity verification onboarding lists a letter of intent, signed MOU, tax/business/statutory compliance evidence, data protection compliance certificate and information security/privacy statements. The page quotes KSh 50,000 connection and KSh 20 per verification; reconfirm terms and eligibility before budgeting. It publishes an institutional access route, not an open technical API specification. Confirm whether the proposed justice use and passport fields are covered by the agreement. [NPDM official service and access requirements](https://www.usajili.go.ke/national-population-data-management-npdm-formerly-iprs).

### Biometrics and law updates

ODPC publishes a **final 2025 biometric guidance note**, alongside the Act and regulations. Review the final note rather than the earlier draft. It addresses DPIA, security, processing arrangements, transfer/localisation and rights. Defer biometric recognition rollout until the institution has established lawful purpose, necessity and an appropriate assessment; evaluate authorised verification separately from searching a population to identify someone. [Final biometric guidance](https://www.odpc.go.ke/wp-content/uploads/2025/11/ODPC-%E2%80%93-Guidance-Note-on-Biometric-Data.pdf), [guidance catalogue](https://www.odpc.go.ke/guidelines-2/), [legislation](https://www.odpc.go.ke/data-protection-laws-kenya/).

Kenya Law publishes legislation, judgments and gazettes. Request permitted reuse, machine-readable access, coverage and update cadence directly; public reading access should not be equated with an unlimited commercial data feed. [Kenya Law](https://kenyalaw.org/kl/), [gazette example](https://new.kenyalaw.org/akn/ke/officialGazette/gazette/2023-06-16/137/eng%402023-06-16).

## DRC

### Justice and identity readiness

The Conseil supérieur de la magistrature's 2025 report includes resolutions establishing a digitalisation unit and sustaining jurisdiction/prosecution-office digitalisation. This establishes an institutional programme, not a verified nationwide production case API. The Justice ministry website was under maintenance when checked. Discovery with CSM, Ministry of Justice and specific pilot jurisdictions is necessary. [CSM report](https://www.csm-rdc.cd/IMG/Documents/Rapport_g%C3%A9n%C3%A9ral_AGO_CSM_2025_version_du_28_Juin_2025-compress%C3%A9.pdf), [Justice ministry](https://www.justice.gouv.cd/).

ONIP issues the national identity card; its published implementing order describes a digitally secured biometric card. Separately, the Presidency announced **RDC-Pass on 13 June 2026** as a unique digital identity for accessing services and expressly says it does not replace the national identity card or competent institutions. Do not merge ONIP CIN, RDC-Pass and passport authority into one assumed integration. No public technical onboarding/sandbox/API schema for Pleadli was established. [ONIP implementing order](https://www.onip.gouv.cd/docs/ARRETE%20CIN%20ET%20NIN.pdf), [RDC-Pass launch](https://presidence.cd/actualite-detail/actualite/le_president_felix_tshisekedi_lance_rdc_pass_lidentite_numerique_unique_pour_chaque_congolais).

### Governance, law and media

The 2023 Code du numérique includes a personal-data framework. Obtain current local advice on biometric processing, authority procedures, data residency/transfers and implementation rules rather than treating Uganda/Kenya arrangements as portable. [Government-hosted code](https://are.gouv.cd/wp-content/uploads/2023/05/04042023-ORDONNANCE-LOI-23-010-DU-13-MARS-PORTANT-CODE-DU-NUMERIQUE_compressed.pdf), [ADN legal catalogue](https://adn.cd/fr/ressources/textes-legaux-et-reglementaires).

The Presidency identifies the Journal officiel as the publication service for legislative/regulatory texts and other official acts. Establish publication access and update rights with that service. No verified court livestream/recording permission or national legal-update API was found in this review. Absence of a finding is not proof that none exists. [Journal officiel mandate and official link](https://presidence.cd/services/3/journal_officiel).

## A practical legal-content API option

Laws.Africa documents a read-only Content API with published legislative versions, metadata, HTML and Akoma Ntoso XML; its commercial offering also describes update webhooks. This is a real documented integration option, unlike assuming public identity lookup APIs. However, country coverage, completeness, offline redistribution/display rights, commercial terms and cadence require a coverage report and written terms. Public free legal reading does not establish commercial API entitlement. Commercial pages currently present different package/pricing structures, so obtain a written quote rather than hard-code a budget. [API guide](https://developers.laws.africa/get-started/overview), [webhooks](https://developers.laws.africa/get-started/webhooks), [platform offering](https://laws.africa/api/), [commercial content terms](https://laws.africa/platform/content/).

## Proposed integration gates and acceptance criteria

These are engineering recommendations, not claims of existing Pleadli implementation:

- A signed connector manifest declares publisher, supported countries, permissions, data classes, versions, network destinations and required institutional authorisations.
- Government identity connectors run through an institution-controlled service with scoped credentials, purpose/case references, audit receipts, minimised responses, revocation and rate limits; secrets never ship in a downloadable plugin or Android bundle.
- Manual document capture remains distinct from authoritative verification. Show provider, checked time, request reference and unavailable/offline status without presenting a cached response as a fresh check.
- Facial/fingerprint capture, device enrolment and identity matching are separate capabilities. First prioritise device compatibility and authorised one-to-one verification. This review does not recommend public-space face surveillance or automatic policing decisions from recognition scores.
- Court media includes role-based authorisation, session state, private-session stop controls, retention, redaction, export review and transcript correction/certification. Public stream approval is independent of internal recording approval.
- Law packs retain provenance, jurisdiction, language, expression/effective date, source hash and supersession history. Updates are staged, reviewed and signed; offline clients expose freshness and can retain the rules applicable on the event date.
- National integrations must demonstrate staging access, signed agreements, approved fields, test fixtures, failure behaviour, auditability and institution acceptance before website claims advertise them as connected.
