# Pleadli Police: station and command (HQ), sign-in, and the connection

Written 2026-09-21 from the direction given that day: the station signs in by **badge only** by default, an administrator can turn **passwords** on in Settings, **HQ** always uses **badge and password**, the two sides look and behave as different things, and a **station connects to HQ the way a Prisons facility connects to Head Office**. This replaces the "three modes" idea in `AUDIT.md` section 6: an individual officer is simply a station with one officer, so there are two installations, not three.

The design borrows Prisons' shape (facility-first, sign-in policy, select-your-facility connection with approval or activation code, a sync token whose hash is all HQ keeps, aggregates instead of records). It does not copy Prisons' terminology.

## 1. Two installations, chosen once

First launch asks one question: **Station** or **Command**. The answer is stored (`installation`) and cannot be changed afterwards without a reset, because it decides what the installation holds.

| | Station | Command (HQ) |
|---|---|---|
| Who it is for | one police station (or one officer on their own) | a district, region or headquarters |
| Holds | every record: diary, cases, custody, statements, exhibits | **no case or person records**: stations, their reports, the officers of the command |
| Sign-in | **badge only** by default; an administrator may require passwords | **badge and password, always** |
| Navigation | the station workspace | Overview, Stations, Officers, Settings |
| Connects to | one HQ (optional, from Settings) | many stations |

Command holds only what a station chooses to report (section 5). That is the tiered disclosure rule from `PRODUCT.md` ("connection does not mean universal visibility") and from Prisons ("Head Office aggregates, never records").

## 2. Onboarding

- **Station.** Name the station (and where it sits: region, district, division, all optional). Then the first **administrator**: an officer with a name, rank and badge number. An installation that already has officers (every existing one) is asked to choose which of them is the administrator; that officer needs a badge number.
- **Command.** Name the command and choose its level (Region, District or Headquarters; proposals, not verified). Then the first administrator: name, rank, badge number **and password**.

Nothing else is asked. Connecting to HQ is done later, in Settings.

## 3. Sign-in

- One gate in front of the whole application. Nothing is reachable without a signed-in officer, in the window or over the development loopback; the API refuses every call without a session (the gate is a courtesy screen).
- **Station, badge only (default):** the officer types or scans a badge number and is in. It identifies who is at the keyboard; it is not a secret, and the sign-in screen says so. Recently used badges on this machine are offered.
- **Station, passwords on:** an administrator switches it in Settings > Sign-in. Every officer then needs a password; an officer with none cannot sign in until an administrator gives them one. The switch is refused unless the administrator making it already has a password (otherwise it would lock them out).
- **Command:** badge and password always. The badge-only mode does not exist there.
- **Sessions** are opaque tokens whose hash is stored; they end after a period of inactivity (default 4 hours, set in the same panel) and on sign-out. In the desktop window the token never reaches the webview: the shell holds it and attaches it. Repeated wrong passwords slow that badge down.
- **Roles:** `officer` and `admin`. Only an administrator changes sign-in policy, adds or edits officers, turns remote access on, or connects the station to HQ. Finer station roles (OC Station, desk officer) come later.
- **Trail:** every sign-in, refusal, sign-out and policy change is recorded and shown to administrators.

The officers' phone sign-in over remote access is separate and unchanged: it always needs a badge **and** a password.

## 4. Telling the two apart

The window says which it is: "Pleadli Police, Station" or "Pleadli Police, Command" in the brand line, a persistent chip in the status bar, different sidebar contents, and a sign-in screen that says "badge" or "badge and password". A Command installation never shows a case, person or custody screen; there are none to show.

## 5. Connecting a station to HQ

Modelled on Prisons' select-your-facility connection.

1. **HQ registers its stations.** On Command > Stations an administrator adds a station: name, region, district. HQ gives it a **station number** and can issue an **activation code** (valid for a limited time; only its hash is kept).
2. **The station asks to connect.** In Settings > Connection an administrator types the HQ address and the station number, and optionally the activation code. The station makes its own **sync token** and sends HQ only its SHA-256, so HQ never holds a usable secret.
3. **HQ decides.** With a valid activation code the connection is made at once. Without one it appears in HQ's Stations as a pending request carrying the requester's badge and name; an HQ administrator approves or rejects it. Approving replaces any earlier connection of that station, which is how a reinstalled machine reconnects.
4. **The station reports.** Every minute, and only when something changed, a connected station sends HQ a **report** with the token: figures (people in custody, people near or past the custody limit, open cases, referrals without an outcome, officers on duty now) and its **roster** (name, rank, post, badge, role, active; never passwords, never a record). HQ keeps the latest report per station and the time it arrived.
5. **HQ shows it.** Stations lists each station with its state (waiting, connected, silent, revoked), when it last reported and its figures; the Overview totals them and names the stations that have gone quiet. HQ can revoke a station.

What is not in this first version: TLS with a pinned key between station and HQ (the report carries names, so this is a real gap; it comes with the security stage), the Cloudflare tunnel as a transport, HQ sending anything down to a station (directives, returns), and a station reporting to a command that itself reports upward (one level at a time).

## 6. Order of work

- **A. Installation and sign-in:** migration, onboarding, sign-in, sessions and the guard on the API and the desktop commands, sign-in policy, the trail, the mode-specific shell.
- **B. Command:** the station registry, the connection requests, HQ's listener, the Stations and Overview pages.
- **C. Station side of the connection:** Settings > Connection, the report loop, the roster push.

Each part ships and is checked on its own.

## 7. Status (2026-09-21)

Built in one pass, checked by two router tests (sign-in and policy; a command registering, connecting and receiving reports). **Not seen in the Tauri window, and the station-to-command network loop (HTTP between two machines) has not been run.**

- **A. Installation and sign-in.** Migration `0028_installation` (installation, auth_policy, app_sessions, auth_events); `domain/{installation,auth,sessions}.rs`; the guard in `api/session.rs` in front of every route (public: system state, onboarding, sign-in); admin-only routes; a Command answers 404 for station-record routes. In the desktop window the shell holds the token (`LocalSession`) and the OS-bound commands need `SignedIn` (`AdminSignedIn` for remote access, Cloudflare and bulk import). Frontend: `SessionGate` outside the router, onboarding (Station or Command), the sign-in screen (badge only, or badge and password), Settings > Sign-in with the trail, the signed-in officer and Sign out in the sidebar, mode-specific shell (brand line, status-bar chip, Command navigation with no search or quick actions).
- **B. Command.** Migration `0029_command`; `domain/command.rs`; `transport/command_server.rs` (port 47822, only while this installation is a Command, no TLS yet); `api/hq.rs`; Stations page (register, activation code shown once, approve or reject, roster, revoke) and Command Overview (totals, connections waiting, stations past the custody limit, silent stations left out of the totals).
- **C. Station side.** `domain/command_link.rs` (connect, poll a waiting request, report every minute when changed and at least every five); Settings > Command on a station.

Decisions taken that you did not spell out:
- An existing installation (one with officers and no `installation` row) is asked to set up on first launch and to choose which existing officer is the administrator, who needs a badge number.
- ~~On a Station in badge-only mode an administrator signs in by badge alone too.~~ **Reversed 2026-10-07:** an administrator always needs a password, on a badge-only station too (anyone at the desk could otherwise open the whole station as the administrator with one click). Setup always asks for it; an administrator with none (stations set up before) chooses one at their next sign-in, once (`POST /api/auth/first-password`, answered 428 `choose_password`/`password` by sign-in); nobody is made or promoted to administrator without one. Ordinary officers stay badge-only.
- Station numbers are `ST-0001` in the order stations are registered (provisional; the force's numbering is not verified).
- "Silent" means no report for 15 minutes; a station reports at least every 5.
- A Command is one level: it does not report upward.
