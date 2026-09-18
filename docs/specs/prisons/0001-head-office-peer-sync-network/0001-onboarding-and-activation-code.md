# First launch role choice and Head Office activation code

## Summary

The first time anyone opens Pleadli Prisons, it now asks a real question it never used to: is this a Prison Facility, or is this Prisons Head Quarters. Choosing Facility drops straight into the app exactly as it works today. Choosing Head Quarters asks for a one time activation code first, a long text string only Pleadli Cloud can produce, checked entirely on this machine with no internet connection needed. Only after that code checks out does the normal officer sign in and Settings flow begin.

## Requirements

**User stories**:
- As a new officer opening the app for the first time, I want to be asked plainly whether this machine is a facility or Head Office, so that I do not have to guess or find a hidden setting.
- As a Head Office officer, I want to prove I hold a real activation code before I can touch anything Head Office specific, so that a random installation cannot declare itself Head Office.

**Acceptance criteria**:
- **AC-1**: On an installation where `hq_config.role` is `NULL` (never chosen), the app shows a welcome and intro screen, then an explicit Prison Facility or Prisons Head Quarters choice; neither is auto detected. Choosing Prison Facility sets `hq_config.role = 'facility'` immediately, so the choice screen never reappears on a later launch.
- **AC-2**: Choosing Prison Facility proceeds exactly as the app behaves today (badge only for routine work, the existing Settings based admin credentialed officer management, including its bootstrap first admin path); nothing in this spec changes facility behaviour.
- **AC-3**: Choosing Prisons Head Quarters shows an activation code entry screen; the app accepts a pasted code, checks its signature against the public key baked into this build and checks it has not expired, entirely offline, and only a valid, unexpired code proceeds.
- **AC-4**: An invalid signature or an expired code shows one plain rejection message with no detail about which check failed, and does not set `hq_config.is_head_office` or `hq_config.role`.
- **AC-5**: After a valid activation code, the officer sees a login screen (create the first HQ admin if none exists yet, otherwise the existing two step badge number then password login); after logging in, Settings requires confirming the responsible officer's identity before the rest of Settings unlocks, then network permission and reach settings (the Head Office Cloudflare Tunnel configuration also introduced in child 2), then Save unlocks full navigation, landing on the Overview with real stats.
- **AC-6**: A dev build only toggle exists that flips the real `hq_config.is_head_office` flag (and the matching `hq_config.role`) directly in the local dev database, letting one installation be tested as both a facility and Head Office without a second real activation code.

## Decision

**Chosen option**: an asymmetrically signed, offline verifiable activation token, delivered as a copy and paste string rather than a short hand typed code (see rationale.md's correction note for why the format changed from the originally described 38 character code).

## Feature design

**Data model sketch**:
- `hq_config` (existing table, from `_root/0001-officer-identity-sign-in`): add two columns. `role TEXT NULL CHECK (role IN ('facility', 'head_office'))`, `NULL` until the first launch choice is made, is what actually gates AC-1 (closes the cross check gap where "no prior role choice recorded" named no real column). `activated_at INTEGER NULL`, set once when a valid activation code is accepted. `is_head_office` already exists and is what this flow ultimately sets to `1`, alongside `role = 'head_office'`.
- No table stores issued activation codes. Verification is entirely stateless and offline: the token itself carries everything needed to check it (see Key invariants).

**State transitions**:
First launch, `hq_config.role IS NULL` → role choice screen → **Facility**: sets `role = 'facility'`, proceeds to the existing flow, unchanged → or **Head Quarters**: activation code screen → valid code sets `is_head_office = 1`, `role = 'head_office'`, `activated_at = now` → HQ login → Settings gate → Overview.

**API surface** (Tauri commands, all local, no network call in this child):
| Command | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|
| `choose_role` | `role: 'facility' \| 'head_office'` | sets `hq_config.role`; `'facility'` is immediate, `'head_office'` only stages the choice pending a valid activation code | none | |
| `verify_activation_code` | `token: string` | `{ valid: bool }`, and on success sets `hq_config.is_head_office = true`, `hq_config.role = 'head_office'`, `hq_config.activated_at` | none (this is what establishes HQ identity) | generic `INVALID_ACTIVATION_CODE` for any failure (bad signature, expired, or the monotonic clock guard), never distinguished |
| `get_hq_config` | none | existing, extended with `role` and `activated_at` | none | |
| `set_dev_role` (dev builds only) | `is_head_office: bool` | updates `hq_config.is_head_office` and the matching `hq_config.role` together, so the two columns never disagree | none, `#[cfg(debug_assertions)]` gated at compile time, not just hidden in the UI | |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Activation screen | whether the pasted token is accepted | the token's embedded expiry compared to the local clock, and its signature verified against the public key compiled into this build |
| Settings gate | whether Settings is unlocked | existing officer/session state from `_root/0001-officer-identity-sign-in`, unchanged here |

**Key invariants**:
- **Exact wire format, pinned so this is actually implementable, not just described.** The signed message is exactly 17 bytes: `version: u8` (`1`) `|| expiresAt: i64, big endian, unix ms (8 bytes) || nonce: [u8; 8]` (random, makes two codes with the same expiry look different). The token is `base64url(message || signature)`, where `signature` is the 64 byte Ed25519 signature of `message`, giving an 81 byte raw value and roughly 108 base64url characters, displayed in dash grouped blocks for readability. `version` exists so a future key rotation can be recognised and rejected cleanly instead of failing an unhelpful signature check. Expiry: 24 hours from issuance (the "same day" the two prior passes described).
- Produced by a private key `www` holds and never distributes; the Prisons binary ships only the matching public key, compiled in at build time, so a decompiled release can verify a code but never forge one. The Ed25519 crate choice (`ed25519-dalek`) is already an approved dependency in this monorepo (declared in `apps/police/src-tauri/Cargo.toml`, currently unused there); add it to `apps/prisons/src-tauri/Cargo.toml` the same way. Verifying a token needs no hashing, so `sha2` is not a dependency of this child (it is needed in child 2, for hashing the pairing and sync credentials there, and belongs in that child's `Cargo.toml` change instead).
- The token is never hand typed character by character; the UI is a single paste field (and may additionally accept a QR scan later, not required for v1), because its real length (roughly 108 base64url characters) makes retyping impractical and error prone. This is the one correction to the two prior `/architect` passes' "38 character, UUID shaped" description; see rationale.md.
- A dev only helper (`#[cfg(debug_assertions)]`, e.g. a `mint_dev_activation_code` Tauri command or a small `cargo run --bin` helper) signs tokens with a separate dev keypair, whose public key is compiled in only for debug builds, so the real verification code path is exercised without needing `www`'s not yet built generation flow.
- Single use for this token is not, and cannot be, enforced by this offline check; it depends on `www`'s own generation policy never issuing the same token twice. This is a real limitation, not an oversight, and is named again in the umbrella's Follow up.
- **Monotonic guard against a rolled back system clock.** `activated_at` is only ever allowed to move forward: activation is refused if the computed `activated_at` would be earlier than a value already stored in `hq_config.activated_at`. This does not stop a first, never yet activated install from having its expiry check fooled by a rolled back clock (a real, accepted limitation, see the umbrella's Consequences), but it does stop an already activated install's clock from being wound back to replay an old, otherwise expired code.

**Security model**: the activation token is the only thing standing between a fresh installation and full Head Office capability, so its verification must run before any other Head Office code path is reachable, and a failed check must never partially set `hq_config`. No compliance scope beyond the justice system data this app already handles under the existing officer identity model.

**Configuration required**: none new for this child; the public key is a compile time constant, not a runtime secret (it is public by design).

**Critical test scenarios**:
- Happy path: a validly signed, unexpired token pasted into the activation screen sets `hq_config.is_head_office = 1` and proceeds to HQ login, verifies **AC-3**, **AC-5**.
- Failure case: an expired token (valid signature, `expiresAt` in the past) is rejected with the same generic message as a garbage string, verifies **AC-4**.
- Auth/permission: choosing Prison Facility never shows or requires an activation code and behaves identically to the app before this spec, verifies **AC-2**.
