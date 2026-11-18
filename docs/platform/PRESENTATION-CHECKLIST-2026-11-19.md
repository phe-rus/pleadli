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

## Production database: there are no users, so wipe it and rebuild (owner decision, 2026-11-18)

Item 2 above is no longer a blocker. With no real users, the live database is rebuilt from the current migrations instead of reconciled.

**Proven locally on 2026-11-18:** deleting the local database and running `bun run db:local` applies all six migrations cleanly (60 statements, including the relay tables); `seed-demo.sh` loads; verify, track, the relay calls and the public pages answer. So a fresh database works with today's code.

For production (needs `bunx wrangler login` first; I could not do it, the login had expired):

1. Optional safety copy: `bunx wrangler d1 export pleadli --remote --output pleadli-before-reset.sql`
2. Create a fresh database, since a D1 database cannot be emptied or renamed in place: `bunx wrangler d1 create <name>`. Naming is free now. The owner's scheme is `pleadli-<purpose>`; this one holds sign-in, licences, papers and the relay, so I would call it `pleadli-data` rather than `pleadli-auth`. Your call.
3. Put the new `database_id` (and `database_name`) in `www/wrangler.jsonc`, and the new name in the `db:local` and `db:remote` scripts in `www/package.json` (they say `pleadli` now).
4. `cd www && bun run db:remote` applies all six migrations to the empty database.
5. Create the bucket: `bunx wrangler r2 bucket create pleadli-post`.
6. Set the Worker secrets again if they are not already on the Worker (`ORCHESTRA_SIGNING_KEY`, `BETTER_AUTH_SECRET`); they live on the Worker, not in the database.
7. `bun run deploy`.
8. Delete the old database only after the site works: `bunx wrangler d1 delete pleadli`.

Everything that lived in the old production database (any institution registrations, licences, issued-paper fingerprints) is gone after this. With no users that is the intention; if a licence key or a paper fingerprint was issued for a real office, export first (step 1).
