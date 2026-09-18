# 0001. Officer identity and sign in: rationale

## Context

None of the three Pleadli desktop apps (Police, DPP, Prisons) have a real, verifiable officer identity today. Police comes closest: it has a working `Officer` entity (badge number, name, role, an Argon2 hashed password) and a `login` function, but this is wired only to the restricted remote and mobile server, never to the main desktop app itself. The main desktop app instead uses a much lighter pattern, seen in its shift check in feature: an officer types a badge number, no password, no session, which suits a shared station terminal multiple officers walk up to across a shift. DPP and Prisons have neither pattern at all.

This decision was triggered directly by two other decisions that both discovered they needed a real identity model and could not proceed without one:

- Prisons' new audit trail item (`docs/scope/prisons/scope.md` feature 19) needs to record who changed a record, and currently has nothing to attribute that to beyond a free text name.
- Prisons' new Head Office and peer prison sync network (`docs/scope/prisons/scope.md` feature 22) needs a Head Office officer to approve a new peer facility before it can sync real prisoner data in. The engineer explicitly rejected recording that approval as a free text name, on the grounds that accountability for a decision this sensitive should rest on something more real than whoever typed a name into a box.

DPP is a different case entirely: it is a single prosecutor installation by deliberate, already recorded product decision (`docs/dpp/PRODUCT.md`, Organizational responsibility: "one prosecutor, never a team or office deployment... no multi-user roster"). Whatever gets designed here must not force DPP into machinery it was explicitly decided not to need.

The forces at play: reuse versus reinvention (Police already has proven password handling sitting right there), friction versus security (a shared station terminal needs low friction for routine work, but a security sensitive gate like Head Office approval needs more than a badge number), and genuine product difference across the three apps (Police and Prisons are shared, multi officer terminals; DPP is not). The consequence of not deciding this is that feature 19 and feature 22 both stay blocked, and any decision made only inside one of them would likely diverge from whatever the other one picks, or from what Police already has.

## Options considered

### Option 1: Reuse and extend Police's existing Officer and Argon2 pattern (recommended)

Port Police's already built, already correct `Officer` shape and Argon2 password hashing into Prisons as its own local table, add a persistent session on top for Head Office, and give DPP a much lighter singleton profile since it has no roster to protect.

**Pros**:
- Reuses proven, already correct password handling instead of writing new authentication code
- Same officer shape across Police and Prisons keeps the pattern predictable for anyone who has worked in either app
- No new external dependency beyond the `argon2` crate, already a dependency elsewhere in this monorepo

**Cons**:
- Introduces a real bootstrap problem a remote access only feature never had to solve: who creates the very first admin on a brand new install
- DPP still needs its own separate, much lighter shape, so this is not one identical pattern everywhere, just one proven building block reused twice

### Option 2: Keep everything at the lightweight, badge number only tier everywhere, including Head Office approval

No password, no persistent session, anywhere, ever. Every action, routine or sensitive, is attributed the same way check in already works today.

**Pros**:
- Zero new dependency, zero bootstrap problem
- Matches the one pattern that already works across the whole platform today, no new code at all

**Cons**:
- A security critical action, approving a new facility onto the peer sync network, would rest on nothing more than typing a badge number, which anyone standing at the shared terminal could do
- Does not meet the real security posture the engineer asked for directly when this need first came up

### Option 3: Extract a shared authentication package all three apps import

A new shared Rust crate (or a workspace package, matching the pattern of `packages/ui`) holding the Officer and session logic, so Police, DPP, and Prisons all call the same code instead of each app owning its own copy.

**Pros**:
- One place to fix a bug or change password handling, instead of three
- Feels consistent with how shared UI and forms logic already work in this monorepo

**Cons**:
- These are three fully independent offline SQLite databases with no shared runtime; a shared crate still needs its own local table replicated inside each app's own database, so the only real saving is not repeating source code, not less data or schema to manage
- Over engineers a solution for DPP, which by explicit product decision does not need most of this at all
- Introduces a new workspace crate before there is a second real consumer with matching needs to justify it; Prisons and DPP need meaningfully different shapes, not the exact same one

## Rationale

Police already solved the hard part of this problem correctly: Argon2 password hashing and a working `login` function already exist and are proven in production use, just scoped narrowly to the remote and mobile server. Reinventing that for Prisons would repeat work that is already done and already correct, and building password handling from scratch is one of the more dangerous places to introduce a subtle security bug (a known failure pattern: authentication is extremely hard to get right, and a proven implementation sitting in the same monorepo removes the temptation to rush a second one).

Option 2 was rejected because the actual trigger for this decision, an engineer wanting real accountability for who approves a new facility onto a network holding real prisoner data, is not met by a badge number alone; a badge number identifies who is claiming to act, not who is actually authorized to. Keeping everything at that tier would answer the audit trail's low stakes need well, but would leave the higher stakes need (Head Office approval) exactly where it started.

Option 3 was rejected because these three apps are independent offline installations with independent local databases: a shared crate would not reduce how much schema or data each app manages, only how much source text is typed twice, and DPP's real shape (a single prosecutor, no roster) is different enough from Police and Prisons that forcing one identical package onto all three would either bloat DPP with unused roster machinery or force Police and Prisons to route around a package built for DPP's simpler case. The two tier, two shape design in Option 1 reflects a genuine, already established product difference rather than smoothing over one.

## References

No references section: the engineer chose "No references, keep it clean" during the design conversation. This reasoning rests entirely on this project's own existing code (Police's `officers.rs`, `check-in-dialog.tsx`) and its own recorded product decisions (`docs/dpp/PRODUCT.md`), not on any external source.

## Cross check (2026-09-18)

The first draft of this spec assumed officer management could gate on "the caller is signed in as admin," modeled loosely on what the Cons of Option 1 called a real but manageable bootstrap problem. A cross check on a different model, verified directly against Police's actual code before accepting any of it, found this was worse than a bootstrap gap: Police's Tauri commands have no caller identity mechanism at all to check, a separate `hq_sign_in` step had no binding to an actual password check and was directly callable without one, and a brand new Head Office install with zero officers had no way to ever sign in, not merely an undesigned one. Verified findings led to `index.md`'s per action admin credential check (fresh badge and password supplied with every sensitive call, not an assumed session), which works identically on a peer or a Head Office installation, something the original session only design could not do. Two smaller, also verified findings, a race condition in the last admin guard and a `Debug` derive that would print a password in a log or panic, are fixed in the same revision. This did not change the chosen option (Option 1 still stands, reusing Police's Argon2 approach); it changed how the admin gate and the session are actually implemented.
