# Help and diagnostics (shared by all five apps)

Written 2026-11-22. **Status: the shared core and the cloud intake are built and tested. No app shows a Help screen yet, no app installs the panic hook, and nothing was run in a real window.**

## What exists

| Piece | Where | State |
|---|---|---|
| Versioned bundle (`format` 1), redactor, offline event ring, crash records, panic hook with a recursion guard, frontend-error record | `packages/node-core/src/diagnostics.rs`, feature `diagnostics`, no network code | Built, 5 tests |
| Private support intake `POST /api/orchestra/v1/diagnostics` and `diagnostics/status` | `www/src/api/orchestra-v1.ts`, stored in the existing `support_report` table (staff inbox and replies already exist) | Built, test `www/tests/diagnostics.test.ts` |
| Help screen (report a bug, report a crash, view local diagnostics, copy the bundle, contact support, check status), consent and preview | Apps | **NOT built** |
| App start-up: `install_panic_hook`, `window.onerror` and `unhandledrejection` forwarding, offering a pending crash on the next start | Apps | **NOT built** |
| Optional community discussion (GitHub Discussions) | Link out only | **NOT built**; see the rule below |

## The bundle (what a person previews, byte for byte)

`format`, `report_id` (uuid made on the computer), `kind` (`bug`, `crash`, `diagnostics`), `app`, `app_version`, `os`, `arch`, `created_at`, `error_code`, `description` (what the person typed, redacted), `crash` (`source`, file name and line only, redacted message, function names), `events` (at most 200: a lower-case code and an optional redacted detail of 120 characters).

**Never collected:** case contents, evidence, names, statements, credentials, tokens, encryption keys, database contents, document paths, client information. The structure has no field that could hold them. Events are codes (`sync.failed`), not sentences; a sentence is rejected as `invalid_code`, so a name cannot enter through an event. The redactor (tokens, keys, long hex and base64, emails, IPv4, absolute paths cut to the file name, 8 or more digits, `password=` style pairs) is a safety net for the description and for crash text, not a licence to collect free text; it cannot recognise a person's name in a sentence.

## Offline, consent, submission

- **Offline**: everything is prepared locally (`record`, `build`, `save_crash`). Nothing needs Pleadli Cloud, so a local administrator can read diagnostics with no connection.
- **Consent and preview**: the app must show `to_json(bundle)` and send exactly those bytes, only after the person chooses Send. There is no automatic upload. Dismissing a pending crash deletes it.
- **Private channel**: Pleadli Cloud accepts only the exact `format` 1 shape. The intake schema is strict at every level, so an extra field (a case note, a client name) is refused with 400 and nothing is stored. A retry of the same `report_id` is not stored twice; another computer cannot reuse an id. An activated computer can report, licensed or on trial. Reports are visible to Pleadli staff in the existing support inbox, and to the sender's own computer through `diagnostics/status` (the staff reply comes back there).
- **GitHub Discussions**: only for sanitised, public technical discussion the person chooses to start. A diagnostic bundle is never posted there automatically and the apps never send a bundle to GitHub.

## Crash capture

`install_panic_hook(dir, app, version)` writes a redacted crash record (file name and line, message, function names) and then calls the previous hook. A guard makes a panic inside the hook, or a second panic on another thread meanwhile, skip the record, so reporting cannot loop. Only the newest 10 crash files are kept, so a crash loop cannot fill the disk. A frontend error goes through `save_frontend_error` (message and function names from the stack). **Not covered:** a native crash that is not a Rust panic (a segmentation fault in a C library such as SQLCipher or whisper) leaves no record; that needs a minidump handler and is not built.

## Privacy checks performed

Unit tests prove: secrets, emails, addresses, paths and long numbers do not survive; a sentence cannot become an event code; the bundle has no field name containing case, evidence, client, token, key, password, database or path; the preview JSON parses back to the same bundle; a crash keeps only a file name and function names; the intake refuses extra fields. **Not done:** a review of every event code an app will record (none do yet), and a real-window check of the Help screen.
