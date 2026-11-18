# Pleadli Cloud (`www`): review, naming, and what to add

Written 2026-11-18, the day before a presentation of the completed work. Based on reading the code (routes, functions, schema, API, plans). **Not based on looking at the rendered pages**: that check is still to do and is the first thing to do before the demo.

## 1. What exists (more than it feels like)

| Surface | Who | Pages | Notes |
|---|---|---|---|
| Public site | everyone | home, products, downloads, roadmap, docs (6), about, contact, licensing, verify, track | translated en/sw/fr |
| **Orchestra portal** `/orchestra/$orgId` | a registered institution or practice | overview, offices, licences, computers, backups, team, help, register | translated; backups page is 551 lines and the most complete |
| **Staff admin** `/admin` | Pleadli staff | overview, institutions, licences, computers, reports, users, templates, signing key | English only; overview has real stats |
| App API `/api/orchestra/v1` | the five apps | trial, activate, refresh, heartbeat, backups, papers, tracking | certified live 2026-10-08 |
| Data | D1 | licence, computer, backup, support, paper, tracking, organisation, unit, member | no relay tables yet |

The data model and API are sound. The weakness is how the two portals are **named, shaped and filled**, not the engine.

## 2. The naming problem, and a recommendation

"Orchestra" now means four different things: the portal URL, the API, the licensing system, and (in staff copy) the whole platform ("Pleadli Orchestra today."). To an officer, a clerk or a procurement officer it explains nothing. The product principles ask for words from the work, never from the system.

**Recommendation: people see two places, named for what they do. "Orchestra" stays only as the internal and protocol name** (the API path `/api/orchestra/v1` does not change, so no app breaks).

| Today | Recommended | Why |
|---|---|---|
| `/orchestra/$orgId` (client portal) | **Pleadli Account**, at `/account/$orgId` | An institution's own page: licence, offices, computers, backups, team, postbox. Everyone knows what an account is. |
| `/admin` (staff) | **Pleadli Admin** | Already the word everyone uses. |
| "Orchestra" in copy (29 strings) | "Pleadli Cloud" when naming the whole, otherwise the page name | One name per idea. |
| `functions/orchestra.func.ts` | `account.func.ts` | Matches the page. |

Alternatives, if "Account" feels too small: **Pleadli Console** (technical, common for admin areas), **Pleadli Office** (clashes with "offices" in the data model, so not recommended). Old `/orchestra/*` URLs redirect to `/account/*`, so printed links and the apps' "manage" buttons keep working.

This also **reduces structure**: the two portals' `route.tsx` files repeat the same shell (sidebar, brand, sign-out). They should be one `CloudShell` component fed by a nav list (the data already lives in `data/admin.ts` and the `orch.nav.*` keys).

## 3. What is missing, by audience

### Clients (institution and practice owners and administrators)

| Missing | Why it matters | Effort |
|---|---|---|
| **Postbox** (connections to approve, message counts, never contents) | It is the new headline feature; `RELAY-DESIGN.md` | needs the relay |
| **Billing** (Flutterwave, invoices, receipts) | Lawyers buy online; today there is a request form and staff issue by hand (`ORCHESTRA-PLAN.md` section 6) | medium, needs a provider account |
| **Alerts by e-mail** (licence ending, backup failing, computer silent) | An administrator should not have to open the page to learn of a problem | small to medium |
| **Activity log** ("who did what on my account") | Trust and the audit expected of justice systems | small: the data is mostly there |
| **Account settings** (organisation details, contact, logo, language) | The register form collects them; nothing edits them afterwards | small |
| **Downloads and versions inside the account** | "Which computers are out of date?" with the installer link beside it | small |
| **Roles beyond owner and admin** (billing only, read only) | A finance officer should not hold admin power | small |
| **Data export and closing an account** | Data protection expectations | small |

### Pleadli staff

| Missing | Why it matters |
|---|---|
| **Staff audit log** (who approved, revoked, issued) | Accountability; staff actions are the highest-trust ones |
| **Support inbox that can reply** (reports exist, answering is thin) | The `/admin/reports` page lists; staff need status, reply, close |
| **Relay health** (volume, failures, queue age, revoke) | Needed the day the relay exists |
| **Staff roles** (reviewer, support, finance) | One role today |
| **System health** (D1 and R2 errors, Worker errors, last deploy) | So staff know before clients do |
| **Announcements** to all or some institutions (maintenance, new version) | A basic need for a platform others depend on |

### The public site and its audience

The visitors are not one group, and the site should say so in its first screen:

- **Institution decision makers and procurement** (Police, DPP, Courts, Prisons): they buy by agreement. They need a **procurement pack**: a one-page summary, a security and data statement (where data lives, encryption, offline, what the relay can and cannot see), the licensing explanation, and a named person to call. Much of this text already exists in `docs/security`, `licensing` and the plans; it is not gathered into one page they can forward.
- **Advocates and firms** (self-serve): a clear price, the trial, and one button to buy. The price page exists inside `licensing`; make it the front door for them.
- **Officers and clerks** (not buyers, but they decide whether it gets used): screenshots in their own words ("Receive someone", not "create custody record").
- **Civilians** (planned, not built): do not promise it on the site beyond the roadmap line.

Also missing and worth doing: a **changelog** (the releases exist), a **status page**, **page weight and speed on a slow phone** (many visitors use basic Android over slow data; check the home page weight), accessibility pass, and Swahili and French parity with English on every page. No testimonials, figures or pricing may be invented (`PRODUCT.md`).

## 4. Consistency and polish

- **Admin is English only** while the client side is translated. Acceptable for internal staff, but then say so deliberately and do not mix: today `signing-key.tsx` and `templates.tsx` partly use messages and the rest do not.
- **`Group`, `GroupRow` and `Stat` from `@pleadli/ui` are used well.** Keep them as the only list and number pattern. The overview's stat grids are fine for staff; for clients, lead with **what needs attention** (a licence ending, a failed backup) before any number.
- **File naming**: `*.func.ts` is the convention, but `members.ts` and `releases.server.ts` break it.
- **One page template**: title, one primary action, content, empty state. Several portal pages build this by hand.
- **Empty states are the biggest risk in a demo.** A portal with no data looks unfinished. See section 5.

## 5. For tomorrow: what to do, in order

Presentation day needs things that look finished, not things that are half built.

1. **Look at every page rendered** (public, client, staff) at laptop and phone widths, and fix what is broken. 1 to 2 hours.
2. **Seed a demo institution** (clearly labelled "Demonstration", never presented as a real customer): offices, a licence, computers, a few backups, a report. Every portal page then shows real structure. 1 to 2 hours.
3. **Rename** Orchestra to Account and Admin in everything people read, with redirects (section 2). 1 to 2 hours.
4. **Unify the shell** into one `CloudShell`. 1 hour.
5. **Add a plain-words "How the Postbox works" page** to the docs with the diagram from `RELAY-DESIGN.md`, marked **in design, not built**. Honest status is the house style. 1 hour.
6. **Gather a one-page procurement summary** from existing text. 1 hour.
7. Deploy and click through once on the live site.

**Do not attempt the relay build before tomorrow.** Show the design and one working vertical slice only if the above is done.

## 6. Decisions for the owner

- **C1.** Names: **Account** for the client area and **Admin** for staff, "Orchestra" kept only as the internal and API name. Recommended: yes.
- **C2.** Which of the section 5 items to do tonight, in what order. Recommended: 1, 2, 3, 4, then 5 and 6 as time allows.
- **C3.** Is the staff Admin to stay English only? Recommended: yes, stated plainly.
