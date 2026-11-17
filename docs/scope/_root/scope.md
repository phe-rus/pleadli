# Scope: _root (shared packages & monorepo tooling)

Repo wide infrastructure the four apps and `www` all depend on: the Turborepo/Bun workspace setup, and the three shared packages (`@pleadli/ui`, `@pleadli/forms-tables`, `@pleadli/rich-text`). Nothing here is institution specific.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** Beta · override (inherits GA project default everywhere else, but tooling and config work here isn't compliance sensitive the way custody or charge records are. `/check verify` then `/test` is enough rigor, no fresh model review needed).

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Design system (`@pleadli/ui`) | Existing | existing |
| 2 | Data tables & forms (`@pleadli/forms-tables`) | Existing | existing |
| 3 | Rich text (`@pleadli/rich-text`) | Existing | existing |
| 4 | Root & nested AGENTS.md | Foundation | planned |
| 5 | CI pipeline | Foundation | in-progress |
| 6 | Turbo task definitions for lint/format/typecheck | Foundation | in-progress |
| 7 | Officer identity & sign in | Foundation | in-progress |
| 8 | Workspace styles in one place | Existing | existing |
| 9 | Code health pass | Stage 2 | planned |
| 10 | Performance and size budgets | Stage 2 | planned |
| 11 | Shared platform core | Stage 4 | planned |
| 12 | Roles and permissions | Stage 4 | planned |
| 13 | Command palette | Stage 4 | planned |
| 14 | App shape contract and consistency audit | Stage 1 | in-progress |
| 15 | Plain language and guided tasks pass | Stage 1 | planned |
| 16 | Postbox relay | Stage 5 | planned |
| 17 | Station and office connection | Stage 5 | planned |
| 18 | Police to DPP over the postbox | Stage 5 | planned |
| 19 | Public site and Find an office | Stage 6 | planned |
| 20 | Report to police | Stage 6 | planned |
| 21 | Case status for the public | Stage 6 | planned |
| 22 | Family enquiry and visit booking | Stage 6 | planned |
| 23 | Appointments | Stage 6 | planned |
| 24 | Phone layouts for field work | Stage 7 | planned |
| 25 | Offline and online sign in, scheduled send | Stage 5 | planned |
| 26 | One shared shell package | Stage 1 | in-progress |
| 27 | One settings, brand and onboarding | Stage 1 | planned |

## Existing

### 1. Design system (`@pleadli/ui`) · existing
~39 shadcn style primitives (Button, Card, Dialog, Drawer, Sidebar, DataTable's Table, Combobox, Select, etc.) plus the oklch light/dark theme and `typeset.css`. Consumed by all four apps and `www`. code in `packages/ui/src/`

### 2. Data tables & forms (`@pleadli/forms-tables`) · existing
`DataTable` (sorting, filtering, pagination, row selection, bulk actions) plus the shared `useAppForm` field registry (text/select/checkbox/multiselect/textarea). code in `packages/forms-tables/src/`

### 3. Rich text (`@pleadli/rich-text`) · existing
Tiptap based `RichTextInput`/`RichTextPreview` + toolbar, the package that replaced an earlier Lexical based `packages/lexical-text` (fully migrated, zero references left). code in `packages/rich-text/src/`

## Foundation

### 4. Root & nested AGENTS.md · needs a decision
No root `AGENTS.md` exists at all. `www/AGENTS.md` is the only one present, and it currently holds nothing but an auto generated tool listing, no authored conventions. `apps/dpp`, `apps/police`, `apps/prisons`, and `packages/*` have none. Every later `/architect`/`/develop` run in this repo is working from `docs/*/PRODUCT.md` alone rather than a captured stack/convention doc.
**Done when:** a root `AGENTS.md` records the shared stack (Bun workspaces, Turborepo, Tauri + sqlx pattern, TanStack Start) and each workspace has a nested `AGENTS.md` with its own real conventions, `www/AGENTS.md` rewritten from a bare tool listing into actual authored content.
- [ ] Capture it: `/audit`

### 5. CI pipeline · Stage 0, do this first
Only `.github/workflows/release.yml` exists (it builds signed Windows installers). Nothing gates a pull request on typecheck, `cargo test`, clippy, or build size today. This is the cheapest fix with the widest effect, so it comes before every other stage.
**Done when:** a PR against `main` runs typecheck, `cargo test` and `cargo clippy` for every touched workspace, fails when a bundle passes its size budget, and a red check blocks merge.
- [x] Design it (spec): `/architect CI pipeline`
- [ ] Build it: `/develop CI pipeline`
  - [x] Thin thread: `ci.yml` with triggers, concurrency, typecheck and the aggregate `ci` gate (satisfies AC-1, AC-6, AC-7)
  - [x] Change detection in bash with its bun test, wired to typecheck (satisfies AC-1, AC-2, AC-8, AC-10)
  - [ ] Rust jobs: pinned toolchain, system packages, cache, `cargo test`, clippy ratchet and baseline (satisfies AC-2, AC-3)
    - Note: job and ratchet written, baseline seeded from real clippy runs of all 5 apps. Toolchain is NOT pinned (engineer's call, a pinned file could break release.yml), so CI uses stable. `cargo test` not yet run on a runner.
  - [ ] Size gate: `size.ts`, `budgets.json` measured on CI, size matrix job (satisfies AC-4, AC-5, AC-6)
    - Note: script, test and matrix job written. `budgets.json` values are `null` (not enforced) until a CI run measures them.
  - [x] Pin actions by SHA, document the branch protection step (satisfies AC-9, AC-10)
- [ ] Verify it: `/check verify CI pipeline`
- [ ] Test it: `/test CI pipeline`
Spec [0002](../../specs/_root/0002-ci-pipeline.md) · code in `.github/workflows/ci.yml`, `toolings/ci/`, `docs/CI.md`

### 6. Turbo task definitions for lint/format/typecheck
Root `package.json` scripts call `turbo lint`, `turbo format`, and `turbo typecheck`, but `turbo.json` only defines `dev`, `build`, `check`, and `deploy` tasks. These three either fall through to uncached, unconfigured behavior or silently do nothing per workspace, not verified which.
**Done when:** `turbo.json` has explicit `lint`/`format`/`typecheck` task entries with correct `dependsOn`/`outputs`, and `bun run lint`/`format`/`typecheck` from the root actually run something real in every workspace that defines the matching script.
- [x] Build it: `/develop turbo task definitions`
  - Note: `lint`, `format`, `typecheck` are declared in `turbo.json`; root `typecheck` runs the workspaces' existing `check` script (real, 11 of 11 pass). No workspace defines `lint` or `format` yet, so those two run nothing until a linter and formatter are chosen (owed to `/architect`).
- [ ] Verify it: `/check verify turbo task definitions`

### 7. Officer identity & sign in
Promoted from deferred 2026-09-18: Police, DPP, and Prisons are all no sign in, single officer desktop apps today. Two features now depend directly on a real answer here rather than a placeholder: the audit trail (`docs/scope/prisons/scope.md` feature 19, who changed a record and when) and, the immediate trigger, Head Office facility approval for the Prisons peer sync network (feature 22 in the same file) — the engineer explicitly chose to settle this first rather than record an approver as a free text name. Cross app on purpose: designing it three times, once per app, risks three incompatible answers to the same question.
**Done when:** an officer can be identified for real in at least Prisons (Police and DPP can adopt the same model afterward), and a Head Office approval action or an audit trail entry records a real identity, not free text.
- [x] Design it (spec): `/architect officer identity & sign in`
- [x] Build it: `/develop officer identity & sign in`
  - [x] Prisons officer identity backend: `officers` table, Argon2 hashing, `login`, per action admin credential checks, the last admin guard, and the session domain (satisfies AC-1 through AC-8)
  - [x] Prisons officer identity frontend: an Officer management screen, the badge only lookup component, and the Head Office sign in gate including the bootstrap first admin flow (satisfies AC-1, AC-2, AC-4 through AC-7)
  - [x] DPP prosecutor profile: migration, domain, settings screen, wired onto the printable Charge Sheet (satisfies AC-9)
  - [x] Migrations applied and confirmed live in both apps (satisfies AC-1, AC-9)
- [ ] Verify it: `/check verify officer identity & sign in`
- [ ] Test it: `/test officer identity & sign in`
Spec [0001](../../specs/_root/0001-officer-identity-sign-in/index.md) · code in `apps/prisons/src-tauri/src/domain/{officers,session}.rs`, `apps/prisons/src/features/{officers,session}/`, `apps/prisons/src/components/hq-sign-in-gate.tsx`, `apps/prisons/src/routes/_public/settings/`, `apps/dpp/src-tauri/src/domain/prosecutor_profile.rs`, `apps/dpp/src/features/prosecutor-profile/`, `apps/dpp/src/routes/_public/settings/`

## Existing, added 2026-11-17

### 8. Workspace styles in one place · existing
Page layout, side panels, paper and print rules now live once in `packages/ui/src/styles/pages.css`. Each app's `globals.css` holds only its accent (Courts also sets `--page-max`). Only the Police build was checked after the move. `PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` record the product and the look. code in `packages/ui/src/styles/`, `apps/*/src/styles/globals.css`

## Stage 1: UI and UX, one large stage, done first

Decided 2026-11-17. This whole stage comes before every other stage. The goal is one shape, one design and one plain way of working in all five apps, with far less code. Measured plan and the reasoning: `docs/platform/APP-SHAPE.md` and `docs/platform/PEOPLE-AND-NETWORK-PLAN.md` sections 4 and 5. Order inside the stage: 14 (contract and audit), 26 (shared shell, which removes about 5,000 lines), 27 (settings, brand, onboarding), then 15 (plain language and guided tasks, Police and Prisons first). Stage 2 (hygiene and CI) can run beside it because CI is already in progress.

### 26. One shared shell package · in-progress
Move the window frame, left pillar, tab strip, tabs store, center header, quick add menu, command palette hook, licence bar and status bar into one package. Each app supplies only its navigation as data, its words as a labels object, its crest and accent, and its routes. The website replicas then use the same package. Measured: about 6,300 lines of shell across five apps, most of it near copies that differ in translation key names.
**Done when:** a change to the tab strip or window controls is made in one place and shows in all five apps and on the website, each app keeps its own words, and `features/workspace` in each app is only its navigation data.
- [x] Design it (spec): `/architect one shared shell package` (2026-11-17)
- [ ] Build it: `/develop one shared shell package`
  - [ ] Package, model layer and tests, and a `bun test` job in CI (satisfies AC-1, AC-3, AC-4, AC-14)
  - [ ] Police onto the package: thin thread (tabs, header), then navigator, pillar, quick add, slots, shortcuts, motion, devtools guard, error, skeletons and record tabs, each looked at in the real window (satisfies AC-2, AC-3, AC-5 to AC-11, AC-13)
  - [ ] DPP, Courts, Lawyers one at a time, then Prisons last with its right panel and extras (satisfies AC-2, AC-4, AC-7 to AC-9, AC-11, AC-13)
  - [ ] Website replicas on the view layer, CI line budget, APP-SHAPE scores updated (satisfies AC-2, AC-10, AC-12, AC-14, AC-15)
- [ ] Verify it: `/check verify one shared shell package`
- [ ] Test it: `/test one shared shell package`
Spec [0004](../../specs/_root/0004-shared-shell-package/index.md)

### 27. One settings, brand and onboarding · needs a decision
The same Settings shape, the same crest and language handling, and the same first run onboarding in all five apps, built once. Prisons drifts most here.
**Done when:** Settings sections, the brand and language switch and the first run steps look and behave the same in every app, with app specific words and fields supplied as data.
- [ ] Design it (spec): `/architect one settings, brand and onboarding`

### 14. App shape contract and consistency audit · in-progress
Write the one contract every app follows (sidebar grammar, list, record page, settings, onboarding, empty and error states, licence and backup surfaces), then score all five apps against it. Prisons drifts most. The contract is not a copy of Police: each app keeps its own words.
**Done when:** `docs/platform/APP-SHAPE.md` exists, each app has a scored gap list, and the gaps are queued as rows in that app's own scope.
- [x] Design it (spec): `/architect app shape contract`
- [x] Build it: `/develop app shape contract and audit` (2026-11-17, static audit, nothing opened in a window)
  - [x] Write the contract as numbered checklist items in `docs/platform/APP-SHAPE.md`, thin thread first with Police scored against it (satisfies AC-1, AC-2, AC-3)
  - [x] Add page patterns, plain language and comfort rules, tokens, motion and native desktop rules, plus the exceptions rule (satisfies AC-5, AC-6, AC-7)
  - [x] Score DPP, Courts, Lawyers and Prisons, record all scores in `docs/platform/APP-SHAPE-AUDIT.md`, and queue each app's gaps in its own scope (satisfies AC-3, AC-4)
  - [x] Fix the CI script rule list for building after feature 26 (satisfies AC-8)
- [ ] Verify it: `/check verify app shape contract and audit`
- [ ] Test it: `/test app shape contract and audit`
Spec [0003](../../specs/_root/0003-app-shape-contract/index.md) · code in `docs/platform/APP-SHAPE.md`

### 15. Plain language and guided tasks pass · needs a decision
Make the apps usable by someone who is comfortable with WhatsApp and not much else. Words from the work, one main action per screen, step by step flows for the common jobs, fewer fields, big targets, icons with words, undo and plain errors. Start with Police and Prisons, then DPP, Courts, Lawyers. Plan: `docs/platform/PEOPLE-AND-NETWORK-PLAN.md` section 5.
**Done when:** five people from each of Police and Prisons who did not build the app finish booking someone in, recording a statement and finding a record without help, and the failures are fixed.
- [ ] Design it (spec): `/architect plain language and guided tasks`

## Stage 2: hygiene and gates

### 9. Code health pass
Sort the roughly 1,000 `.unwrap()` calls outside tests (many sit in inline test modules), the 170 uses of `any`, and the four files over 1,000 lines (`police/api/mod.rs`, `dpp/api/mod.rs`, `lawyers/api/mod.rs`, `lawyers/settings/panes.tsx`). Remove the legacy cream palette, the colour transition on every element, and the global scrollbar hiding from `packages/ui`. Archive dated docs that are no longer current.
**Done when:** no production `.unwrap()` remains on a path a user can reach, `any` is gone from shared packages, no source file passes 600 lines without a reason written in the pull request, and the shared styles carry no legacy palette or `*` transition.
- [ ] Build it: `/develop code health pass`

### 10. Performance and size budgets
Set measured limits for cold start, route change, idle memory, installer size and JavaScript per route, then measure today's numbers on the lowest supported machine. The Police web bundle is 3.3 MB with chunks of 530 KB, 409 KB and 335 KB.
**Done when:** a budget file lives in the repo, CI reads it, and each app reports its current numbers against it.
- [ ] Design it (spec): `/architect performance and size budgets`

## Stage 4: shared platform core

### 11. Shared platform core · needs a decision
The five apps repeat the same shell, API skeleton, backup glue, settings and translation wiring. Move the common parts into shared packages and crates so a fix lands once. Do not start before Stages 1 and 2 are done. Stage 1 already moves the shell, settings, brand and onboarding, so what is left here is the API skeleton, backup glue and translation wiring.
**Done when:** a security or behaviour fix to the shell, settings or API skeleton is made in one place and reaches all five apps.
- [ ] Design it (spec): `/architect shared platform core`

### 12. Roles and permissions · needs a decision
Who in an office can see, edit, sign and export. Police roles and vault sealing are known unfinished. Depends on feature 7 (officer identity).
**Done when:** a role can be set per person, enforced by the backend and not only the screen, and every denial is written to the audit record.
- [ ] Design it (spec): `/architect roles and permissions`

### 13. Command palette · needs a decision
One keyboard first search and command box with the same shortcut in every app, the way VS Code and Apple apps work.
**Done when:** one shortcut opens it in every app, it finds records and runs the main actions, and it never exposes anything the current role cannot open.
- [ ] Design it (spec): `/architect command palette`

## Stage 5: the postbox network

Recommendation on peer to peer: do not build it. A justice system needs one named place that is accountable for what was sent and received, institutions that can be revoked, and a record of delivery. Computers at stations sit behind phone networks and are often off, so they cannot be reached directly anyway. Prisons already works hub and spoke (feature 22 in its scope: facilities push out to Head Office over outbound HTTPS, nothing connects in). Generalise that, do not replace it with a mesh. The same building LAN stays, because it is one site talking to itself.

### 16. Postbox relay · needs a decision · GA
pleadli.com holds sealed packages it cannot read, addressed to one office. Apps only call out: post, collect, acknowledge, revoke. Sending is an outbox with plain statuses (Sent, Delivered, Opened, Accepted). The package format in `docs/interchange/police-dpp.md` does not change.
Built on what pleadli.com already runs on, on the Cloudflare free plan and one domain with no subdomains: the existing Worker, D1 for the directory and package status, and sealed package bodies in D1 first (small referrals) with R2 added only when attachments need it. The API lives under `/api/postbox/*`. Free plan limits checked 2026-11-17: 100,000 Worker requests a day for the whole domain, 10 ms CPU per request, D1 5 million rows read and 100,000 rows written a day, 500 MB per database, R2 10 GB. So the server stays dumb (no decryption, no heavy crypto), apps poll gently (about every 15 minutes, and when the person presses Send or Refresh), and delivered packages are deleted after a short retention. Whether R2 needs a card on file is not verified.
**Done when:** a sealed package posted from one computer is collected by another that was offline when it was sent, the server cannot read it, and the sender sees each status change.
- [ ] Design it (spec): `/architect postbox relay`

### 17. Station and office connection · needs a decision · GA
Replace the spoken fingerprint ceremony. An office appears in a directory, a station asks to connect, a named person at the office approves in one tap, and the licence on Orchestra is the root of trust. Fingerprints are checked silently, shown only on an advanced screen. Revocation works.
**Done when:** a station connects to an office from a list without anyone reading digits aloud, the office can revoke it, and a revoked station can no longer send.
- [ ] Design it (spec): `/architect station and office connection`

### 18. Police to DPP over the postbox · GA
Send a referral from Police to the chosen DPP office through the postbox and get the receipt and the decision notice back, using the existing package and acceptance rules. USB and e mail stay as a fallback.
**Done when:** a referral made in Police reaches the DPP office inbox without a file being carried, the prosecutor accepts or rejects it, and the station sees the receipt and later the decision.
- [ ] Build it: `/develop police to dpp over the postbox`

### 25. Offline and online sign in, scheduled send · needs a decision · GA
Custom sign in with email and password, our own API for the apps, no anonymous accounts. Offline, the app checks the credentials against the officer record on the computer. Online, the same email and password are registered on pleadli.com tied to the licence, and the first online sign in gives the device a long lived token. An outbox holds anything for another office with an optional send after time and sends by itself when a connection appears. Plan: `docs/platform/PEOPLE-AND-NETWORK-PLAN.md` section 9.
**Done when:** a person signs in with no internet, queues a package for later, and it sends by itself once a connection appears; a lost device can be revoked and then nothing more is accepted from it.
- [ ] Design it (spec): `/architect offline and online sign in`

## Stage 6: the public

All public flows are off until an institution turns them on and names who answers. Nothing is shown about suspects, victims or children, and there is no public search of people. A legal review of what may be shown comes before the first live flow (`docs/platform/PEOPLE-AND-NETWORK-PLAN.md` section 3).

### 19. Public site and Find an office · needs a decision · GA
A phone first site on pleadli.com (one domain, no subdomains, so the public pages live under paths on it; the exact path names are the owner's to confirm, and the API stays under `/api/**`), installable from the home screen, opening on "What do you need?". First flow: find the right office, its hours, what to bring and how to complain. English, Swahili and French.
**Done when:** a person on a basic phone finds a nearby police station or court and what to bring in under a minute, and the page works on slow data.
- [ ] Design it (spec): `/architect public site and find an office`

### 20. Report to police · needs a decision · GA
A short guided form, a reference number, and a status the person can follow. It arrives in Pleadli Police as an unconfirmed report in a separate tray, and an officer accepts it, replies or declines. Nothing becomes a record without a person at the station accepting it.
**Done when:** a report made on a phone reaches the chosen station through the postbox, an officer accepts it as an incident, and the reporter sees the status change.
- [ ] Design it (spec): `/architect report to police`

### 21. Case status for the public · needs a decision · GA
Reference plus a phone code gives a plain status ladder (Received, With an investigator, Sent to the prosecutor, Court date set) and any message the officer chose to send. Never the contents of the file.
**Done when:** a complainant sees only their own report, the status follows what the institutions record, and a wrong code reveals nothing.
- [ ] Design it (spec): `/architect case status for the public`

### 22. Family enquiry and visit booking · needs a decision · GA
A relative proves the link, the facility staff approve in a tap, and the reply is only visits information: held here or not, visiting days, how to book. A booking gives a confirmation and a reminder, and the gate ticks the visitor off. What a relative may learn is set with the Prisons Service and a lawyer first.
**Done when:** a relative books a visit slot from a phone, the facility sees it in Today, and no charge or file detail is ever shown.
- [ ] Design it (spec): `/architect family enquiry and visit booking`

### 23. Appointments · needs a decision
Offices (police, DPP, court registry) publish what they offer and when. A person books, and the office sees it in Today.
**Done when:** a booking made on a phone appears in the office app and the person gets a reminder.
- [ ] Design it (spec): `/architect appointments`

## Stage 7: the field

### 24. Phone layouts for field work · needs a decision
A beat officer, a visiting advocate and a prison gate need real phone screens for their few daily tasks. Police has a mobile plan; it comes forward after the Stage 6 flows are real.
**Done when:** the field tasks for each of those three roles can be done on a phone with one hand.
- [ ] Design it (spec): `/architect phone layouts for field work`

## Deferred
Real, evidenced findings from a 2026-09-18 Uganda government adoption research pass (`docs/prisons/research/findings.md` §12), cross cutting across the desktop apps rather than owned by one workspace:
- **Police, DPP, Prisons interoperability seam**: JLOS (Uganda's real cross institution justice sector coordination body) runs a live "E-Justice" project whose stated goal is "open standards and APIs for secure data sharing across JLOS institutions," explicitly spanning Police, Judiciary, Prisons, and DPP. Prisons' own Head Office and peer sync network (a hub and spoke design, not a mesh, and the model Stage 4 generalises) (feature 22 in its scope file) is a first, concrete step in this direction, scoped to inside Prisons only; the wider cross institution picture (Police, DPP, Courts all connecting, DPP and Lawyers staying individual practitioner tools) stays a documented future direction until Courts exists as a real app · needs a decision
- **NITA-U certification posture**: government MDAs reportedly may only use NITA-U certified IT products; unverified with certainty (two direct fetch attempts to NITA-U's certification pages failed) · needs a decision, worth confirming directly with NITA-U before treating as a hard gate
