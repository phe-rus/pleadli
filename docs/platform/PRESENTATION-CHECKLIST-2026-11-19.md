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
2. **The live database's migration list** does not match the renamed migration folders (local `db:local` fails with "table account already exists"). Do not run `db:remote` until the `d1_migrations` table has been compared with `www/.migrations`. Deploy without migrating is safe for the existing site; the relay tables need the new migration.
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
