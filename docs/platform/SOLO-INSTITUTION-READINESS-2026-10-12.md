# Solo and institutional use, readiness review

Date: 12 October 2026. This reads the current checkout, including work that has not been committed. It does not establish what the published installers contain. No production records were used.

## The supported model

The user confirmed that Pleadli is a SaaS platform usable by one person alone offline or by an institution with multiple users. Offline means everyday local work does not need the internet. It does not mean every joined computer holds its own independent copy of the records.

An institution may have one user or many. A solo user of a Police or Courts workspace still acts within the relevant office and professional authority. Choosing solo does not grant access to another institution or authority to sign official records. Lawyers already distinguishes the practice setting from the person's professional role and administrative permission.

The earlier licensing decisions in `ORCHESTRA-PLAN.md` remain relevant: public institutions obtain an agreement, while advocates and firms obtain their own licence. The plan describes a 30 day trial and continuing local record access after expiry. Signed licences and optional online services are a separate layer. The SaaS clarification does not replace those decisions with a new pricing scheme. Checkout implementation and published version acceptance still need separate evidence.

## What exists

| App | Local setup and identity in the checkout | Multiple user and network position | Remaining proof |
|---|---|---|---|
| Lawyers | Explicit alone/firm choice. Local PIN or password plus authenticator; optional no sign in for one person. Practice administrator is separate from advocate/paralegal/accounts role. | Named users and a joined desk protocol exist. The office computer holds records; a desk forwards requests over pinned TLS and depends on that office being reachable. | Packaged offline setup/sign in, concurrent physical computers, removal of users/devices, host failure and recovery. Reactivation and stale staff additions are now checked locally; physical device and packaged acceptance remain open. |
| DPP | Office/HQ setup, local named users and protection levels exist. Setup limits no sign in to one person. | Named users can use the local workspace. This review did not establish a joined desk implementation equivalent to Lawyers. Office/HQ setup alone does not prove multi computer use. | One person rule corrected locally; remaining permission checks, packaged offline trials and an explicit shared office architecture before promising simultaneous desks. |
| Police | Station/Command setup and local officer authentication exist. Administrator and Command require passwords. Badge only is identification, not proof of possession of a secret. | Station/Command reporting and separate remote surfaces exist. They are not proof of a complete field Android app or institutional hierarchy. | Two machine reporting trial, verified transport, permission/revocation tests and offline field capture. Do not add an anonymous solo shortcut around officer authority. |
| Prisons | Facility/HQ/workstation setup and local officer sign in policies exist. | Workstation enrolment uses an address, fingerprint and one time code. The workstation holds no independent copy and depends on the facility node. | Concurrent physical desks, node availability after closing the desktop window, device/user revocation, loss of node and backup restore. |
| Courts | Local court record workspace exists. | This checkout has no comparable authenticated role boundary in the Courts API. Profile or bench details do not establish the identity of the caller. | Clerk/judicial officer/transcriber/admin identity and permissions before shared access; then local setup, recording recovery and multiple user trials. |

Key sources: `packages/setup/src/types.ts`, `packages/setup/src/{setup-flow,sign-in}.tsx`, Lawyers `features/practice-setup/steps.tsx` and `src-tauri/src/domain/{installation,staff,network}.rs`, DPP `src-tauri/src/domain/{installation,staff,security}.rs`, Police `features/session/onboarding.tsx` and `src-tauri/src/domain/auth.rs`, Prisons `features/onboarding/{onboarding-gate,workstation-screen}.tsx`, Courts `src-tauri/src/api/mod.rs`.

## Required acceptance scenarios

1. On a new supported computer with internet disabled, complete local setup, create a record, export it, close the app, reopen it and sign in. Test the actual installer separately, including WebView2 availability.
2. Repeat with a protected solo workspace. A single user is still allowed to choose local authentication.
3. With two named users, sign out and sign in as the other user. Confirm attribution, forbidden actions and removal of cached records belonging to the previous session.
4. Where joined desks exist, use two physical computers concurrently. Disconnect internet while retaining the LAN, then disconnect the office node. Show an unavailable office honestly; do not create a divergent empty local workspace.
5. Remove a user and revoke a device. Check both existing sessions and new requests. Reconnect after an outage and confirm stale privileges do not persist.
6. Expire the trial or licence with internet unavailable. Confirm the agreed local access policy, a clear service status, and no silent change of payer for AI or online services.
7. Restore an encrypted backup onto a replacement computer. Confirm ownership, named users, audit history, documents and attachment integrity.

## Recommended next sequence

Preserve existing setup paths and fix contradictions in their invariants first. Next, specify Courts identity and roles using the existing local authentication patterns as reuse candidates. Define shared office host availability and recovery before adding more remote connections. Keep optional SaaS account/entitlement onboarding separate from local workspace setup. Add billing only against the existing licensing decisions and explicit operational acceptance criteria.

## DPP correction completed locally

The review reproduced a contradiction: Settings could remove sign in with two active people. Staff creation also lacked the corresponding guard. The API regression returned HTTP 200 and changed protection to none before the fix.

DPP now rejects removal of sign in unless exactly one person is active. That check and change use one SQLite statement. Staff creation rejects no sign in, verifies the current stored protection inside its insertion transaction, and refuses a stale protection value. Reactivating another person while protection is none rolls back the update. Enabling local PIN protection still permits adding another person and signing in as that person.

The full DPP backend suite passed, 47 tests including two new API scenarios. The tests use the real router, migrations and an isolated in memory database. They check unchanged protection and actor after refusal, no success audit event for the refused setting change, rollback of reactivation, and working local sign in after adding a second person. No dependency or migration was added. No production record was changed or release published.

Packaged Windows and physical multi computer acceptance remain open. This correction does not add DPP network sharing or Courts roles.


## Lawyers correction completed locally

The next review reproduced two reactivation bypasses: a person could be made inactive, the practice changed to alone or no sign in, then that person reactivated with other edits in the same API request. Both regressions returned HTTP 200 before the correction.

Staff update now checks active membership against the stored practice setting and protection inside its existing transaction. A rejected activation rolls back all of the submitted edits, including name and role. Staff creation reads the stored settings inside its insertion transaction and refuses a stale protection value. The earlier API setting check was removed because the domain now owns that rule. Switching to alone checks the active count within its update transaction; disabling sign in uses a conditional database update so validation and the change cannot separate.

The full Lawyers backend suite passed, 66 tests. Three new tests cover reactivation in a solo practice, reactivation without sign in, and a staff addition using settings read before the practice changed. They also check preserved account fields and acting administrator, no successful staff change event for a refusal, and successful reactivation and local sign in after returning to a protected firm workspace. Existing tests for office/desk sessions, documents, exports, audit and encrypted storage also passed.

No dependency or migration was added. No deployed account, production record or published installer was changed. These in process and local test server checks do not replace physical multi computer, packaged Windows or offline installation trials. Courts identity and role enforcement remain the next design and implementation priority before shared court use.
