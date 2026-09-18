# 04. Deployment and networking

Three levels, one product. Recommendations D1, D2, D8, D9, D11, D12 (README) are the decisions this file depends on. Environment facts about Ugandan facilities (hardware, power, connectivity, operating systems) are **hypotheses** until R-22 is closed; the design degrades gracefully rather than assuming them.

```
Level 1  LOCAL            one machine          app + SQLite + vault
Level 2  FACILITY LAN     one node, N clients  node (SQLite + vault) <- LAN <- workstations
Level 3  PRODUCTION       facilities + HQ      exchange packages over a pluggable transport
```

Each level is a strict superset of the one below. No level makes the one below stop working.

---

## I. Local deployment

### I.1 The node

A **node** is the process that owns a SQLite database, a vault directory, the domain logic, the audit log, the outbox and inbox, and the APIs. The desktop app embeds a node. A facility node and a Head Office node are the same program in different roles (the shared-binary contract in the 0001 spec is kept).

The domain and transport code already separate cleanly in the repository (`domain/*.rs` under `commands/*.rs` and `transport/*.rs`). The recommended structure is one shared node library used by the desktop shell and, later, by an optional headless service, so a facility can run its node on a small always-on machine without a display.

### I.2 Level 1: a single machine

```
Computer
 +-- Pleadli Prisons desktop app (UI)
 |     |  authenticated loopback channel
 +-- embedded node ---- SQLite + vault under the app data directory
```

Requirements:

- No network needed for anything ordinary. Nothing in ordinary work calls a cloud API.
- **The loopback API is not a public surface.** It is bound to loopback, requires a per-launch random credential handed only to the app's own webview, rejects wildcard CORS, and validates the `Host` header. A local process or a web page in a browser must not be able to call it. (Today's `dev_server.rs` does none of this and runs in release builds; see 07.)
- Data lives under the application data directory, not the user's Documents folder. The vault uses content-addressed, relative paths recorded in a manifest so a backup restores on another machine. (Today files are stored under `~/Documents/Pleadli Prisons` and the database keeps absolute `stored_path` values.)
- **Development infrastructure stays out of production.** The dev role switcher, seeded data, dev activation-code minting, and any browser-only fallback are compiled only in debug builds and never share a code path with the production API.
- Officers sign in even on one machine (P12). The current "badge-only lookup" identifies but does not authorise; it is not sufficient for accountability.

### I.3 Level 2: a facility with several workstations

**Recommended topology (D1): one authoritative Facility Node, thin workstations.**

```
              FACILITY LAN
                   |
   +---------------+----------------+
   |               |                |
Workstation     Workstation     Workstation      thin clients: UI only, no records at rest
   |               |                |
   +---------------+----------------+
                   | HTTPS  /api/auth/**  /api/prisons/**  (LAN listener)
            +------v--------------+
            |  FACILITY NODE      |  SQLite (WAL) + vault + audit + outbox/inbox
            |  designated PC or   |
            |  small always-on    |  network listener: /api/network/** (outbound-only use)
            |  machine            |
            +---------------------+
```

The node may be a designated workstation running the desktop app in node mode, or a headless service on a small dedicated machine. The second is more reliable (no one closes the app; can sit on a UPS). Standalone is the same node with one local client.

Why not multiple writable databases replicated between machines: it forces conflict resolution over legal state, needs a sync engine per workstation, and multiplies the places sensitive records sit at rest. Why not a central Postgres: it adds a server product to operate and breaks the simple offline story. SQLite in WAL mode with a single writer handles the write volume of one prison comfortably (tens of officers, hundreds of writes a day) [H, confirm in pilot].

**Answers to the questions in the brief.**

| Question | Answer |
|---|---|
| Where does authoritative facility data live? | On the node: its SQLite database and vault. Nowhere else. |
| Can several workstations operate at once? | Yes, through the node. SQLite serialises writes; edits use optimistic concurrency (a row version check) so two officers cannot silently overwrite each other. |
| How do they communicate? | HTTPS to the node's LAN listener at `/api/auth/**` and `/api/prisons/**`. |
| What if the LAN is unavailable? | A workstation cannot change legal state. It may queue a whitelist of append-only captures and print downtime forms (03 L.3). If the node itself is unreachable for everyone, the facility falls back to paper and back-enters. |
| Can one workstation operate independently? | The node's own machine can. A separate workstation cannot: there is one authority. This is deliberate. |
| How are changes reconciled? | There is nothing to reconcile: one writer. The only replay is the whitelisted capture queue, keyed by client-generated ids. |
| What is the local authority? | The node's database and clock. |
| How are backups handled? | Scheduled encrypted snapshots (SQLite online backup plus vault manifest) to removable media and, optionally, a second machine on the LAN; optional opaque escrow to Head Office (D8). Restore drills are a scheduled obligation. |
| What if a workstation is replaced? | Enrol the new one with a one-time code shown on the node; revoke the old device credential. Nothing is lost because workstations hold no records at rest. |
| What if the node restarts? | Data is durable (WAL). Workstations reconnect and sessions resume within their lifetime. Outbox and inbox are persistent. |
| How are permissions enforced? | On the node, per request, from the officer's session role and the device's enrolment. The UI is not the enforcement point. |
| How is audit maintained? | The node writes audit in the same transaction as the change (05). |

**Enrolment and transport security on the LAN.** The node holds a self-issued certificate. A workstation enrols with a one-time code and pins the certificate fingerprint (shown on the node as text and QR). No mDNS or auto-discovery; the code carries the node address. Plain HTTP is not used. This follows the existing pairing pattern (Police's `get_local_pairing_qr`) and its finding that discovery protocols are unreliable.

**Workstation client (D11).** The node serves the same single-page application over HTTPS. A workstation can run the Tauri shell (preferred: native printing, notifications, file dialogs) or simply open a browser, which removes an install step on each machine. This works because the frontend already has a dual-transport layer (`isTauri() ? invoke : fetch`, 70 call sites); the recommendation collapses it to one `/api/**` client with a base URL.

**Two listeners, not one.** The node runs:

1. A **LAN listener** for `/api/auth/**`, `/api/prisons/**`, `/api/system/**` and the SPA, bound to loopback or the LAN interface only.
2. A **network listener** for `/api/network/**` only.

Only the network listener is ever pointed at a tunnel, VPN ingress or exposed to a wider network. Separating them means a misconfigured ingress cannot expose the domain API. (Today one server, `dev_server.rs`, carries everything, and a second, `hq_server.rs`, carries only the two network routes: the second is the right shape.)

**Time.** The node's clock is the facility's authority. Statutory rules depend on time (release before noon, 60 and 180 day thresholds). The node stamps `recorded_at`; clients send `occurred_at` only as declared. The exchange reports node clock skew to HQ and warns the admin.

### I.4 Head Office at Level 2

Head Office has its own officers on its own LAN. It runs an **HQ node** with the same topology and adds public ingress for `/api/network/**` only. HQ workstations use `/api/auth/**` and `/api/hq/**`. HQ is a single point of aggregation: if it is down, no facility loses data, and nothing local stops (see 03 K.4).

---

## J. Production networking

### J.1 Transport is a plug-in

The application cares about **authenticated, authorised, reliable exchange**, not about Cloudflare. The exchange protocol (03 K) is defined over signed packages and runs over any carrier that can move bytes.

| Transport | What it is | Facility needs | HQ needs | Trust anchor |
|---|---|---|---|---|
| **Cloudflare Tunnel** (current) | HQ runs a tunnel; facilities call HQ's public hostname over outbound HTTPS | Internet, no inbound port, no Cloudflare account | Cloudflare account, domain, `cloudflared` | TLS from Cloudflare plus the package signature |
| **VPN or private network** | HQ reachable at a private URL | Route to it | Ingress on the private network | Pinned CA or certificate fingerprint plus package signature |
| **Government or Judiciary network** (future, JLOS) | As above, over a sector network | Connection | Ingress | As above |
| **Removable media (file)** | The package is written to a file, carried by hand, and imported | Any drive | Any drive | Package signature only |
| **LAN relay via a regional node** (future, research R-23) | A Regional Commander node relays for its facilities | Route to the regional node | Regional node | Signatures |

Configuration is an ordered list of transports per node, each with an endpoint, credentials and health. The connectivity centre shows which is in use and why it failed.

**Package signatures are the security anchor, not the transport.** A package arriving on a USB drive is exactly as trustworthy as one arriving through a tunnel, because both are verified against the sender's registered public key. This is what makes "a future government network should not require rebuilding the product" true.

### J.2 Cloudflare Tunnel as one adapter

Keep, unchanged in intent: HQ-only tunnel; facilities make outbound HTTPS calls; the provisioning code ported from Police (`domain/cloudflare_tunnel.rs`); a pairing invitation that carries the hostname so no hostname is typed.

Change: the tunnel's ingress points at the **network listener only**; the Cloudflare API token moves out of the plaintext `cloudflare_config` table into the OS keystore; the pairing flow moves to `/api/network/v1/pairing/**`.

Open: whether routing encrypted traffic through Cloudflare's edge is a cross-border transfer under DPPA s.19 is unresolved; the Police remote-access doc records the same caveat. Package-level encryption for T3 and T4 payloads (HQ relays ciphertext it cannot read) reduces exposure regardless of the transport. NITA-U certification posture is unverified (R-21).

### J.3 Facility identity and pairing lifecycle

```
Facility:  invited -> registered (pending) -> active -> suspended -> revoked
                                              |           ^
                                              +-----------+   (suspend and resume)
           active -> decommissioned    (closure; archive exported; keys destroyed)
           identity events: split, merge, rename (Moroto Women split is real [P])

Device:    enrolled -> active -> revoked          (workstation, per node)
Officer:   active -> deactivated                  (never deleted)
```

Registration remains human-verified. **The current build shows the verification code in plaintext in the HQ UI**, because email is not wired, so the "verify by an officer who received the code out of band" safeguard is not real yet (07). Until real delivery exists, the verification should be described as a manual approval, not an email proof.

Each facility holds an **Ed25519 node key** generated at initialisation, registered with HQ at pairing. HQ verifies package signatures against it. The pairing secret and sync token (current design) authenticate the transport call; the key authenticates the content.

### J.4 File transport format

A package file is a self-describing container: header (kind, from, to, sequence, schema version), payload (encrypted to the recipient for T3 and T4), signature. Import verifies signature, sequence and destination and shows a receipt to be carried or sent back. Used for: facilities with no connectivity, transfer dossiers between offline facilities, and HQ instructions to them. Named package kinds are in 03 K.2.

### J.5 Scale

About 270 facilities. A rough volume of a few thousand T1 events a day nationally [H] is trivial. If HQ also stores locator entries for ~80,000 people and retains events for years, SQLite remains workable for a pilot but HQ availability, multi-user analytics and disaster recovery may justify a server database later (D10). This is deferred with a recorded trigger: pilot exit or 50 paired facilities.

---

## The `/api/**` namespace (P11, D12)

Recorded from your instruction that every API path is under `/api/**` (for example `/api/prisons` and `/api/auth`). "api/ath" is read as `/api/auth`.

| Namespace | Purpose | Served by | Listener | Authentication |
|---|---|---|---|---|
| `/api/auth/**` | Officer identity: sign-in, sign-out, current session, password change, device enrolment, bootstrap status | Every node | LAN | Credentials; then session |
| `/api/prisons/**` | Facility domain API: prisoners, custody, movements, court diary, obligations, counts, documents, registers, returns, search, admin | Facility node | LAN | Officer session plus device, per-route permission |
| `/api/hq/**` | Head Office domain API: registry, estate, coordination, oversight, decisions, directives, consolidation, locate | HQ node | LAN | HQ officer session, scoped |
| `/api/network/v1/**` | Inter-installation exchange: pairing, exchange sessions, inbox, package upload and download, health | Any node | **Network listener** | Node key signature or pairing secret; never an officer session |
| `/api/system/**` | Liveness, version and API level, backup status | Every node | LAN | Limited; version and health open to enrolled devices |

Rules:

1. The SPA is served at `/`, not under `/api`.
2. Nothing outside `/api/**` is an API. No unprefixed `/prisoners` or `/peers/register`.
3. `/api/network/**` is the only namespace ever exposed beyond the LAN, and it exposes nothing of the domain.
4. Request and response shapes are camelCase JSON as today. Errors are `{ code, message }`; unauthenticated failures on `/api/network/**` stay uniform (`invalid`) so callers learn nothing about which check failed.
5. A required `X-Pleadli-Api-Level` header lets a node refuse a mismatched workstation with a clear "update required" message; the network API is additionally versioned in the path.
6. `/api/auth/**` here is the node's own officer identity, a separate trust domain from Pleadli Cloud's BetterAuth in `www` (which also uses `/api/auth` by convention). They share a path prefix by convention only and never share a session.

**Current routes to target routes** (see 09 for the full list):

| Current | Target |
|---|---|
| `/login`, `/hq/login`, `/hq/session`, `/hq/sign-out`, `/officers/is-bootstrap` | `/api/auth/login`, `/api/auth/session`, `/api/auth/logout`, `/api/auth/bootstrap-status` |
| `/prisoners`, `/prisoners/{id}`, `/prisoners/{id}/releases`, `/releases`, `/visits`, `/requests`, `/court-productions`, `/remand`, `/search`, `/reports/summary`, `/attachments` and the rest | `/api/prisons/...` under the new domain structure |
| `/facilities`, `/facilities/{id}/verify`, `/facilities/pairing-code`, `/facilities/{id}/revoke` | `/api/hq/network/facilities/...` |
| `/peers/register` (`hq_server.rs`) | `/api/network/v1/pairing/register` |
| `/sync/prisoners` (`hq_server.rs`) | `/api/network/v1/exchange` |
| `/cloudflare/config` | `/api/hq/network/transports` |
| `/hq/config`, `/hq/dev-role`, `/activation/*` | `/api/system/role`, and activation under `/api/hq/activation`; dev-only routes exist only in debug builds |

---

## Production readiness

"Production ready" means a facility or Head Office could be installed, run, fail, recover, be audited and be decommissioned by the Service's own staff, without the developer present. Today: demonstrable, not deployable.

| Requirement | Definition of done | Today (07 has evidence) |
|---|---|---|
| Installation | Offline installer, no internet needed; verified signature | Tauri bundle configured; offline install untested |
| Facility initialisation | Guided: identity, capacity, first OIC and admin, node key, backup target | Facility onboarding gate exists (pairing-first) |
| HQ initialisation | Activation, first HQ admin, network settings | Built (offline-verifiable activation) |
| Officer provisioning | Accounts, roles, device enrolment | Accounts built; roles minimal; no devices |
| Authentication | Every operation attributed to a signed-in officer | Badge-only lookup for facility work |
| Authorisation | Server-enforced per permission | Only HQ management commands check a session |
| Backups | Scheduled, encrypted, verified, restorable | None |
| Database recovery | Integrity check, restore wizard, audit-chain verification | None |
| Machine replacement | W17 | None |
| Facility migration | Move to new hardware, rename, split, merge | None |
| Network configuration | Transports list, health, diagnostics | Cloudflare config only |
| Connectivity failures | Explicit states (03 L.2) | Last sync status text only |
| Sync recovery | Ack, epoch, reconcile (03 K) | Stateless snapshot; no ack history |
| Update strategy | Signed update bundle including by USB; pre-migration backup; forward-only migrations; protocol N-1 compatibility; HQ publishes minimum and recommended versions | Updater artifacts enabled; nothing designed |
| Logging | Rotating diagnostic logs without personal data; support bundle export | `tauri-plugin-log` in place |
| Auditability | Section 05 | None |
| Document storage | Content-addressed vault, relative paths, hashes, backup included | Absolute paths in the user's Documents folder |
| Data retention | Configurable schedule; archive and export; never user-deleted | Unresearched (R-20) |
| Security boundaries | Six zones: workstation UI, LAN API, network listener, HQ ingress, tunnel or VPN edge, removable media | One unauthenticated local API in release builds |
| Encryption | In transit TLS; package encryption for T3 and T4; at rest via database encryption or verified full-disk encryption (decision) | Plaintext database and vault |
| Secrets | Node keys, DB key, backup key, transport credentials in the OS keystore | Sync token and Cloudflare token in plaintext tables |
| Revocation | Facility, device, officer; effective immediately at the node or ingress | Facility token revoke exists at HQ |
| Decommissioning | Archive export, key destruction, registry marked closed | None |
| Pairing lifecycle | Section J.3 | Register, verify, revoke exist |

Update flow specifics: nodes update first, then workstations (which refuse a mismatched API level); every update runs a pre-migration backup; rollback is restore of that backup. HQ publishes the minimum supported and recommended versions in the inbox. A facility that has been offline for a year must still be able to ingest a cumulative update bundle.
