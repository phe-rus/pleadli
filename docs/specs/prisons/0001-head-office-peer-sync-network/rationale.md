# Rationale: Head Office and peer prison sync network

## Context

`docs/prisons/PRODUCT.md` used to state plainly that Pleadli Prisons is "not a national UPS system," one installation per facility, no cross facility awareness. That line was written before anyone had used the app for real. On 2026-09-18, after testing the desktop app, the engineer reversed it directly: a single installation model is too limited for a service that runs 266 real custodial units under one national command structure (`docs/prisons/research/findings.md` §1). Uganda Prisons Service already organises itself into 19 regions with a real headquarters function (the Commissioner General's office, per `docs/prisons/research/findings.md` §1's governance section); a Pleadli product that cannot mirror that basic shape stops short of what the institution actually needs.

The forces at play: facilities operate with unreliable, intermittent internet, so anything built here must keep working exactly as it does today when Head Office is unreachable. There is no existing canonical facility ID scheme for Uganda's 266 (or roughly 270, depending on source) prisons, so a new facility cannot be validated against an external list, only against a person's judgement. And unlike Police's own remote access work, this is genuinely a many to one topology (many facilities, one Head Office), not a one to one pairing between an officer's phone and their own station.

Two prior `/architect` passes on this same topic (2026-09-18, recorded in `docs/scope/prisons/scope.md`) already settled the load bearing shape: peers keep full offline autonomy and are always the authoritative source; Head Office is a pure aggregator with no prisoners of its own; onboarding is pairing code then human email verification, not automatic; v1 sync scope is the core Prisoner record only, full snapshot push, not incremental diffing. This document does not re litigate those; it records the reasoning behind how they were turned into an actual buildable design, including one correction made while writing this spec (the activation code's exact format, below).

## Options considered

### For the overall sync direction

**Option 1: One way push from peer to Head Office (chosen)**. Every fact starts at a facility; Head Office only ever receives. No conflict resolution is needed because there is exactly one writer per record.
- Pros: matches "a peer's own data is always authoritative" exactly; simplest possible consistency model; a compromised or buggy Head Office can never corrupt a facility's own data.
- Cons: Head Office cannot originate or correct a record on a peer's behalf; any fix has to happen at the facility and re sync.

**Option 2: Bidirectional sync with conflict resolution**. Head Office could also edit and push changes back down to facilities.
- Pros: would let Head Office correct data centrally.
- Cons: needs real conflict resolution (last write wins, vector clocks, or manual merge), a class of bug this project has no evidence it needs yet, and it was explicitly ruled out by the engineer ("A peer's own data is always authoritative; Head Office holds a read only copy. No bidirectional writes, so no conflict resolution is needed").

**Option 3: A shared central database, no local database per facility**. Every facility could just be a thin client against one Head Office hosted database.
- Pros: no sync protocol to build at all.
- Cons: destroys the offline first property that is this whole product's reason to exist; a facility with no internet for a week would be unable to record an admission, which is not acceptable for a custody system.

### For peer onboarding and trust

**Option 1: Human gated, pairing code plus email verification (chosen)**. Described above.
- Pros: real safeguard given no canonical facility list exists; matches how a real institution would actually onboard a new office, a person vouches for it.
- Cons: slower than automatic onboarding; depends on a Head Office officer actually checking their email in reasonable time.

**Option 2: Automatic acceptance of any registration matching a facility name pattern**.
- Pros: instant, no human step.
- Cons: no real check at all; a typo'd or malicious registration would be indistinguishable from a real one. Not defensible for a justice system record.

### For sync sophistication in v1

**Option 1: Full current snapshot push, idempotent upsert, no diffing (chosen)**.
- Pros: trivially correct, easy to reason about, and explicitly the engineer's own instruction ("deliberately kept simple ... not incremental version diffing yet").
- Cons: wastes bandwidth resending unchanged records; will not scale indefinitely, already named as a real Follow up.

**Option 2: Version aware incremental sync from day one** (the "torrent like" model the engineer named as the real long term direction).
- Pros: efficient, scales further.
- Cons: meaningfully harder to get right (needs per record versioning, partial failure handling, resumable transfer) and would be designing that complexity before a single sync has ever run for real. Deferred on purpose.

## Rationale

Option 1 in each group was chosen because each alternative either reintroduces a problem this product was built to avoid (losing offline autonomy, Option 3 above) or adds real complexity the engineer explicitly said is not wanted yet (bidirectional writes, incremental diffing). The one way push model is also the only one of the three that keeps the security story simple: because Head Office never writes back, a facility's sync token only ever needs to grant "push your own snapshot," never "read or modify anything," which is exactly the scoped down capability the engineer asked for directly (see `docs/scope/prisons/scope.md`'s security intent line).

**A correction made while writing this spec: the activation code's format.** The two prior passes described the Head Office activation code as "a UUID shaped, 38 character code" that is verified fully offline against a signature from a private key `www` never distributes. Those two properties cannot both hold at full strength: a genuine, unforgeable asymmetric signature (the whole reason to use a public key instead of a shared secret) needs on the order of 90 to 100 characters once safely encoded as text, not 38; a 38 character string simply does not carry enough information to hold one. Shrinking the signature to fit would mean either a much weaker, more guessable scheme, or giving up genuine offline verifiability, either of which undoes the property this decision exists to provide. Child spec `0001-onboarding-and-activation-code.md` keeps every other part of the settled decision (asymmetric signing, the public key baked in at build time, the dev only test signer, same day expiry) and corrects only the format: the code is a longer token delivered by copy and paste, not something an officer retypes character by character, which is both the only way to keep the security property genuine and, in practice, no harder to use than a long activation key already is for many real products. This is flagged here rather than silently changed, per this skill's own instruction to say clearly when a stated direction runs into a real constraint.

**Head Office's own network exposure.** Reusing Police's Cloudflare Tunnel provisioning code (`apps/police/src-tauri/src/domain/cloudflare_tunnel.rs`) rather than writing a new provisioning flow was an easy call: it is already working code in this monorepo, doing exactly what Head Office needs (create or reuse a tunnel, point a hostname at a local port), and the engineer already flagged it as reusable. What is genuinely new is the small, restricted HTTP surface behind that tunnel (`hq_server.rs` in child 2), because Police's own restricted surface (`remote_server.rs`) is shaped for an officer's phone talking to their own station, not for a fleet of unattended facility installations pushing to one aggregator; the routes, the auth model, and the failure contract all differ enough to warrant a new, small file rather than bending the existing one.

**Choosing a transactional email provider.** The engineer's instruction was specific: the verification email must be sent directly from the Head Office desktop app itself, to a provider, not routed through `www`. This project already has a real, working relationship with Cloudflare (Workers and D1 for `www`, Cloudflare Tunnel for both Police and now Prisons), and an installed `cloudflare-email-service` skill exists for exactly this kind of transactional send from any app over a plain REST call, which matches how `cloudflare_tunnel.rs` already talks to Cloudflare's API (a bearer token over `reqwest`). Recommending it over an unrelated provider like Postmark or SendGrid follows this skill's own rule to build on what a project already uses rather than introduce a new external relationship for one email. The runner up, a dedicated transactional email API such as Postmark, remains a reasonable fallback if the Cloudflare product turns out not to fit a plain server to server call from a native Rust app; child 2's Configuration required section names both.

**On TanStack DB.** Raised again in the second `/architect` pass as a tooling suggestion, not decided. It stays out of this design: v1 sync is a single background push and a handful of read only Head Office screens (a facility list, some aggregate counts), none of which needs a reactive, versioned client side collection. The same reasoning already recorded for Police (single collection, still beta) applies here with even less pressure, since Prisons has less client side state to manage than Police's remote access surface did. Worth checking again if the deferred incremental sync work ever needs genuine client side reactivity across many collections.

## Revision after cross check

An independent model cross checked the first draft of this spec and found eleven real gaps (missing wire formats, an unproducible value, a summary that contradicted its own invariants, a struct that could not actually be deserialized, and more), plus one worthwhile simplification: the original draft issued two separate credentials, a short lived "registration token" used only to poll a status endpoint, then a long lived "sync token" handed over once verification completed. That second handover had a real hole: Head Office only ever stored the sync token's hash, so nothing could produce the plaintext at the moment it was supposedly returned. Collapsing this into one credential, issued immediately at registration but inert until Head Office verifies the facility, removes that hole entirely along with the whole status polling endpoint, at the cost of a facility holding a token slightly before it is useful, which was already true of the registration token it replaces. All eleven gaps and this simplification are applied directly in the three child specs; this paragraph exists so the change is visible in the decision record rather than silently folded into a "first draft."

## Supporting facts used in this design

- Uganda Prisons Service's own regional structure (used verbatim as the enum of valid `region` values in the facility registration dialog): Southern, Northern, Kigezi, Mid Central, Central, Kampala Extra, Eastern, North Central, Mid Western, Mid Northern, Mid Eastern, South Western, East Central, North Eastern, Iganga, Western, North Western, Kooki, South Eastern (`docs/prisons/research/findings.md` §1, sourced from UPS's own January 2024 statistics report).
- UPS runs 266 (one source: 270) individual custodial units nationally, the real scale this design must not choke on even at full national rollout (`docs/prisons/research/findings.md` §1).
