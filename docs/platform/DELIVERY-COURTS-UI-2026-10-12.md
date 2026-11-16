# Courts workspace refresh — 12 October 2026

Status: local shell implementation; initial type check and production build passed. Native Tauri development launched at the user’s request. Browser scroll verification passed against its local API. No release or deployment.

## Scope

Courts had retained an older permanent icon rail, a wider navigation sidebar, a compact header and a bottom status bar. The first refresh follows the existing Lawyers, DPP and Prisons shell: one 256px sidebar, a 48px header, shared workspace theme tokens and quieter tabs. No dependency or database migration was added.

Today now leads the sidebar. Search, navigation groups, actual work counts and the judicial officer profile remain available. Quick actions moved to the header so registering a case remains available even with the sidebar folded. Window controls move between the sidebar and content header and use semantic buttons. Stored tabs, pinning, recents, keyboard shortcuts and the existing licence bar remain in place. The retired ribbon and status bar components were removed.

The judicial officer profile remains installation configuration, not authenticated identity. This UI slice does not establish institutional access control or shared deployment readiness. It does not implement streaming, transcription, voice services or a new hearing workflow.

## Remaining refresh sequence

1. Today and cause list: review the day's work, warnings, empty states, filtering and hearing navigation at actual desktop window sizes.
2. Case workspace: align hierarchy and actions for parties, documents, history and next hearing. Keep official case references visible and reduce repeated entry.
3. Hearing workspace: explicit recording state, microphone readiness, storage and recovery status, speaker marking and transcript review. Durable recording and transcription remain separate implementation work with real audio acceptance trials.
4. Orders and rulings: coherent draft, review, signature and issue states; readable document previews and consistent export actions.
5. Setup and settings: separate bench profile, user identity/roles, institution membership, subscription entitlement, connectivity, backup and recovery. Preserve offline solo use and plan named institutional users without treating a subscription as record permission.
6. Accessibility and language review across all these screens, followed by native desktop verification of window resizing, controls, printing and dialogs.

## Validation limits

The production build reports chunks above 500kB. Removing duplicate shell chrome reduces source and visual clutter, but does not establish a material reduction in installer size. Measure route bundles, editor dependencies, native release artifacts and optional features before choosing size reduction work.

An isolated headless preview was attempted and stopped before launch. The user requested the native app instead, which now runs through the existing Tauri development script with one compilation job. Browser verification uses that running app’s debug API. No record was created or issued during this UI verification. Browser verification cannot prove native window behavior, microphone reliability, multi-user permissions or courtroom suitability.

## Controls and scroll correction

The first shell pass used simplified window controls. The user requested larger controls and readable symbols across all five desktop apps. A shared `@pleadli/ui/window-controls` component now provides 16px visible lights within 28px hit targets, persistent close/minimize/maximize symbols, keyboard focus styling and inactive window appearance. App wrappers retain native actions and remembered size behavior; Courts adopts the same host behavior. This is an Apple inspired adaptation, not a claim to implement native macOS Liquid Glass or full screen semantics. Green toggles maximize and restore.

Courts’ root wrapper and shell previously each claimed a viewport height. The browser reproduced an outer document scroll. The root now owns the viewport and the shell fits its available height. The document remains at scrollTop zero while the content pane scrolls, including at the configured 960 × 640 minimum window size. Print flow remains separately enabled. Native manual verification of controls is still required.

Quick actions now has a visible Actions label and entry points for search, case registration, the cause list, orders and rulings. Document drafting is not represented by a fake global button: it must resolve the case and document type first.

## Document workflow findings and next slice

The user finds the applications dominated by fields and inputs. Courts already contains `OrderSheet` and `RulingSheet` renderers, but the routes expose them after issue or delivery. Draft orders show facts instead of the eventual paper; draft rulings show an editor. This explains why paperwork is difficult to discover before the final action. Existing working order templates explicitly do not claim to be prescribed Judiciary forms.

The next substantive Courts slice should make the readable draft paper central, with a case document tray for orders, decisions, hearing records and attachments. Selecting a document opens a paper preview or editor; metadata sits beside it. Missing required details should remain explicit and block issue, without preventing an honest draft preview. Preview generation must not allocate an official reference, sign, issue, deliver or change the record. Issued papers must continue rendering the stored frozen wording rather than changing when a template changes.

Acceptance: from a case, prepare an order, see the draft wording before issue, edit its facts and see the updated preview, review required details, issue deliberately, then reopen and print the unchanged issued wording. Canceling or previewing creates no official document. Check paper pagination, signature space, headers, references and print output. Validate each country’s approved form separately.

After that slice, review the other applications against the same document workflow: locate their actual generated papers, identify missing draft previews and attachments, and keep their own institutional terminology and authority boundaries. A shared shell alone is not product parity.

The startup splash previously replaced the entire workspace whenever the router became pending. It now appears only until the first page opens. Subsequent navigation retains the frame. Quick action navigation to Orders and the cause list was verified in the browser.

Follow-up priorities requested by the user: retain the approved visual direction across apps; strengthen quick actions; make document preparation and review the next substantive Courts slice. Full visual parity of all application screens is not claimed.

Final validation: Courts, DPP, Lawyers, Police and Prisons frontend type checks all passed after the shared controls change. Browser verification confirmed document scrollTop zero with an independently scrolled content pane and working Actions navigation. Native Courts remains running; native close/minimize/maximize actions in all five apps were not exercised automatically. No additional app server was started for the other four checks.

## Single window frame correction

The user identified a square native background behind the rounded UI. Courts differed from the other four apps with `transparent: false`; it also retained a second border/rounded shell inside the root frame. Courts now uses a transparent native background and screen page background, one 12px rounded root frame, and no inner shell border or shadow. The native configuration change requires the Tauri development process to rebuild/restart. Actual compositor corner rendering requires desktop visual confirmation.

The native development rebuild for the transparency/frame change succeeded and Courts restarted. Frontend frame structure and native configuration are corrected; actual corner appearance remains a desktop visual check.

## Shared polish across all five desktop apps

The floating language selector now uses shared glass surface styling, larger rounded language rows and code badges. Its reduced motion mode disables layout/arrow animation. Each app retains its translations, selectable locales, drag position storage and existing docked selector behavior.

Window frames were reconciled against their actual mounting trees. Police, DPP and Lawyers already wrap setup and the router in DesktopFrame, so their inner root route no longer draws a second border. Courts and Prisons own their frame in the root route. Every native background is transparent; the shared screen stylesheet keeps the page transparent behind one 12px rounded frame. Each workspace fits its parent height, and print flow is retained.

Sidebar motion now has one width owner with a 320ms easing curve, a short fade and 8px slide. Nested navigators remain full width so their contents do not compress. Hidden sidebars are inert, and reduced motion disables the transitions. Native controls across all five apps use the shared glyphs and hit targets.

The custom frontend size restore competed with the already enabled Tauri window-state plugin and used screen-size heuristics to infer maximization. That custom writer and restore were removed from all five control wrappers. The plugin now owns saved size, position and maximized state. Existing native saved state is not deleted; configured first-launch sizes remain unchanged. Manual resize, maximize/restore, close and relaunch verification remains required on target operating systems, especially Wayland.

Shared polish validation: all five frontend type checks passed. Courts rebuilt and restarted successfully. Browser checks confirmed the sidebar folds to zero width, unfolds, keeps document scroll at zero, and uses the shared transition. The floating selector opens, closes with Escape, changes to Kiswahili and returns to English. Screenshot: `/tmp/pleadli-language-polish.png`. Controls were further refined to 18px visible lights with 32px targets and distinct expand/restore arrowheads. Native visual checks and physical resize/close/relaunch checks for the other four apps remain pending; those apps were not launched during this pass.


## Court paperwork, draft review

The order page now requests a read only preview from the Rust domain renderer. It uses the same paragraph rules as issuing. Missing facts are reported, court and officer settings are checked, and the issue button stays unavailable until the preview is ready. Draft papers explicitly say Draft, Not issued, Not signed and No reference assigned. Their date is a preview date. The existing issue endpoint still validates, assigns the reference, freezes the wording and records its hash. Issuing now asks for confirmation in the interface.

The case page brings existing orders, rulings and judgments into a document tray above the case facts. It replaces the two former lists rather than adding duplicate lists. Creating an order from the case or an adjourned sitting opens its draft for review. Attachments and hearing records have not been added to this tray.

Validation: Courts frontend type check passed. Five order API tests passed, including a new real router test proving that previews leave the stored order and audit history unchanged, report incomplete facts, return the same wording as issue and reject an unknown order. Visual verification is recorded below when complete. No new dependency or database migration was needed.

Visual verification completed in the browser against the running native app's debug API, using isolated data under `/tmp/pleadli-courts-paper-review`. Created an adjournment draft from a seeded case, confirmed automatic navigation to its paper, saved changed wording and confirmed the preview refreshed, verified missing officer and court settings disable issue, and opened the order through its case document tray. No order was issued. Screenshots: `/tmp/pleadli-courts-draft-paper.png` and `/tmp/pleadli-courts-document-tray.png`. The native development build completed. Native window interaction and printer output were not tested. Courts alone remains running with its required Vite server on port 3007.


## Ruling and hearing reading views

Ruling drafts now offer Write and Read draft views. The paper uses the current local title and rich text, with officer and court information from the existing profile query. It explicitly says Draft, Not delivered, Not signed and No reference assigned. Delivered decisions still use their stored frozen content. The editor remains mounted while reading, preserving unfinished input and selection state.

Draft writes are serialized. If new edits arrive during a save, the next write completes before the save promise resolves. Opening delivery awaits that same promise. Failed saves retain the text and expose Retry save. Discard is unavailable during an active save. This does not guarantee recovery of edits after a device crash or app termination.

The case document tray now links to sitting workspaces, excluding cancelled sittings. Read record presents current sitting notes and appearances as paper. It reports the existing signed state and integrity result when present, and clearly labels itself a working view rather than a separate certified document. The case heading is current data outside the signed payload. Machine transcripts are excluded. The sitting editor remains mounted while reading so an unfinished note is retained. Exporting a separate certified hearing document and attachments remain future work.

Validation: Courts type check and diff whitespace check passed. Browser checks against the isolated development data confirmed ruling draft creation, writing, reading, returning to write, saving and persistence after reload. A simulated two second network delay confirmed edits made during a save were stored before the delivery panel opened, with the latest wording surviving reload. Simulated offline saving showed Not saved and Retry save, followed by successful retry without losing text. Networking was restored after these checks. No decision was delivered and no sitting was signed or closed. Hearing checks confirmed the tray link, recorded notes and appearances, and retention of an unsubmitted note across view switches. Screenshots: `/tmp/pleadli-courts-ruling-paper.png`, `/tmp/pleadli-courts-hearing-paper.png`. These are browser verification results, not native window or printer verification. No dependencies or migrations added.


## Portable paper export

Paper views now offer Print and Export document. Export produces a self contained HTML document with local styles, no external assets, and a restrictive content policy. It keeps headings, emphasis, lists, tables, paper alignment, draft labels and reference text. App controls, links, scripts, images and arbitrary attributes are not copied. The browser development path downloads the file. The native command opens the operating system save dialog and writes only to its chosen destination, accepting no caller supplied path. Cancellation is not reported as success. This is HTML export, not a built in PDF generator, Word export or a cryptographic verification package.

Print styles hide the workspace chrome and remove duplicate screen padding. Printing and export do not issue, deliver or sign documents. A draft copy contains the current reading view, including local edits; its save status must still be checked before leaving the app.

Validation: three export tests passed with 17 assertions, covering escaping, active element exclusion, readable structure and bounded file names. Courts type check passed. An actual browser download was inspected for the ruling text, draft labels, alignment and absence of scripts or external assets, then rendered through a temporary preview file on the existing development server. The temporary preview was removed. Print media emulation confirmed zero page and paper padding and hidden sidebar and toolbar. Print media was restored afterwards. Screenshot: `/tmp/pleadli-courts-exported-document.png`. Export sample: `/tmp/pleadli-courts-ruling-export.html`. Native save dialog interaction and physical printing remain untested.

Attachment review: Courts has exhibit metadata and a sealed audio vault, but no case attachment domain or table. Its Orchestra restore code recognizes recording chunks specifically. File attachments therefore need storage and backup work together: case ownership, file metadata, sealed originals, integrity checks on reading, file size limits, clear separation from admission as an exhibit, and backup plus restore coverage. No attachment upload interface has been added ahead of that storage work.

The native development rebuild completed successfully after the export command was registered. Browser downloads from the order and hearing views also succeeded; inspection confirmed their draft or working labels and recorded text were preserved.

## Document preview format choices (supersedes HTML-only export)

Orders, rulings and sitting reading views now share a preview export menu with PDF (`.pdf`), Word (`.docx`), Markdown (`.md`) and Print. HTML-only export has been removed. PDF and Word renderers load on demand. Every format reads the paper view through one text/structure model, including draft/unsigned labels; export does not issue, deliver or certify a document.

PDF uses selectable A4 text, line wrapping, continuation pages and page numbers. Word is an editable Office ZIP/XML package. Markdown preserves headings, inline emphasis, list numbering and simple tables. These are reading copies; editable exports do not acquire the app's signed-record integrity guarantee. Images are not part of the current supported paper export model. PDF reports unsupported font characters rather than substituting them; Word, Markdown and Print preserve Unicode. Vertically merged or nested tables require Print; Markdown also rejects horizontally merged tables. Export reports these limitations instead of silently dropping table contents.

The native save command now accepts bounded base64 binary data, checks the selected format and opens the matching OS file filter. The frontend never supplies a destination path. Cancellation returns without a success message.

Verification: TypeScript check; five export tests covering actual loadable multipage PDF, actual Word document XML, shared text/status/structure, unsupported PDF characters and file names. Native development application compiled successfully. Browser downloads of the draft order in all three formats were inspected for wording and draft status; PDF text extraction and page rendering succeeded. Word opened and rendered successfully through bundled LibreOffice. Native save-dialog interaction and physical printing remain unverified. Screenshot: `/tmp/pleadli-courts-export-options.png`.

Attachments remain a separate pending slice; this change does not add attachment storage.


## Case attachments and release preparation (supersedes pending attachments above)

Cases now have an Attached files tray accepting PDF, PNG, JPEG and UTF-8 text originals up to 10 MB. Originals are sealed in the existing local vault, scoped to their case, hashed, audited, previewed and saved through a verified read. An attachment is separate from an exhibit admission. The native save command only writes to an OS-selected destination. The browser development path downloads the verified original.

The backup document adapter now includes attachment originals alongside recording chunks. Restore re-seals supported documents and retains unknown incoming files on failure instead of shredding them. API coverage checks case isolation, tamper rejection, validation and vault restore. A full encrypted backup/recovery acceptance test has been added; its final result is recorded below when available. Native save dialog and Windows installation remain separate acceptance checks.

Release candidate metadata and the Windows release workflow now cover all five applications. Courts includes the signed updater integration. See `RELEASE-CANDIDATES-2026-10-12.md` for versions, bootstrap constraints and publication gates, and `CASE-CHAIN-ACCEPTANCE-2026-10-12.md` for the fictional cross-institution case trial. No release has been published by this work.

Validation for attachments: all 48 Courts native library tests passed, including a full encrypted snapshot export, recovery staging, database restore, vault re-sealing and exact original-byte read. Courts TypeScript passed after the final UI changes. The initial full-backup fixture used an in-memory database and failed SQLCipher export; it now uses a real database file like the desktop application. Browser upload/preview and native save-dialog acceptance are not yet verified for this slice.
