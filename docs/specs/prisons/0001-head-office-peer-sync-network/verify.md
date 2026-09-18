# Verify: head office and peer prison sync network · spec prisons/0001 · updated 2026-09-18

_Steps derived from spec prisons/0001's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._
_Only child 1 (onboarding and activation code) is built so far; children 2 and 3 have no steps here yet._

## UI / manual

- [ ] Fresh install, `hq_config.role` is `NULL` → launch the app → see the welcome and role choice screen (Prison Facility / Prisons Head Quarters), neither auto selected → AC-1 (child 1)
- [ ] Choose Prison Facility → app proceeds exactly as before (badge only routine work, existing officer management) → relaunch the app → role choice screen does not reappear → AC-1, AC-2 (child 1)
- [ ] Reset `hq_config.role` to `NULL` → choose Prisons Head Quarters → see the activation code entry screen (not persisted yet: relaunching before completing activation shows the role choice screen again) → AC-1 (child 1)
- [ ] Paste a validly signed, unexpired activation code (dev builds: mint one via the dev helper) → accepted, proceeds to HQ login (bootstrap first admin if none exist) → AC-3 (child 1)
- [ ] Paste a garbage string, or an expired but validly signed code → same generic "Invalid or expired activation code" rejection either way, `hq_config` untouched → AC-4 (child 1)
- [ ] Dev builds only: the dev role toggle flips `is_head_office` and `role` together and never lets them disagree → AC-6 (child 1)

## Commands

- [ ] `cargo test --lib domain::activation` → 5 tests pass (valid code activates, tampered signature rejected, expired rejected, garbage rejected, facility/head_office choose_role asymmetry) → AC-3, AC-4 (child 1)
- [ ] `bun run check` (apps/prisons) → typechecks clean → all of child 1

## Acceptance-criteria coverage

- AC-1 (child 1) … covered by the first three UI steps
- AC-2 (child 1) … covered by the Facility path step
- AC-3 (child 1) … covered by the valid activation step and the cargo test
- AC-4 (child 1) … covered by the rejection step and the cargo test
- AC-5 (child 1) … **not yet fully covered**: the spec's Settings gate sequence ("confirm officer identity, then network permission and reach settings, then Save unlocks full navigation") depends on child 2's Cloudflare Tunnel configuration UI, not yet built. Today, after a valid activation and HQ login, the officer lands on the existing Overview directly through the app's current routing, with no interstitial Settings gate. Re-verify this row once child 2 ships.
- AC-6 (child 1) … covered by the dev toggle step
