# Records directory: the institution owns its work (2026-11-27)

> Orchestra owns the tools, not the institution's work. The institution keeps control of its records, documents and operations whether or not it keeps using Orchestra.

**Status (2026-11-27, later).** Built and wired into Police, DPP and Prisons: `packages/node-core/src/records.rs` (folders, manifest, scan) and `records_db.rs` (sync from the database, recover into an empty one, keys). Each app writes its records folder in Documents while it runs (every 45 s, never deletes). **The database is still the working copy; the folder is a mirror until a watched recovery run in each window is done.** Recovery is proven in tests on the real schema of all three apps (rebuilt into an empty station from the folder and the recovery phrase). Police was run in an isolated desktop installation: a case, a person and a statement entered through the screens produced the case folder, a readable paper and sealed data. DPP and Prisons have been built and tested, **not yet run in a window**.

## 1. What is true today (read from the code, Police, 2026-11-27)

- The database (`SQLCipher`, 57 tables in `apps/police/src-tauri/migrations`) is the **only** home of cases, people, statements, custody, bonds, exhibits and their movements, charge sheets, referrals, the station diary, registers, incidents, medical exams, the audit log and the postbox. Lose the database, lose the work.
- Attachments are sealed files named by id (`vault/attachments/<id>`), flat, with the name, type, size and owner kept **only in the `attachments` table**. Without the database they are unnamed ciphertext.
- The Library (`domain/library.rs`, migrations 0047-0048) is a file manager of folders and a trash bin held in database rows. It duplicates nothing on disk and shows nothing the officer's work did not already put there. That is the "personal drive" the client rejects.
- A Markdown snapshot exists (`documents::regenerate_all_markdown`, `export_all_markdown`) from before the vault was sealed. It is a one-way export, not a source anyone can rebuild from.
- Backups (`node-core/backup.rs`, `snapshot.rs`) are encrypted, institution-keyed and restorable. Good. They are a copy of the database, not a records directory.

## 2. Ownership: one authority per kind of information

No competing sources of truth. The directory is authoritative for **what the institution produced**. The database is authoritative for **how the app finds and operates on it**.

| Kind | Authority | Why |
|---|---|---|
| Case, person, statement, custody, exhibit, charge sheet, referral, bond, correspondence **as records** | **Records directory** (`record.json` + Markdown/JSON + files) | The institution's work. Must survive reinstall. |
| Finalised, signed, issued documents | **Directory**, immutable once issued (new version, never edited in place) | Legal weight. The issued bytes are the record. |
| Evidence and attachments | **Directory**, sealed by the vault, named by record | Must not be plain. See section 4. |
| Search index, counts, "what needs attention", sort order, Library listing | **Database** (rebuilt by `scan`) | Derived. Always rebuildable. |
| Sessions, officer sign-in, local settings, keys | **Database / keystore** | Machine-specific, never part of records. |
| Audit log | **Both**: hash chain in the database, a sealed copy of each segment in the directory | Tamper evidence must outlive the index. |

Rule: if a value could be lost with the database and someone would be harmed, it belongs in the directory.

## 3. Layout and format (version 1)

Implemented in `records.rs`; see its header. Summary:

- `RECORDS.json` at the top: format version, institution.
- `<kind>/<readable name> [<id8>]/record.json`: **stable id**, kind, reference, title, format version. The folder name is for people; **identity is only the id**, so renames and new references never break links.
- `MANIFEST.json`: path, size, sha-256, `sealed` for every file. Written **last**, so a matching manifest means a complete record.
- Writes: temp file in the same folder, flush, rename, flush the folder. A crash leaves the old state or the new one.
- `scan` reads only the directory and reports **missing**, **modified**, **unlisted** (added outside Orchestra: kept, offered for review, never deleted), **conflicts** (two folders, one id: never merged), **incomplete**, **stale temp files**, and refuses a newer format instead of misreading it.
- Relationships between records are by id inside `record.json` (to be added per kind), never by path.

## 4. Protection is not weakened

`records.rs` does no cryptography. Callers pass bytes already sealed by the vault and mark them `sealed`, so this module cannot write protected material plain. The decision to keep:

- Ordinary working documents (drafts, Markdown, issued PDFs) are readable files in the directory. Restricted cases and anything the vault seals today stay sealed in the directory, with the same keys and the recovery phrase that exist today.
- To open sealed files without Orchestra the institution needs its recovery material and the (to be published) sealed-file specification. That keeps "recovery needs authorisation" and "not locked in" both true. **The published specification and a small stand-alone opener are not written yet.**

## 5. Library and Documents

- **Library** = the indexed, browsable view of the directory (and so of historical cases and their papers). It is built from `scan`, not from its own tables. The folders and bin tables should be retired once the directory exists, not kept as a second repository.
- **Documents** = the papers an officer prepares, edits, signs, prints and sends, drawn from the same records.
- A file added to a record folder outside Orchestra appears as `unlisted`, offered to an authorised officer to adopt into the record. It is not lost and not silently trusted.

## 6. Paper, paperless and hybrid

One workflow, two ways out. A referral by hand: the officer prints/exports the record package. A referral by Postbox: the same package is sent. An incoming paper or Postbox document with no matching local record is stored as `correspondence` for authorised review (an unmatched, authentic item changes nothing else). No app may require the other institution's record to exist first. Existing Police behaviour (referrals as sealed `.pxpkg` by file or postbox) already follows this and is kept.

## 7. Migration order (each step safe to stop at)

1. **Done.** Foundation module and tests.
2. **Mirror, additive.** After a record changes, write its folder. The database stays authoritative; nothing is deleted. A `scan` check is added next to the existing backup check.
3. **Prove recovery on an isolated directory:** delete the database, rebuild the index from the directory, compare counts and hashes. Only then.
4. **Flip authority** per kind (cases first), keep the database copy for one release, then drop duplicated columns.
5. Library from `scan`; retire `library_folders`, `library_trash`.
6. Sealed-file specification and stand-alone opener.

Steps 2-6 are **not started**. Step 3 is the gate: no flip without a recovery run that someone watched.

## 8. Open items (need research or an owner, none invented)

- Prisons: legal authority for detention, warrants and the registers actually used are **not yet researched** (`docs/prisons/legal/` exists; not re-verified today).
- Kenya and DRC record structures: Police rule packs exist for UG/KE/CD; prosecution and prison paperwork for KE/CD is **unverified**.
- Which kinds are sealed by default in the directory (decision above is the safe existing behaviour, not a confirmed requirement).
- Audit-log segment copies into the directory.

## 9. What was built and how it behaves (2026-11-27)

- **Keys.** One records key per directory. It is wrapped for each computer using the folder (opened by that computer's vault key) and once for the institution's recovery key (`backup::seal`, opened only by the recovery phrase). A new computer, or a reinstall, opens the folder with the phrase and from then on opens it on its own. If the institution has no recovery phrase yet, the folder is written but is not recoverable on another computer until it has one; the Library says so by being locked there.
- **What is plain and what is sealed.** `record.md` is the readable paper, written only for ordinary records and only from tables each app lists (Police: the case, exhibits and their movements, charge sheets, referrals). Statements, custody, medical, people and everything else are sealed in `data.sealed` with the records key; a restricted case has a one-line paper and nothing else. Attachments are re-sealed under the records key into the record's folder. Credentials (`password_hash`, `totp_secret`, PINs) are never copied, and machine-only tables (sessions, private keys, pairing codes, the Orchestra state) are never written.
- **Recovery** inserts rows with `INSERT OR IGNORE`, never overwriting what the app already holds, then re-seals attachments into the new installation's vault. A record whose sealed data was edited, or that does not open, is skipped and reported by name.
- **Library.** One shared screen (`packages/shell/src/view/records-library.tsx`) in all three apps: records by kind, search, the paper of each, show the folder, save now, recover. The old folder-and-recycle-bin browser in Police is removed from the UI.
- **Gaps that remain.** Prisons officer accounts are not copied (recovery needs accounts set up again). Attachments over 256 MB stay in the vault and are reported. The old `library_folders` / `library_trash` tables still exist, unused by the screens. Authority has not been flipped for any kind. The sealed-file specification and a stand-alone opener are not written. A fresh Police install seeds demo rows; recovering into one mixes them (to confirm for production installs).
