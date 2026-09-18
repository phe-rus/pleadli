# 0001. Head Office and peer prison sync network

**Date**: 2026-09-18
**Status**: In Progress

## Summary

Today every Pleadli Prisons installation is its own island: one facility, one local database, no awareness of any other facility. This spec turns that into a real network with one aggregator (Head Office) and many facility installations (peers) that push their prisoner records up to it. A peer's own data stays authoritative and offline first; Head Office only ever holds a read only copy assembled from what peers send it. Getting a facility onto the network is a two step, human checked process (a short pairing code, then an email verified approval), not an automatic handshake, because there is no canonical, checkable list of real Uganda prison facilities to validate against.

## Structure

This spans three decisions that can each be built and understood on their own, so they are split into child specs. Build them in the order listed, each one a complete working slice before the next starts (see Build plan).

- [0001-onboarding-and-activation-code.md](0001-onboarding-and-activation-code.md): the first launch role choice screen (Prison Facility or Prisons Head Quarters) and the offline verifiable activation code that gates the Head Office path. Supports AC-1.
- [0002-peer-registration-and-pairing.md](0002-peer-registration-and-pairing.md): how a facility installation finds and registers with Head Office, the human email verification step, and how the facility receives its long lived sync credential. Supports AC-2, AC-4.
- [0003-sync-protocol-and-head-office-management.md](0003-sync-protocol-and-head-office-management.md): the v1 snapshot push protocol for Prisoner records, and Head Office's own screens (facility roster, aggregate stats, cross facility search). Supports AC-3, AC-4.

**Cross child contract**, shared by all three:

- **One shared binary and schema.** A peer installation and the Head Office installation run the exact same compiled app and the exact same migrations. Only data tells them apart: the `hq_config.is_head_office` flag (already added by spec `_root/0001-officer-identity-sign-in`) and, after child 2 is built, whether any row exists in the new `facilities` table. Nothing here is compiled in or out per role.
- **Officer identity already exists and is reused, not reinvented.** `officers` and the `hq_config`/`hq_session` tables (from spec `_root/0001-officer-identity-sign-in`, code in `apps/prisons/src-tauri/src/domain/officers.rs` and `session.rs`) already gate the Head Office sign in. Every Head Office management action added here (generate a pairing code, verify a facility, revoke a facility) is a Tauri command that requires an active HQ session; none of it is exposed on the public network facing server.
- **One uniform failure contract (AC-4), pinned exactly.** Every failure on `/peers/register` or `/sync/prisoners` (defined in child 2 and child 3; a third endpoint, a separate status check, was cut after cross check, see child 2) returns the same response: HTTP 401 with body `{"error": "invalid"}`, whether the problem is a wrong secret, an unknown facility, or a revoked one. The one deliberate exception: a *valid* sync token belonging to a facility that is not yet verified gets a distinct, non error response (child 3's `pending_verification` status), because that caller has already proven it holds a real credential, telling it "not yet approved" reveals nothing an attacker without the credential could use. None of these endpoints ever trust a client supplied facility identifier; the facility is always resolved server side from the credential presented.
- **A new, always on, small HTTP surface, not the existing dev only one.** `apps/prisons/src-tauri/src/transport/dev_server.rs` is a local only, debug build only fallback (same as Police's and DPP's). The two network facing endpoints above need a small, restricted, release build surface reachable through Head Office's Cloudflare Tunnel, the same shape as Police's own `transport/remote_server.rs`. Child 2 introduces this as a new `transport/hq_server.rs`, bound to a fixed local port (`47923`, one above the existing dev server's `47922`), carrying only those two routes with a raised body size limit and a per IP rate limit, nothing else from the app's full API.

## Requirements

**User stories**:
- As a Head Office officer, I want to activate my installation as Head Office and see every paired facility's status, so that I can oversee the whole prison estate from one place.
- As a facility officer, I want to pair my installation with Head Office in a few minutes without any manual network setup, so that my facility's records start reaching Head Office without becoming a side project.
- As a Head Office officer, I want a facility's identity to be checked by a real person before it can push data, so that a rogue or mistaken registration cannot pollute the national picture.

**Acceptance criteria** (the umbrella level contract; each child's own AC list is the detailed, buildable version of these):
- **AC-1**: An officer can complete the full Head Office onboarding, welcome, role choice, activation code, HQ login, Settings, and land on a working Overview, with no network call except the one time activation code check.
- **AC-2**: A facility officer can pair a fresh installation with Head Office (enter the pairing code, fill in facility details, wait for a Head Office officer's email verification) and receive a working sync credential, with no hostname, port, or certificate ever typed by hand.
- **AC-3**: Once paired, a facility's entire existing Prisoner roster reaches Head Office on the first sync (not just new admissions), and every prisoner Head Office ever holds is correctly attributed to exactly one facility.
- **AC-4**: A wrong, expired, or revoked credential presented to any Head Office facing endpoint is rejected with one generic, indistinguishable failure, and no request can ever write to or read a facility other than the one its own credential belongs to.

## Decision

**Chosen option**: a one way, push based, full snapshot sync from every peer to a single Head Office aggregator, with human gated onboarding (pairing code plus email verified approval) rather than automatic discovery or a canonical facility registry.

**Implementation skills**: `cloudflare` (`anthropic/skills`, `.claude/skills/cloudflare/`) for the Tunnel provisioning Head Office needs · `cloudflare-email-service` (`anthropic/skills`, `.claude/skills/cloudflare-email-service/`) for the verification email, see child 2's Configuration required for why this is the recommended pick over an unrelated provider.

## Feature design

This umbrella section covers only what is shared; each child's own `## Feature design` has the full data model, API surface, and security model for its own piece.

**Shared data flow**: a peer's officer registers once (child 2) and gets back a sync token; from then on the peer periodically pushes its current Prisoner snapshot (child 3) to the one Head Office endpoint that token is scoped to. Head Office never calls a peer; peers never call each other. Head Office's own Overview, roster, and search screens (child 3) are the existing Prisons screens reused, filtered by the `facility_id` column child 3 adds, not new UI written from scratch.

**Shared security model**: two independent trust boundaries, kept separate on purpose.
1. **Officer to Head Office app** (already built): badge number and password, gates who can manage facilities from inside the Head Office installation.
2. **Facility installation to Head Office server** (built here): opaque bearer credentials (pairing secret, then sync token), gates what an unattended machine can push over the network. A compromised sync token can only ever push prisoner data for the one facility it was issued to; it cannot read, and it cannot act as any other facility.

## Build plan

Ordered so each numbered step leaves a genuinely working, demonstrable slice, per this project's Tracer Bullet approach: a thin thread through the whole system first, thickened afterward, rather than building every migration first and wiring it all up at the end.

1. **(Built)** Build child 1 end to end: role choice screen, activation code entry and offline verification, HQ login reusing the existing officer/session code, Settings gate, landing on Overview. Satisfies **AC-1**. Code in `apps/prisons/src-tauri/src/domain/activation.rs`, `apps/prisons/src-tauri/migrations/0016_hq_role_and_activation.sql`, `apps/prisons/src/components/hq-onboarding-gate.tsx`, `apps/prisons/src/features/activation/`.
2. Build child 2 end to end: Head Office's pairing code generator, the new `hq_server.rs` network surface with `/peers/register`, the facility registration dialog on the peer side, the email verification step and the Head Office pending list screen, sync token issuance (returned immediately at registration but inert until verified, see child 2's cross check revision). Satisfies **AC-2**, the credential half of **AC-4**.
3. Build child 3 end to end: the `facility_id` migration, `/sync/prisoners`, the peer's background and manual sync trigger, and Head Office's facility roster, aggregate stats, and cross facility search screens. Satisfies **AC-3**, the remaining half of **AC-4**.

## Consequences

**Positive**:
- One aggregator gives Head Office a genuine national picture without any facility losing its own offline first operation.
- The human email verification step is a real safeguard against a mistaken or malicious registration, without needing a canonical facility ID scheme that does not exist yet.
- Reusing officer identity, Cloudflare Tunnel provisioning, and the existing Prisoner schema keeps this from becoming a second, parallel system.

**Negative / tradeoffs**:
- Head Office is a single point of aggregation: if it is offline for an extended period, no facility's data reaches the national picture during that time, though every facility keeps working locally regardless.
- v1's full snapshot push means every sync sends every prisoner a facility has, not just what changed; this is fine at today's scale (single digit thousands of prisoners per facility, comfortably inside the raised body size limit child 3 sets) but will not scale forever, see Follow up.
- The activation code's offline verification cannot itself detect reuse across two different machines; single use for it depends on discipline in a system (`www`'s code generation) that is explicitly not being built yet.
- The activation code's expiry check trusts this machine's own system clock, which its operator controls; setting the clock back can extend an otherwise expired code's life. Child 1's monotonic `activated_at` guard raises the bar (a rollback cannot be replayed against an already activated install) but does not close this for a first, never yet activated install. Accepted as a known limitation, not solved here.

**Neutral**:
- Three new database tables (`facilities`, `hq_pairing_codes`, plus the `facility_id` column on `prisoners`) exist on every installation, peer or Head Office; they simply stay empty on a peer.

## Follow-up

- [ ] If a facility's roster grows large enough to threaten `hq_server.rs`'s raised body size limit, split `/sync/prisoners` into chunked requests with a run identifier, rather than raising the limit indefinitely. Not needed at today's scale (a few thousand prisoners per facility).
- [ ] Extend sync to the other 8 domains (Visits, Requests, Court Productions, Releases, Transfers, Health Events, Property, Programmes) once this core Prisoner sync is proven in the field, per the same pattern.
- [ ] Design the "torrent like," version aware incremental sync the engineer named as the real long term direction, once full snapshot sync has been running long enough to know where it actually strains.
- [ ] `www`'s own activation code generation (admin screen, private key custody, single use enforcement) is a real, separate piece of work this spec assumes but does not build.
- [ ] The `cloudflare` and `cloudflare-email-service` skills are installed and directly relevant to this feature but are not yet referenced anywhere in this project (root `AGENTS.md` does not exist, only `CLAUDE.md`, which has no `## Agent skills` section). Once this is built, `/audit` or `/sync` should add pointers to them.
- [ ] The wider Police, DPP, Courts, Lawyers cross institution topology the engineer described is a real future direction but out of scope here; see `docs/scope/_root/scope.md`'s interoperability seam item.

## Rationale

Reasoning, alternatives considered, and supporting detail: see [rationale.md](rationale.md).
