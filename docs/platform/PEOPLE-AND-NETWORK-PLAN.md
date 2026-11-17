# People, network and one shape for every app

Written 2026-11-17. Living plan: start here for the next phase. It replaces nothing yet; it sets the direction and lists the decisions the owner still has to make. Read with [[AUDIT-2026-11-17]] (what is real) and [[../interchange/police-dpp]] (the existing package contract).

Three things the owner asked for, in the owner's words, then the plan for each:

1. All five apps should share one structure, one design and one way of working. Some are not there yet.
2. The network ("the p2p thing") does not make sense. Explain how it works, then fix it.
3. Add **civilians**, and make every app plain enough for people who can barely operate a phone.

## 1. How the network works today (the honest version)

There is no network between institutions yet. There are three separate pieces, and none of them is something a station clerk can use.

| Piece | What it does | Why it fails the owner's test |
|---|---|---|
| **Signed packages** (`packages/interchange`, `.pxpkg`) | A referral, receipt or decision notice is one sealed, signed file. It can travel by USB stick, e-mail attachment or download. | A person has to export a file, carry it, and import it at the other end. That is a courier, not a network. |
| **Pairing by fingerprint** | An office invites a station, the station answers, and a person phones the other side to read out a 20 digit fingerprint and types it in. | Safe, and also the most nerdy step in the product. Nobody at a station will do this. |
| **LAN with pinned TLS** (`packages/node-core/src/lan.rs`) | One computer in a building serves the others. Joiners pin its certificate fingerprint. | Only inside one building. Built, never run on two machines. |
| **Orchestra relay** (`www`) | Endpoints on pleadli.com for licences, keys and backups. | Not yet used to carry case material between institutions. |

So "p2p" was never peer to peer across the country. It is a signed-file format plus a same-building LAN. The gap is the part that matters: **getting a referral from a station in Gulu to a prosecutor in Kampala without anyone carrying a file or reading out a fingerprint.**

## 2. The network we should build instead: a postbox

Stations and offices are offline most of the time, behind phone networks and shared routers. Direct connections between them will not work reliably. So:

- **Pleadli Cloud is a postbox, not a database of cases.** An app seals a package on the device (the existing `.pxpkg`, already end to end encrypted), posts it to pleadli.com addressed to one office, and the office app collects it when it next has a connection. The server only ever holds sealed bytes it cannot read, plus who it is for and when it arrived.
- **No inbound connections to any computer.** Apps only call out. This is what lets a station behind a phone hotspot work.
- **Offline first stays.** Sending is "put in the outbox". The app shows Sent, Delivered, Opened, Accepted, in plain words, the way a courier tracks a parcel.
- **Pairing becomes an introduction, not a ceremony.** The office publishes itself in a directory (name, area, kind). A station asks to connect to "Kampala Central ODPP" by picking it from a list. A named person at the office taps Approve on a phone. Trust is the office's decision plus the institution's licence on Orchestra, not a spoken fingerprint. The fingerprint stays underneath as a check that apps do silently, and an "advanced" screen shows it for the few who want it.
- **Same building stays LAN.** A prison or a firm with several computers keeps the existing LAN node. It is the fast path inside one site, and the postbox is the path between sites.
- **USB and e-mail stay as a fallback.** The package format already supports it, so a place with no connection for a week is not stuck.

What this changes in code: a relay API on `www` (post, collect, acknowledge, revoke), a directory, an outbox and inbox in `node-core`, and the pairing screens rewritten. The package format, signatures and acceptance rules in [[../interchange/police-dpp]] do not change.

## 3. Civilians

Today there is no civilian surface at all. People deal with the system through the police desk, the court registry and the prison gate, and they queue to do it. Pleadli can take the queue away, but only if what is public is chosen carefully, because the records are about suspects, victims and prisoners.

### What a civilian actually needs to do

| Person | Needs | Where it goes |
|---|---|---|
| Someone who was robbed or assaulted | Report it, get a reference number, see that it was received, ask what happened later | A police station |
| A relative of someone held | Find out where the person is and whether they are well, visit, send money or a message | A prison |
| Someone summoned or on bail | See what date and court, get a reminder, know what to bring | A court or police |
| A witness or complainant | See that a statement was recorded, when to attend | Police, DPP, court |
| A suspect or accused person | Know the charge, the next date, the right to a lawyer, how to reach one | Police, court, prison |
| Anyone | Find the right office, opening hours, what documents to bring, how to complain | All |

### The surface

A single **Pleadli for the public** site on pleadli.com, designed for a phone first (many users will have a basic Android phone, slow data, and little patience for forms). It also works as an installable web app so it opens from the home screen. It is not a sixth desktop app.

The home screen is not a menu of institutions. It is **"What do you need?"** with a handful of big buttons in plain words:

- Report something that happened to me
- Find out about my report or case
- Find someone who is held
- Book a visit
- Find an office near me
- I was given a date to attend

Each opens a short guided flow: one question per screen, big buttons, plain words, the next step always visible, and a reference number at the end that can be sent by SMS or WhatsApp. English, Swahili and French from the first day, with Luganda and others as soon as they can be done properly.

### The rules that keep it safe

These are the harder part and they decide the design, so they are written as rules:

1. **No public list of suspects, offenders or reports.** There is no "search anyone" box. Searching is by a reference the person was given, or by proving who they are.
2. **A relative looking for a person who is held** proves the link in steps: the person's full name and date of birth, plus the relative's phone number verified by a code. The prison confirms whether to show anything, and the answer shown is only what the law and the facility allow (that the person is held here, visiting days, how to book). Not the charge, not the file.
3. **A complainant sees only their own report**, with the reference and a phone code. They see status in plain words ("Received", "With an investigator", "Sent to the prosecutor", "Court date set"), not the contents of the file.
4. **Nothing a civilian sends becomes a record without a person at the institution accepting it.** The same principle as the DPP package: it arrives, it is held apart, a person decides.
5. **Children, victims of sexual offences and protected witnesses** are never found by search and never shown, whatever the flow.
6. **Every civilian action is rate limited and audited**, and the institution can switch any flow off.
7. Each flow ships only after the institution has said it will answer. A "Report" button that nobody reads is worse than none.

### How each flow works end to end

- **Report to police.** Civilian fills the short form (what, when, where, who, how to reach me), attaches photos if they want, and gets a reference. It is sealed to the chosen station and lands in the station's Pleadli Police as an *unconfirmed report* in a separate tray. An officer reads it, then accepts it as an incident or replies "come in with X". The civilian sees the status change and any message.
- **Inquire about my case.** Reference plus the phone code gives the status ladder above and any message the officer chose to send.
- **Find someone who is held.** The request goes to the facility's Prisons app as a *family enquiry*. Staff approve or decline in a tap. The reply is visits information only.
- **Book a visit.** The facility publishes its visiting days and the number of slots in Prisons. The relative picks a slot, the person's consent is recorded by staff if the law needs it, and the relative gets a confirmation and a reminder. The gate opens the booking on a phone and ticks it off when the visitor arrives.
- **Request an appointment** (police, DPP, court registry). Offices publish what they offer and when. The civilian books. The office sees it in Today.
- **Court dates.** A person given a date can look it up by the reference printed on their notice.

## 4. One shape for every app

Mixed state now: Police, DPP, Courts and Lawyers share the shell (full height sidebar, tab strip, Today, panels). Prisons has its own history and still differs. Lists, tables, settings and onboarding drift from app to app. The fix is a written contract and a shared package, not five separate polish passes.

**The contract** (to be written into `docs/platform/APP-SHAPE.md` after review):

- Sidebar: Today first, then the person's daily places, then the registers, then the office. Same grammar, app specific words (see [[../../CLAUDE.md]] and the "each app owns its words" rule).
- Every list is the same table or the same row list. Every record page has the same header, the same actions place and the same tabs for the same things (Overview, Papers, People, History).
- One Settings shape, one onboarding shape, one empty state, one error state, one licence and backup surface, one language switch, one set of keyboard shortcuts.
- One Rust skeleton (`node-core`) so a security fix is made once.
- Structure inside each app: `features/<domain>` with a barrel, routes thin, API split by domain (the audit's giant `api/mod.rs` files get cut up as part of this).

**The check:** a short consistency audit per app (shell, list, record, settings, onboarding, empty, error, copy, a11y, size) with a score, so "consistent" is something that can be verified, as the replicas on the website already show for the shell.

## 5. Plain enough for people who barely operate a phone

The apps still read as built by engineers for engineers. The test is a clerk, a prison officer or a village advocate who is comfortable with WhatsApp and not much else. Rules:

1. **Say what to do, not what the system calls it.** "Receive someone" beats "Create custody record". Words from the work, never from the database.
2. **One main thing per screen.** One obvious primary button. Everything else is quiet.
3. **Guided tasks for the common jobs.** Booking someone in, recording a statement, issuing a charge sheet, opening a matter: a step by step flow with a progress line, not a long form.
4. **Fewer fields, smarter defaults.** Fill what the app already knows. Ask for the minimum, allow the rest later.
5. **Big targets and readable type.** Minimum touch size, minimum text size, high contrast. Works on a small laptop and on a phone.
6. **Icons always with words.** No icon only buttons for anything important.
7. **Undo and plain errors.** Nothing destructive without a clear confirmation. Errors say what happened and what to do.
8. **Phone layouts for the field.** A beat officer, a visiting advocate and a prison gate need a phone screen. Police already has a mobile plan; it comes forward.
9. **Test with real people.** Five people from each institution who are not the developer, watched doing three tasks, before a flow is called done.

## 6. Order of work

1. **Contract and audit.** Write APP-SHAPE.md, run the consistency audit on all five apps, list the gaps.
2. **Plain language and flows pass** on Police and Prisons first (the highest stakes and the most "nerdy"), using the guided task pattern. Then DPP, Courts, Lawyers.
3. **Postbox relay** on `www`, then Police to DPP over it, then receipts and decision notices back. Pairing screens rewritten.
4. **Civilian site, one flow at a time**: find an office, then report to police, then case status, then family enquiry and visit booking.
5. **Phone layouts** for the field flows.
6. **Run it for real** between two machines and one phone before any claim goes on the website.

## 7. Decisions that are the owner's to make

Recommendations are first in each line.

- **D1. Postbox through pleadli.com.** Recommended: yes, sealed packages only, apps call out only. Alternative: stay file based.
- **D2. Trust model.** Recommended: office approves a station from a directory, licence on Orchestra is the root of trust, fingerprint hidden under an advanced screen. Alternative: keep the spoken fingerprint.
- **D3. Civilian surface.** Recommended: one phone first public site and installable web app on pleadli.com. Alternative: a separate mobile app per institution.
- **D4. What a relative may learn about a prisoner.** Recommended: held here or not, visiting days, booking. Nothing about the charge. To confirm with the Uganda Prisons Service and the law before it ships.
- **D5. Identity for civilians.** Recommended: phone number plus one time code, plus name and date of birth for sensitive flows. National ID checks later, only if an institution requires it.
- **D6. Which flow first.** Recommended: Find an office, then Report to police. They are useful on day one and carry the least risk.
- **D7. Languages for the public site.** Recommended: English, Swahili, French now, Luganda next with a real translator.
- **D8. Do institutions have to opt in per flow?** Recommended: yes. A flow is off until an office turns it on and names who answers.
- **D9. Legal review** of what is shown to the public (data protection, victims, minors, ongoing cases) before the first public flow goes live. Recommended: yes, as a gate, not a later step.

## 8. What is not decided or not known

- Whether the Uganda Police Force and Prisons Service will accept online reports and visit booking as official channels, and under what rules. This is an institutional question, not a software one.
- Data protection obligations for a public site (Uganda's Data Protection and Privacy Act, and equivalents in Kenya and DRC). Needs a lawyer.
- Connectivity reality at stations and facilities. The postbox design assumes occasional connectivity, not none for months.
- Cost of SMS for codes and reminders at national scale. Needs a provider and a price.

## 9. Sign in that works offline and online (decided 2026-11-17)

The owner chose a custom sign in, not anonymous accounts: email and password, our own API for the apps, working without internet and with it.

- **One identity, two ways to prove it.** Offline, the app checks the email and password against the officer record on the computer (the Argon2 officer identity already built for Prisons, feature 7). Online, the same email and password are registered once on pleadli.com, tied to the institution's licence. The first online sign in gives the device a long lived device token. After that the app can sign requests to pleadli.com without asking for the password again.
- **Local first.** The app never needs the internet to open, sign in or work. The internet is only for sending, receiving, licences and backups.
- **Scheduled and automatic send.** Anything meant for another office goes into the outbox with an optional send after time ("send at 6pm", "send when I am connected"). The outbox sends by itself when a connection appears, retries on failure, and shows each package's status in plain words.
- **Not anonymous.** Every action is tied to a named person and a device, so revocation and the audit trail mean something. Lost computer: the office revokes the device token and nothing more is accepted from it.

## 10. Other useful interfaces (candidates, nothing chosen yet)

Each needs its own decision before it is built, and only the first two are likely before a pilot:

- **Text messages for codes and reminders** (civilian phone codes, visit reminders, court date reminders). Needs a provider that works well in Uganda and a price.
- **Email for notices** ("you have a new referral"), never carrying case material.
- **Maps and places** for Find an office (stations, courts, prisons on a map with directions). Open map data is probably enough.
- **Mobile money** for fees, bail administration costs and licence payment. Real revenue path, and a heavy legal and trust question, so later.
- **WhatsApp** for notifications to the public, since that is where people already are. Needs a business account and rules.
- **National ID check** for stronger identity of civilians. Only if an institution requires it.
- **Court and registry systems** (the Judiciary's own case system) for reading case numbers and dates. Depends on what they offer.
