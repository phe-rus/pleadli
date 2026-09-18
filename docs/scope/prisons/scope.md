# Scope: Pleadli Prisons (apps/prisons)

The Tauri desktop app for Uganda's prisons service: admission and prisoner custody, releases, transfers, court production and remand, health and welfare, visits, property, rehabilitation, and complaints. Same offline first Rust/sqlx + no SQL over IPC architecture as Police and DPP. Canonical product model in `docs/prisons/PRODUCT.md`.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

**2026-09-18 correction**: an earlier pass of this scope said this workspace was "fully caught up, no planned next slice." A skeptical code audit found that was wrong: `docs/prisons/PRODUCT.md`'s own gap analysis table incorrectly marked Reports as done, and never listed Search's real coverage gap at all. See the corrected rows below and `docs/prisons/RESEARCH.md` §12 for new research into what would help real Uganda government adoption (JLOS, NITA-U, the Data Protection and Privacy Act 2019), which surfaced the audit-trail and export items below. Existing features 1 to 14 remain accurately built; the next slice extends two of them (Reports, Search) and adds real gaps the audit found.

`docs/prisons/PRODUCT.md` §10 also records two open product questions worth resolving before they matter: how `admission_instrument_type` should represent "convicted, document pending" (now feature 18 below, since the audit found it still forces a false choice), and how reliable national ID based cross episode search really is (still just a decision, not a scope row, raise with `/architect` if it becomes load bearing).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Prisoners (admission/custody/status) | Existing | existing |
| 2 | Releases | Existing | existing |
| 3 | Transfers | Existing | existing |
| 4 | Court Productions | Existing | existing |
| 5 | Remand (s.118 list) | Existing | existing |
| 6 | Health & Welfare | Existing | existing |
| 7 | Visits | Existing | existing |
| 8 | Property & Effects | Existing | existing |
| 9 | Rehabilitation & Work | Existing | existing |
| 10 | Communication & Requests | Existing | existing |
| 11 | Documents / Attachments | Existing | existing |
| 12 | Reports | Existing | existing |
| 13 | Search | Existing | existing |
| 14 | Overview | Existing | existing |
| 15 | Reports: population breakdowns | Next slice | planned |
| 16 | Search: full domain coverage | Next slice | in-progress |
| 17 | Property to Release workflow link | Next slice | planned |
| 18 | Admission instrument pending state | Next slice | planned |
| 19 | Audit trail | Next slice | planned |
| 20 | Print and export | Next slice | planned |
| 21 | UPS shaped statistics export | Next slice | planned |
| 22 | Head Office and peer prison sync network | Foundation | in-progress |
| 23 | Visits page + motion add-record + nav alignment | Next slice | in-progress |

## Existing

### 1. Prisoners (admission/custody/status) · existing
Full CRUD plus admission fields; the core workspace everything else attaches to. code in `apps/prisons/src/features/prisoners/`, `apps/prisons/src-tauri/src/domain/prisoners.rs`

### 2. Releases · existing
Wired into the prisoner workspace. code in `apps/prisons/src/features/releases/`, `apps/prisons/src-tauri/src/domain/releases.rs`

### 3. Transfers · existing
Wired into the prisoner workspace. code in `apps/prisons/src/features/transfers/`, `apps/prisons/src-tauri/src/domain/transfers.rs`

### 4. Court Productions · existing
Includes a physical/virtual production method field and select. code in `apps/prisons/src/features/court-productions/`, `apps/prisons/src-tauri/src/domain/court_productions.rs`

### 5. Remand (s.118 list) · existing
Own dedicated route, sharing nav with Court Production. code in `apps/prisons/src/routes/_public/remand/`

### 6. Health & Welfare · existing
Referral/return event pairs, wired into the prisoner workspace. code in `apps/prisons/src/features/health-events/`, `apps/prisons/src-tauri/src/domain/health_events.rs`

### 7. Visits · existing
All 6 visit categories, including a split personal doctor / voluntary visitor / special authorization set. code in `apps/prisons/src/features/visits/`, `apps/prisons/src-tauri/src/domain/visits.rs`

### 8. Property & Effects · existing
Admission time record plus a returned marker. code in `apps/prisons/src/features/property-records/`, `apps/prisons/src-tauri/src/domain/property_records.rs`

### 9. Rehabilitation & Work · existing
Includes programme completion and certificate reference fields. code in `apps/prisons/src/features/programme-participations/`, `apps/prisons/src-tauri/src/domain/programmes.rs`

### 10. Communication & Requests · existing
Complaint log with category, description, outcome, and resolved_at, nullable prisoner reference for anonymity. code in `apps/prisons/src/features/requests/`, `apps/prisons/src-tauri/src/domain/requests.rs`

### 11. Documents / Attachments · existing
Generic attachment/vault mechanism used across the domains above. code in `apps/prisons/src/features/attachments/`, `apps/prisons/src-tauri/src/domain/attachments.rs`

### 12. Reports · existing
code in `apps/prisons/src/features/reports/`, `apps/prisons/src-tauri/src/domain/reports.rs`

### 13. Search · existing
code in `apps/prisons/src/features/search/`, `apps/prisons/src-tauri/src/domain/search.rs`

### 14. Overview · existing
code in `apps/prisons/src/routes/_public/index.tsx`

## Next slice

### 15. Reports: population breakdowns · needs a decision
`docs/prisons/PRODUCT.md` documents four real, UPS sourced breakdown dimensions (age group, capital offence type, nationality, sentence category) as grounded and buildable. None exist in `domain/reports.rs` today. Needs a decision because it likely requires new fields on the Prisoner record to categorize by, not just a report query change.
**Done when:** Reports shows population counts broken down by age group, capital offence type, nationality, and sentence category, matching the categories UPS's own published statistics use (see `docs/prisons/RESEARCH.md` §11.1).
- [ ] Design it (spec): `/architect reports population breakdowns`

### 16. Search: full domain coverage · in-progress
`domain/search.rs` only searches Prisoners. Visits, Requests, Court Productions, Releases, Transfers, Health Events, Property Records, and Programme Participations are real, built domains with no search coverage at all.
**Done when:** searching from the Search route returns matches across all nine domains, not just Prisoners.
- [x] Build it: `/develop search full domain coverage`
code in `apps/prisons/src-tauri/src/domain/search.rs` (plus a new `search()` function added to each of the 8 domain files), `apps/prisons/src/features/search/schema.ts`

### 17. Property to Release workflow link · needs a decision
Releasing a prisoner never touches their property record; the two exist independently despite s.62 describing return-at-release as one duty. Needs a decision on the exact behavior (auto mark returned, require confirmation before release completes, or just surface a reminder).
**Done when:** completing a release either marks the linked property record returned or blocks/prompts on an unreturned one, per whichever behavior gets decided.
- [ ] Design it (spec): `/architect property to release workflow link`

### 18. Admission instrument pending state · needs a decision
`docs/prisons/PRODUCT.md` §10 flags this as an open product question: UPS's own Commissioner General reports 98 real "convicted, no commitment warrant on file" cases, but `admission_instrument_type` still forces a choice among 4 complete instrument types with no honest way to record a pending document.
**Done when:** a prisoner can be admitted with the commitment document marked pending, without the schema lying about completeness, per whatever representation gets decided.
- [ ] Design it (spec): `/architect admission instrument pending state`

### 19. Audit trail · needs a decision
No `created_by`/`updated_by`/changed-at exists on any domain. Matters for the Data Protection and Privacy Act 2019's security and accountability duties (`docs/prisons/RESEARCH.md` §12, s.20 to 23), not just good practice. Needs a decision because Prisons (like Police and DPP) currently has no signed-in officer identity concept to attribute a change to, which this depends on. Worth checking whether this should be a cross-cutting decision across all three sibling apps rather than Prisons-only before designing it here alone (see `docs/scope/_root/scope.md`'s matching Deferred item).
**Done when:** every domain record shows who created and last changed it and when, per whatever identity model gets decided.
- [ ] Design it (spec): `/architect audit trail`

### 20. Print and export
No admission slip, release order, or remand list printout exists; Police and DPP both have an established print route pattern this can follow.
**Done when:** an officer can print or export an admission slip, a release order, and the s.118 remand list, following the existing sibling apps' print route pattern.
- [ ] Build it: `/develop print and export`

### 21. UPS shaped statistics export · needs a decision
Once feature 15 is built, format an export that mirrors UPS's own real Monthly Statistics Summary layout, so an officer isn't re-typing numbers this system already has into a separate report.
**Done when:** Reports can produce an export whose shape matches UPS's own published monthly statistics report structure.
- [ ] Design it (spec): `/architect UPS shaped statistics export`

## Next slice

### 23. Visits page + motion add-record + nav alignment · in-progress
2026-09-18, from the engineer directly. Three UI gaps the audited product model (`docs/prisons/navigation.md` §4.5-4.6) already implies but the app doesn't deliver:
- **Visits page**: the sidebar has promised a top-level `/visits` since `navigationItems.ts` was written, but the route does not exist — a dead nav link. The domain is fully built (`features/visits/*`, used inside the prisoner workspace); this adds the missing facility-wide destination: a visit log across every prisoner (authorization + attendance), searchable, prisoner rows linking through to the person. Backed by a new facility-wide `list_visits` command.
- **Motion add-record panel**: `add-record-panel.tsx` uses `@pleadli/ui`'s Drawer with a 3-item text list. Per the engineer the add-record surface is a **framer-motion panel** (same animation language as the existing onboarding gates) containing a **grid of record types**; selecting a card for a person-scoped record asks which prisoner (a search), then shows that record's inputs — real "steps" (grid → prisoner → form), never a nested tree.
- **Nav alignment**: the flat nav shape is settled (navigation.md D6 = flat); the work is truth—`navigationItems.ts`'s comments describe an older reality (e.g. "Reports is a written document" vs the built `/reports` statistics surface), and its `Visits` link points at a route that now exists. No regrouping.

**Done when:** `/visits` renders the facility-wide visit log and its nav link resolves; the header's "Add record" opens a motion panel with a record-type grid covering every built form (person-scoped ones ask for a prisoner via search first); `navigationItems.ts` matches the `navigation.md` trees with no stale comments.
- [ ] Build it: `/develop visits page, motion add-record, nav alignment` (in progress)
- [ ] Verify it: `/check verify` — skip, no backend behavior change beyond a new list command; covered by code review instead

## Foundation

### 22. Head Office and peer prison sync network
2026-09-18, from the engineer directly, after testing the desktop app and finding the single installation model too limited. This is a real reversal of `docs/prisons/PRODUCT.md`'s former "not a national UPS system" line, recorded there rather than silently changed. The wider Police, DPP, Courts, Lawyers cross institution topology the engineer described (each institution type running its own internal network, connecting out to Courts only, DPP and Lawyers staying individual practitioner tools) is a real future direction, not built now: Courts has no app or product doc yet, so that leg cannot be designed for real. See `docs/scope/_root/scope.md`'s interoperability seam item for that wider picture.

**No longer blocked**: officer identity and sign in (`_root/scope.md` feature 7) is built, so Head Office approving a new facility, and the HQ login itself, now have a real identity to build on. `apps/prisons`'s known bug from that build (the dev server's `Credentials`/`AdminCredentials` missing `camelCase`) is already fixed.

**Settled in the first `/architect` pass, don't re ask these when resuming:**
- Only Head Office needs a Cloudflare Tunnel and public hostname. Peers push to it over outbound HTTPS only, no inbound port on any peer, no Cloudflare account needed per facility (unrealistic across 266 real facilities). Police's tunnel *provisioning* code is real and reusable; its "pairing QR" is not a registration protocol, it only encodes a local network URL, so the actual peer registration and sync protocol is being designed fresh.
- A peer's own data is always authoritative; Head Office holds a read only copy. No bidirectional writes, so no conflict resolution is needed.
- Sync scope for v1 is the core Prisoner record only; the other 8 domains (Visits, Requests, Court Productions, Releases, Transfers, Health Events, Property, Programmes) follow later as the same proven pattern repeated, per this project's own Tracer Bullet approach.
- A peer's first sync after pairing backfills every existing prisoner it already has, not just new admissions going forward.
- Registration is a hybrid: a peer self declares its own facility identity, but starts `pending_verification`, not active. A verification code goes by real email to a named Head Office officer; only once they verify does the facility unlock. No real UPS facility ID scheme was ever found in RESEARCH.md, so facility identity fields stay self declared free text; the human approval step is the actual safeguard, not a check against a canonical list.
- Pairing is single use: a short code onboards a facility once, then Head Office issues a separate long lived sync token the peer stores and uses for every sync call after that. Head Office can revoke a peer's token at any time.
- A peer works fully offline indefinitely once paired; sync only happens whenever it has internet, no fixed schedule.
- Head Office is purely an aggregator with no prisoners of its own; every prisoner record it ever holds came from a synced peer.
- Head Office features beyond a normal peer: a facility roster with last synced status, aggregate population and occupancy stats across every paired facility, and cross facility prisoner search.
- The verification email sends from a real transactional email provider, called directly from the Head Office desktop app itself, not routed through `www`.
- Security intent stated directly by the engineer, real and worth holding onto: an unauthenticated or invalid request to Head Office's endpoint should reveal nothing (no distinguishing "wrong token" from "unknown facility" from "revoked"), and a token is scoped to exactly one facility's own push, never a broader capability.

**Settled in the second `/architect` pass (2026-09-18, after real UX feedback on the built officer identity screens), don't re ask these either:**
- **Network topology, corrected**: not per facility discovery. One fixed network per institution type; for Prisons, one Head Office and every facility (plus Head Office itself) sit on that same fixed network, end to end encrypted.
- **First launch onboarding**: a welcome and intro flow (what Pleadli Prisons is), then an explicit choice screen: **Prison Facility** or **Prisons Head Quarters** (not auto detected).
- **Facility path**: proceeds straight into the app as already built (badge only for routine work, the existing Settings based admin credentialed flow for officer management, including its bootstrap first admin path). Explicitly confirmed NOT to gate the whole facility app behind a login, keeping the existing lightweight tier for routine use — this was directly asked and the engineer chose to keep what's already built rather than add a bigger gate.
- **Existing login already covers**: no users yet → create account (legal full name, badge number, password, confirm), then log in; users exist → confirmed as a two step login, badge number first, then a revealed password field, not a passwordless "ID only" login (directly confirmed, since that reading would have been a real security regression).
- **HQ path is gated by an activation code**, a decision genuinely separate from facility pairing: a UUID shaped, 38 character code, generated on the `www` (Pleadli Cloud) side, single use, expiring the same day it is issued, verifiable by the Prisons app fully offline. **Confirmed scheme**: asymmetric signing. `www` holds a private signing key it never distributes; the Prisons app ships with only the matching public key baked in at build time, so a decompiled distributed binary can only verify codes, never forge them. `www`'s own generation is explicitly NOT being built now, placeholder only there; the Prisons side (real input screen, real signature and expiry verification) must genuinely work, backed by a small dev only helper that mints validly signed test codes with a separate dev keypair, so the real verification path is actually exercised without `www`.
- After a valid activation code: a login screen (create the first HQ admin if none exist, else the existing two step login), then Settings, which the engineer described as "locked until the official is added" — read as: Settings requires confirming the responsible officer's identity before the rest of it unlocks, then network permission and reach settings, then Save unlocks full navigation, landing on the Overview with real stats. This interpretation is stated here for the record, not yet directly confirmed word for word; flag it back to the engineer if wrong when resuming.
- **Facility registration dialog fields, refined**: facility name, ID or number, location, **region** (real: Uganda Prisons Service uses a genuine 19 region structure, RESEARCH.md §1), and **the head officer**'s name — added to the previously settled facility identity fields.
- **Sync sophistication for v1, deliberately kept simple**: a full current snapshot pushed whenever Head Office is reachable (an idempotent upsert of everything a peer currently has), not incremental version diffing yet. The engineer described a fuller "torrent like," version aware sync as the real long term direction; that is a named, real Follow-up for a later slice once this simpler loop is proven, not something to design blind before anything syncs at all.
- **Dev only role switcher, confirmed**: a toggle visible only in dev builds that flips the real `hq_config.is_head_office` flag in the local dev database (not a fake, parallel view), so one signed in account can be used to test both the Head Office and facility sides without needing two real installations.
- TanStack DB was raised again as a tooling suggestion; not decided this pass, still likely premature per the same reasoning already recorded for Police (single collection in v1, still beta) — worth a fresh, quick check at write time rather than assuming, not a re litigation of the whole question.

**Shape for the write up**: this spans enough independent decisions (onboarding and activation code; peer registration and pairing; sync protocol v1 plus Head Office management UI) that it should be an **umbrella spec** with child specs, not one flat file. A directory was started at `docs/specs/prisons/0001-head-office-peer-sync-network/` but the actual spec files were not yet written when this session paused to control token usage — resume `/architect head office and peer prison sync network` fresh; it should read this note plus the two settled blocks above and go straight to writing, no re asking.

**Done when:** a Head Office installation and at least one peer installation exist, the real onboarding flow (welcome, role choice, activation code or facility path) works end to end, pairing (including the email verification step) works end to end, and a peer's Prisoner records genuinely reach Head Office, not just its statistics export.
- [x] Design it (spec): [0001](../../specs/prisons/0001-head-office-peer-sync-network/index.md)
- [ ] Build it: `/develop head office and peer prison sync network`
  - [x] Onboarding and activation code: first launch role choice, offline verifiable activation gating the Head Office path, HQ login and Settings gate, satisfies AC-1. code in `apps/prisons/src-tauri/src/domain/activation.rs`, `apps/prisons/src/components/hq-onboarding-gate.tsx`
  - [ ] Peer registration and pairing: Head Office pairing code generation, the new `hq_server.rs` network surface, facility registration, email verification, sync token issuance, satisfies AC-2, AC-4
    - **2026-09-18, information-architecture fix, not the network protocol itself**: the engineer flagged that Settings was just an Officers `DataTable` wearing a Settings label, and Head Office had no dedicated screen of its own beyond a read-only roster stapled onto Overview. Fixed: `Officers` is now its own top-level nav item/route (`/officers`, both roles) instead of living inside Settings; `Facilities` is a new Head Office-only nav item/route (`/facilities`) holding the roster (moved out of `HqOverview`, which now just links to it); `Reports` and `Search` are no longer hidden from Head Office (were wrongly `facilityOnly`, contradicting child 3's own AC-4). Settings is now real configuration only (General: appearance, dev role switch; Network & Sync: a facility's read-only `peer_sync_config` status via new `get_peer_sync_config` command, and Head Office's Cloudflare Tunnel config form via new `get_cloudflare_config`/`save_cloudflare_config` commands, `apps/prisons/src-tauri/src/commands/cloudflare.rs`, ported from Police). None of this adds `/peers/register`, `hq_server.rs`, pairing code generation, or verification — those remain unbuilt, this pass only gave the Head Office side of Settings something real to configure and a real place to eventually show pairing actions once they exist.
  - [ ] Sync protocol and Head Office management: the `facility_id` migration, the snapshot sync endpoint, and Head Office's facility roster, aggregate stats, and cross facility search screens, satisfies AC-3, AC-4
- [ ] Verify it: `/check verify head office and peer prison sync network`
- [ ] Test it: `/test head office and peer prison sync network`
- [ ] Review it (fresh model): `/check review head office and peer prison sync network`
- [ ] Document it: `/document head office and peer prison sync network`

## Deferred
Real, evidenced adoption factors from `docs/prisons/RESEARCH.md` §12, not yet decided as build work. Broader than this one workspace, so not planned here as features, but worth surfacing where they were found:
- **PDPO registration and a documented security policy**: the Data Protection and Privacy Act 2019 requires registering as a data processor and having a documented security policy (s.20 to 29) · needs a decision, organizational not just code
- **NITA-U certification posture**: reportedly government bodies may only use NITA-U certified IT products, unverified with certainty (two direct fetch attempts failed) · needs a decision, worth confirming directly with NITA-U before treating as a hard gate
- **Uganda data residency for `www`**: Cloudflare hosting is a real cross-border transfer point under DPPA s.19; see `docs/scope/www/scope.md` · needs a decision
- **Police, DPP, Prisons interoperability seam**: JLOS's own stated "open standards and APIs for secure data sharing across JLOS institutions" goal is real evidence for eventually connecting the same person/case across the three sibling apps, without building a live sync engine · needs a decision, see `docs/scope/_root/scope.md`
- **Extend the sync network to the other 8 domains** (Visits, Requests, Court Productions, Releases, Transfers, Health Events, Property, Programmes): feature 22's v1 syncs only the core Prisoner record; the same pattern repeats for the rest once it is proven in the field · from spec [prisons/0001](../../specs/prisons/0001-head-office-peer-sync-network/index.md), blocks nothing about feature 22 shipping
- **"Torrent like," version aware incremental sync**: feature 22's v1 is a deliberately simple full snapshot push every time; the engineer named a version aware, partial update model as the real long term direction once full snapshot sync has run long enough to show where it strains · from spec [prisons/0001](../../specs/prisons/0001-head-office-peer-sync-network/index.md)

## Legend
See `docs/scope/index.md` for the shared legend.
