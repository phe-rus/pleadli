# 10. Facility-first workspace model

Status: **approved 2026-09-20 (recommendations N1 to N9 accepted). Phases A (shell), B (onboarding and sign-in policy), C (connectivity and inbox), D (documents and printing) and E (settings, localization, Head Office onboarding, clean-up) built, see section 14.** Written 2026-09-20 after running the real frontend against a real node (method and limits in section 1). Builds on 01 to 05 and 08 and does not replace their research. Where it disagrees with them it says so (section 12).

The one-line product: **an officer opens Pleadli and is inside their prison's workspace. Head Office, courts and the internet are things that quietly attach to it later.**

## 1. What was inspected, and how

The Tauri window could not be captured here (Wayland session, X11 grab returns black). So the walkthrough used the **real frontend on Vite against real nodes over the debug loopback**, driven by headless Chromium:

- the existing dev database (facility, already paired), signed in as the debug-only `DEV-FAC` account, every area visited plus the command palette;
- a **clean first-run node** (empty data dir, `role: null, bootstrap: true`), walked from role choice to first workspace.

Not covered: the Tauri window chrome (drag region, resize handles, OS buttons), desktop notifications, the LAN workstation flow, prisoner file, reception and discharge procedures (the code was read, the screens were not). Treat those as unverified.

## 2. What is actually there (evidence)

| Area | Observed | Against the model |
|---|---|---|
| First run | Role choice (Facility / HQ / Workstation) then **"Connect to Head Office" before anything else**, then create first account, then the workspace | Inverted. Identity should come first, HQ last and skippable. The connect screen is the second screen a new officer meets |
| Facility identity | Never asked. Today shows a "Set the facility profile" nag card. Profile has name, number, location, region, capacity only | No badge format, numbering, timezone, language, document identity, register identity at setup. `facility_profile` is too thin |
| Sign-in | Badge + password, min 8 chars, 5-attempt lockout, 4 h idle / 12 h absolute session. No "remember officer", no password policy | Password is always required. Nothing is configurable per facility |
| Shell | Title bar, 44px ribbon (Today, Add, Search, Settings), 240px navigator, tab strip, right context panel, status bar. Committed 2026-09-20 | The pieces exist. The behaviour is not Obsidian yet (below) |
| Tabs | Only **records** open tabs. Visiting Population or Legal leaves the strip showing just "Today" | In Obsidian everything you open is a tab. This is the biggest gap in feel |
| Navigator | "Recent", then "Workspace" heading that contains "Search", then a second "Work/People/Institution" list that repeats Today. 12 route rows always visible | It is the old route list re-skinned. Duplicates, no collapsing, no pinned, no contextual section |
| Recent | Rows read `/prisoners`, `/settings`, `/officers` (raw paths) | Bug: `ActiveTabSync` passes `pathname` as the title for area views |
| Ribbon | Home, Add a record, palette, settings. **No quick-actions menu**, no notifications, no connection state | The first control is not useful yet |
| Status bar | "Facility node · Badge DEV-FAC", tab count, date | No facility name, no connection, no notifications. "Facility node" is jargon for an officer |
| Notifications | None. Only two desktop-alert hooks (obligation deadlines, pending-facility requests). No storage, no inbox, no unread state | Whole subsystem missing |
| Connectivity | Settings > Network & Sync shows "Connected" beside "Never synced". Sync is a periodic snapshot push, plus roster push and policy pull. No outbox count anywhere | State is not honest or quiet, and there is no per-class sync scope |
| Settings | Four tabs: General (theme only), Network & Sync, Numbering and uniforms, Node and backups | Not the sectioned model asked for. No ownership labels |
| Printing | `window.print()` on Reports only | Not first class. No document numbering, identity block, page numbers, attestation areas |
| Localization | No i18n dependency, all strings inline | Nothing to extract into yet |
| Contrast | Pre-auth left panel headline is dark text on dark blue, close to unreadable | Accessibility defect, seen on every first-run and sign-in screen |
| Data | Population "Prisoner number" column shows the UUID for the seeded prisoner. Officers table lists the leftover `DEV-HQ` account inside a facility | Dev-data artefacts, but check that numbering really applies at reception |

## 3. What stays

Do not rewrite these because the shell changes:

- **Custody spine and the node**: authenticated `/api/**` surface with per-route `Need`, hash-chained audit on the caller's transaction, sessions, devices, encrypted backup and restore, recovery gate. This is why the facility can already run alone. It is the strongest part of the product.
- **Reception, discharge, two-ended transfer** procedures and `ProcedureShell`; Today's obligation queue; Legal diary and thresholds; visits lifecycle; requests; numbering and uniforms; officer profiles and photos.
- **Facility connection request and HQ approval** (`domain/connection.rs`, `peer.rs`, `api/network.rs`). It already matches sections 9 to 11 of your brief in shape. It needs a better front door, not a new mechanism.
- `@pleadli/ui`, `@pleadli/forms-tables`, TanStack Router and Query, the existing `tabs-store` (persisted locally, keyed tabs, recents). Extend, do not replace.

## 4. Three layers, and who owns what

```
                    PLEADLI
        ┌───────────────┴───────────────┐
    FACILITY                            HQ
  local prison work              organisation work
        └────────── CONNECTIVITY ───────┘
                 (optional, revocable)
                         │
              Courts and other systems
              (reached through HQ, later)
```

Invariant: **a facility never needs a connection to do a lawful day's work.** Connection adds things; it never gates them, and disconnecting removes only the additions.

| Facility owns | HQ owns | Inherited from HQ, overridable where HQ allows |
|---|---|---|
| Facility identity, officers and badges, local authentication policy, prisoners and every custody record, local numbering, printers, backups, workflow preferences, its audit log | Organisation identity and code, facility directory, organisational roster and roles, directives, statutory return structures, network and sync policy, AI access, jurisdiction pack selection | Language defaults, document identity template, numbering pattern, return schedules, notification rules |

The UI shows an ownership chip on every settings section: **This facility**, **Set by Head Office**, or **Set by Head Office, you may change**. Nothing HQ-owned is editable in a facility, and the reverse.

## 5. The workspace shell

### 5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▣ Luzira Upper Prison                                    [tabs...  +]   ─ □ × │  title bar carries the tabs
├──┬───────────────┬─────────────────────────────────────────────┬─────────────┤
│▸ │ Search…       │                                             │ CONTEXT     │
│⌕ │ ─────────     │                                             │ Connected   │
│◫ │ ▾ Pinned      │              ACTIVE TAB                     │ records     │
│✉ │ ▾ Open        │           (fills the space)                 │ Related     │
│  │ ▾ Recent      │                                             │ Timeline    │
│  │ ▸ Areas       │                                             │ Documents   │
│  │ ─────────     │                                             │             │
│⚙ │ Officer chip  │                                             │             │
├──┴───────────────┴─────────────────────────────────────────────┴─────────────┤
│ UP-0142 Test Admin                        ● Connected   ✉ 3   Sun 20 Sep 2026 │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Tabs live in the title bar row** (Obsidian's arrangement), not in a second bar. That gives content one more row of height and is the "tabs integrate with the header" request. The drag region is the empty stretch of that bar.
- **Content fills the remaining area.** The ribbon is fixed to the left window edge, the navigator is resizable and collapsible, the context panel is contextual and collapsible.
- **One working pane in v1.** Splits are deferred until a procedure genuinely needs the file beside the step (matches `UX.md`). The right context panel gives most of the value of a split for far less state.

### 5.2 Tabs: everything you open is a tab

A tab is `{ key, kind, title, to }`. Kinds: `area`, `prisoner`, `procedure`, `document`, `inbox`, `settings`. The route is still the source of truth for what is shown; the tab is the workspace's memory of it.

- Opening an area (Population, Legal, Settings) opens or focuses its tab. One tab per key, so navigation never duplicates.
- Titles resolve from the query cache (as `useTabTitle` already does for prisoners) and from a static label table for areas. **Never a raw path.** This also fixes the Recent bug.
- Pin, close, reorder by drag, middle-click closes, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+1..9`. Pinned tabs are compact (icon only) and survive a restart.
- A tab in a dirty procedure asks before closing (the existing dirty-guard).
- Persisted per officer, not per machine. The store key includes the badge so a shared machine never shows one officer's open prisoners to the next. This is a confidentiality fix, not polish.
- Cap at 12 open tabs with least-recently-used eviction of unpinned, clean tabs. Old hardware: an evicted tab costs nothing because the data is a cached query, not component state.

### 5.3 The ribbon and the first control

Top to bottom:

1. **Quick actions** (`+`): a small menu, not a drawer. Filtered by the officer's permissions and by context:
   - *Find*: Search, Open recent, Command palette
   - *Start*: Receive someone, Receive a transfer, Court trip, Discharge, Transfer out, Visit, Request (person-scoped ones ask "who" first)
   - *Go*: Today, Notifications
   - *Record*: Scan or attach a document
   Inside a prisoner tab the *Start* group leads with that person's procedures.
2. **Search** (opens the palette in search mode).
3. **Today** (pinned home).
4. **Notifications** (bell with unread count). Section 8.
5. spacer
6. **Settings**.

The ribbon stays visible when the navigator is closed so the fastest actions are always one click away.

### 5.4 The navigator: small, meaningful, contextual

Replace the route directory with four collapsible sections. Collapse state persists.

- **Pinned**: what the officer or facility pinned (a prisoner, a diary, a register).
- **Open**: the current tabs, grouped, with a close affordance. This is the answer to "where was I".
- **Recent**: last 8, real titles.
- **Areas**: the 9 areas from doc 08 (Today, Movements, Legal, Population, Care and contact, Records, Returns, Facility, and Security and order when piloted) as one compact list, **collapsed by default after the first week** (`areasCollapsed` remembered). The areas are a map, not the main way in. Search, the palette and quick actions are the main way in.

Removed: the duplicate "Search" and "Today" rows, the "Workspace" heading over a second heading, the permanent 12-row list. Head Office gets its own Areas list (doc 08 section 2); the shell is the same.

### 5.5 The context panel

Meaningful only when the active tab is a record. For a prisoner it shows, top to bottom: custody status and next obligations, **Connected records** (visits, productions, requests, property, documents referring to this person, i.e. backlinks), and the merged timeline. For a document or inbox item it shows the record it concerns and the audit trail of who opened or actioned it. Closed by default on area tabs. Its open state is per tab kind.

### 5.6 Status bar and connection

Left: officer badge and name. Right: connection dot, unread count, date.

- Connection is one **quiet dot and one word**: `● Connected`, `○ Offline`, `◌ Not connected`, `◐ Syncing`. Never a dashboard widget.
- Click opens a small popover: Head Office name, last exchange, **pending records**, network kind ("Internet", "Local network"), and `[Open connection settings]`.
- "Facility node" wording is removed from officer-facing chrome. The facility name goes in the title bar.

### 5.7 Command palette

Keep the existing one. Add: quick-action verbs, open tabs, pinned items, inbox items ("Court communication, John Doe"), and settings sections. Permission-filtered as now.

### 5.8 Motion and accessibility

CSS transitions of 120 to 200 ms for panel open and close, section expand, tab switch fade. `motion` only where a layout animation is genuinely needed (tab reorder). Everything behind `prefers-reduced-motion`. Full keyboard path: every ribbon control focusable with a visible ring, tabs are `role="tablist"`, the navigator is a labelled tree, the palette traps focus. Fix the pre-auth panel contrast to meet AA. The pre-auth screens use 44px targets.

### 5.9 Performance rules

Nothing preloads the database. Area and record routes load their own query. Lists use server-side paging (`DataTable` already pages). The shell subscribes to the tabs store through selectors so a tab change re-renders the strip, not the page. Notification count is one cheap `COUNT` query with a poll of 30 s while the window is focused and none while it is not.

## 6. Onboarding: facility first

### 6.1 Flow

```
Start (first run)
  → "How will this installation operate?"   Facility | Headquarters   (Workstation moves under "Advanced")
  → FACILITY
      1. Identity        name, facility code, location, region, country
      2. Conventions     badge format, prisoner number, document number, register identity   (each with a live preview)
      3. Regional        language, timezone (defaults from the jurisdiction pack)
      4. First administrator   badge, name, password
      5. Sign-in policy  who needs a password (default: everyone)
      6. Head Office     "Not connected. You can connect later."   [Connect now]  [Skip]
  → Workspace (Today, with a one-time "here is what you can do" ribbon, not a modal tour)
```

Six short screens, one decision each, back always possible, progress shown as a thin line. Nothing asks about networks, ports, tunnels or keys. Step 6 last and skippable is the whole point: it is where the current flow starts.

The choice screen wording follows your brief. "Workstation of a facility node" is a real case (LAN), but it is a second-line option because it confuses the primary decision.

### 6.2 What is asked, and what it does

Each field carries one sentence of purpose, for example: *Facility code, "UG-LUZ-001". Printed on every document and used by Head Office to recognise this facility. Cannot be changed after the first prisoner is admitted.* Locked fields say why they lock. Defaults come from the jurisdiction pack (section 10), so Uganda's `{SEQ:4}/{YEAR}` numbering stays marked **provisional** exactly as `numbering` marks it now.

### 6.3 Headquarters onboarding

Organisation name, organisation code, headquarters name, jurisdiction pack, languages offered, facility numbering, badge conventions, document identity, then the first administrator. Network and sync policy, AI, reports and provisioning are settings, not onboarding.

**Decision D-N1** (below): today HQ needs an activation code issued by Pleadli Cloud. Your model has no cloud prerequisite. Recommendation: HQ onboarding stands alone; the Cloud code becomes an optional later "verify with Pleadli" step.

### 6.4 Sign-in and officer accounts

The officer identity is the **badge**. Sign-in is `Badge` then `Secret`.

Policy is stored on the node (`auth_policy`, facility-owned, changed only by an administrator, every change audited):

| Mode | Behaviour | Guard rails |
|---|---|---|
| **Password** (default) | As today, min length raised by policy | Lockout unchanged |
| **PIN** | 4 to 8 digits, hashed like a password, same lockout | Not available to administrator accounts |
| **Badge only** | Badge alone, for a controlled room | Off by default; enabling needs an administrator's password, shows a warning, is audited, **never** applies to administrator or Head Office roles, and refuses on a node serving LAN workstations |

Fast return after a restart: the sign-in screen offers the last **three** badges as tappable chips (not a remembered password), then the secret. A locked screen after idle re-asks only the secret for that badge. The idle and absolute session limits become policy values with the current 4 h and 12 h as defaults.

Development defaults: the existing `#[cfg(debug_assertions)]` `dev-password-1` seeding stays debug-only and gets a test that a release build cannot construct it. Production always runs first-administrator setup.

Dismissal: deactivate, revoke sessions, keep the row. Historic audit entries keep resolving to the name and badge. (Already the model: "Accounts are deactivated, never deleted"; the Head Office-only delete added 2026-09-19 needs a guard that it refuses when an officer has any audit entry.)

## 7. Connectivity: the seam

The rule from your brief: **design the whole model, build the seam.** The seam is a small, honest layer that the shell, settings and inbox all read, and that HQ and courts later plug into without touching feature code.

### 7.1 One state machine, one status endpoint

```
not_connected → pairing → awaiting_approval → connected ⇄ offline
                     ↘ rejected                     ↓
                                              disconnected (local data intact, can reconnect)
```

`GET /api/network/status` (facility side) returns one object: `state`, `headOffice { name, reference }`, `lastExchangeAt`, `pending { outbound: n }`, `transport { kind }`, `policy { classes: [...] }`. The dot, the popover, Settings and the inbox all consume this and nothing else. Today the same facts are scattered across `hq_config`, `peer_sync_config`, `cloudflare_config` and a UI-only guess.

`transport.kind` is one of `local_network | internet | tunnel | file`. It is displayed as a plain word and configured nowhere in the UI; the node decides. `file` (USB or export package) is a first-class transport because facilities without reliable links exist.

### 7.2 Data-aware sync classes

Replace "push the prisoners snapshot" with an explicit class table, evaluated on the node:

| Class | Direction | Default | Content |
|---|---|---|---|
| `identity` | up | on | facility identity, reference |
| `roster` | up | on | officer names, badges, roles, status (never secrets) |
| `returns` | up | on | statutory returns the facility chooses to submit |
| `locator` | up | policy | who is held here, minimal (doc 03 tiers T0 to T2) |
| `directive` | down | on | Head Office directives, configuration |
| `communication` | both | on | court and HQ communications addressed to this facility |
| `records` | none | **off** | full custody files never leave the facility except by a confirmed transfer dossier |

Each class has a queue and a count, so "Pending 7" is a sum of real outbox rows. The class table is shown read-only in a facility ("What Head Office receives") so an officer can see the boundary. Doc 03 already defines the tiers; this table is how they reach the UI.

### 7.3 What is built now versus later

| Built in this target | Designed, not built |
|---|---|
| `network/status` endpoint and the shared connectivity hook | Court routing and courts as peers |
| Status dot, popover, honest "Not synced yet" | Multi-hop delivery, retries beyond a simple outbox |
| Outbox table and count (locally meaningful even with no HQ) | AI access grants |
| Existing connect, request and approve flow moved into Settings > Head Office and offered at onboarding step 6 | Organisation-level policy editing UI |
| Disconnect (revoke, keep all local data, keep queue local) | Statutory return submission to HQ |
| Inbox that local events already feed | HQ-originated directives and court items (the inbox has the shape; nothing sends yet) |

### 7.4 Connecting later

HQ side: **Connect a facility** produces a package: address, connection key, facility reference, with Copy, Print (a real printable page with the identity block), and Save as file. Facility side: **Settings > Head Office > Connect** takes those three values, or the file, and runs the checks in order (reachable, key valid, HQ recognises the reference, not already paired, identity consistent). Each check reports in plain words and stops at the first failure with the fix. An unknown facility becomes a **connection request** at HQ for Approve, Review or Reject, using the existing request tables. No reinstall, no migration, local data untouched; the first exchange sends only classes in the policy.

## 8. Notifications and the inbox

### 8.1 A legal and operational inbox, not chat

One table on the node, `inbox_items`:

`id, kind, source, source_ref, recipient (officer, role or facility), subject, body_ref, related_type, related_id, status (new, acknowledged, actioned, dismissed), read_at, read_by, actioned_at, created_at, origin (local, head_office, court, system)`

- Every read, acknowledge and action writes to the existing hash-chained audit.
- **Unread is per officer** (`inbox_reads`), status is per item. Two officers can each have it unread; when one actions it, both see "Actioned by X".
- Items are addressed to an officer, a role (for example `records_clerk`), or the facility. Permissions decide visibility, as everywhere else.
- An item **opens its source**: a prisoner tab, a production, a document. If the source is missing (not synced yet) it says so instead of failing.

### 8.2 Sources, in the order they become real

1. **Local, now**: obligation due or overdue, transfer awaiting arrival confirmation, mandatory-bail threshold, backup overdue, pending sync, connection changes, account events. These need no HQ and make the inbox useful on day one. The two existing desktop-alert hooks become producers of items instead of one-off toasts.
2. **Head Office** (`origin: head_office`): directives, configuration changes, report requests.
3. **Courts** (`origin: court`, arriving through HQ): production request, return notification, instruction to report back.
4. **Manual**: an officer records an official communication received on paper or by phone. Same item, `origin: manual`, so the offline path is a first-class citizen.

### 8.3 In the shell

- Bell in the ribbon and a count in the status bar (one source of truth). Hover shows the five newest. Click opens the **Inbox as a tab**, a two-column list and reader: the list rows show `●/○`, kind, subject, source, time; the reader shows source, recipient, type, related record, status and audit context with `[Open]` and `[Acknowledge]`.
- Court items that must be actioned stay in "Needs action" until handled, however old.
- No toast for routine items. A toast only for something the officer must not miss (a due mandatory-bail person, a court return). Desktop alerts follow the existing setting.
- Filter chips: Needs action, Unread, Court, Head Office, Transfers, System. No folders, no threads, no compose (a *manual record* form only).

## 9. Settings that reflect ownership

Left-nav sections, each opening as its own tab-pane, each with an ownership chip:

`Facility` (identity, location) · `Numbering and identity` (badge, prisoner, document, register) · `Documents and printing` · `Language and region` · `Officers and roles` · `Sign-in and security` · `Head Office` (connect, status, what is shared) · `Notifications` · `AI` · `Backup and recovery` · `Audit` · `Device and node` (advanced)

HQ variant: `Organisation` · `Facilities` · `Roster and roles` · `Conventions` · `Returns` · `Network policy` · `AI access` · `Jurisdiction` · `Audit` · `Backup`.

Section state is in the URL (`/settings/$section`), so a section can be a tab and a palette target. The current four-tab page is split into these; its contents (numbering, node, backups, network) move, they are not rewritten.

## 10. Printing, localization, jurisdiction: seams, not islands

### Printing

One print pipeline for everything: `PrintableDocument { kind, number, date, authority, body, attestations[], references[], verification }` rendered by one `<PrintFrame>` with a print stylesheet (A4, running header with facility identity and document number, page X of Y, footer verification block, signature and attestation areas as configured). Documents get a number from the facility's document-numbering pattern at **issue** time, and reprints say "Reprint". Register and report views print through the same frame. First consumers: transfer dossier, reception record, discharge certificate, monthly return (already `window.print`), and the connection package. The current `prisoner-document.tsx` is the natural first port.

### Localization

Adopt **Paraglide** per `LOCALIZATION.md` (compiler-first, typed keys, settings-backed locale, no URL prefixes). Start now with the **shell, onboarding and inbox** strings so the new code never contains raw English, and extract the rest area by area as each is touched, not in a big-bang pass. Ship `en` complete; `sw`, `fr`, `de`, `zh` files exist with English fallback so a missing key never shows a raw key. This is the one new dependency in the plan and it is the one you already chose.

### Jurisdiction

A `JurisdictionPack` is a typed object selected at onboarding and stored on `facility_profile`:

```
{ id, name, terminology, regions[], timezoneDefault, languageDefaults,
  thresholds{}, documentTypes[], instruments[], registers[], returnLayouts[],
  statutoryRefs{}, identityCategories[], numberingDefaults }
```

Only `ug` is real. It is populated from what is already hard-coded (categories, thresholds, s.118, numbering defaults) so the seam is exercised by a live pack, not by a placeholder. The onboarding country field shows the pack it selects and says "Other jurisdictions require legal work and are not available", rather than offering a country dropdown that implies otherwise.

## 11. Security: what the UI must never imply

- Offline is not secure. The security settings section states the actual protection of local data and backup, including what is not yet encrypted at rest.
- Connected does not mean visible. "What Head Office receives" (7.2) is always one click from the status popover.
- Synced does not mean copied everywhere. Copy in the UI says *records shared* and names the class, never "your data is synchronised".
- The known debt you cite from the audit (plaintext secrets, unencrypted local storage, snapshot-style sync, missing CSP) is **not in this repository**, and I have not independently verified each item. The phase gate for connectivity is that the snapshot push is replaced by the class table before any real HQ is paired, and a CSP is added to `tauri.conf.json`.
- Release builds must contain no unauthenticated route. The 2026-09-19 note says the dev API was gated; the walkthrough confirms it is reachable only as a debug loopback. A release-build test should assert that.

## 12. Where this changes earlier decisions

| Earlier | Now |
|---|---|
| 08 section 1.1: nine areas in the sidebar as the main map | Areas become one compact, collapsible list. The main way in is search, quick actions, tabs and pins. The areas themselves are unchanged |
| 08: "no visual redesign proposed" | The shell is redesigned (the interface and structure), the design tokens and `@pleadli/ui` are reused as-is |
| Onboarding: HQ connect is the first real screen | Last and skippable |
| HQ requires a Cloud activation code | Proposed optional (D-N1) |
| Password always required | Policy, with guard rails (6.4) |
| Sync pushes a snapshot | Class table (7.2) |

## 13. Code structure

Keep "a route is a door, not the room". Extend `features/`, do not scatter.

```
features/
  workspace/       shell, tabs store, ribbon, navigator, context panel, status bar, quick actions
  onboarding/      the facility and HQ flows (moves the two gates out of components/)
  connectivity/    status hook, popover, class table, disconnect (wraps existing facilities/network data)
  notifications/   inbox tab, bell, producers, hooks (absorbs use-obligation-alerts)
  settings/        sectioned settings shell; sections import their feature (numbering, node, officers)
  documents/       PrintFrame, printable documents, numbering at issue
  jurisdiction/    pack type and the `ug` pack
  i18n/            Paraglide wiring, locale from node settings
```

Rust side, additive migrations only in a reserved range (no edits to saved migrations): `0090` facility identity and conventions columns + `jurisdiction`, `0100` `auth_policy`, `0110` `inbox_items` and `inbox_reads`, `0120` sync outbox and class table. New routes under `/api/system/onboarding/*`, `/api/prisons/inbox/*`, `/api/network/status`, all with a declared `Need`.

The state boundary: TanStack Query for anything from the node (facility, status, inbox); the tabs store for workspace layout; the URL for what is open. No global store beyond that.

## 14. Order of work

Each phase ends in something that runs and is checked in the real frontend against a real node, plus a Tauri window smoke test by you where I cannot capture it.

| Phase | Delivers | Backend |
|---|---|---|
| A. Shell | Tabs in the title bar, area tabs, real titles, per-officer persistence, quick-actions menu, new navigator, context panel refit, status bar with placeholders, contrast fix, motion and keyboard pass | none |
| B. Facility onboarding | Six-step flow, identity and conventions, jurisdiction pack `ug`, sign-in policy, first-admin, the "remember badge" chips | `0090`, `0100` |
| C. Connectivity seam and inbox | Status endpoint, dot and popover, outbox count, Settings > Head Office, disconnect, inbox tab and bell fed by local events | `0110`, `0120` |
| D. Records as workspace | Prisoner file as tab with connected records and timeline in the context panel; procedures and documents opened as tabs; `PrintFrame` and first three printables | small |
| E. Settings, i18n, refactor | Sectioned settings, string extraction of the shell and onboarding, HQ onboarding and settings variant, then the React structure clean-up you asked to defer | none |

### Phase A status (2026-09-20)

Built and checked in the real frontend against a real node (headless Chromium, `bun run build` clean): tabs in the title bar for areas, prisoner files and procedures with real titles; Ctrl W, Ctrl Tab, Ctrl 1 to 9, middle-click, drag to reorder, pin; workspace saved per officer; quick-actions menu (Find, Start, and Discharge or Transfer out for the file in view); Pinned, Open, Recent, Areas navigator with folding (Areas folds itself at 4 tabs); CSS-only panel and section motion with reduced-motion respected and `MotionConfig` for the rest; context panel and status bar (facility name in the title bar, connection dot from what the node knows today); pre-auth contrast fix.

Found and fixed on the way: `SplashScreen` replaced the whole window on **every** navigation while a route loaded, unmounting the workspace each time. It is now boot-only.

Not in Phase A, still owed: palette rows for open tabs and pins; a dirty-procedure guard when a procedure tab is closed; per-tab-kind context panel state; the notification bell (Phase C); the offline and pending-count states of the connection dot (Phase C); a check of the drag region, window controls and Ctrl Tab inside the real Tauri window, which could not be captured here.

### Phase B status (2026-09-20)

Built and checked against real nodes: a clean first-run node through the whole setup in the real frontend, and the migrations against a copy of the live dev database (data kept, defaults unchanged). `cargo test --lib`: 70 tests, up from 50.

- **Setup is five screens, not six.** Facility identity (name, facility code, location, region, with jurisdiction, language and time zone shown as facts), numbering (badge prefix, prisoner numbers with a live preview from the node, document prefix), the first administrator, how officers sign in, then Head Office. The planned language and region screen was folded into the first: with only English and one time zone there was nothing to decide, and a screen that asks nothing is worse than none. It returns when a second language ships.
- **One atomic save** (`POST /api/system/onboarding/facility`): role, profile, numbering, administrator and sign-in policy commit together or not at all, then the administrator is signed in. Nothing is saved before the fourth screen, so abandoning setup changes nothing. Head Office is offered last and reuses `ConnectFlow`; skipping costs nothing.
- **Sign-in policy** (`auth_policy`, migration `0100`): Password (default), PIN (4 to 8 digits, non-administrators), Badge only (accounts an administrator marks; never administrators or Head Office, never a workstation sign-in, refused while this machine serves the LAN, every such sign-in audited as `auth.login_badge_only`). Leaving badge-only strips the flag from every account. Idle timeout and session lifetime are now policy values (defaults 4 h and 12 h, as before). Settings has a Sign-in tab.
- **Facility identity** (migration `0090`): jurisdiction, language, country, badge prefix, document prefix. The facility code is the existing `facility_number` and locks once anyone is admitted. Time zone is deliberately not stored: dates are still kept in East Africa Time, and a time zone setting nothing honours would mislead.
- **Jurisdiction pack seam** (`features/jurisdiction`): `ug` only, holding regions, numbering default (still marked provisional), time zone and example values. Other jurisdictions are stated as needing legal work, not offered.
- **Sign-in screen**: the last three badges as chips (never a password), the label follows the mode, and a blank secret can be submitted under badge-only.

Found and fixed on the way: the debug-only sample prisoner was seeded before setup, which locked the numbering and made first setup impossible in any dev build (now seeded once the installation has an administrator); `TextField`, `SelectField` and the officer-form switches had no accessible name (label not associated); sign-out left a blank screen once the splash was boot-only, because the cache was cleared twice (the splash had been hiding it); a facility setup left the router in the error it got at startup, because the sign-in gate that normally reloads it is not mounted during setup.

Not built in Phase B: HQ onboarding stays as it was (activation code, N1 is Phase E); document numbering itself (only the prefix is stored, Phase D issues numbers); a "used the facility code before Head Office knew it" check; the officers table does not yet mark badge-only accounts.

### Phase C status (2026-09-20)

Built and checked: `cargo test --lib` (81 tests, up from 70), the real background loop and a fake Head Office end to end, and the real frontend for every screen below.

- **Connection status** (`GET /api/system/network/status`, `domain/connectivity.rs`): one object with `state` (not connected, awaiting approval, not approved, connected, offline, needs attention, disconnected), Head Office address, last exchange, pending count, plain transport word (Internet, Local network), last error and the class table. The status bar dot and popover, Settings and the inbox all read it and nothing else.
- **Honest pending count**: SQLite triggers record which prisoners and officers changed since they were last sent (`sync_outbox`), only while paired, one row per record, so "2 changes waiting" is a fact. A push marks only what changed before it started, so a change made during a push stays pending.
- **The exchange sends only when something changed** or the last attempt did not succeed, checks reachability first, and runs every 60 seconds (was a full snapshot every 5 minutes). Going offline is recorded as offline, the change stays pending, and the next tick after Head Office returns sends it. The headless node now runs the loop too (it did not before).
- **What Head Office receives** (Settings > Network and sync): `sync_classes` lists officer roster, prisoner records (the legacy whole-row push, labelled honestly and switchable off), and Head Office defaults (received), each with a switch and what is waiting.
- **Disconnect**: ends the link, clears the credential and the pending queue, keeps every local record, officer, backup and audit entry, and says so before it acts. Reconnecting begins with a full exchange.
- **Inbox** (`inbox_items`, `inbox_reads`, migration `0110`): unread is per officer, an item has source, recipient, type, related record, status and origin, and visibility follows permission (an item an officer may not see does not exist for them). Opening (first time only), acknowledging, actioning and dismissing are audited. Derived items (an obligation due or overdue, an overdue or failed backup, Head Office unreachable, a facility asking to connect) open with their condition and close themselves as "No longer applies"; recorded items (a communication typed in from paper) and one-off events (connected, disconnected, approved) stay.
- **The inbox follows a mail-client layout, at the user's direction on 2026-09-20**: the sidebar switches between Workspace and Inbox. The Inbox view lists the messages (filters, unread dot, a Closed group), and choosing one shows it in the content area with its details, status and the actions. The ribbon bell opens the sidebar on the inbox. This replaces the two-pane page described in 8.3 and reverses the earlier "do not look like an email client" note, on purpose.
- **Sidebar**: both views are fixed at `w-72`. Open always lists the open tabs (Today first), Recent shows at most three, Pinned appears when something is pinned.

Not built: HQ-originated directives and court items (the inbox has the shape and the `origin` values; nothing sends them yet), routing through Head Office, statutory return submission, the tiered exchange that replaces the legacy record push, and a related-prisoner picker on the manual record form.

### Phase D status (2026-09-20)

Built and checked: `cargo test --lib` (86 tests, up from 81), the real frontend against a fresh node with a seeded prisoner and a prepared transfer, and the print media view at A4 width.

- **Issuing** (`domain/documents.rs`, migration `0130`): the first print of a record's document assigns its number, `PREFIX/YEAR/0001` from the facility's own document prefix (set at setup) with a counter that restarts each year. Every later print is a reprint of the same number, counted, audited (`document.issued`, `document.reprinted`) and marked "Reprint n" on the sheet. Looking at a document never numbers it. A verification code (`XXXXX-XXXXX`, from the number, what it was issued for, when, and the facility) is printed in the footer, and `POST /api/prisons/documents/verify` checks a number and code against the register. It proves the number belongs to that record at that facility. It is not a signature and carries no secret.
- **`PrintFrame`** (`features/documents`): one frame for every printed document: facility identity, number, date, body, attestation areas, and a footer with who issued it and the verification. It is a light sheet on screen whatever the theme and the whole page when printed, with A4 margins, "Page X of Y" where the print engine supports margin boxes, and a footer that repeats on every page and never runs under the body.
- **Three printables**: reception record, discharge certificate (only for someone who has been discharged), transfer dossier (with the checklist and the electronic dossier digest). Each opens as its own **document tab**, titled for what it is and whom it is for.
- **Records as workspace**: the prisoner file's context panel gets a Documents list, each with the number it was issued under or "Not printed", opening the document as a tab. The shell hides all its chrome and lets content flow when printing.
- Found and fixed: the prisoner tab kept the title "Prisoner file" on a direct load, because the rename ran before the tab existed.

Not built: the monthly return and the connection package on `PrintFrame` (the return still uses `window.print`), a screen to check a printout's verification code, voiding an issued document, and the property statement and register printables. The dev Tauri window has not been used to print: the print dialog on WebKitGTK is the one thing I could not exercise here.

### Phase E status (2026-09-20)

Update, same day: **every remaining UI string in `apps/prisons/src` is now a Paraglide message** (about 2,350 in `messages/en.json`, area-prefixed keys such as `visits_...`). Method and rules are in `LOCALIZATION.md`. Left as literals on purpose: Tauri window-edge enum values, the languages' own names, jurisdiction pack data (regions, time zone), CSS class strings, date-fns format strings (dates still use date-fns' English names), log lines and the CSV header.

Built and checked: `cargo test --lib` (88 tests), `bun run build`, and the real frontend in headless Chromium against a fresh node for both installation kinds. Not yet checked in the real Tauri window.

- **Head Office stands alone (N1)**: `POST /api/system/onboarding/head-office` saves the role, the organisation's identity and the first administrator in one transaction, with no Pleadli Cloud code. `hq_config.activated_at` now means "verified with Pleadli" and stays empty until an administrator pastes a code in Settings, Organisation. The old code screen is gone from first run. A facility can never be turned into Head Office by this route, and it refuses LAN callers.
- **Sectioned Settings**: `/settings/$section` (`features/settings/`), a left list and one pane, with an ownership chip on each (This facility, This organisation, This computer). Facility sections: Facility, Numbering and identity, Language and region, Appearance, Sign-in and security, Head Office, Backup and recovery, Device and node. Head Office: Organisation, Numbering, Language, Appearance, Sign-in, Network, Backup, Device. All Settings sections are one Settings tab that remembers its section. "Set by Head Office" chips are defined but no section uses them yet, because received defaults are still shown inside Numbering. Head Office administrators can now read the facility profile (`GET /api/prisons/facility` accepts `node.manage`).
- **Settings shape**: one column, `w-full md:max-w-md`, that nothing inside overrides. Groups are `SettingsCard` (title, purpose, controls, footer with a hint and the one action) or `SettingsTable` rows, in the pattern Vercel, GitHub and Claude share. Content text is semantic tags only (`h3`, `h4`, `p`, `code`, `strong`), so the global typography styles it.
- **One side panel shape**: `--panel-width` (30rem: one 28rem column plus padding), flush right and full height, in both `Createpanel` and Add record. Header (`panel-header`), one scrolling body (`panel-body`), and the form's footer pinned to the bottom edge. Nothing inside a panel sets a width or centres itself.
- **Localization (N6)**: Paraglide 2 (`project.inlang`, `messages/{en,sw,fr,de,zh}.json`, compiled to the git-ignored `src/paraglide`). `en` is complete for the shell, onboarding (both flows), and Settings chrome; the other four fall back to English key by key. `features/i18n` holds `LocaleBoundary` (remounts on change), `changeLocale`, and `useLocaleFromProfile` (the language is stored on the node). Locale strategy is `localStorage` then base locale, no URL prefixes. `bun run check` and `bun run build` compile the messages first. The node accepts only `en` as a language today, so the language selector has one option until translations exist.
- **React clean-up**: the two gates left `components/` (`features/onboarding/onboarding-gate.tsx` with `role-choice`, `workstation-screen`, `facility-setup`, `head-office-setup` on one `SetupScreen`/`Progress` frame; `features/session/sign-in-gate.tsx`).
- **User directions given during Phase E**: the sidebar has no Open section and Recent holds three items at most (`MAX_RECENTS`); the inbox filter chips are small coloured pills; no inline typography in content markup.

Not done: Backup, Head Office network and Numbering panes still carry their own inner structure beyond the card frame; palette rows for Settings sections and tabs; a real Tauri window check of Phases A to E; the language selector's other locales.

### Resource limits and error handling (2026-09-20)

After a dev session froze the machine (window process at 100% CPU and 4 GB, plus the "useWorkspace must be used within WorkspaceProvider" error), these guards were added:

- **One instance**: `tauri-plugin-single-instance` was already registered first; `scripts/guard.mjs` (run by `bun run tauri`) also refuses a second dev session (ports 3005 and 47922 in use) and a start with under 1.5 GB of memory available. Vite uses `strictPort`.
- **Ceiling** (`src-tauri/src/watchdog.rs`, Linux): every 5 s it samples the app and every process it started. Over 1.5 GB in one process, over 2.5 GB in total, or one process near a full core for 90 s: it logs, shows a native error dialog with the reason, and exits. Dev tools are capped too: Node at 768 MB, Cargo at 2 jobs (`.cargo/config.toml`, `CARGO_BUILD_JOBS`).
- **Retry limit and error dialog** (`features/diagnostics/`): a boundary around the app and the router's error component report to one store. A failing screen draws nothing and opens a dialog like Next.js's: message, stack, component stack, route, time, Copy details, Reload window, and Try again for at most 3 tries (the budget refills after 60 s without errors). Six errors inside 3 seconds (render, window or failed queries) is a loop: the app stops fetching (`onlineManager` offline), disables Try again and says so. Auth refusals (401/403) never count.
- **Workspace context**: kept on `globalThis` so a hot-updated second copy of `tabs-store.tsx` shares it, and `useWorkspace` outside a provider now logs a warning and returns an empty workspace instead of throwing (throwing was what allowed a retry loop).
- **Paraglide in dev** uses `locale-modules` (see LOCALIZATION.md).

## 15. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| N1 | Should HQ onboarding stand alone, making the Pleadli Cloud activation code an optional later step? | Yes |
| N2 | Sign-in modes (Password, PIN, Badge only) with the guard rails in 6.4? | Yes. Badge-only off by default and never for admin roles |
| N3 | Every opened area is a tab (Obsidian behaviour), not only records? | Yes |
| N4 | One pane plus a right context panel now, no splits? | Yes, splits only when a procedure needs them |
| N5 | Inbox stored in the node's SQLite from the start, with `origin` for local, Head Office, court and manual? | Yes |
| N6 | Adopt Paraglide now, shell first? | Yes (your plan already names it) |
| N7 | Facility name and code required at setup, code locked after the first admission? | Yes. It is what Head Office and dossiers recognise |
| N8 | Move tabs into the title bar row, replacing the separate tab strip? | Yes |
| N9 | Areas list collapsed by default once the officer has opened a few tabs? | Yes, remembered per officer |
