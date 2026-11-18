# Before and at the presentation, 2026-11-19

Written 2026-11-18. What is real, what to say, and what only the owner can do.

## What is real and can be shown

| Thing | State | Where |
|---|---|---|
| Five desktop apps, records on the office's own computers, encrypted | Built; Police, DPP, Courts, Lawyers Rust tests green in CI | the apps |
| Pleadli Account (clients) and Pleadli Admin (staff) | Built, seen in Chrome at laptop and phone width | `/account`, `/admin` |
| Check a paper is genuine | Built, works on the site and as JSON | `/verify`, `/api/public/v1/verify?code=` |
| Follow a case by code | Built, works on the site and as JSON | `/track`, `/api/public/v1/track?code=` |
| Licences, computers, backups to the office's own storage | Built | Pleadli Account |
| Docs: how it works, Postbox, procurement one-pager | Built, en, fr, sw | `/docs/*` |

Demo data: `bun run` the local seed (`www/scripts/seed-demo.sh`). Demo codes: `DEMOA1B2C3D4` (paper), `DEMOTRACK123` (case). Everything is labelled "Demonstration". The seed is local only; it must never run against the live database.

## What is built but must NOT be shown as working

The Postbox relay (sending a case between offices through pleadli.com). The server side and the computer-side module are written and tested on a laptop. It is **not switched on**, no app uses it, and the Postbox page in Pleadli Account says so. Say: "designed, first version built and tested, not live".

Also not built: civilian reporting to police, appointments, the office directory, traffic and on-duty officer tools. These are designs in `PUBLIC-AND-FIELD-API.md`, waiting for decisions D4, D8, D9 and the traffic directorate.

## Owner's list (only you can do these)

1. **Before anything goes live:** create the R2 bucket `pleadli-post` (`wrangler r2 bucket create pleadli-post`). Not checked: whether R2 needs a payment method on the free plan.
2. **Production database:** no users, so wipe and rebuild it from the current migrations (steps in the last section). Not done: needs your Cloudflare login.
3. **Rate limit:** add one Cloudflare rule on `/api/public/*` before announcing the public lookups.
4. **Native readers** for the French and Swahili text (written by me, not reviewed by a speaker of either).
5. **Decide the public name.** The site still says "Pleadli Orchestra" and "Legal Orchestra" for the connecting layer; the client area is now "Pleadli Account". Choose one story.
6. **The Prisons passcode:** the app allows 4 to 8 digits, the sign-in shows six boxes. Pick six or make the field accept any length.
7. **Where the relay should run for public bodies:** the first version runs on Cloudflare, storage outside Uganda. Decide whether that is acceptable for pilots (D-list in `RELAY-DESIGN.md`).

## Honest answers to likely questions

- *Is our data on your servers?* No. Records stay on each office's computers. pleadli.com holds addresses, licences, backup success or failure, and fingerprints of issued papers.
- *Can offices send each other cases today?* By export and import (USB or e-mail). DPP can receive sealed files. The automatic Postbox is not live.
- *Does it work without internet?* Yes, every app. Internet is for licences, updates, backups to your own storage, and the connecting services.
- *Can the public report crimes through it?* No. Not built, and it needs legal review first.

## Production database: new one created by the owner (2026-11-18)

There are no users, so the old production database is replaced, not reconciled. The owner created a new D1 database, **`pleadli-database`** (id `09f65704-...`), and put it in `www/wrangler.jsonc`. The binding is still `DB`; the `db:local`, `db:remote` and `seed-demo.sh` commands now use the binding name `DB` instead of the database name, so a future rename needs no script change.

**Proven locally with the new config:** a fresh local database applies all six migrations (relay tables included), `seed-demo.sh` loads, and verify, track, the relay connection call and the public pages answer.

**Still to do on production** (needs `bunx wrangler login`, which had expired for me):

1. From `www/`: `bun run db:remote` applies all six migrations to the empty `pleadli-database`. Check the result lists six green ticks.
2. Create the bucket: `bunx wrangler r2 bucket create pleadli-post`.
3. Check the Worker secrets are set (`ORCHESTRA_SIGNING_KEY`, `BETTER_AUTH_SECRET`); they live on the Worker, not in the database.
4. `bun run deploy`.
5. Look at the live site: `/`, `/verify`, `/login`, then create the first real account.
6. Delete the old database only when the site works: `bunx wrangler d1 delete pleadli`. Anything it held (registrations, licence keys, paper fingerprints) is gone then; export it first if any real office was issued something (`bunx wrangler d1 export pleadli --remote --output pleadli-before-reset.sql`).

Do not run the demo seed against production: it is local only.

### Production state, done 2026-11-18 (by Claude, with the owner's wrangler login)

- The new `pleadli-database` was empty (only Cloudflare's internal table). `bun run db:remote` applied all six migrations: 27 tables, the three relay tables among them.
- R2 bucket `pleadli-post` created. (The account already has `pherus`, `pleadli-documents` and `pleadly-bucket`; those are not used by the relay.)
- Worker secrets present by name: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ORCHESTRA_SIGNING_KEY` and others. Values were not read.
- Deployed: Worker `pleadli`, version `50075f44-7344-409b-8df8-4fafc7c74526`, bindings `DB` = `pleadli-database` and `POSTBOX` = `pleadli-post`, custom domain `pleadli.com`, cron `17 3 * * *` (the relay sweeper).
- Checked live: `/`, `/verify`, `/login`, `/docs/*` answer 200; an unknown code gives 404 `not_found` on verify and track; the relay refuses an unauthenticated call with 401. `/docs/postbox` was a 404 for a few seconds right after deploy, then 200.
- **Not done:** the first real account, the rate-limit rule on `/api/public/*`, and deleting the old `pleadli` database (only after you are happy with the site; export it first if any real office was issued anything).
- The relay on the live site is switched on at the server, but no app uses it, no office has registered keys, and no connection exists. It is idle, and the site still says so.
