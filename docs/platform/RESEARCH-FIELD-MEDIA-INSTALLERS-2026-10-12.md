# Field Android, courtroom media and Windows installer research

Date: 2026-10-12. Read-only application review; this note is a proposal, not an implementation or deployment claim. Primary sources checked on this date. Country-specific legal authorisation, institutional hosting and release artifacts were not verified.

## 1. Repository facts and scope conflicts

- `docs/platform/ORCHESTRA-PLAN.md` already proposes a signed, recipient-encrypted mailbox relay, direct pinned-TLS exchange on a local network, country-hosted government relay, and later Police Android dispatch/traffic. This is a records-delivery plan, not a complete live operations service.
- `docs/police/PRODUCT.md` still explicitly excludes a mobile client, live location, sync and distributed networking from its then-current implementation. Its future mobile surface includes assignments, field reporting and assistance requests. The new request should supersede those exclusions in a controlled next-stage specification.
- Police already has a restricted phone web surface in `apps/police/src-tauri/src/transport/remote_server.rs`, reached directly or through cloudflared; its comments do not describe a finished native field app. Scope claims in old comments need checking against routes, not copying into product advertising.
- `docs/courts/PROPOSAL.md` approved D8 as recording/annotation rather than a new video conferencing product. The user's current request adds a new decision and scope.
- Courts has microphone recording, timestamped transcript segments and a manual edit/adopt workflow. `apps/courts/src-tauri/src/domain/transcripts.rs` deliberately supplies `NoEngine`; automatic transcription always returns unavailable. It must not be marketed as working automatic transcription.
- `apps/courts/src/features/recordings/use-recorder.ts` captures five-second chunks but keeps pending writes in memory. Its stop path can discard unsaved chunks after waiting. Therefore the comment implying power-loss exposure of only about five seconds is not a general durability guarantee when writes fail or fall behind. Verify crash/power-loss recovery and sustained slow storage before relying on it.
- `.github/workflows/release.yml` uses `TAURI_SIGNING_PRIVATE_KEY` and publishes updater metadata. No Windows Authenticode signing configuration was found in that workflow or the five checked Tauri configuration files. The workflow excludes Courts. Configuration review cannot establish the signature of an already-published binary.

## 2. Windows installation: identify the message before fixing it

**Verified facts.** Tauri updater signatures authenticate downloaded updates to the application. Windows code signing is a separate process using a recognised publisher certificate or signing service. Having an updater `.sig` does not establish a Windows-trusted publisher. [Tauri updater](https://v2.tauri.app/plugin/updater/), [Windows signing](https://v2.tauri.app/distribute/sign/windows/).

Microsoft says signed new files can still receive SmartScreen warnings while reputation accumulates; EV certificates no longer confer immediate bypass. Public direct downloads cannot honestly promise zero warnings. [Microsoft SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

Microsoft Artifact Signing Public Trust currently lists eligible organisation countries that do not include Uganda, Kenya or DRC; individual eligibility is US/Canada. Confirm publisher eligibility before selecting this service. Otherwise evaluate a recognised certificate authority that supports the legal publisher. [Artifact Signing prerequisites](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart).

Tauri normally installs WebView2 when absent using an internet bootstrapper. An offline runtime installer increases bundle size substantially; embedding only the bootstrapper still needs internet. Skipping installation fails on machines without the runtime. [Tauri installer options](https://v2.tauri.app/distribute/windows-installer/).

**Recommendations.** Reproduce the reported message on a clean supported Windows machine using the actual website download. Record whether it is SmartScreen, UAC, Defender, WebView2, or an installer failure; each needs a different response. Add publisher signing with timestamps, signature validation before publication, version/hash metadata, and a tested update/rollback process. Provide a normal download and a clearly labelled offline installation option or institution deployment pack where useful; measure exact sizes. Use least-privilege install modes where compatible. Keep legitimate OS permission prompts understandable rather than promising their removal. Include Courts only after its release gates pass. Pin and verify the cloudflared release rather than fetching an unpinned latest executable during each build.

## 3. Police field Android: recommended first product

**Verified facts.** Android's offline guidance recommends local persisted data and queues, with WorkManager retrying network-bound work. Location foreground services require platform permissions and have restrictions when started from the background. Push delivery can be delayed by Doze; high-priority FCM attempts prompt delivery but can be deprioritised when it does not produce visible notifications. [Offline architecture](https://developer.android.com/topic/architecture/data-layer/offline-first), [foreground services](https://developer.android.com/develop/background-work/services/fgs/service-types), [FCM priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).

Tauri supports native Android plugins written in Kotlin/Java; reusing web/Rust code does not remove Android lifecycle and permission work. [Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/).

**Proposal.** Build one small field app with role-specific workflows, not the full desktop interface:

- Patrol: shift start/end, assignment acceptance, arrival/status, incident notes, controlled photo/audio evidence and assistance requests.
- Traffic: collision scene, vehicle/driver details, photos, witness notes and approved forms. Citation/fine collection and official vehicle/identity lookup wait for authorised institutional contracts.
- Investigations: assigned tasks, field interviews/notes and evidence submission, with only the minimum downloaded case information.

Default to native Kotlin/Compose for an Android-first operational client because location, notifications, camera capture, managed device support and lifecycle recovery dominate this use case. This is an engineering recommendation, not a benchmark result. If team capacity favours Tauri 2, run a bounded device spike first: screen-off shift location, notification receipt, camera return, offline queue survival and low-memory process death. Choose by measured results on the intended low-end phones, not code reuse alone.

Separate three flows: (1) reliable encrypted records mailbox with acknowledgements/deduplication, (2) online dispatch presence/status with timestamps, expiry and explicit acknowledgement, (3) live voice/video transport. A stale location or undelivered help request must never appear current or received. Push is a wake-up hint; the server ledger is authoritative for assignment and receipt. Preserve radio/telephone operational procedures and escalation until the institution validates the digital service. Never make a store-and-forward relay substitute for guaranteed emergency communications.

Use encrypted local storage, device enrolment/revocation, short-lived scoped credentials, constrained offline access and auditable evidence transfer. Start location sharing deliberately for a shift, show last-fix age/accuracy and stop it on shift end. Do not put case contents in push payloads. Decide support for devices without Google Play Services during procurement. Measure network loss, reboot, duplicate/reordered delivery, clock skew, battery use and lost/stolen-device recovery.

## 4. Courtroom media: durable record first, controlled live access second

**Verified facts.** LiveKit can be self-hosted with WebRTC media and separate egress services for recording/stream export. Self hosting carries SSL/TURN/firewall and operational responsibilities. [Self hosting](https://docs.livekit.io/transport/self-hosting/), [egress](https://docs.livekit.io/transport/self-hosting/egress/).

LiveKit E2EE requires application-controlled key distribution; signalling/API metadata remains visible to the server over TLS. An institution-owned recording or transcription endpoint needing plaintext must be an explicitly trusted decryption recipient. Do not promise server-blind encryption and unrestricted server processing simultaneously. [Encryption](https://docs.livekit.io/transport/encryption/).

**Proposed sequence.** First harden local recording: microphone selection/level checks, channel labels, persisted chunk queue, checksums, interruption recovery, bookmarks/exhibits and verified audio export. Next connect a replaceable transcription engine, keeping original audio immutable and machine text visibly draft. Benchmark Ugandan/Kenyan English and relevant French/local-language courtroom samples, names, numbers, interpretation and overlapping speakers. Human review remains required; field evidence must precede accuracy claims.

Then add authorised remote participation or a read-only sitting feed using a proven media service; LiveKit is a candidate to evaluate, not an approved dependency. Default rooms private, with identified roles, waiting room, short-lived access grants, attendance log, clerk recording control and reconnect/audio-only behaviour. Preserve a local courtroom recording if WAN streaming fails. Where an existing official conferencing system is mandatory, integrate authorised recordings/links rather than replace it.

Public streaming should be a separate publication workflow: a judicially approved feed, exclusion of restricted proceedings, separate moderation/cutoff, and an approved delay/redaction policy. Public visibility cannot be inferred from a hearing being scheduled. No legal approval for this feature was established in this research.

Voice dictation for notes, accessible playback and read-aloud of drafts are useful later conveniences. They should not issue legal decisions, trigger operational orders without confirmation, or disguise generated speech as recorded testimony.

## 5. Recommended acceptance gates

1. Windows: first-install, missing-runtime, offline-install, update and uninstall verified on supported clean machines; actual publisher signature checked.
2. Field: station/HQ ownership and dispatch API agreed; offline submissions survive termination/reboot and are accepted once; stale assignments/location and unacknowledged help remain explicit.
3. Court: recoverable recording under storage/network/process failure; draft transcript provenance and review preserved; no release claim about language accuracy without a measured corpus.
4. Live media: permitted participants and proceeding types documented by the institution; reconnect and local recording independent; encryption/recording trust boundary demonstrable.
5. Civilian prerequisites: trusted institutional receiving queues, routing, receipt/status, abuse controls and staffed response responsibilities are operating before broad public reporting launches.
