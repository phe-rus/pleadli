# Pleadli DPP: security

Stage 7 of `PLAN.md`, built 2026-09-21. It follows the design of Pleadli Prisons D14 (`docs/prisons/SECURITY.md`) and reuses its key handling and sealed vault. DPP has no sign-in and no head office: one prosecutor owns the installation. No login does not mean no security, so the application protects its own data.

## What protects what

| Layer | What protects it | Where the key is |
|---|---|---|
| Database (`dpp.db`, its WAL, pre-migration snapshots, databases a restore set aside) | SQLCipher, raw 256-bit key | derived from the installation master key |
| Documents (`vault/attachments/<id>.enc`) | ChaCha20-Poly1305 STREAM, the attachment id bound into every chunk | derived from the same master key by a different label |
| Backups (`.dppbk`) | ChaCha20-Poly1305 under a key from a passphrase the prosecutor chooses (Argon2id, 64 MiB) | the passphrase, kept by the prosecutor and stored nowhere |
| The screen | Optional application lock: an Argon2id hash of a passphrase, attempts slowed after five wrong ones | the passphrase |

The master key is 32 random bytes held in the operating system's keystore (Windows Credential Manager, macOS Keychain, Linux Secret Service) under a name that carries this installation's id, so copying the data folder to another machine copies nothing that opens it. Where there is no keystore it is an owner-only key file, `node.key`, beside the data. Settings > Security says which is in force.

## The application lock is not the encryption

The lock stops a person at an unattended, unlocked screen. While it is on, the API refuses everything except unlocking (HTTP 423), the desktop commands that reach data ask it too, and the window shows a lock screen instead of the application. It locks itself after a chosen idle time. It does not encrypt anything: the records are encrypted on disk whether or not a lock is set. Someone who can already run code as this user can reach the key in the keystore.

## Existing data

An installation from before Stage 7 has a plain `dpp.db` and plain documents in `~/Documents/Pleadli DPP/`. At the first start:

1. the database is exported into an encrypted copy, which is opened with the key, integrity-checked and compared with the original table by table; only then is the original set aside, the copy put in place and the original overwritten and removed. A crash at any step is finished or undone at the next start;
2. every document is read from its old location, sealed in the vault, read back and compared; only then is the plain file overwritten and removed. The old folder is emptied of what the database claimed and nothing else. The stored path is now relative to the vault and no longer names the file's number.

## Backup and restore

A backup is one file holding the whole record and every document. It restores on another machine: the passphrase is the only thing that opens it. Restoring never touches the running data. The backup is unpacked and checked into a staging folder, the app restarts, and the next start sets the current database and vault aside (kept, encrypted, the newest three) and puts the backup in place, re-encrypted under that machine's key. A wrong passphrase, a damaged or truncated file, or a backup from a newer version stages nothing.

## Recovery mode

If the database exists but this machine holds no key for it, or it fails its integrity check, the app starts in recovery: the window explains and offers a restore from a backup; nothing else is served. A key is never invented for a database that already exists.

## Audit trail

An append-only, hash-chained record of decisions, reviews, documents issued or discarded, attachments, the lock and backups. Each entry commits to the one before; the database refuses to update or delete a row; Settings > Security verifies the chain. It records what happened and who was acting, never the content of a record.

## What this does not defend against

- A copy of the whole data folder, when the key is in a key file (no keystore). The settings say so.
- Someone signed in to the operating system as the same user.
- A lost key with no backup: the data cannot be opened.
- Plaintext removal is best effort: files are overwritten and removed, which on flash storage or a journalling file system does not guarantee the old blocks are gone.
- While a document is open in another program it exists as a plain file in a private folder, emptied when the app starts and exits.
- Memory, swap and crash dumps.
- Not verified on Windows or macOS. The packaged app has not been built or run. The webview has no Content-Security-Policy.

## Police packages (Stage 8)

Built on the layers above: a station is trusted only after this office invited it and a person typed its fingerprint; packages are signed, sealed, replay-protected and held apart from the records until accepted. This office's interchange secrets live in the encrypted database. See `docs/interchange/police-dpp.md`.
