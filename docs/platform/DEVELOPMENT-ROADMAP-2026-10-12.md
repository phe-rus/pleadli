# Pleadli: review, recommendations and development roadmap

Date: 12 October 2026, Africa/Nairobi.

Status: proposed roadmap for review. This is not an approved implementation specification or a claim that the work has shipped. Application code is unchanged by this review. Earlier product decisions remain in force until the relevant changes below are ratified and recorded in their implementation specs.

## 1. Direction

### Usage and service model clarified by the user

Pleadli is a SaaS platform with desktop workspaces that support offline use. A person can use a workspace alone. An institution can use it with multiple named users and roles. These are two supported operating modes, not a requirement that every user join an institution or connect to the cloud.

Keep four decisions separate: workspace ownership, permission to access records, subscription entitlement, and connectivity. A paid account does not confer institutional membership or platform administrator access. Institutional membership does not permit access to every institution's records. Both solo and institutional local work must remain possible during an internet outage.

Onboarding should offer a personal workspace or an institutional workspace. Institutional joining requires an invitation or an approved membership process. Local onboarding and offline sign in must not require a live website session. Carry forward the existing licensing decisions in `ORCHESTRA-PLAN.md`, including institutional agreements, practice licensing, the trial and continued local access. Confirm their activation, renewal and recovery implementation before adding payment collection. The SaaS clarification does not replace these decisions with a new pricing scheme. Migration from a personal workspace into an institution needs an explicit ownership and transfer decision. A solo user in an official institution still acts within that office and its authority; solo use does not imply anonymous access or permission to issue official records.

Acceptance needs separate trials for a solo computer with no internet, an institution with multiple concurrent users on a local network, internet loss and restoration, role revocation, backup recovery, and an optional remote connection. This clarification defines the intended model; it does not establish that these trials have passed or that subscription billing has shipped.

Make the institutional chain work before opening a broad civilian service: officer in the field, station, command, prosecution, court, prison, then the authorised person asking about their case. Every institution keeps its own authoritative record. A connection does not give everyone access to everyone else's files.

The first deployment focus is Uganda. Research and partner discovery for Kenya and the Democratic Republic of the Congo (DRC) begin now, but their live deployments have separate legal, language, infrastructure and acceptance gates. This document interprets the user's “Congo” as DRC, consistent with the earlier French language direction; Republic of the Congo would need a separate pack and authority map.

The strongest product promise is practical: complete the work with less repeated entry, produce an accepted paper, deliver the right material, and recover after a computer or connection fails. Measure that promise before describing Pleadli as the best or ready nationally.

## 2. Evidence and corrections to the previous audit

This review reads the current checkout, including existing uncommitted work. It does not establish the state of deployed services or published installers. No fresh runtime, Windows installation, mobile, courtroom or multiple machine test was performed.

| Area | Evidence in this checkout | Consequence |
|---|---|---|
| Police station and command | `docs/police/HQ-FACILITY.md`, `domain/command.rs`, `domain/command_link.rs`, `transport/command_server.rs` | The connection is not wholly absent. Station registration, approval, reports and a listener exist, but the documented physical network trial was not run. |
| Police transport | Command link accepts/defaults to HTTP; earlier plan explicitly defers TLS, commands sent back and multiple command levels | Existing command reporting is not the finished secure institutional network. |
| Police to DPP | `docs/interchange/police-dpp.md`, `packages/interchange`, Police `domain/referrals.rs` | The shared contract and DPP receiving side exist. Police referrals remain local records; a destination name does not deliver a package. |
| Field access | Police restricted remote page and phone capture transport | A phone web page is not an Android dispatch, patrol or traffic product. |
| Courts recording | `domain/recordings.rs`, `features/recordings/use-recorder.ts` | Sealed, ordered recording chunks and retry logic exist. Unsaved frontend chunks remain in memory; a persistent save failure can lose more than five seconds. |
| Courts transcription | `domain/transcripts.rs` | Manual editing and adoption exist. `NoEngine` is selected and automatic transcription returns unavailable. The earlier broad audit should not be read as confirming working speech recognition. |
| Courts media | `docs/courts/PROPOSAL.md` | The LAN live feed is unfinished. The earlier decision excludes video conferencing; the new request deliberately expands that boundary. |
| Public website | `www/src/data/home.ts`, `data/products.ts`, `data/roadmap.ts` | Copy mixes technical implementation, older capability claims and release claims. One trust statement says TLS everywhere despite the Police transport gap. |
| Downloads | `routes/_public/downloads.tsx`, `functions/releases.func.ts` | Downloads have no app previews. Buttons lead to GitHub release pages rather than directly to a chosen installer. Feeds fall back to listed releases. |
| Product visuals | `routes/_public/products/$slug.tsx` | Product pages have labelled mockups, not release screenshots, and depict older interface elements. |
| Installation | `docs/RELEASING.md`, `.github/workflows/release.yml`, Tauri configuration | Updater signatures exist; Windows publisher signing is not configured in the inspected workflow. Exact user reported prompt still needs identification. |
| AI | `packages/node-core/src/ai.rs` | Shared provider/key support exists. ChatGPT plan authorisation is a different connection and request contract, not another API key value. |

Supporting research:

* [Capability ledger, published artifact baseline and delivery backlog](CAPABILITY-AND-DELIVERY-BACKLOG-2026-10-12.md). The follow up checks public release metadata and distinguishes customer download sizes from development disk usage; it does not establish installer trust or runtime acceptance.
* [Country authorities, identity, legal content and court permissions](RESEARCH-COUNTRY-INTEGRATIONS-2026-10-12.md)
* [Android, courtroom media and Windows installation](RESEARCH-FIELD-MEDIA-INSTALLERS-2026-10-12.md)
* [OpenAI personal usage and institutional AI](RESEARCH-OPENAI-USAGE-2026-10-12.md)

## 3. Explicit changes of scope

Before implementation, reconcile these conflicts in the relevant product/spec documents:

* Police's older exclusion of mobile and live location becomes a phased field product, with location limited by duty, purpose and permissions.
* Courts' exclusion of conferencing becomes separate proposals for a private courtroom feed, remote participation and optional public broadcast.
* Command reporting grows from a single parent connection into governed hierarchy, with explicit rules for summaries, exceptions and directives. Do not assume all raw records flow upward.
* The Orchestra relay recommendation becomes an implemented, operated carrier. Licensing and backup endpoints do not establish that a relay already exists.
* Uganda, Kenya and DRC are distinct deployment packs. Translating Uganda labels is not legal localisation.
* A plugin means a controlled Pleadli extension with declared capabilities. It does not mean arbitrary code or a ChatGPT plugin installed inside the justice database.

## 4. Police network recommendation

### Four separate responsibilities

1. **Identity and permission:** institution, office, officer, device, role and connection approval. Licensing entitlement is separate from permission to view or change a justice record.
2. **Durable exchange:** signed, encrypted messages and files, outbox/inbox, retries, acknowledgement and human acceptance where required. Reuse `packages/interchange` for its supported Police/DPP contract; add separately versioned contracts for other workflows.
3. **Operational dispatch:** assignment and status events, device connectivity, last acknowledged state and escalation when the recipient does not respond. Delivering a notification is not accepting an assignment.
4. **Live media:** audio/video rooms and streams with their own bandwidth, attendance, recording and retention rules. Media is not carried inside the case package mailbox.

### Recommended topology

* Local office operations continue without the internet. A designated office service should stay available independently of a user closing the desktop window; whether that is a service on an existing machine or a small managed node needs a deployment specification.
* Same network connections use verified or pinned TLS and approved device pairing. Do not ship a fallback to unprotected HTTP for production identity or case traffic.
* Remote offices initiate outbound connections to an approved relay, avoiding manual public addresses and a tunnel configuration per station.
* Recommend an institution/country operated relay for public deployments and a clearly disclosed pilot relay while that service is being established. Hosting, metadata retention and operator access must be agreed; encryption does not hide sender, receiver, timing or size from the relay.
* Keep sealed package export/import as the offline fallback. Define custody of removable media, receipts and reconciliation.
* Do not route Uganda records through Kenya or DRC by default. Sharing across countries requires an explicit approved purpose and route.

### First complete thread

Pair a Police station with its DPP office, send one case with attachments, accept it once, return directions, resubmit, and show receipt and office references on both sides. Prove it through file transfer first, then the secure relay, using the same payload contract.

After that, complete station to command reporting, directives back to a station, and hierarchy. Preserve the office of origin and freshness time as reports move upward. Counts from silent stations must not look current.

### Required exchange behaviour

Every delivery has an identifier, sender, recipient, schema version, payload hash, signing identity and timestamp. Model queued, sent, received, accepted/rejected and failed as different states. Retries are idempotent. Unknown or revoked identities are refused. Reconnection, clock skew, key rotation, duplicate messages, interrupted attachments and backup/restore of queues each need acceptance tests. No cross institution global person database is introduced by this plan.

## 5. Police Android recommendation

Recommend one **Pleadli Field** Android app with institution enabled modules, rather than separate patrol, traffic and investigation binaries. Final naming is proposed. Native Kotlin/Compose is the leading recommendation for duty location, background work, camera and hardware integration; validate it with a short device spike against Tauri mobile before committing. Share versioned contracts and test vectors with Rust/TypeScript, not desktop UI assumptions.

| Module | First useful work | Important boundary |
|---|---|---|
| Dispatch | Assigned job, acknowledge, en route, arrived, assistance requested, completed | No silent assumption that an unread push message reached an officer. |
| Patrol | Duty status, incident notes, location while on duty, photos and voice notes, station receipt | Clear queued/sent/received state; location permission can be denied or expire. |
| Traffic | Stop/incident record, collision sketch/photos, vehicle and driver details, approved notice output | National driver/vehicle checks and payment systems require separate authority access. Never invent fines or mark a payment paid locally. |
| Investigation | Assigned case extracts, statement capture, attachment upload, follow up tasks | Only the assigned/authorised material is cached on the device. |
| Supervisor | Unit availability, unacknowledged assignments, incident escalation | Freshness and connectivity shown; permission scoped to the command. |

Common foundations: approved device enrolment and revocation, strong officer authentication, encrypted local queue, resumable attachments, content hashes, duty scoped location, clear lost device procedure, battery and storage limits, accessibility and local language support. Unsynced evidence on a lost device may be unrecoverable; make that limitation visible in operating procedures.

Use push only as a signal to fetch authorised work. Evaluate managed and non Google device fleets. Voice/PTT is a later operational module after basic dispatch is proven; preserve the force's radio/telephone escalation. No consumer mobile network is promised as a guaranteed emergency channel.

## 6. Courts recommendation

Make Courts a dependable hearing workspace that produces accepted records and works alongside the Judiciary's systems.

### A. Recording and record quality first

* Clerk, judicial officer, transcriber, remote participant and administrator have distinct permissions.
* Microphone/device check, channel selection, visible recording indicator and storage warning.
* Persist capture locally before relying on an upload queue. Test forced exit, power loss, disk full and persistent database failure. Report gaps honestly.
* Timeline bookmarks for witness, exhibit, objection, adjournment and ruling, linked to recording time.
* Separate original audio, machine draft, human corrections, translations and adopted/certified record. Retain provenance and revision history.
* Export a proceedings bundle with the required officer review/signature workflow determined for the country and court level.

### B. Transcription, dictation and voice

* Benchmark local/offline and approved hosted speech services on authorised representative recordings, including names, case numbers, legal vocabulary, overlapping speakers and language switching.
* Start with saved audio transcription and correction. Add live captions once continuity and correction are reliable.
* Use separate microphone channels or human speaker assignment where possible. A diarisation label such as Speaker 2 is not verified identity.
* Keep English, French and Kiswahili goals distinct from proven local language accuracy. Evaluate Luganda and relevant Kenyan/DRC languages with practitioners rather than claiming blanket support.
* Dictation for private notes and a limited set of confirmed voice actions may follow. A spoken command must not silently issue a warrant, sign a record or publish a hearing.
* Cloud use needs approved data handling and a visible funding mode. Local recording continues when AI quota or the network fails.

### C. Three different streaming products

| Product | Audience | Recommendation |
|---|---|---|
| Private courtroom feed | Bench, clerk and authorised transcriber on the local network | Build first, with room roles and access expiry. |
| Remote hearing | Invited counsel, witness, interpreter or prison endpoint | Build second, with waiting room, identity check, admission/removal, protected sessions and document sharing controls. |
| Public broadcast | Authorised public viewers | Separate later opt in decision with court permission, delayed publication/cutoff, redaction and restricted case controls. |

Evaluate a self hosted WebRTC/SFU service, with LiveKit as a leading candidate, instead of writing a media server inside the Tauri app. Specify TURN, room tokens, recording, capacity, retention and support costs. TLS on a media connection is not the same as encryption that excludes the media server; server transcription/recording changes the trust boundary.

### D. Additional high value court work

Prioritise hearing preparation, who has not been produced, outstanding exhibits, adjournment reasons, reserved decisions, cause list publication, interpreter needs, and authorised orders exchanged with Prisons/DPP. Bail and sentencing worksheets must cite reviewed country rules and stay advisory. Automatic case outcomes or biometric identity conclusions are not part of the proposed court record workflow.

## 7. Website and visual download recommendation

Lead with who the app is for, the work it makes easier and what the person receives. Put technical deployment detail in an institution/IT guide linked from each product.

Suggested opening: “Tools for police, prosecutors, courts, advocates and prisons. Work through cases, prepare papers and keep the right people informed.” Qualify connected capabilities according to the version available, not the future vision.

### Every product and download card

1. Product name and intended user.
2. One genuine screenshot of that release, using synthetic demonstration records.
3. Three short outcomes and a small workflow gallery.
4. A short, captioned demonstration that loads only when requested.
5. Version, release date, Windows/architecture, download size and release channel.
6. A direct installer action, with system requirements and help beside it.
7. Plain explanation of offline use, where records stay, licensing and optional AI charges.
8. Separate “Available now” and “Planned” lists. Concept images must say they are concepts.

| App | Visuals to prepare |
|---|---|
| Police | Station Today/custody, a case file, a bond or charge sheet; later paired command view and phone assignment |
| DPP | File papers, charging review, issued directions or charge sheet |
| Courts | Sitting workspace, recording/transcript correction, adopted proceedings; remote room only when built |
| Lawyers | Matter, diary, document preview and accounts |
| Prisons | Person's file, reception/discharge, facility Today and HQ estate |

Capture each screenshot from the candidate release, not from a different development branch. Store app/version/locale/capture date with the asset inventory. Use fictional data, readable crops, alt text, lightweight thumbnails and no autoplay. Review English, French and Kiswahili copy with intended users.

Correct unsupported or obsolete security claims before visual polish. Remove universal claims such as “TLS everywhere” until every exposed production transport satisfies them. Do not imply approval or endorsement by a government because a product targets its officers. Reconcile static download fallback with actual published assets; never show a release as available solely because a planned version is listed.

## 8. Installation recommendation

Identify the exact prompt and artifact on a clean Windows machine before promising a fix.

| Prompt class | Proposed response |
|---|---|
| SmartScreen or unknown publisher | Obtain eligible publisher signing, sign installer and shipped binaries, timestamp signatures, preserve publisher continuity, verify on downloaded artifacts. Updater signatures alone do not provide Windows publisher trust. |
| UAC permission prompt | Review whether installation can be per user without elevation. A required legitimate OS approval is not removed by website wording. |
| WebView2/runtime setup | Choose and test an online bootstrap or an offline runtime package for government distribution. Explain the dependency simply. |
| Pleadli startup/setup error | Capture exact error, version, installation log and reproduction; fix that defect independently of signing. |

Do not promise warning free first installs. Microsoft's current documentation says new signed artifacts can still receive reputation warnings. Confirm signing provider eligibility for the actual Ugandan/Kenyan/DRC publisher; do not assume Microsoft Artifact Signing is available to that entity. Do not make “Run anyway” the standard government installation procedure.

Release requirements: publisher verification, stable version metadata, direct assets and checksums, clean install/update/uninstall tests, existing record preservation, offline distribution path, Courts added to the release/update pipeline, support contact and release notes. An external checksum helps detect a changed file but is not a substitute for a trusted publisher signature.

## 9. Extension and plugin recommendation

Start with **country content packs and controlled provider adapters**, not a public marketplace or arbitrary code loaded into the database process.

| Extension family | Contract |
|---|---|
| Laws and forms | Country, authority/source, licence, version, effective date, amendment history, language, signature and rollback |
| Identity/passport | Approved provider, explicit verification operation, authority/purpose, minimum response, requester audit and expiry |
| Biometric device | Capture quality, device/SDK/version, encrypted template handling and approved verification operation |
| Institution exchange | Versioned message, allowed recipients, receipt, source references and reconciliation |
| AI/speech | Capabilities, data destination, funding mode, model policy, limits and provenance |

A proposed extension manifest declares identifier, publisher, supported app/protocol versions, country, capabilities, network destinations, data categories, update signature and migration needs. HQ approves enablement and can revoke it. Secrets stay in the host keystore or approved gateway. All adapters use the host's permissions and audit boundary rather than getting raw database access.

First executable adapters should run behind a narrow host interface or isolated service. Define process isolation and resource/network limits before calling that a sandbox. Use a simulator for development until an authority provides a legitimate integration environment.

National ID, passport, driver and vehicle services are separate authorities/contracts. No public API or right to search is assumed. Uploading a face or fingerprint is not a lawful identity lookup by itself. Start with authorised, claimed identity verification where a provider permits it. Broader identification needs separate necessity, legal authority, accuracy/bias assessment, human review and deployment approval. Never turn an uncertain match into an automatic arrest, custody or access decision. Biometric integrations remain disabled in public demos.

## 10. Country and law update recommendation

| Country | Delivery position | Gate before a live deployment |
|---|---|---|
| Uganda | First pilot, using existing implementation and institutional partners | Confirm approved workflow/forms, existing system coexistence, hosting, supplier/data protection requirements, identity and support ownership |
| Kenya | Discovery now, separate adapter and country rule pack | Kenya court/prosecution procedures, e filing coexistence, identity provider agreement, traffic/payment authority and data protection assessment |
| DRC | Discovery now, French first interface and locally validated workflow | Competent police/prosecution/court/prison bodies, identity/passport authority, procedural and language review, infrastructure and data governance |

Keep one application family with country configuration and approved adapters. Avoid separate code forks per country. Do not assume the countries have identical custody clocks, file references, offences, forms or appellate procedures.

Specific findings that change the integration plan:

* Uganda NIRA's published partner route involves vetting and MOUs. Its PKI REST references are not evidence of an open citizen lookup API. Passport access is a separate Immigration arrangement. [NIRA notice](https://www.nira.go.ug/publications/call-for-provision-of-pki-secured-services).
* Kenya's official identity verification service is described as NPDM, formerly IPRS, with institutional onboarding and an MOU. Confirm fields, fees and technical access directly before implementing a production connector. [NPDM service](https://www.usajili.go.ke/national-population-data-management-npdm-formerly-iprs).
* DRC's RDC-Pass announcement expressly distinguishes the digital identity from the national ID card. RDC-Pass, ONIP CIN and passports must not become one assumed plugin/API. [Official announcement](https://presidence.cd/actualite-detail/actualite/le_president_felix_tshisekedi_lance_rdc_pass_lidentite_numerique_unique_pour_chaque_congolais).
* Kenya Supreme Court directions require leave for parties' recording and describe certified transcripts as the official record. Check the actual court's rules in every deployment; this is not a universal rule for all three countries. [Supreme Court directions](https://supremecourt.judiciary.go.ke/wp-content/uploads/2024/07/Supreme-Court-Virtual-Session-Practice-Directions-2023.pdf).

For law updates, track source and licence, retrieve on a schedule, detect changes, review, sign a country pack, distribute, verify and retain the prior version. Show “law current to” and a citation at the point of use. A legislative change that affects code calculations requires legal and engineering review plus regression tests. New wording does not silently change the rule used to calculate an old record. Offline offices can import a signed pack; withdrawn or disputed updates have a rollback path. Do not promise a live legal update feed until its actual source, rights and latency are agreed.

Evaluate Laws.Africa's documented content API and update webhooks alongside UPPC/ULII, Kenya Law and DRC Journal officiel sources. Existing DPP law library code is a reuse candidate, but its coverage does not prove complete licensed content for all three countries. Obtain country coverage, commercial/offline reuse terms and update cadence in writing. [API](https://developers.laws.africa/get-started/overview), [webhooks](https://developers.laws.africa/get-started/webhooks).

## 11. AI funding and account recommendation

Offer three clearly labelled modes, subject to institutional policy:

* **Institution funded:** HQ contracts with a provider or hosts a gateway. Office/user quotas, approved models, data classes and audit apply. Do not copy one unrestricted HQ secret into every app.
* **Personal usage:** user supplied API credentials, or ChatGPT plan authorisation when Pleadli is eligible. Personal payment does not authorise sending institutional records to a personal AI account.
* **Local or institution hosted:** optional model service suitable for available hardware and approved data. Models download separately; core apps stay usable without them.

OpenAI's current Sign in with ChatGPT documentation confirms optional ChatGPT plan use for eligible AI requests. Commercial/private availability is limited. Treat Pleadli access approval as an external dependency and do not advertise it as available yet. Its documented plan usage flow uses Responses API; do not assume it covers Realtime voice or audio transcription. Text, transcription and conferencing can have different funding and endpoint requirements.

Store OAuth credentials outside the webview, validate grants, support revoke/sign out, show “Using your ChatGPT plan” and link to provider usage management. Verify eligible model discovery and completed inference, not merely a successful login. No silent fallback from a personal limit to HQ billing or from HQ denial to personal billing. Data minimisation, approved destinations and action permissions remain in force across providers.

## 12. Development sequence and gates

Build one complete thread through UI, domain, storage, permissions, delivery and output before broadening it. The following are work packages, not elapsed time promises. Estimate after team capacity, access dependencies and the first device/network spike are known.

| Stage | Deliverable | Depends on | Exit evidence |
|---|---|---|---|
| 0 | Current capability/release ledger; scope conflicts and security blockers recorded; representative cases/device list | This review | One reviewed inventory; exact installer prompt captured; pilot sponsor and workflow contacts identified |
| 1A | Website/download rewrite and real release visuals | Accurate ledger | Intended users can identify their app, see real work, choose the right artifact and explain offline/licence/AI limits |
| 1B | Publisher signing and complete release/update path, including Courts | Eligible publisher/provider; release artifact inventory | Clean Windows install and update preserve records; OS prompts understood; signatures verified on downloaded files |
| 1C | Close existing DPP/Lawyers paper/output acceptance work and Prisons custody/recovery blockers | Earlier completion plans; current ledger | Required papers open/print/export correctly; backups restore expected attachments; custody actions retain approved identity and legal gates |
| 2A | Secure Police to DPP package round trip | Existing interchange contract; authenticated officers | Pair, refer with attachments, receive once, return directions, resubmit and recover queues after restart |
| 2B | Office identity, secure LAN and durable relay thin slice | 2A contract; hosting/operator decision | Same exchange succeeds between two real offices through disconnects, retries, revocation and certificate change |
| 2C | Police command connection completion | 2B identity/transport | Station reports, command approves/revokes and sends a directive; stale data shown; hierarchy access tested |
| 3A | Android dispatch/patrol pilot | 2B; device and native platform spike | Assignment acknowledged, offline incident captured, upload resumed and revoked device refused on representative phones |
| 3B | Courts roles, durable recording and transcription pilot | Identity; microphone/storage trial; approved audio service | Interrupted recording recovered with honest gaps; corrected transcript and reviewed record produced from real authorised sample audio |
| 4A | Traffic and investigation field modules | 3A; country procedure review | Approved notices, correct references and reliable station receipt; external checks only with authorised access |
| 4B | Private court feed, then remote participation | 3B; media hosting/permission decision | Authorised parties admitted; removal enforced; local recording survives stream failure; records/export accepted |
| 4C | Controlled extensions and signed law/form packs | Host permission/audit interface; source agreements | One content pack and one simulator adapter install/update/revoke without bypassing permissions |
| 4D | AI funding modes and conditional ChatGPT integration | Policy/billing ownership; vendor eligibility | Quota, revocation and payer shown; provider outage leaves core workflow intact; institutional data policy enforced |
| 5 | Uganda institutional pilot, Kenya/DRC country validation | Relevant packages above; actual sponsors and operational readiness | Authorised practitioners accept outputs; recovery drill passes; workflow benefit measured; support burden understood |
| 6 | Civilian services in controlled steps | Institutional receipt/status ownership and response process | Public request gets a receipt and a responsible institution; tracking privacy/revocation tested; no unsupported emergency promise |

Operating mode review, 12 October: [solo and institutional readiness](SOLO-INSTITUTION-READINESS-2026-10-12.md) records the app by app position, local node dependencies and acceptance scenarios. It also records the locally tested DPP correction that preserves named sign in for shared workspaces.

Delivery note, 12 October: [the first website/download slice](DELIVERY-WEBSITE-DOWNLOADS-2026-10-12.md) is implemented and checked locally, not deployed. It includes verified installer metadata, shared controls, labelled illustrations and clearer translated guidance. Real release screenshots and the broader Stage 1A reconciliation remain open; Stage 1B is not completed by this website work.

1A and 1B can proceed together. Existing completion work in 1C is retained rather than cancelled by new features. Country partnership research starts in Stage 0. After secure identity/transport, Android and Courts can proceed as separate tracks if team capacity allows. Critical safety and recovery findings from the initial audit must be resolved before a pilot handles live custody/evidence data; that work is included in the relevant package, not postponed until Stage 5.

## 13. Civilian route

Do not wait for a giant civilian app to offer a small useful public service, but do require an institution to operate each service.

1. Improve the existing paper verification and code tracking pages. State exactly what a registered code proves. Implement real status producers, source/freshness display, appropriate expiry/revocation and cross institution event authority.
2. Publish only court authorised cause lists and provide simple office/contact information.
3. Add service requests with acknowledgement and a responsible queue: case enquiries, visit requests or appointments where the receiving institution agrees to handle them.
4. Add structured complaints and evidence submission with retention, access, safeguarding and receipt procedures. Restricted material must not become public tracking metadata.
5. Consider incident reporting and requests for urgent help only after a staffed response model, escalation/fallback, availability targets and field dispatch pilot exist. An app button must not imply a guaranteed emergency response.

Start with a lightweight mobile web experience for receipts and enquiries. Decide on a civilian Android app when offline capture, secure device storage or notifications create a demonstrated need.

## 14. Proof that the system is worth adopting

Measure baseline and pilot results on representative work: minutes and repeated fields to refer a case; successful handoff and receipt rate; time to produce an accepted paper; missing attachment/gap rate; recording correction effort; offline queue age; restore success and duration; field battery/data use; training time; weekly active use and support incidents. Agree thresholds with each institution before live pilot acceptance. Do not invent national impact or procurement confidence from a demo.

Before broader rollout, name who operates the relay/media service, handles incidents, pays ongoing costs, approves law packs, manages signing keys, revokes devices, restores records and trains replacements. Match availability/backup targets to the actual institution, fleet and infrastructure.

## 15. Keeping code and installs manageable

Reuse stable identity, transport contracts, vault, paper and update primitives. Keep institutional rules local to their app. Share transport mechanisms without forcing a dispatch job and a court record into the same domain model. Keep models, media servers and optional hardware SDKs out of the base installer unless a deployment needs them. Consolidate repeated UI/runtime infrastructure after behaviour is verified. Measure installer size, startup, memory, attachment throughput and multiple machine behaviour separately from development cache disk usage.

Do not begin with a public plugin marketplace, nationwide biometrics, every country procedure, public live broadcast or a full civilian super app. Each can be revisited against pilot evidence and authority agreements.

## 16. Decisions to ratify before implementation

| Decision | Recommended default | Remaining evidence |
|---|---|---|
| Pilot order | Uganda first; Kenya/DRC discovery alongside | Named institutional sponsors and access agreements |
| Mobile scope | One Field Android app with duty modules | Device fleet, offline needs and Kotlin/Tauri spike |
| Office availability | Managed service independent of desktop window | Institution hardware/operations arrangement |
| Remote exchange | Country/institution relay with sealed payloads | Hosting owner, metadata rules and operating budget |
| Court rollout | Durable audio, transcription, private feed, remote hearing, then optional public broadcast | Court permissions, representative audio and acceptance process |
| Extensions | Signed content packs plus controlled adapters | Host isolation/permission design and authority SDK/API terms |
| AI funding | Institution gateway plus optional personal/local modes under policy | Commercial ChatGPT eligibility and data approval |
| Civilian entry | Receipts, verification, enquiries before urgent dispatch | Named receiving queues, response ownership and privacy controls |

These recommendations are concrete enough to prioritise. Before each load bearing package is built, write its narrower implementation spec, acceptance tests and rollout/rollback procedure. No application implementation is authorised by a status label in this proposed document.

## Courts UI priority clarification — 12 October 2026

The user identified Courts as visually behind the other applications. Refresh its existing daily workflow alongside the identity work: shell first, then Today/cause list, case workspace, hearings, orders/rulings and setup/settings. See [Courts UI delivery and remaining sequence](DELIVERY-COURTS-UI-2026-10-12.md). This is distinct from new streaming/transcription capabilities and does not change the solo/offline and institutional SaaS requirements.
