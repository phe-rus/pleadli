# Pleadli capability ledger and delivery backlog

Date: 12 October 2026. Planning only. No application code, deployment, installer or live record changed in this pass.

Read with the [development roadmap](DEVELOPMENT-ROADMAP-2026-10-12.md). This ledger makes its first stages actionable. It does not replace the institutional product decisions or mark old scope items complete.

## Evidence rules

“Present” means found in the current checkout, including existing uncommitted work. “Published” means public release metadata was retrieved. Neither establishes acceptance by an institution, successful installation, secure operation or production readiness. A completed feature needs recorded behaviour checks on the intended device and workflow.

## Local delivery updates after this audit

The ledger below preserves the audit baseline. Later work has changed some of that baseline locally, without deployment:

* [Website/download delivery](DELIVERY-WEBSITE-DOWNLOADS-2026-10-12.md): direct installer controls, validated public release metadata, labelled illustrations and translated installation guidance. Actual release screenshots remain open.
* [Signup/release safeguards](DELIVERY-ACCESS-RELEASES-2026-10-12.md): automatic admin promotion by entered email was removed, regression tested, and draft release validation added. Existing production admin membership and Windows acceptance remain unverified.
* [Solo/institution readiness](SOLO-INSTITUTION-READINESS-2026-10-12.md): distinguishes local offline use from a joined desk that depends on its office node. Records the remaining setup, permission and recovery proof for each app. DPP now enforces the one person rule when removing sign in, adding staff and reactivating staff; its 47 backend tests passed locally. Lawyers now enforces solo and sign in limits during reactivation and staff creation, with 66 backend tests passing locally.

## Current capability ledger

| Capability | Evidence and current state | Remaining work and proof |
|---|---|---|
| Police station and Command | [HQ plan](../police/HQ-FACILITY.md); `apps/police/src-tauri/src/domain/{command,command_link}.rs` and `transport/command_server.rs`. Registration, approval, reporting and revocation are present. | Run the real two machine loop. Complete verified TLS, commands back to stations and authorised hierarchy. The earlier network plan exists, but it is not finished. |
| Police to DPP delivery | [Contract](../interchange/police-dpp.md), `packages/interchange`; DPP receiver exists. Police `domain/referrals.rs` records referrals locally. | Build sender, durable outbox, receipt and returned directions. Prove attachments arrive, retries do not duplicate files, and both sides retain the same handoff reference. |
| Android field dispatch | Restricted phone access and capture are useful existing pieces, not a complete field app. | Device trial, enrolment, assignment acknowledgement, offline capture, resumable attachments and device revocation. Add traffic as a duty module after the common field workflow works. |
| Courts audio | `apps/courts/src/features/recordings/use-recorder.ts` captures and retries chunks. Backend recording storage exists. | Persist unsaved chunks across crashes. Stop currently waits up to 60 seconds and can clear unsaved audio. Demonstrate recovery after storage failure, window closure and interrupted power. |
| Courts transcription | `apps/courts/src-tauri/src/domain/transcripts.rs` selects `NoEngine`; automatic transcription returns unavailable. Manual work exists. | Approved engine, audio trial, speaker/timestamp correction, audit and reviewed adoption. Measure correction effort on local courtroom speech. |
| Courts media and access | [Courts proposal](../courts/PROPOSAL.md); live feed and conferencing are unfinished. The reviewed app also needs an authenticated role boundary. | Roles first, then private feed and remote participation. Public broadcast is a separate court permission and publication decision. |
| DPP and Lawyers completion | [Existing completion plan](COMPLETE-DPP-LAWYERS.md) records built papers/UI and outstanding checks. | Retain that work. Prove print, PDF, Word, relevant translations, law access and Windows workflows. Do not infer paper acceptance from a typecheck. |
| DPP recovery | `apps/dpp/src-tauri/src/domain/backup.rs` writes the database and attachment entries. | Establish a complete inventory including incoming interchange files. Restore on another machine and open every referenced paper and attachment. Missing files must be visible. |
| Website and downloads | `www/src/routes/_public/downloads.tsx`, `www/src/functions/releases.func.ts`, `www/src/data/products.ts`; existing product mockups and release fallbacks. | Plain outcomes, actual release previews, direct installers and verified metadata. Remove unsupported claims and stale feature lists. |
| Public verification and tracking | Website routes exist. Verification is based on a registered code; source application status production is incomplete. | State exactly what a code proves. Define document integrity separately. Add authorised status producers, freshness, expiry and cross institution event ownership. |
| Website administration | `www/src/auth/index.ts` grants admin at email signup when the submitted address matches the staff list. No email verification requirement is configured there. | Prove control of the address before privilege, or provision administrators through an explicit trusted operation. Test a stranger submitting a staff address. Treat this as a security blocker. |
| Courts release | `apps/courts/src-tauri/tauri.conf.json` has version `0.0.0`, updater artifacts disabled and no updater configuration. Release workflow excludes Courts. | Add the complete update path after access/recovery checks. Test installation, upgrade and record preservation before publishing it as available. |
| Identity and biometric plugins | No verified production authority connection established by this review. | Agreed provider access, narrowly scoped adapter, permissions and audit, then simulator and approved staging trial. Capture is distinct from identity verification and identification. |
| Country law packs | Existing law library is a reuse candidate. Three country coverage and update rights are not established. | Source/licence inventory, effective dates, reviewed signed updates, offline import and rollback. Retain the rules applicable to historical records. |
| Personal ChatGPT usage | Shared AI provider support exists; no working ChatGPT plan connection found. | Eligibility, provider grant flow, model discovery, payer display and quota/revocation checks. Institutional data permission remains separate from who pays. |

## Published artifact baseline

The public GitHub API returned these versioned, non draft, non prerelease releases and their installer asset metadata on 12 October 2026. Sizes below are decimal MB, rounded to one decimal place. Binaries were not downloaded, executed or inspected for publisher signatures. A GitHub verified commit is not evidence of Windows Authenticode signing.

| App | Highest version found | Published UTC | EXE MB | MSI MB |
|---|---|---|---:|---:|
| Police | `0.1.2` | 8 October 2026 | 26.7 | 36.2 |
| DPP | `0.1.1` | 7 October 2026 | 7.9 | 10.7 |
| Lawyers | `0.1.1` | 7 October 2026 | 7.5 | 10.2 |
| Prisons | `0.1.1` | 7 October 2026 | 25.6 | 34.9 |
| Courts | None found | Not established | Not established | Not established |

Source: [public release repository](https://github.com/phe-rus/pleadli-releases/releases), via `https://api.github.com/repos/phe-rus/pleadli-releases/releases?per_page=100`. This is a dated observation, not a permanent download catalogue. The four rolling `<app>-latest/latest.json` feeds were also retrieved and matched the versions above, each listing Windows x86_64, MSI and NSIS platform entries. The Courts feed returned HTTP 404. Feed agreement does not verify downloaded binaries, publisher signatures or successful updates.

The local directories measured approximately 57 GB for `apps`, 4.6 GB for `packages`, and 2.3 GB for `node_modules`. These include development/build outputs and dependencies. They must not be presented as the customer download size. Public artifacts also predate some current checkout changes, so screenshots from this tree cannot automatically be labelled as screenshots of those releases.

## Delivery backlog

Recommended ordering follows risk and dependencies. These are packages to estimate after the relevant access and operating decisions, not promised dates.

| Order | Work package | Completion evidence |
|---|---|---|
| 1 | Reconcile scope, claims and releases | Each advertised capability has a source, implementation status, released version and remaining proof. Resolve mobile and conferencing exclusions explicitly. Record known security/recovery blockers before any live data pilot. |
| 2 | Website and download experience | A nontechnical officer, clerk or advocate can select the right app, recognise its actual screen, identify Windows requirements and understand offline use and optional charges. Test mobile width and every supported website language. |
| 3 | Release trust and existing workflow acceptance | Exact installer prompt classified on clean Windows. Publisher/signature requirements agreed, downloaded signatures checked, update preserves records, and relevant papers/restore checks pass. Courts remains unavailable until its release gates pass. |
| 4 | Police to DPP package round trip | One fictional case, attachments, receipt, returned directions and resubmission complete on both sides. Interrupt and restart delivery; retry must not duplicate acceptance. |
| 5 | Secure office connection and Command | Two machines/offices complete the same exchange through disconnects and revocation. Command sees authorised reports, freshness and directives, with no unrestricted upward sharing of raw records. |
| 6 | Field Android and Courts audio tracks | Field: acknowledged assignment, offline capture, resumed upload and revoked device. Courts: access control, durable recording, corrected transcript and reviewed output. Each needs representative devices and users. |
| 7 | Traffic, private court media and controlled extensions | Country approved traffic papers; restricted media attendance/removal; one signed content pack and one simulator adapter install, update and revoke without bypassing host permissions. |
| 8 | Uganda pilot, then country validation and civilian services | Named operators accept outputs and demonstrate recovery. Kenya and DRC get distinct procedure packs and agreements. Civilian receipt/enquiry services have an institution responsible for responding. |

Identity and country partner discovery can start during the early packages. Keep advanced integrations outside the critical path for proving an ordinary case handoff. Personal AI integration can proceed once eligibility and institutional policy are clear, without blocking core offline work.

### Website work brief

Use the existing website design and translation system. Lead with the task and intended user: station records, prosecution files, court sittings, legal matters or prison operations. Explain technical infrastructure in supporting documentation.

Each download card needs product name, intended user, three practical outcomes, a real preview, version/date/architecture/size, direct Windows installer, support and a short distinction between available and planned features. Provide MSI and offline distribution details as secondary choices where supported. Do not advertise an offline installation until runtime dependencies have been tested without internet.

Capture previews from the exact candidate release with fictional records. Keep version, locale and capture date in an asset inventory. Use readable images, alt text and lightweight thumbnails; load demonstrations on request. Label development previews and concepts accurately. Never substitute a generated interface image for proof of delivered behaviour.

Release lookup needs bounded network waits, explicit unavailable/error states, validated app/version/platform metadata and an asset allowlist. A static version or a successful login is not evidence that an installer exists. A known previously verified release can be shown with an explicit last checked time if that fallback policy is chosen and recorded.

### Size and code quality work brief

1. Record download size, installed size, cold startup, idle memory and representative attachment throughput for each candidate release. Keep developer cache usage as a separate measurement.
2. Inspect packaged components before changing them. Police and Prisons carry a tunnel sidecar in the workflow; this is a candidate to measure, not proof that it explains the full size difference.
3. Keep optional AI models, media infrastructure, biometric SDKs and country content downloads separate where the deployment permits it. Offer an explicitly tested offline bundle for offices that need one.
4. Reuse stable paper, credential, vault, update and transport primitives. Consolidate exact duplicates only after checking that institutional behaviour is identical. Keep legal decisions and permissions inside the institution's domain.
5. Identify broad query invalidation, oversized route components and repeated infrastructure for small measured improvements. Avoid a wholesale rewrite. Minifying source or deleting type information does not establish a faster app or a smaller native installer.
6. Clean disposable build outputs only through an agreed maintenance task. Do not delete databases, vaults, working changes, lockfiles or release evidence to make the repository appear smaller.

## Reality and adoption assessment

Pleadli has enough existing institutional workflow code to justify a focused pilot. This review does not establish readiness for national adoption, procurement acceptance or complete interconnection. Its strongest proposition is offline office work, accepted papers and fewer repeated fields during handoff. The next proof should be one complete Police to DPP workflow rather than a larger feature list.

| Audience | What would make adoption credible | Evidence still needed |
|---|---|---|
| Government sponsor | Approved outputs, coexistence with existing systems, operating ownership, support and sustainable cost | Named sponsor, workflow owner, permission to pilot, acceptance checks, service ownership and cost model |
| Officer, clerk or prosecutor | Faster daily work, reliable offline behaviour, clear errors and recoverable records | Observed task completion, training time, successful handoff, correction burden, restore drill and support incidents |
| Advocate or firm | Accepted papers, matter continuity, privacy and easy onboarding | Real Word/print workflow, network/access checks, willingness to use regularly and pay |
| Civilian | A receipt, understandable status and a responsible institution | Actual status producers, receiving queue, privacy/revocation and response process |

Compare the pilot with the office's current paper/spreadsheet process and existing government service, not only with another demo. Record baseline and pilot task time, repeated entry, failed handoffs, missing attachments, restore results and support effort. Agree pass thresholds with practitioners before the trial; no invented readiness percentage or adoption forecast is defensible from this code review.

For Uganda, Kenya and DRC institutional context and external integration gates, use the [country research](RESEARCH-COUNTRY-INTEGRATIONS-2026-10-12.md). For installer/media choices, use the [technical research](RESEARCH-FIELD-MEDIA-INSTALLERS-2026-10-12.md). OpenAI documents eligible ChatGPT plan use but limits commercial/private availability; verify Pleadli access before promising it. [Official quickstart](https://developers.openai.com/siwc/quickstart).

## Open evidence to collect

The planning work can continue without these answers, but the dependent implementation or live pilot cannot be accepted without them:

* Exact Windows warning, downloaded filename/version, Windows version and installation log where applicable.
* Pilot office, responsible institutional contact, actual forms and the existing system Pleadli must coexist with.
* Representative officer phones, office computers, microphones, connectivity and power constraints.
* Publisher legal entity/signing eligibility and who operates the relay, media service and support desk.
* Identity provider onboarding, law content rights, court recording/publication permission and AI data policy.

No fresh runtime or physical device acceptance test was performed in this planning pass. Public release metadata checks are the only new external artifact verification recorded here.
