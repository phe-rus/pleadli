# The postbox relay: design

Written 2026-11-18, revised the same day (three tables, free-plan budget, platform features). Status 2026-11-21: build steps 1 to 3 are built in `www` (messages, connections with approval, office certificates: `api/relay-v1.ts`, `db/relay-schema.ts`, the Postbox page in Pleadli Account) and the computer side is built in `packages/node-core/src/postbox.rs` (outbox, inbox, retry, ack). No app calls it yet: step 4 (Police to DPP over the relay) needs a licensed computer token and a real two-computer run, step 5 (Prisons) and step 6 (hardening, end to end test) are not started. Nothing here has been run between two real machines. Originally written as DESIGN, nothing built. This is step 3 of `PEOPLE-AND-NETWORK-PLAN.md` and the "Relay" part of `ORCHESTRA-PLAN.md` section 2, made concrete against what `www` already has. Decisions D1 (postbox through pleadli.com) and D2 (office approves, licence is the root of trust) are the recommended answers in the plan; this file assumes both. Read `docs/interchange/police-dpp.md` for the package.

## 1. What it is, in one paragraph

An app seals a package (`.pxpkg`, already signed and end to end encrypted), posts it to pleadli.com addressed to one office, and the office's app collects it the next time it is online. pleadli.com holds the sealed bytes only until they are collected, and never reads them. Apps only ever call out; no computer accepts a connection. A sender sees a plain progress line (Sent, Delivered, Opened, Accepted), as with a courier parcel.

## 2. What already exists and is reused (so this is small)

| Need | Already in `www` or `packages` |
|---|---|
| Who is calling | `computer` row + Bearer token (`authorised()` in `api/orchestra-v1.ts`), already bound to `organizationId` and `unitId` |
| Office addresses | `organization.address` and `organization_unit.address` (`ug.dpp.hoima`), unique, permanent |
| Is the caller licensed | `licence` check in `state()`; a relay call needs `state === 'licence'` |
| Root of trust | Pleadli signing key (`sign()` in `api/orchestra-v1.ts`), public half in `docs/platform/orchestra-root-public-key.txt` |
| The envelope | `packages/interchange` (`envelope.rs`, `identity.rs`, `messages.rs`): signed, sealed, hash of body in the signed header |
| Per-call audit | the pattern of `backup_report` and `support_report` |

Not present, and needed: blob storage (D1 rows are too small for a package; add **R2**), three tables, about nine endpoints, an outbox/inbox in `node-core`, and the screens.

## 3. Rules the relay keeps

1. **Opaque.** The relay never parses a body. Routing uses fields the sender states next to the bytes (`to`, `kind` label, `size`, `sha256`), not the package header.
2. **Only calls out.** Nothing on any computer listens for the relay.
3. **Deleted on collection.** Bytes are removed from R2 when the recipient acknowledges, and at most 30 days after posting if never collected. Metadata (who, when, size, status) is kept 60 days so the sender can still see "Delivered" (section 4a).
4. **No unsolicited mail.** A message to an office is refused unless that office has an **approved connection** with the sender's office (section 6). The only message allowed without one is the connection request itself, and it is rate limited.
5. **Licensed callers only.** A trial or ended licence can still read its own mailbox (records are never locked) but cannot post to others. This matches "what waits for a licence is everything that goes through Pleadli".
6. **The relay can be moved.** Bytes live behind a small `BlobStore` interface (put, get, delete). pleadli.com uses R2. A government server later uses its own store. Certificates name which relay an office uses (section 7).

## 4. Data (D1, Drizzle, in `db/relay-schema.ts`): three tables

The owner's rule is few tables. The first draft had four; the identity, the certificate and the directory entry are one thing (an office that can receive), so they are one row.

```
relay_office       one row per office address that can receive mail
  address (pk, = organization/unit address)   organization_id (fk)
  ed25519_pub   x25519_pub   certificate (signed by Pleadli, json)   relay (host)
  name   area   kind (station|office|court|facility|chambers)
  accepts (json: package kinds)   listed (bool, default false)   updated_at

relay_link         the introduction, decided by a person
  id (pk)   from_address   to_address
  status    requested | approved | declined | revoked
  requested_by (computer id)   decided_by (user id)   reason   created_at   decided_at
  unique (from_address, to_address)

relay_message      the envelope, never the letter
  id (pk = package id, so a retry is idempotent)
  from_address   to_address   kind (label)   size   sha256   blob_key
  posted_at   delivered_at   acked_at   expires_at
  index (to_address, posted_at)   index (from_address, posted_at)
```

No `deleted_at`: when bytes are removed from R2 the row keeps its status, and the whole row is pruned by the sweeper at the history limit. The civilian and field traffic in `PUBLIC-AND-FIELD-API.md` adds **no tables**: it is sealed `relay_message` rows with a different `kind`, plus the existing `paper`, `tracking_code` and `tracking_event`.

R2 bucket `pleadli-post`, binding `POSTBOX`, key `relay/<to_address>/<message id>`. Per office: at most 500 MB queued and 60 posts per hour; both are numbers in config, not code.

## 4a. The free-plan budget (verified against developers.cloudflare.com on 2026-11-18)

| Limit | Free plan | What it means here |
|---|---|---|
| Workers requests | 100,000 per day, whole account | every poll, post, page view and API call counts |
| Worker CPU | 10 ms per request | no crypto on the relay: verify a signature, never open a package; hashing a body is the largest job, do it with `crypto.subtle` on the stream |
| Subrequests | 50 per request | fine; D1 and R2 calls count |
| D1 queries per request | 50 | use `db.batch` for several writes |
| D1 rows written | 100,000 per day | the real ceiling: each post is about 3 writes, each ack 1, each heartbeat 1 |
| D1 size | 500 MB per database | rows are tiny; blobs live in R2 |
| R2 storage | 10 GB-month, 1M writes, 10M reads, free egress | 30-day expiry keeps it small; not verified: whether a payment method is needed to turn R2 on |
| Paid (Workers Paid, 5 USD a month) | no daily request cap, 30 s CPU, 50M D1 writes a month | move before a real rollout |

Rules that follow:

1. **Poll every 10 to 15 minutes**, not every minute: about 40 requests per computer per day. Poll straight after the app posts something, and give the Postbox a **Check now** button. A pilot of a few hundred computers fits in the free plan; a thousand computers needs Workers Paid.
2. **Write less.** Do not update `last_seen_at` on every call (heartbeats already write once). Update it at most once an hour.
3. **Blobs in R2, tiny rows in D1.** Never store a package, or any text from one, in D1.
4. **Prune.** The sweeper (a scheduled Worker, one of the five free cron triggers) deletes uncollected blobs after 30 days and whole message rows after 60.
5. **Rate limiting stays in memory** (Better Auth's default storage). Storing it in the database would spend D1 writes. Defence is Turnstile on public forms plus one Cloudflare WAF rate-limit rule.

## 4b. Use the platform instead of hand-rolling

**Better Auth** (`www/src/auth/index.ts` today has `bearer()`, `admin()` and two plugins from `toolings/`; the built-in `organization` plugin is not used, `institutions()` declares its own tables). Available in the installed package and worth using:

- `device-authorization` (RFC 8628) to enrol a computer or a field phone: the device shows a code, an administrator approves it in Pleadli Account. This replaces the hand-made activation path for new devices.
- `captcha` (Turnstile) and `phone-number` (SMS code) for the public flows in `PUBLIC-AND-FIELD-API.md`.
- `jwt` or `one-time-token` for the short-lived duty pass.
- Fold `orchestra_member` (owner or admin) into roles on the existing model later. Do not switch to the built-in `organization` plugin before the 19 November presentation.
- `api-key` is a separate package and is not installed: do not assume it.

**Drizzle** (v1 rc with `relations-v2`): `db.batch` for multi-row writes, schema-derived validation instead of hand-written zod, and the two indexes above.

**TanStack:** Start server routes with middleware for the API (one middleware chain per audience: computer, public, duty pass); Query with a loader prefetch and `refetchInterval` for the Postbox page; Table (`@pleadli/forms-tables`) for staff lists; Form where forms exist; Pacer for client-side outbox throttling and debounced directory search (verify the package and its version before adopting).

## 5. The API (under `/api/orchestra/v1/relay`, same Bearer token)

| Call | Who | What |
|---|---|---|
| `PUT /identity` | an office computer | register or rotate the office's public keys; the relay returns the certificate (section 7) |
| `GET /directory?kind=&area=&q=` | any licensed computer | list offices that chose to be listed; never lists a person |
| `GET /certificates/:address` | any licensed computer | the signed certificate for an address, to pin or check |
| `POST /connections` `{to}` | station | ask to connect to an office from the directory |
| `GET /connections` | any | mine, both directions, with status |
| `POST /connections/:id/approve` `/decline` `/revoke` | office administrator, from the app or from Pleadli Cloud | the person's decision |
| `POST /messages` | office computer | `to`, `kind`, `size`, `sha256`, bytes; idempotent on the package id; returns `postedAt` |
| `GET /inbox?after=<cursor>` | office computer | envelopes waiting: id, from, kind, size, postedAt |
| `GET /messages/:id` | office computer | the bytes (only for the addressee) |
| `POST /messages/:id/ack` | office computer | collected: delete bytes, set `acked_at` |
| `GET /outbox/status?ids=` | sender | per message: `posted`, `delivered`, `acked`, `expired` |

Errors are plain and recoverable: `not_connected` (with the connection to request), `licence_needed`, `too_large`, `quota`, `slow_down` (with when to retry).

**Why "Opened" and "Accepted" are not relay states.** The relay only knows Posted, Delivered (collected) and Acknowledged. "Opened" is the recipient app confirming it verified and decrypted; "Accepted" is the existing `receipt` package coming back. Both are ordinary messages in the other direction, so the relay stays dumb and the contract in `police-dpp.md` is unchanged. The app joins the three into the one progress line the officer sees.

## 6. The introduction (replaces the spoken fingerprint)

1. Station opens **Postbox, Add an office**, searches the directory, picks "Kampala Central ODPP". The app calls `POST /connections`.
2. The office sees "Kagadi Police Station asks to send you cases" in its **Postbox** and as a card in Pleadli Cloud. A named administrator taps **Approve** (or Decline, with a reason).
3. Approval creates the connection. Both apps fetch each other's certificate and pin the keys. The fingerprint is compared by the apps silently, and shown on an "Advanced" screen only.
4. Either side can **Revoke** at any time. After that, messages between them are refused and queued ones are dropped.

Trust is: the office's decision, plus the sender's licence, plus Pleadli's signature on both certificates. This is D2.

## 7. Certificates

A certificate is JSON signed by the Pleadli key: `{ address, institution, office, ed25519, x25519, relay, issuedAt, expiresAt }`. An office can only get one for an address its licensed organisation owns, so nobody can claim `ug.dpp.hoima`. Apps verify with the published root key, offline. `relay` names the host that carries this office's mail, which is how a government relay can be used later without changing the apps. Lifetime 1 year, renewed on any call after 6 months; key rotation is `PUT /identity` with a new key and the old certificate is superseded.

## 8. What changes in each place

| Place | Change |
|---|---|
| `www` api | `api/relay-v1.ts` beside `orchestra-v1.ts`; shared bearer and licence helpers pulled out of `orchestra-v1.ts` |
| `www` db | `db/relay-schema.ts`, one migration, R2 binding in `wrangler.jsonc` |
| `www` Cloud | a **Postbox** page for clients (connections to approve, message counts, never contents) and a **Relay** page for staff (volumes, failures, quota, revoke); see `CLOUD-REVIEW-2026-11-18.md` |
| `node-core` | `postbox.rs`: outbox (SQLite table, retry with backoff), inbox poller, ack; one place, so all five apps get it |
| each app | `PostboxView` (already a props-only shell in `packages/shell`) gets real data: Sent, Delivered, Opened, Accepted |
| Police and DPP | `referral`, `receipt`, `decision_notice` go through the outbox instead of "export a file" |
| Prisons | delete `peer.rs` and `exchange.rs` and their screens, only after Head Office exchange runs over the relay |

`transport/lan.rs` and `packages/interchange` stay.

## 9. Build order (each step ends in something that can be shown)

1. **Skeleton, no crypto:** tables, R2, `POST /messages`, `GET /inbox`, `GET /messages/:id`, `ack`, `outbox/status`. Test with curl and two fake computers. Staff Relay page shows volumes.
2. **Directory and connections:** directory listing, request, approve, decline, revoke; the client Postbox page.
3. **Certificates:** `PUT /identity`, signing, pinning; refuse messages without a valid connection.
4. **node-core outbox and inbox**, then Police to DPP: a referral travels, a receipt comes back, the officer sees the progress line.
5. **Remove pairing and exchange code** from Prisons; move Head Office exchange to the relay.
6. **Hardening:** rate limits, quotas, expiry sweeper (a scheduled Worker), abuse and revoke tests, an end to end run between two machines and one phone before anything goes on the website.

## 10. Risks and honest limits

- **Metadata is visible to Pleadli** (who wrote to whom, when, how big). Content is not. For public institutions, the in-country relay (section 3 rule 6) removes even that. Say this plainly on the website.
- **R2 is outside Uganda.** Fine for pilots and private clients; for public institutions the relay should run in country (`ORCHESTRA-PLAN.md` section 2). The `BlobStore` seam exists for this reason.
- **Size.** 25 MB per message in v1. A referral with many photos needs several messages or chunking; decide with the first real referral.
- **Availability.** If pleadli.com is down, the outbox waits. Nothing is lost, and USB and e-mail stay as the fallback.
- **Abuse.** The approved-connection rule, quotas and rate limits are the defence; staff can suspend an organisation, which blocks its posting at once.

## 11. Decisions for the owner

- **R1.** Pilot on pleadli.com with R2, with the in-country relay as a later move. Recommended: yes.
- **R2.** 30 days to hold an uncollected message, 60 days of envelope history (the free write budget, section 4a). Recommended: yes, shown on the website.
- **R3.** Directory listing is opt-in per office. Recommended: yes (same principle as D8).
- **R4.** Who may approve a connection: any administrator of the receiving office. Recommended: yes, and the approval is audited with their name.
- **R5.** Decided 2026-11-18: the client area is Pleadli Account (`/account`), staff are Pleadli Admin (`/admin`); "Orchestra" stays only as the internal and API name.
