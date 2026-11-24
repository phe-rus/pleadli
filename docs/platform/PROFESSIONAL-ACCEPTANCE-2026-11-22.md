# Professional-use acceptance record, 2026-11-22

This session worked the brief in priority order and stopped where the budget ended. Everything below is **uncommitted** (no commits, pushes, CI, releases or deployments were made). **No native Tauri window was run this session**; every claim of "verified" below means unit or API-level tests, and is labelled so.

## Feature inventory

Status: **V** implemented and verified (tests, not a window); **I** implemented but incomplete; **M** missing; **L** needs institutional or legal validation.

| Area | Item | Status | Evidence / gap |
|---|---|---|---|
| Public lookup | `verify` and `track` kept, field choice by the issuing institution, withdrawn and superseded, unpublish (sealed), uniform 404 | V | `www/tests/public-lookup.test.ts` (45 assertions) |
| Public lookup | Rate limiting: edge binding + Durable Object counter + local fallback, 429 with `Retry-After`, buckets chosen only by the server | V (code, fake DO) / **M** (WAF rule NOT configured, DO not exercised in workerd) | `www/tests/quota.test.ts`, `PUBLIC-AND-FIELD-API.md` "Limits" |
| Records API | Institution-controlled lookup, 5 audiences (not a ladder), per-field audiences, grants with verifier and expiry, revocation, credentials, sealed, freshness, audit | V (API level) / **M** (no app publishes or calls it; no UI) | `www/tests/records.test.ts` (84 assertions), `RECORDS-API.md`, `examples/records-client.ts` |
| Records API | Postbox request-response for approval-gated fields | **M** (design only) | `RECORDS-API.md` |
| Records API | Who registers credentials and grants, who verifies a lawyer, per-country field law | L | R1 to R5 in `RECORDS-API.md` |
| Lawyers | Conflict search (word match across clients and parties) | V (existing) | `parties.rs` |
| Lawyers | **Restricted matters**: barrier on every list and every `/matters/{id}/**` path, same 404 as unknown, administrator repair without access, audit | V (API level, `cargo test`: 70 pass) / **I** (no UI to set it; some by-id routes such as `/documents/{id}` are not gated, reachable only by an unguessable id found through the filtered lists; statistics and client counts still include restricted matters) | `apps/lawyers/src-tauri/src/domain/access.rs`, `api/tests.rs` |
| Lawyers | **Restricted conflict hits**: the name is reported, the matter, title and status are not | V | same test; UI shows the restricted wording in en, fr, sw |
| Lawyers | 13 matter types incl. advice, land, company, family, employment, legal aid, appeals; limitation clocks with citations (UG, KE, CD); client-money ledger; fee notes; Postbox filings | V (existing, 68 prior tests) | not re-audited by a lawyer: **L** |
| Lawyers | Document versioning and approvals; research authorities library; evidence and disclosure confidentiality; reminders | **M** or **I**, not audited this session | needs an audit against real practice |
| Lawyers | Full lifecycle with realistic fictional matters in a window | **M** | not run |
| Diagnostics | Versioned bundle, redactor, offline events and crash records, panic hook with recursion guard, frontend-error record | V | `node-core` 5 tests |
| Diagnostics | Private support intake and status (strict shape, idempotent, sender-only status) | V | `www/tests/diagnostics.test.ts` |
| Diagnostics | Help screen, consent and preview UI, hook installed in apps, native (non-panic) crashes | **M** | `DIAGNOSTICS.md` |
| Extensions | Package format, integrity, signatures, closed capabilities, lifecycle, isolation, audit events, example extension end to end | V (unit) | `node-core` 3 tests, `EXTENSIONS.md` |
| Extensions | WebAssembly runtime, Settings UI, catalogue, trusted keys, app audit wiring | **M** | `EXTENSIONS.md` next steps |
| Cloud integration | Public, records, diagnostics endpoints through the existing computer authentication | V | tests above |
| Cloud integration | Licence, backup and restore, address, revocation audit across five apps | **M** (not re-audited; see the earlier 2026-11-22 relay notes) | |
| Postbox interoperability | Police-DPP, DPP-Courts, Courts-Lawyers, Courts-Prisons | Not re-run this session. Earlier native runs: DPP-Courts, Courts-Lawyers, Courts-Prisons passed (see `HANDOVER-PLAN-2026-11-22.md`) | Police window, revocation, two machines still open |
| Website | `/verify` and `/track` privacy text: institution decides, no legal-validity claim, absence is not proof (en, fr, sw); `/verify` shows limited and superseded results | V (typecheck, i18n check, not seen in a browser) | |
| Website | Products pages, roadmap, downloads, docs, notices that call built features unavailable | **M** (not audited) | |
| Police, DPP, Courts, Prisons | Professional-context audits | **M** | not started |

## Security findings (this session)

1. **Public lookup had no real rate limit.** Fixed in code (three layers). The Cloudflare dashboard rule is **not** configured; until it is, do not announce `/verify` and `/track` as protected against enumeration. The Free plan's daily request cap is shared with attackers.
2. **A first design flaw found by a test:** the records audience model was a ladder, so a party out-ranked a lawyer and saw lawyer-only fields. Replaced with per-field audience lists.
3. **A second, in the extension host:** ordinary refusals (a missing file, a full storage) were counted as crashes, so a typo could switch an extension off. Refusals and faults are now separate.
4. **Lawyers had no information barrier:** every staff member saw every matter, and conflict hits exposed the title of every matter. Fixed at the API level, with the gaps listed above.
5. **Any licensed computer of an institution can publish records, register credentials and grant access** (R2). Bounded by expiry and audit, not by role. Treat as a blocker before real use.
6. Old finding still open: the owner's real Courts data folder was touched by an earlier run (see the handover).

## Tests run (all local)

`www`: `bun test` 23 pass, `tsc` clean. `node-core` with `extensions,diagnostics`: 59 pass. Lawyers: `cargo test --lib` 70 pass, `tsc` and `i18n` clean. Not re-run: Police, DPP, Courts, Prisons suites (their code was not changed), the relay tests.

## Deployment blockers (new)

- Apply two new D1 migrations (`*_loving_magus`, `*_purple_power_man`) and deploy the Worker with the new `ratelimits`, `durable_objects` and `migrations` blocks in `wrangler.jsonc`. **Nothing was applied or deployed.** The `QuotaCounter` class and the `QUOTA` binding have never run in workerd.
- Add and verify the WAF rate-limit rule, and record who verified it.
- Decide R1 to R5 (records API) and the trusted extension keys.
- `www/src/routeTree.gen.ts` was edited by hand for the new route (it is generated and ignored by git): regenerate it with a normal `bun run dev` or `build`.

## Next, in order

1. Lawyers: a screen to restrict a matter and a conflict-check view; then a real-window run of an entire matter (civil and an advisory matter with no court number) with fictional data.
2. Help screen and panic hook in Lawyers, then the other four apps.
3. Extensions screen in Lawyers, then the WebAssembly runtime.
4. An institution-facing "Publish to Lookup" screen (per record, per field) in one app, with the records API example client.
5. Website product pages and notices, in en, fr and sw.
6. Police, DPP, Courts and Prisons professional audits.

---

# Update, later on 2026-11-22 (second session)

Still **uncommitted**; no commits, pushes, CI, releases or deployments. **No native Tauri window was run in this session** (a debug Tauri build plus WebKit on this 14 GB machine was not attempted; it is batched for the end and has NOT happened). Everything below is API-level or unit-level evidence unless it says otherwise.

## 1. Lawyers information barrier: closed at the API, UI built, window run still owed

Every route was audited. Closed in the backend (not the UI):

| Path | How |
|---|---|
| `/matters/{id}/**` | router gate (existing) |
| `/documents/{id}`, `/papers/{id}`, `/bills/{id}`, `/fee-notes/{id}`, `/hearings/{id}`, `/tasks/{id}`, `/notes/{id}`, `/time/{id}`, `/parties/{id}`, `/events/{id}`, `/filings/{id}`, `/ledger/{id}`, `/registers/{id}` | the gate resolves the record to its matter and refuses with `NOT_FOUND` (`access::record_hidden`) |
| Matter id in a request body (task, document, ledger, fee note, register, notice filing, task re-assignment) | `access::require` in the handler |
| Printed papers: last, history, ink, stamp, verify by code | entity checked; a code for a hidden paper answers `null` |
| Statistics, pro bono compliance, client list counts, notices list, register list, document verify, audit trail | filtered by the same visibility rule |
| Administrator export | excludes restricted matters and everything under them |
| Audit trail | entries scoped to, or about records of, a hidden matter are left out; the chain still verifies whole |

Emergency repair: an administrator who is **not** listed may still change the list, but must give a reason; it is recorded as `matter_access_recovered` with the people added and removed and the reason, and it does not let them read the matter. History is returned by `GET /matters/{id}/access`. UI: "Who can see this" in the matter menu (toggle, staff picker, reason box, history), a "Restricted" tag, en/fr/sw; typechecked only. Revocation is immediate because every request re-reads the list; a test shows an administrator's live session losing access in the same call that removed them.

Residual: a hidden record's id and a wholly unknown id answer slightly differently on the `GET /documents/{id}` family (404 vs `200 null`); ids are random UUIDs so this teaches little, but it is not byte-identical. Clients are not hidden by design (conflict checks need names).

Tests: `cargo test --lib` **72 pass**.

## 1b. Matter confidentiality is separate from firm-wide finance

Reviewed first: roles are `advocate`, `paralegal`, `accounts` plus the administrator flag. The ledger is complete for the **client account** only; there is **no bank-side data** (no statement balance, uncleared cheques, deposits in transit), so a trust reconciliation cannot be completed here.

- Finance scope = `accounts` role or an administrator (`access::finance_scope`), enforced in the backend.
- `GET /api/accounts/reconciliation` (finance only, 403 otherwise): client-ledger liability over every entry, restricted matters included; clients with a balance; overdrawn clients; and `trustBankBalance`, `outstandingTransactions`, `discrepancy` all **null** with `bankSide: "not_recorded"`, `complete: false`. No matter ids, titles or descriptions.
- `statistics.money` is `null` outside the finance scope (never a figure summed from visible matters); for finance it is whole-firm and "held for clients" uses the same ledger sum as the reconciliation. Matter counts, hours, hearings and pro bono stay scoped per person.
- `/money/positions` is finance-only. A client's books for ordinary staff omit hidden-matter entries, say `partial: true` and give **no balance**; finance sees whole books with restricted entries masked. UI shows "n/a" or a partial note, en/fr/sw.
- Test `client_money_totals_are_firm_wide_for_finance_only_and_leak_nothing_about_restricted_matters`: accounts gets 2,500,000 including the restricted 2,000,000 and still gets 404 on the matter; the clerk gets 403 on both finance endpoints, `money: null`, scoped counts, partial books; lifting the restriction does not change the liability.
- **Not done:** a finance/compliance role distinct from "accounts or administrator" does not exist in the schema; bank-statement entry and outstanding items are needed before this is called a reconciliation. Not validated by an accountant.

## 2. Records API authority (decision R2 closed in code)

Enforced on the server (`www/src/lib/records-authority.server.ts`, Orchestra handlers):

- **Licensed device** proves a machine and licence, grants nothing.
- **Officer**: a named person authorised by an institution owner; personal random secret (`pro_...`, shown once, only its hash kept, expiry, revocable, bound to its institution, optionally to one computer). Unknown, revoked, expired, other-institution and other-computer secrets all answer the same `403 officer_needed`.
- **Permissions** are separate: `publish`, `approve`, `revoke`, `credentials`, `audit`.
- **Publication policy** per institution, jurisdiction, record type and reference kind, with a per-field audience ceiling. **No default**: no enabled policy means nothing can be published. The ceiling is re-applied on read, so tightening or disabling a policy stops disclosure of already-published records immediately.
- Lawyer and party grants need a stated verification; **who** verified is the officer from the secret, never a name in the body. Revoked or expired credentials cannot be granted anything. Every sensitive action goes to `record_admin_event` under the officer's name, with no record values.
- Migration `20261122003552_mute_gargoyle` (3 tables) generated with `bun run db:gen`.

Tests: `records.test.ts` (84 assertions) and new `records-authority.test.ts` (82): computer alone refused everywhere; permissions separate; stolen secret on the wrong computer, other institution, expired, revoked; hash-only storage; no policy, field or audience beyond the policy; a label is not a permission; no cross-institution reach; guessed neighbouring references give the same empty answer; stale and revoked grants and credentials stop at once; policy tightening and disabling; a real publisher plus the external TypeScript client (`docs/platform/examples/records-client.ts`, synthetic data) retrieves only permitted fields, and restricted field names and values are absent from the serialised response; with the counter down, officer operations change nothing.

**Not built:** web screens for institution owners (authorise officers, set policies, review and revoke grants) and the app-side "Publish to Lookup" screen. `createOfficer`/`revokeOfficer` exist and are tested but no page calls them, so an institution cannot operate this yet. Who verifies lawyers and per-country field law remain institutional decisions (R1 to R5), not assumed.

## 3. Rate limits: roles defined, fail closed, real Durable Object run

- Anonymous public lookups (`/verify`, `/track`) may degrade to the isolate-local counter (nothing protected behind them); documented and tested.
- Protected lookups, credential and grant operations **fail closed**: `503 service_unavailable` with `Retry-After`, nothing read or changed, no local fallback. Officer operations have authoritative limits (60/min per officer, 300/min per institution). Tested with the counter down and the binding missing.
- The **real** `QuotaCounter` ran in workerd via `wrangler dev --local`: `bun run test:workerd` (new, `www/tests/workerd/`): 50 concurrent requests at limit 5 let exactly 5 through; buckets independent; remaining counts down; window expires; a refusal does not extend the window. 7 of 7 passed.
- `wrangler types` re-run (no diff). `routeTree.gen.ts` still carries the earlier hand edit and regenerates on the next `bun run dev`/`build`, which was not run. No production Cloudflare setting changed; the WAF rule is still not configured.
- `bun test` in `www`: **26 pass**; `tsc` clean.

## Not started this session (do not treat as done)

| Item | State |
|---|---|
| 4. Help and Diagnostics screens, panic hooks installed in the five apps, crash history, consent and bundle UI | not started (shared module and private intake from the earlier session stand) |
| 5. WebAssembly extension runtime, Settings > Extensions in five apps, drag-and-drop install, example run in an app | not started (package manager and capabilities stand, unit-tested) |
| 6. Professional workflow review across eight kinds of practice in a window | not started |
| 7. www product pages, Account screens for records, diagnostics, extensions (en/fr/sw) | not started |
| 8. Real Tauri window run with two staff accounts, screenshots of restrictions, diagnostics, Extensions | not done |

## Remaining security blockers

1. Restricted-matter UI has not been run in a window.
2. No web screens for owners to authorise officers or set policies, so the records API cannot be operated by an institution yet.
3. Trust reconciliation is structurally incomplete (no bank-side data).
4. Cloudflare: migrations unapplied, Worker undeployed, WAF rule absent.

---

# Update, third session (2026-11-22): usage limit reached part-way

Still **uncommitted**; no commits, pushes, CI, releases or deployments.

## Done and verified

1. **Information disclosure (item 1), closed in Lawyers.** The gate (`api/mod.rs`) now refuses an unknown id on every owned by-id route before the body is parsed. An unknown matter under `/matters/{id}/**` is treated the same way. Any 404 under those routes is rewritten to one body. `GET /documents/{id}` returns 404 for an unknown id (it was `200 null`). Test `a_hidden_record_and_an_unknown_one_answer_byte_for_byte_alike` compares status, headers and bytes for 30 method and path cases. `cargo test --lib`: **73 pass**. Only Lawyers has restricted resources; the other apps were not checked.
2. **Lawyers native run (item 2, partly).** Debug binary rebuilt from current source (`scripts/native-binary.sh`, 3 jobs). It ran in an isolated data folder (`~/.pleadli-accept/law2-xdg`); the real folder was not touched. Fictional firm with an administrator, an associate, a clerk and a finance user. Set up and driven through the app's own local API in the same process, and seen in the window. These checks passed:
   - a clerk gets 404 for the restricted matter and for its notes, plea and document
   - a clerk's matter list omits the restricted matter
   - `statistics.money` is null for the clerk, and the clerk gets 403 on reconciliation
   - a clerk cannot lift the barrier
   - finance sees the firm-wide reconciliation with no matter detail, and still gets 404 on the matter
   - a listed associate reads the document, and loses access in the same call once removed
   - an administrator who is not listed is refused, then repairs the list only with a reason (422 without one)
   - a conflict hit shows a clerk only `restricted: true`, with no name, matter or title
   
   The "Who can see this" panel (toggle, staff picker, repair history with reason) was seen in the window. Screenshots (fictional data only) are in `~/.pleadli-accept/shots2/`.
3. **Finding fixed:** the window kept open tabs and recents (matter titles and court numbers) in one `localStorage` key per computer. The next person to sign in saw "HCT 2/2026" for a matter they cannot access. The Lawyers workspace key is now per person (`workspace-shell.tsx`). Prisons already keyed by officer; DPP and Courts have no per-person sign-in. **Not yet re-checked in a window**; `tsc` printed no errors.

## Not done (do not treat as done)

- Lawyers native: restart persistence and a final window screenshot as clerk after the key fix; the Lawyers window test of finance in the UI.
- Item 3: diagnostics wiring, Help and Diagnostics screens, and a full report submission in five apps. The shared core and cloud intake stand from earlier.
- Item 4: WebAssembly runtime (`wasmi` 2.x is on crates.io and was not tried), Settings > Extensions, drag-and-drop install, example run.
- Item 5: records administration screens on www.
- Item 6: professional workflow review (Lawyers, Police, DPP, Courts, Prisons).
- Item 7: route tree regeneration, www product pages and translations.
