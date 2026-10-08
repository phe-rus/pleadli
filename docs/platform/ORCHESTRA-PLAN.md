# Pleadli Orchestra: the www side, licensing, backups and the network

Written 2026-10-08 from the user's brief that day. Audit first, then the recommendation for each decision (the user asked for recommendations, not questions), then the order of work. Contact for the site: pleadli@pleadli.com, +256 772 591 289, Justice Vincent Opyene.

## 0. Decisions taken by the user (2026-10-08)

- **Licensing**: public institutions (Police, DPP, Courts, Prisons) are licensed through an **agreement** with Pleadli: the HQ registers and its licence covers its stations or facilities, procured the way governments buy. **Lawyers and firms buy online** themselves (Flutterwave, not wired yet).
- **Price on the website**: a page explaining **how licensing works** (30-day trial, records never locked, how each kind of office gets a licence); **prices shown only for lawyers and firms**; institutions are told to talk to Pleadli. Not a SaaS tier table.
- **Who registers on pleadli.com/orchestra**: **institutions** (at their HQ, attaching their offices) **and practices** (an advocate or a law firm). Individual officers never register; they sign in to their office's app.
- **Contact on the site**: pleadli@pleadli.com, +256 772 591 289, **Justice Vincent Opyene, Founder**.
- **Backups and relay**: nothing stored at Pleadli; backups go to the institution's own storage; the relay can run in the country (sections 2 and 4).
- **Backup keys** (2026-10-08): a recovery phrase for the institution (computers hold only its public half, so they can lock backups but not open them); storage secrets sealed in the administrator's browser to each approved computer; S3-compatible, folder or drive, and SFTP. Full design: ORCHESTRA-BACKUP.md.
- **Registration is a request**: Pleadli staff check an institution or practice is genuine before its Orchestra address and certificate are issued.
- **Addresses** read `country.institution.place` and never change: `ug.police.albertine` (HQ), `ug.police.albertine.kagadi` (its station), `ug.dpp.hoima`, `ug.court.kagadi-cm`, `ug.prisons.hoima`, `ug.advocate.okello-chambers`.
- **Managers**: whoever registers is the owner and invites a few administrators by email; ordinary officers never need a pleadli.com account.
- **Apps, Police first** (2026-10-08): backups run once a day on their own (when the app is open and online and the last good backup is 24 hours old) plus a Back up now button; every officer sees the trial or licence bar, only administrators enter the key, back up, restore or see storage; papers that leave the office (Police: charge sheets, police bonds, letters) are sent to /verify automatically once licensed; restore is from a chosen backup file and the recovery phrase, staged and applied at the next start with the old data kept aside. Shared code: `packages/node-core` `orchestra.rs` and `snapshot.rs` (feature `orchestra`).
- **Way of working**: ask before going ahead on anything load-bearing; remember Pleadli is justice infrastructure, a family of purpose-built apps, not another SaaS.

## 1. Audit: what exists today

- **pleadli.com** (TanStack Start on Cloudflare Workers + D1): public pages (home, products, downloads, roadmap, docs, about), sign-in with Better Auth, and an `/admin` that manages *organizations, units, memberships, entitlements and institution templates*.
- **The apps never talk to it.** No app calls pleadli.com for anything. The admin's organizations are not read by any app; nothing an app does is visible on the www. Updates come from GitHub releases (`phe-rus/pleadli-releases`), signed, and work.
- **No licensing, no trial, no cloud backup, no usage figures, no crash or support reports** exist anywhere.
- **Institution-to-institution connections**: Police and DPP have a signed and sealed package format (`packages/interchange`) moved as files; Prisons has pinned-TLS LAN exchange (`node-core/lan.rs`); stations reach their command over plain HTTP on the LAN; phones reach a station through a Cloudflare tunnel with a subdomain per station (`station-name.pleadli.com`). Each of these needs an address the other side can reach, which is why subdomains and tunnels keep appearing.
- **Public pages**: roadmap, docs and about are thin and partly technical; there is no contact page, no pricing page, no contact details anywhere.

## 2. The network, explained (and the recommendation)

### The problem in one sentence

Two offices can only talk if one can reach the other, and a police station behind a mobile modem has no fixed address anyone can reach. Subdomains and tunnels are workarounds for that, and they need setting up again for every office.

### Recommendation: a post office, not a phone line

pleadli.com becomes the **Orchestra relay**: one fixed address every app already knows. It works like a post office with locked mailboxes:

```
 Kagadi Police Station                pleadli.com (relay)                 DPP Hoima
 ---------------------                -------------------                 ---------
 seals the file with DPP's key  -->   mailbox "ug.dpp.hoima"   -->  DPP collects, opens
 (only DPP can open it)               holds sealed bytes only           with its own key
                                      cannot read them
 collects its replies          <--    mailbox "ug.police.kagadi" <--  DPP seals the decision
```

- **Every institution gets an Orchestra address** when it registers on pleadli.com, for example `ug.police.kagadi` or `ug.dpp.hoima`. It never changes, whatever internet the office uses. No subdomain, no tunnel, no port opened.
- **Every institution gets a certificate**: Pleadli signs "this address belongs to this institution, and these are its keys". An app receiving a package checks the certificate, so it knows who sent it without trusting the relay.
- **The crypto stays end to end.** Packages are signed by the sender and sealed to the receiver (`packages/interchange`, already built and used by DPP). The relay sees who wrote to whom, when and how large, never what. That is the honest limit: Pleadli sees the envelope, not the letter.
- **Peer to peer still comes first.** When two offices are on the same network (a station and its command in one compound), they talk directly over pinned TLS (`node-core/lan.rs`); the relay is used when they are not. Apple's iMessage and Signal work this way.
- **Offline first still holds.** A package written with no internet waits in the app's outbox and goes when a connection returns; replies wait in the mailbox until collected.
- **Tor**: not recommended now. It is slow, often blocked on East African mobile networks, and adds little once packages are sealed end to end; the design leaves room for it later as another way to reach the relay.
- **Pairing still needs a person.** The certificate says who an address belongs to; whether an office *accepts* packages from another is still decided by a person there (the fingerprint check in `docs/interchange/police-dpp.md`), and either side can end it.

Phones reaching their station (backup calls, photos) move onto the relay too, and the per-station tunnel and subdomain go away.

**Where the relay runs (revised 2026-10-08).** The relay is a pass-through: a package waits only until it is collected, then it is deleted (and at most 30 days if never collected). Even so, the relay sees who wrote to whom and when. So the relay is one small program that can run in two places:

- **In the country**, on a government server (for Uganda, the National Data Centre), for public institutions. Their certificates name that relay, and their apps use it. pleadli.com then only signs certificates and lists addresses; no case traffic passes through it.
- **On pleadli.com**, for private clients (firms, advocates) and for pilots before a government relay exists.

Either way the content is sealed end to end; the choice decides only who can see the envelopes.

## 3. Licensing and the trial (recommendation)

- **30-day trial, starting at first launch, for every app.**
- **Tied to the machine, not the MAC address.** MAC addresses change with every network adapter and are hidden by modern systems. The app uses the operating system's machine identifier (Windows MachineGuid, Linux machine-id, macOS hardware UUID), hashed so the real value never leaves the computer.
- **Cannot be restarted by reinstalling.** The first time the app has internet it tells pleadli.com "this machine started a trial on this date". A reinstall gets the same date back. An app that has never been online keeps its own start date in a place a reinstall does not remove. (Honest limit: a machine kept offline for ever and wiped completely could start again. The cost of preventing that, locking the records, is worse.)
- **After the trial nothing is locked.** Justice records must never become unreachable: a station that cannot open its cell register is a danger, not a sales tool. A station or facility keeps working with a permanent "trial ended" bar and a "Get a licence" button. What waits for a licence is everything that goes through Pleadli: the relay, cloud backup, updates of law packs, Assist through Pleadli.
- **A command (HQ) must be registered.** The institution registers on pleadli.com (the HQ is the registered organisation); its stations and facilities are attached to it.
- **A licence is a signed file**, issued by pleadli.com: institution, app, number of computers, expiry, features. Apps check it offline with Pleadli's public key, and refresh it online every 7 days, with 30 days' grace without internet.
- **Activation**: type the licence key once; the app sends it with the machine's hashed identifier; pleadli.com returns the signed licence for that machine and counts it against the seats.

## 4. Backup: to the institution's own storage, through Pleadli, never at Pleadli (recommendation, revised 2026-10-08)

The first draft stored encrypted backups in Cloudflare R2. That puts copies of case records outside the country, against what pleadli.com promises and what Uganda's Data Protection and Privacy Act, 2019 expects of personal data. Revised:

- **Pleadli stores no backups.** Each institution connects the storage it already trusts: a government data centre (for Uganda, NITA-U's National Data Centre), any S3-compatible store in the country, a server or NAS on its own network, or an external drive.
- **The app sends the backup straight to that storage.** The bytes go from the office's computer to the institution's storage and never pass through pleadli.com.
- **Encrypted before it leaves the computer**, with a key the institution holds (a recovery phrase shown once). Even the storage operator cannot read it.
- **Configured in one place.** An institution administrator sets the storage on pleadli.com/orchestra. The secret part of the access details is sealed in their browser to each approved computer, so only those computers can open it; Pleadli holds nothing it can use (ORCHESTRA-BACKUP.md).
- **The iCloud-like view shows facts, not files.** Apps report "computer, time, size, success" after each backup, so pleadli.com/orchestra shows every office's last backup and alerts on failures. Restoring reads from the institution's storage.
- A private client (a law firm) with no storage of its own may later choose a Pleadli-run store in a named country; it is never the default and never for public institutions.

## 5. pleadli.com: three parts with three addresses

| Address | For | What it holds |
|---|---|---|
| `/` and public pages | everyone | the official site: products, pricing, downloads, roadmap, docs, about, contact |
| `/orchestra/` | a registered institution's own people | its dashboard: profile, Orchestra address and certificate, its offices (HQ, stations, facilities), licences and computers, backups, team, billing, support |
| `/admin/` | Pleadli staff only | every institution, licences and trials, computers in use and versions, figures, releases, law and document packs, Assist keys and use, support inbox and crash reports, relay health |
| `/api/orchestra/v1/` | the apps | trial, activate, refresh licence, heartbeat, backup upload and download, relay mailbox, certificates and directory, updates, document packs, reports |

### What the apps send home, and what never leaves

- **Sent**: hashed machine identifier, app and version, country, institution (when registered), trial or licence state, last seen; crash reports and issue reports only when someone presses Send.
- **Never sent**: names, case files, statements, custody records, photographs, anything a person typed into a record.

### The figures staff see

Computers active today, this week, this month; by app, country and version; trials started, ending and ended; licences active and expiring; backups taken and failing; reports waiting.

## 6. Payments (recommendation)

Flutterwave (mobile money and cards across East Africa), not wired yet. Now: a Pricing page and a "Get a licence" checkout shell on `/orchestra/billing` that records the request and says payments open soon; staff issue the licence by hand from `/admin` meanwhile.

## 7. Assist (AI) through Pleadli (recommendation)

The provider key stays on pleadli.com and never reaches a computer; apps call `/api/orchestra/v1/assist`, metered per institution. Because case text would pass through Pleadli, this is **off by default** and an institution turns it on; the local model (already in DPP and Lawyers) remains the default.

## 8. The HQ question (recommendation, since asked)

A station should send its command more than figures, but never its files:

- **Named people held near or past the 48-hour limit**: name, station, time held, case reference. Supervising detention is the commander's legal duty and the force's largest human-rights complaint (docs/police/research/command-levels.md); a number alone cannot be acted on.
- **A register of serious cases** (murder, defilement, robbery and similar): reference, offence, station, date, stage. No statements, no exhibits.
- **The monthly crime return** by offence category, made by the app from the station's own records.
- **Complaints against officers and discipline**, which the law places with the district and regional commanders.
- **Orders and circulars down** from the command, acknowledged by the station.

## 8b. The public side: verifying papers and following a case (recommendation)

Papers leave offices (charge sheets, bonds, court orders, release warrants) and the person receiving one needs to know it is real. Families, complainants and accused people need to know where a case stands without walking from station to court to prison. And the institutions need one consistent chain of numbers for a case.

- **pleadli.com/verify**: every paper an app prints already carries a verification code (DPP, Lawyers and Police papers). When a paper is issued, the app sends pleadli.com only its fingerprint: the code, a hash of the document, the kind of paper, the issuing office and the date. **Never the content.** Anyone scans the QR code or types the code and sees "Genuine: charge sheet issued by Kagadi Police Station on 7 January 2019", or "No paper with this code". They can also drop the PDF on the page: the browser compares its hash on the spot, and the file never leaves their device. A paper later withdrawn shows as withdrawn.
- **Following a case with a tracking code**, like a parcel: the person concerned (complainant, accused, family, advocate) is given a code on their printed receipt or bond. On pleadli.com/track it shows the stage only: "With the DPP since 3 March", "Next in court on 12 April at Kagadi Chief Magistrate's Court", "Remanded at Hoima Prison". No names, no statements, no evidence.
- **No open search of police or DPP files by name.** Victims (above all in sexual offences and cases involving children) and people presumed innocent must not be findable by anyone typing a name. Searching is only by a code the person was given.
- **Court cause lists can be public**, as they already are on court notice boards: case number, parties as listed, court, date, time. Each court chooses to publish its list.
- **One chain of numbers**: when a case moves (CRB number at the station, then the DPP file number, then the court case number, then the prison number), each institution adds its own number to the same case through the relay. Every paper prints the numbers it "arises from", as courts already do (docs/platform/real-cases/uganda-v-kibuuka-2025.md), so the chain stays consistent without any institution seeing another's file.

## 9. Order of work

1. **www public site** (now): contact details everywhere and a Contact page; About with the people and the mission; Roadmap and Docs rewritten in plain language; a Pricing page. Deploy.
2. **Orchestra portal and admin, shells with real data model**: D1 tables for institutions, offices, licences, computers, trials, backups, reports, content packs; `/orchestra/*` pages; `/admin/*` rebuilt around them. Deploy.
3. **App-facing API v1**: trial, activate, refresh, heartbeat, signed licences (Pleadli signing key as a Worker secret), figures in admin; paper fingerprints with the public /verify page; case tracking codes with /track. Deploy.
4. **Backup to the institution's own storage**: storage connection sealed to the institution, direct upload from the apps, the iCloud-like page of backup facts.
5. **Relay**: mailboxes, certificates, directory; packaged to run on a government server as well as on pleadli.com.
6. **Reports, document packs, Assist proxy.**
7. **Apps**: trial bar, licence entry, heartbeat, cloud backup, relay as the carrier (Police, DPP, Lawyers, Prisons, Courts).
8. Then, in the user's order: Police HQ, Prisons, Courts; 5 to 8 real cases run end to end; Police mobile (dispatch, traffic); the civilians' app (report, call for help, inquire, record evidence, complain to the DPP or police, book a prison visit, follow a person in custody, residence registration with the local police, find an advocate).
