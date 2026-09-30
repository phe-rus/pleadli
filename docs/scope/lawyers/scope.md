# Scope: Pleadli Lawyers (apps/lawyers)

The Tauri desktop app for an individual advocate or small firm's own practice: clients, matters, hearings and the diary, notes and time, documents, and plea bargain support. Same offline first Rust/sqlx architecture as the other Pleadli desktop apps. Research is captured in `docs/lawyers/RESEARCH.md` and `docs/lawyers/PROPOSAL.md`; there is no `PRODUCT.md` yet.

**Build approach:** Tracer Bullet (inherits the project default).
**Workflow:** GA (inherits the project default).

Drift note: `docs/scope/index.md` currently still lists Lawyers under "Not yet started, research only, no product doc, no code." That is stale: `apps/lawyers` already has substantial existing, built functionality (clients, matters, hearings, notes, tasks, documents, plea, profile, overview, audit), none of it cataloged here yet. This file only tracks the one feature below; a full catalog of what already exists is a `/scope` or `/audit` job, not done here.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | App lock | Foundation | in-progress |
| 2 | Settings: sectioned shell | Existing | existing |
| 3 | Matter notes: rich text | Existing | existing |

## Foundation

### 1. App lock · in-progress
Pleadli Lawyers has no access gate today: `advocate_profile` is a single row with no password, so anyone who can open the app sees every client and matter immediately, the single most named gap for this app across every audit of the Pleadli ecosystem. This adds a PIN based lock screen, enforced by the Rust backend itself, single advocate scope (no roster, no per matter access control, both explicitly deferred).

**Done when:** an advocate can turn on a PIN from Settings; the app then requires it on every launch, after five minutes of inactivity, and after the window has lost focus for ten seconds; the check holds even against a direct call to the app's own local API, not only the visible screen; and the advocate can disable the lock or recover a forgotten PIN without outside help.
- [x] Design it (spec): [0001](../../specs/lawyers/0001-app-lock/index.md)
- [x] Build it: `/develop app lock`
  - [x] Data model and domain logic: the `app_lock` table, `domain/lock.rs` (hash/verify, setup, unlock, disable, recover), redacted `Debug` implementations, the `argon2` dependency, satisfies AC-1, AC-2, AC-6, AC-7, AC-8, AC-10
  - [x] Backend enforcement: the in memory runtime lock flag, the lock checking middleware over the existing router, the `/lock/**` routes, and audit log entries for lock events, satisfies AC-2, AC-3, AC-4, AC-5
  - [x] Frontend: the lock screen, the recovery flow reachable from it, a shared 423 response interceptor, activity and focus loss tracking that also clears fetched domain data on relock, and the Settings security section, satisfies AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-9
  - [x] Tests and verification: the Rust test suite (happy paths, the cooldown surviving a restart, the middleware's 423 behaviour) and the migration applied against a real local database, satisfies AC-1 through AC-8. `tsc --noEmit` clean; checked live in a browser against the real headless API (not the native Tauri window; the app-lock relock behavior specifically needs the real window to actually exercise, since it's desktop only).
- [ ] Verify it: `/check verify app lock`
- [ ] Test it: `/test app lock`
- [ ] Review it (fresh model): `/check review app lock`
- [ ] Document it: `/document app lock`

### 2. Settings: sectioned shell · existing
Settings was one flat page (every card stacked, no categories). Rebuilt as a left nav of sections plus one pane, the section in the URL, matching the shape DPP and Prisons already use (`features/settings/settings-shell.tsx`, `/settings/$section`). Three sections for now: Practice (the advocate profile), Security (app lock plus the audit record), Roadmap (what's not built yet). No spec: a direct port of an already established, repeated pattern, not a new decision. Code in `apps/lawyers/src/features/settings/`, `apps/lawyers/src/routes/_public/settings/`.

### 3. Matter notes: rich text · existing
Notes were a plain `<textarea>`, the only place in the app still typed as free text where a document already had real rich text. Switched to the same `@pleadli/rich-text` (`RichTextInput`/`RichTextPreview`) the Documents feature already uses; older plain text notes still render (`safeParseRichTextDoc` handles both shapes). No backend change: `matter_notes.body` was already a plain `TEXT` column holding either shape. Code in `apps/lawyers/src/features/practice/notes.tsx`.

## Legend
See `docs/scope/index.md` for the shared legend.
