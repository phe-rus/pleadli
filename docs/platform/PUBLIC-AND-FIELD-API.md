# The public and field API: design

Written 2026-11-18. Status: **DESIGN**, except the two public lookups in section 2, which are built and served as JSON. The owner asked for an API for civilians, traffic officers and officers on duty. This file says what each audience can do, how each is let in, what it costs on the Cloudflare free plan, and what must wait for a decision. It builds on `RELAY-DESIGN.md` (the sealed post) and `ORCHESTRA-API.md` (the computer API that exists today). Rule from the owner: every HTTP route is under `/api/**`.

## 1. Three audiences, three doors

| Audience | Has an account on pleadli.com? | Door | Trust comes from |
|---|---|---|---|
| **Civilians** (the public) | No | `/api/public/v1/*` | Reference codes, Turnstile, an SMS code for anything that sends |
| **Computers** (stations, offices: what exists) | No, a licence | `/api/orchestra/v1/*` and `/relay/*` | Licence plus bearer token |
| **Field officers** (traffic, on duty) | No | `/api/field/v1/*` | A phone enrolled under the station licence, and a short-lived **duty pass** minted by the station |

Each door is one TanStack Start server route with its own middleware chain (rate limit, then auth, then handler), so a civilian call can never reach a computer handler by accident.

## 2. Civilians: public, reference based

Principle from `PEOPLE-AND-NETWORK-PLAN.md`: **no search by name, ever.** A civilian finds a record only by holding its reference. The owner said "search cases": that means reference-based search for the public, and authenticated search (inside the app, over the office's own records) for staff.

| Call | What it does | State |
|---|---|---|
| `GET /api/public/v1/verify?code=` | Is this paper genuine: reference, kind, issuing office, date, withdrawn or not, file hash to compare | **Built**, also as JSON (2026-11-18): `www/src/routes/api/public/v1/$.ts`, logic in `lib/public-lookup.server.ts`, page `/verify`. CORS open, no cookies, `404 not_found` for any unknown code. |
| `GET /api/public/v1/track?code=` | Where a case is, from a fixed list of stages, with the office and next date; no names | **Built**, also as JSON (2026-11-18), same route and module, page `/track`. |
| `GET /api/public/v1/offices?kind=&area=&q=` | Offices that **chose to be listed**, to "find an office near me": name, area, kind, opening note | Design. Gated by D8 (office opt-in). |
| `POST /api/public/v1/reports` | Report to a police station | Design. Gated by D4, D8 and D9, see below. |
| `POST /api/public/v1/appointments` | Ask for a visit or an appointment at an office | Design. Gated by D8. |

Rules for all public calls: Turnstile token on every POST; the quota layers and one WAF rate-limit rule at the edge (see "Limits"); responses carry no cookies; every error is the same shape (`{error, retryAfter?}`); lookups return the same answer for "no such code" and "not yours" (nothing to learn by guessing).

### Reporting to police: how it can be honest

1. The civilian fills a short form and passes Turnstile. To stop spam to a real station, they enter a phone number and an SMS code (Better Auth `phone-number` plugin). Without SMS the report is refused.
2. The Worker **seals the report to the station's public key** (from `relay_office`) and posts it as a `relay_message` of `kind: civilian_report` from a reserved sender address `ug.public.reports`. The relay holds sealed bytes only; the station app collects and opens it.
3. The plaintext exists only in the Worker's memory for the length of the request. It is not written to D1, R2 or logs. This must be said on the form in one plain sentence.
4. The civilian gets a **reference code** back and can use `/track` with it, like a parcel. They do not get an account.

Not promised: that a station reads it quickly, that a report is a complaint in law, or anonymity from the station. Whether a sealed report from an unauthenticated sender is acceptable to police and to law is **D9 (legal review)**. Do not build this before the owner confirms D4, D8 and D9.

### Visits and appointments

Same shape: a sealed message `kind: appointment_request` to the office; the office replies with a sealed message the civilian reads by reference. Nothing is stored in clear.

### Limits: what protects the lookups, and how far to trust each layer

Written 2026-11-22. Verified against wrangler 4.164 and its generated types. **Status: written and unit-tested, NOT deployed, and the dashboard rule below is NOT configured.**

| Layer | What it is | Strength | Where |
|---|---|---|---|
| 1. Edge rule (WAF rate limiting) | A Cloudflare dashboard rule on the route | Real, global per rule, before the Worker runs. **Not configured.** | Dashboard only |
| 2. Rate Limiting binding `PUBLIC_LOOKUP` | `env.PUBLIC_LOOKUP.limit({ key })`, 30 per 60 s per hashed address | **Approximate and location scoped.** Cloudflare counts per location and may let a burst through; it returns only `success`, no reset time | `wrangler.jsonc` `ratelimits`, `lib/quota.server.ts` |
| 3. Durable Object counter `QUOTA` | One atomic counter per bucket, worldwide (`lib/quota-counter.ts`, rule in `lib/quota-window.ts`) | **The authoritative quota.** Anonymous: 300 per hour per address | same |
| 4. Isolate-local counter | A Map in one Worker isolate | **Not a limit you can rely on.** Used only if the Durable Object cannot be reached, so a fault degrades to a weak limit, never to none | `lib/rate-limit.server.ts` |

**Order of checks on every call:** quota (needs only the address Cloudflare reports) -> shape of the code -> database read. A refused caller costs no database read and learns nothing: the 429 is the same body for a code that exists and one that does not.

**Who names a bucket.** The server, from facts it verified. Anonymous: the connecting address from `cf-connecting-ip` (set by Cloudflare), hashed so no address is stored. `X-Forwarded-For`, any other header, a query parameter or a body field never chooses a bucket. A request with no address shares one strict bucket. Authenticated: after a credential is verified, per user, per credential and per institution (120, 600 and 3,000 per minute, `AUTHENTICATED` in `quota.server.ts`). An unauthenticated caller cannot spend any application's quota, because authentication comes before the quota is charged.

**Answer.** `429 {"error":"too_many_requests","retryAfter":N}` with `Retry-After`. From the edge binding `retryAfter` is the whole period (60), because the binding gives no reset time; from the Durable Object it is exact.

**Offline casework.** None of this is on the path of the five apps' own work. They run without pleadli.com. Only calls that reach pleadli.com's public lookups are limited. Institutional calls (Orchestra, Postbox) are not charged to these buckets.

**Dashboard rule to add before announcing `/verify` and `/track` (not done):** Security -> WAF -> Rate limiting rules. Scope: URI path starts with `/api/public/`, plus `/verify` and `/track` (the pages call the same lookup through a server function). Counting characteristic: IP address. Action: block, with a duration. Plan limits: Cloudflare limits the number of rate limiting rules, the counting characteristics, the periods and the block durations by plan, and the free plan is the most restricted. Check the plan's limits in the dashboard when adding the rule, and record here what was configured and who verified it. **Until then, do not describe the lookups as protected against guessing or bulk enumeration.** Code space is the other defence: 12-character codes over a 32-symbol alphabet.

**Free-plan caution.** Workers Free also caps requests per day for the whole account, and refused requests still count. Layers 2 and 3 protect the database, not the request budget; only the edge rule (1) stops traffic before the Worker runs. Moving to Workers Paid before a public launch stays the recommendation in section 4.

**Not proven.** That Cloudflare serialises calls to one real Durable Object (a platform guarantee, relied on, not exercised here: the tests use a fake namespace with the same counting rule); the binding's behaviour in a real location; any of this under load on the deployed Worker.

## 3. Field officers: traffic and on duty

Officers have no pleadli.com account and should not need one. The model is **enrol the phone, mint the pass at the station**:

1. **Enrol a device.** A field phone is enrolled once under the station licence with Better Auth `device-authorization` (RFC 8628): the phone shows a code, a station administrator approves it in Pleadli Account. The phone gets a device token, a row in `computer` (application `field`), and no personal data.
2. **Duty pass.** At the start of a shift the station app (which knows the officer, their role and unit) mints a short-lived signed **duty pass**: `{ device, officerRef, unit, scope, notBefore, notAfter }`, a few hours long, signed with the station's key (Better Auth `jwt` or a plain signed token). The officer loads it on the phone by QR. `officerRef` is the station's own reference, never a name or a national ID.
3. **Every field call** sends the device token and the pass. The relay checks the pass against the station certificate (`relay_office.certificate`), the device against the licence, and the time window. Expired pass: the call is refused with `pass_expired`, nothing else.

### What fits store-and-forward in v1

| Flow | How | New tables |
|---|---|---|
| **Duty check-in, check-out, handover** | `POST /api/field/v1/duty` sealed to the station (`kind: duty_event`) | none |
| **Traffic fixed-penalty notice** | The phone makes a notice paper with a verify code (existing `paper` row, kind `traffic_notice`), and a sealed copy goes to the station register. The driver can verify the notice on `/verify`. | none |
| **Look up a notice or a paper by reference** | `GET /api/field/v1/papers?code=` (same data as `/verify`, plus status) | none |
| **Station circulars to on-duty officers, with acknowledgement** | station posts `kind: circular` to a duty group address; each phone collects and sends `kind: circular_ack` back | none |
| **Quick incident draft** | `POST /api/field/v1/incidents` sealed to the station, becomes a draft in the station app, never a record until an officer adopts it | none |

All five are `relay_message` rows with a different `kind` label, plus the existing `paper`, `tracking_code`, `tracking_event`. No new tables.

### Out of scope, said plainly

Real-time checks (licence, vehicle, wanted persons) need national data sources that Pleadli does not have access to. Nothing in this API pretends to. Also: the fixed-penalty rules (who may issue, amounts, whether a digital notice is valid) must be checked with the traffic directorate **before** the notice flow ships.

## 4. Free-plan cost (see `RELAY-DESIGN.md` section 4a)

Workers Free is 100,000 requests a day for the whole account and 10 ms CPU per request; D1 Free is 100,000 rows written a day.

- Public lookups are one D1 read each and no write. A busy day of 20,000 lookups is a fifth of the request budget.
- A civilian report is about 4 writes (message row, rate counter, SMS record, audit). 5,000 a day is 20,000 writes: workable, but this audience alone can use the whole budget in an attack. Turnstile and the SMS code are not optional.
- Field duty events are tiny; 500 officers on 2 events a day is 4,000 writes.
- **Conclusion:** the free plan is fine for the pilot. Any public launch (civilians) should move to Workers Paid first, as the abuse headroom matters more than the 5 USD.

## 5. Better Auth, Drizzle, TanStack: what is used

- Better Auth: `phone-number` and `captcha` (civilians), `device-authorization` (enrol phones), `jwt` (duty pass). All present in the installed package; `api-key` is not installed, do not rely on it.
- Drizzle: `db.batch` for the multi-row writes, schema-derived validation for request bodies, `(to_address, posted_at)` index.
- TanStack Start: one server route per door, with a middleware chain each; Query on the Postbox pages; Pacer (verify the package first) for debounced directory search on the client.

## 6. Build order

1. DONE 2026-11-18: `verify` and `track` as JSON in `/api/public/v1`, no new tables. Rate limiting: see "Limits" above (code written 2026-11-22; the WAF dashboard rule is still to do and is NOT configured).
2. After `RELAY-DESIGN.md` step 1 (skeleton): `kind` labels and the duty-event flow, phone enrolment, duty pass.
3. After the owner confirms D4, D8, D9: the office directory, appointments, then police reports.
4. Traffic notices only after the directorate has confirmed the rules.

## 7. Decisions for the owner

- **F1.** Is the public API (verify, track) allowed to be called from other websites? Recommended: yes for GET lookups, with CORS, because the answer is already public.
- **F2.** Duty pass length. Recommended: 12 hours, one shift.
- **F3.** Which one field flow first. Recommended: duty check-in and handover (no law needed), then circulars.
- **F4.** D4, D8, D9 from the people and network plan still gate everything in section 2 that sends.
