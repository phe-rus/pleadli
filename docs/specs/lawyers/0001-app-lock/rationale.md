# 0001. App lock for Pleadli Lawyers, rationale

## Context

> ⚠️ Premise note: the original topic named three things: app lock, OS authentication, and per matter access control. The engineer's own answers during design narrowed this to one coherent decision (a PIN based app lock, single advocate, backend enforced) and explicitly deferred OS native authentication and per matter access control rather than building them now. This spec covers only what was actually chosen; the deferred pieces are named in Follow up, not designed here.

Pleadli Lawyers is meant to hold an advocate's privileged, confidential work: clients, matters, notes, filed documents, plea bargain material. Today the app has no access gate of any kind. `advocate_profile` is a single row with a name, firm, phone, and email, no password, no session, no lock screen. Anyone who can open the app sees every client and matter immediately. This has been the single most named gap for this application across every audit of the Pleadli ecosystem (`docs/lawyers/PROPOSAL.md`'s not yet built list; the www product pages' security capability note).

A second forcing fact discovered while reading the code: `packages/node-core/src/keys.rs` already retrieves the database's encryption key from the operating system's keystore automatically at launch, with no prompt of any kind. The SQLCipher database is always silently decrypted the instant the process starts. This means an app lock cannot be built by gating the encryption key; there is no natural place in that path to insert a password check. It has to be a separate access gate sitting in front of an already unlocked session, closer in spirit to the persisted sign in gate Prisons uses for its Head Office installation (`docs/specs/_root/0001-officer-identity-sign-in`) than to encryption itself.

That existing spec also set a real precedent worth following closely: Police and Prisons share a roster of named officers with Argon2 password hashing, while DPP was deliberately kept to a single row profile with no password at all, because DPP is a single prosecutor tool by design. During this design the engineer chose the same shape for Lawyers as DPP, not as Police or Prisons: Lawyers stays single advocate per install for this pass. Per matter access control, which only means something once more than one named person can open the same install, is explicitly out of scope here as a result, not an oversight.

A third constraint surfaced only while writing this spec, after the design conversation had already settled on relocking immediately when the operating system session suspends or locks. Tauri has no single, portable event across Windows, macOS, and Linux that reliably means "the operating system just suspended or locked." A real per operating system implementation (Windows session notifications, macOS NSWorkspace screen lock notifications, Linux logind over D Bus) is three separate pieces of native code, a large addition for a first version of this feature. The practical, low effort signal available inside the webview itself is a window focus loss event. A brief focus loss (switching to read a PDF, a quick alt tab) is not the same thing as a genuine walk away, so a naive "relock the instant focus is lost" rule would be constantly, needlessly annoying. The resolution carried into this spec's design (see Decision) is a focus loss held for a short grace period, treated as a practical approximation of the engineer's stated intent rather than a guaranteed native hook, with the honest limitation recorded in Consequences and a real per operating system implementation left as Follow up.

No compliance framework is formally in force on this project yet, but privileged legal material is inherently sensitive, so every rule in this spec is treated as load bearing regardless.

## Options considered

### Option 1: App level PIN, single advocate, backend enforced (chosen)

A PIN or short passphrase set inside the app, hashed with Argon2 (the same crate already used in Police and Prisons), checked on unlock. A single `app_lock` row, no roster. Every existing domain route sits behind one shared middleware check in the app's one axum router; only the lock management routes themselves and the existing `/system/status` stay reachable while locked.

**Pros**:
- No new native dependency; works identically on every operating system Tauri targets.
- Reuses Argon2 hashing already proven correct in this codebase (Police and Prisons' officer passwords), rather than inventing new cryptography. The escalating cooldown itself is new to this spec; Prisons' own login lockout is a fixed threshold and duration, not a doubling delay, so this is not reused precedent, only the hashing underneath it is.
- The one axum router this app already funnels every request through (`api/mod.rs`) makes backend enforcement a single middleware layer, not a change scattered across 25 or more existing handlers.

**Cons**:
- A PIN can still be guessed given unlimited time and no cooldown; this is mitigated, not eliminated, by the escalating delay.
- Adds one more secret (however short) for the advocate to remember, with no vendor side recovery beyond the one time recovery code.

### Option 2: Operating system native authentication only (Windows Hello, Touch ID, polkit)

Defer entirely to the operating system's own authentication, so there is no Pleadli managed secret to set or forget.

**Pros**:
- Nothing new for the advocate to remember; reuses whatever the operating system already protects the machine with.
- Potentially stronger per attempt (biometric hardware, TPM backed) than a short PIN.

**Cons**:
- No single Tauri plugin covers all three desktop platforms today; this is three separate native integrations, not one feature.
- Fails ungracefully on a machine with no biometric hardware or no operating system lock configured at all, which this project cannot assume.
- Rejected directly by the engineer during design in favour of an app level PIN.

### Option 3: Frontend only route guard, no backend enforcement

A React route guard hides the application behind a lock screen component; the Rust command layer stays callable regardless of lock state.

**Pros**:
- Least code; no middleware, no shared runtime state to manage.

**Cons**:
- Not a real security boundary. Anyone able to call `invoke()` directly, including through the webview's own developer tools, bypasses it entirely. Rejected directly by the engineer during design.

### Option 4: Full multi advocate roster with Argon2 login (the Police or Prisons pattern)

Give Lawyers its own `officers` style table, real named sign in, and a permissions model that could support genuine per matter access control between different advocates sharing one install.

**Pros**:
- The only option that makes "per matter access control" a real, meaningful feature rather than a name with nothing behind it.
- Directly reuses the pattern `docs/specs/_root/0001-officer-identity-sign-in` already proved out for Police and Prisons.

**Cons**:
- Solves a problem this project does not yet have: Lawyers' own data model (`advocate_profile`) is architecturally single user today, and the engineer confirmed that stays true for this pass. Building a roster and access control model now would be speculative.
- Materially larger build: a login screen, session model, and access checks threaded through every matter, client, document, and note query.

## Rationale

Option 1 was chosen because it matches the constraint the engineer actually confirmed (single advocate for this pass) while still closing the real, repeatedly named gap: an unprotected desktop app holding privileged material. Option 4 would have been the more complete answer to the original three part topic, but it solves for a user model (a firm with several advocates sharing one install) that does not exist in this codebase yet and that the engineer explicitly chose not to build now; doing so would be exactly the kind of design for a hypothetical this workflow warns against. Option 2 was ruled out directly, both for the real platform fragmentation it would introduce and because the engineer preferred a mechanism that works the same everywhere. Option 3 was ruled out because a lock that only hides the UI is not a real security control for this data.

The backend enforced approach is only cheap to build here because of a specific, favourable fact about this codebase: `api/mod.rs`'s `router()` function is the one place every domain route in this application already passes through. That is not true of every codebase, and made a real security boundary and a UI only shortcut cost almost the same amount of code, which is why the more honest option was also the practical one.
