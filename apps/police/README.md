# Pleadli Police

A desktop application for individual police stations in Uganda: offline first, one officer or many, no internet connection required to work. Built with Tauri v2 (Rust backend, React/TypeScript frontend), local SQLite as the source of truth, and an optional restricted remote surface so an officer's own phone can reach the station from the field.

Pleadli Police is one application in a larger, still-mostly-future ecosystem: Pleadli Police, Pleadli DPP, Pleadli Courts, Pleadli Lawyers, Pleadli Prisons, each a purpose-built app for a different participant in the justice system, meant to eventually connect through Pleadli Cloud. Only Police exists today. See `docs/police/PRODUCT.md` for the canonical product definition this README summarizes; that file, not this one, is the source of truth if the two ever disagree.

This document describes the system as it stands, honestly: what it does, how it works, what it is genuinely useful for today, and what is still missing before it could be called a complete police records and operations platform.

## What this is not

Not a digital version of a paper register. Not a generic case-management CRUD app. Not a multi-station or head-office system yet (see "What is missing" below). Not a records system for DPP, Courts, or Prisons, each of those owns its own records once it exists; Police only ever owns Police's own records.

## How it works

**Local-first, single station.** Each installation is one Tauri desktop app with its own local SQLite database, migrated with `sqlx::migrate!` on every launch (`apps/police/src-tauri/migrations/`). Nothing needs a network connection to work. There is currently no sync engine between stations and no central server; each station's data lives only on that station's machine, backups and multi-device sync are not built.

**Rust owns the domain, not just the database.** Every feature is a Rust module under `src-tauri/src/domain/` (people, cases, incidents, statements, custody, bonds, exhibits, charge sheets, referrals, station diary, duty, station assets, vehicles, shift log, officers, search, activity, reports, documents, attachments, import) with its own structs, SQL, and business rules (for example, 48 hour custody compliance is always derived from stored timestamps, never a manually set flag). The frontend never touches SQL. `src-tauri/src/commands/` are thin one-line wrappers exposing each domain function as a Tauri command; the React app calls them exactly like it would call a remote API.

**Two transports, one set of domain functions.** In development, a small local HTTP server (`transport/dev_server.rs`, port 47821, compiled out of release builds entirely) mirrors every Tauri command so the UI can be exercised in a plain browser tab without the Tauri shell. In production, the same domain functions are reachable only through Tauri's `invoke()` bridge.

**Optional remote access, off by default.** A station can turn on a second, much smaller HTTP server (`transport/remote_server.rs`, port 47822, always compiled in but never started unless a Settings toggle is on) that a phone can reach either over the local network or, via an optional Cloudflare Tunnel, from anywhere. This surface deliberately exposes only: badge and password login, civilian-scoped search (a person, a case, custody status, a bond, a statement, a charge sheet, or a vehicle, nothing about internal station operations like the duty roster or the armory), a "request backup" call, custody deadline alerts, and check-in. It never exposes the full desktop feature set. Local desktop use itself has no login at all; anyone with physical access to the machine has full access, matching how a station's own computer already works today.

**Everything writes to a real file vault, not just a database row.** Every domain that creates a record also writes a human-readable Markdown file for that record into a local "Police Vault" folder structure (`domain/markdown.rs`, per-domain `write_*_markdown` functions), and every record can carry file attachments (photos, scanned documents) stored alongside it. A full station export exists in three formats: a browsable Markdown/file tree (zip), an all-tables Excel workbook, and a flowing PDF/DOCX document, all generated from the exact same data every screen in the app reads (`domain/documents.rs`). Structured spreadsheet import exists for bulk-entering historical records domain by domain (`domain/import.rs`).

## Feature map

Organized the way the app's own sidebar organizes it, not as a database schema; several of these are workspaces or derived views over other domains' data, not separate tables.

**Overview.** What needs attention right now: active backup requests, custody records at or near the 48 hour limit, today's station diary volume, open cases, a cross-domain Recent Activity feed (station diary, incidents, statements, custody, bonds, charge sheets, referrals, cases, vehicles, check-ins, and handovers, merged and sorted by recency), and an 8 week case-intake trend.

**Search.** One global search (top bar, `Ctrl+K` command menu, and a dedicated `/search` page) across every domain at once, ranked by exact-identifier match first, then exact name, then partial match. Dedicated list screens for People, Files, Cell Lock-up & 48h, and Bonds & Sureties.

**People.** The one cross-cutting identity record: name, phone, national ID, address, up to four photo angles plus a headshot, and every other domain's relationship to that person (cases, incidents, statements, custody history, bonds, exhibits, charge sheets, vehicles, station diary mentions) assembled into one profile page. Printable and exportable (PDF, DOCX) per person.

**Station Diary (SD).** The counter-level activity log: rich-text entries, categorized, optionally linked to a person. Most entries stay purely informational; there is deliberately no automatic rule promoting an SD entry into an Incident, since no such real procedure has been confirmed.

**Incidents.** What happened or was reported: summary, rich-text description, location, time, optional links to a person and to the SD entry it may have come from.

**Cases and Investigations.** Cases hold formal case identity, status, and the people involved with their roles. "Investigations" is not a separate database table; it is a composed workspace view over a case's own already-linked people, statements, custody, bonds, evidence, and a derived timeline, the one place the product is meant to feel most different from a generic records app.

**Statements.** Recorded testimony with procedural weight: who gave it, who took it, when, rich-text content.

**Evidence & Exhibits.** Exhibit identity plus a real chain-of-custody log (every movement event, who moved it, where, why), deliberately kept separate from Stores/Armory despite both being "physical items," since the accountability model differs.

**Custody.** The operational and legal accountability record around detention, built around Uganda's 48-hour constitutional requirement (Constitution Art. 23(4), Police Act s.25, verified against primary text) plus the cross-jurisdiction transfer window. Compliance is always computed live from arrest/transfer timestamps, never a status an officer sets by hand. An app-wide modal interrupts with the deadline the moment a record crosses into "at risk," not just a passive banner on the Overview page.

**Bonds & Sureties.** Bond and surety terms tied to a person and, where relevant, a case, including PF18-shaped fields.

**Charge Sheets & Forms.** Generated from Person, Case, Statement, and Evidence data that already exists rather than re-entered, matching the real UPF form series where confirmed (PF53 and related).

**Referrals & Dispatches.** One record type for sending a case elsewhere (DPP, Courts, or another station), destination, status, timestamps. This is a one-directional record today: Police records that a referral happened, it does not yet track or receive a DPP or Courts response, since neither of those apps exists yet.

**Stores, Armory & Impounded Assets, and Vehicles.** Station equipment and weapons, unclaimed or impounded public property, and (new this build) a plate/make/model/owner vehicle registry searchable by plate number the same way a person is searchable by national ID, with an optional link to a Person as owner.

**Duty Roster, Officer Check-in, and Shift Handovers.** A duty assignment schedule, plus a real "who actually reported in and when" log with two check-in paths (a badge number typed at the front desk, or an officer's own phone, already logged in, tapping "Check in" from the same page it uses for everything else remote), and a shift handover log capturing who took over from whom, when, and what happened.

**Station Admin.** Station profile, establishment (staff roll), and officer accounts (badge number, password, role, optionally linked to that officer's own Person record for phone, address, and national ID).

**Reports & Analytics.** Weekly trend buckets and status/category breakdowns across every domain, answering "how is the station doing over time," distinct from Overview's "what needs attention now."

**Logs.** Every remote access request, and the full backup-alert history with live status (requested, responding, ended) and responder.

**Remote access and backup dispatch.** A phone reaches the station (Cloudflare Tunnel or local network) for civilian-status search, custody alerts, check-in, and a "request backup" call. A backup request becomes a tracked, live, app-wide event on the desktop side: a synthesized ringtone, a modal with the requesting officer's location and a responder picker, a toolbar indicator, and a persistent toast, all staying live until the dispatch is explicitly ended, not just fired and forgotten.

**Data portability.** Full-station export to a Markdown/file vault (zip), an Excel workbook, or a PDF/DOCX document; per-record printing and export from most detail pages; structured CSV/Excel bulk import mapped against each domain's real fields, with person and case references resolved by name/national ID/reference rather than requiring raw internal IDs.

## Getting started

From the monorepo root (Bun workspaces, Turborepo):

```
bun install
cd apps/police
bun run tauri dev     # full desktop app
bun run dev            # Vite only, browser tab, talks to the dev-fallback HTTP server
bun run check           # TypeScript typecheck
bun run tauri build     # native app bundle
```

No environment variables or external services are required for local use. Remote access (Settings, Network tab) is opt-in and needs nothing beyond the toggle for local-network reach; Cloudflare Tunnel access additionally needs a Cloudflare account and domain, configured from the same Settings tab.

## How this compares

Against a paper register or a spreadsheet, which is the real baseline in most stations today, this is a substantial step forward on its own terms: every record type is structured and searchable instantly instead of by manual flipping, the 48-hour custody clock is computed automatically instead of tracked by memory or a wall chart, a person's full history across every domain is one search away instead of scattered across separate books, and nothing depends on one physical ledger that can be lost, damaged, or is only ever in one place at a time.

Against a commercial police records management system (RMS) or computer-aided dispatch (CAD) product, which typically assume a funded IT department, a persistent network, and often a cloud subscription, Pleadli Police's real advantage is that it needs none of that: it runs fully offline on ordinary hardware, has no subscription cost, and every domain is grounded in verified Ugandan procedure (the Constitution, the Police Act, real UPF form numbers) rather than a generic Western policing model relabeled. Its real disadvantage against that same category is scale and maturity: no computer-aided dispatch, no radio integration, no live officer location tracking, no multi-station deployment, no years of field hardening, and several procedural areas (bond authorization rank, the exact SD-to-CRB conversion rule, surety cash-deposit rules) are explicitly flagged as unverified rather than guessed at.

Against building nothing and continuing as-is, the honest comparison is: this system already does real, verifiable things a paper process cannot (live 48-hour compliance, cross-domain search, a real chain-of-custody log, generated charge sheets from data already entered once), while deliberately not pretending to solve problems (national ID verification, biometric matching, inter-agency case transfer, head-office oversight) that would require infrastructure and institutional agreements far beyond what one station's desktop app can supply on its own.

## Usefulness to the Uganda Police sector, station level to head office

**At the individual station, today, this is genuinely useful as-is.** An officer can log a person once and see everything the station knows about them from then on; custody compliance is enforced by the software rather than left to a duty officer's memory; a backup call actually interrupts the desk with a live, impossible-to-miss alert instead of a shout down a hallway; charge sheets are generated from data that was entered once, not retyped by hand for a third time; and an officer in the field can check a name, a plate, or a case status from their own phone without radioing the desk. This alone would materially reduce daily friction at a station that is currently running on paper, memory, and a shared exercise book.

**Above the single station, the honest answer is: not yet.** There is no concept today of a division, a sector, or a national headquarters seeing anything across stations. Each installation is an island: its own database, its own vault, no replication, no aggregation, no dashboard a divisional commander or IG's office could open to see trends, workload, or compliance across multiple stations. `docs/police/PRODUCT.md` names the intended direction explicitly (Officer, then Unit/Team, then Station, then Division/Sector, then Organization) and is equally explicit that a connected, multi-station deployment is a future capability layered on top of standalone usefulness, never a requirement for it, and that none of that sync/aggregation infrastructure should be built ahead of a real, confirmed need. That discipline is a deliberate strength of the engineering approach (nothing here is scaffolding for a feature that does not exist yet), and it is also, honestly, the single largest reason this cannot yet be described as a national or even a multi-station system. It is real software for one station, not yet a platform for a police service.

The remote-access piece is the one place a station already reaches slightly beyond its own four walls, an officer's own phone, anywhere the tunnel reaches, but that is still entirely one station's own officers reaching their own station's own data, not cross-station or head-office visibility of any kind.

## What is missing

Grounded in the product's own stated boundaries (`docs/police/PRODUCT.md`) and this build's actual state, not speculation:

- **No multi-station or head-office layer.** No sync engine, no cross-station data sharing, no divisional or national dashboard, no way for anyone above a single station to see anything. This is the largest gap for describing the system as useful to "the Uganda Police sector" as a whole rather than to individual stations.
- **No real audio or video calling.** "Request backup" is a tracked status event (who, when, where, responded by whom), not a live voice or video channel; this was deliberately scoped out this session because the current remote-access architecture (Cloudflare Tunnel, HTTP/WebSocket relay) has no WebRTC/TURN/media infrastructure, and building that is a materially larger effort with a real consent and recording-during-duress policy question that has not been decided.
- **No mobile app.** The "remote side" is a single, deliberately minimal server-rendered web page an officer's phone browser loads, not a native or installable mobile application with offline support, push notifications, or a richer interface.
- **No live location tracking or radio integration**, and none is planned as a near-term feature; a backup request captures a one-time location snapshot at the moment it was sent, not continuous tracking.
- **No external identity or biometric integration.** No connection to a national ID system, no fingerprint or biometric matching. The product's own boundary language explicitly allows for this to be connected later without a redesign, and explicitly forbids inventing or faking such an integration in the meantime; none exists today.
- **No DPP, Courts, Lawyers, or Prisons applications exist yet.** A referral to DPP or Courts is a one-directional Police record ("we sent this"); there is no receiving system, no response tracking, no case-file handoff beyond that single record. The wider Pleadli ecosystem this app is meant to be one piece of is, for now, only this one piece.
- **Several real Ugandan procedural details remain explicitly unverified, not invented.** Documented case by case in `docs/police/research/`: the exact rank authorized to grant an ordinary (non-preventive) bond, whether a surety can be a cash deposit or only a person of accountability, the precise rule for which Station Diary entries convert to the Crime Report Book, and the CID-to-DPP referral hand-off mechanics beyond the Two-Stage/Threshold Test itself. Nothing in the product treats these as settled; they are flagged as open, pending real legal/procedural review.
- **A real, unresolved data protection question.** Whether routing remote-access traffic (even encrypted) through Cloudflare's edge counts as processing data outside Uganda under the Data Protection Act and 2021 Regulations has not been settled, and is documented as an open caveat rather than quietly assumed away.
- **No formal role-based permission system.** Officer accounts exist with a role field, but there is no enforced permission model beyond that; local desktop access itself has no login at all.
- **No audit trail for local desktop actions.** Remote (phone) access is logged in full; what happens directly on the desktop app is not separately audited beyond each record's own created/updated timestamps.
- **No offline-conflict resolution or true multi-device sync**, even within a single station; the architecture is deliberately left open to add this later ("Local when possible. Connected when available. Explicit about synchronization.") but nothing here implements it yet.
- **Reports & Analytics is basic aggregation**, weekly trend buckets and status counts, not forecasting, staffing optimization, or any deeper analytical capability.
- **Case-management task/workflow features are deliberately absent.** The Investigation workspace shows a case's real linked data; it does not include generic task boards, assignment tracking, or project-management features, a deliberate choice to avoid building speculative process tooling ahead of a real, named requirement.

None of the above are silent gaps; each is either named directly in `docs/police/PRODUCT.md`'s own "what to research later, not invent now" and "ecosystem boundaries" sections, or is a straightforward consequence of a single-station, offline-first architecture that has not yet been asked to become a multi-station one.
