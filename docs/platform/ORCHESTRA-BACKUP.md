# Pleadli Orchestra backups: keys, seals and the backup file

Decided by the user on 2026-10-08 (ORCHESTRA-PLAN.md sections 0 and 4): a recovery phrase for the institution, storage details sealed in the administrator's browser to each approved computer, and S3-compatible storage, a folder or drive, or an SFTP server. Pleadli stores no backups and holds nothing it can use to read one or to reach the storage.

Code: `www/src/lib/seal.ts` (browser and Worker), `packages/node-core/src/backup.rs` (apps), and `packages/node-core/src/storage.rs` (feature `storage`: sending the file to the storage). Both sides are checked against the test vectors in `packages/node-core/tests/seal-vectors.json`.

## Who holds what

| | Where | Can do |
|---|---|---|
| Recovery phrase | Written down by the institution, shown once in the administrator's browser | Restore any backup |
| Institution backup public key | pleadli.com, and every approved computer | Lock a backup (not open one) |
| Computer seal key (X25519) | Each computer's keystore; its public half on pleadli.com | Open the storage secret sealed for that computer |
| Storage settings (endpoint, bucket, path, user name) | pleadli.com, in plain view | Nothing without the secret |
| Storage secret (S3 secret key, SFTP password or private key) | Sealed per computer on pleadli.com; the administrator's own records | Reach the storage |

A stolen computer can write backups and read the storage secret it was given (the administrator then revokes it and changes the secret), but cannot read any backup. Losing the phrase loses the backups; a new phrase starts a new key, and older backups need the older phrase.

## Recovery phrase

16 random bytes, then the first 4 bytes of their SHA-256: 20 bytes, written in Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`) as 8 groups of 4: `7K3M-QX9A-...`. Reading it back, case, spaces and dashes are ignored, `O` reads as `0` and `I`, `L` as `1`; a wrong checksum means a typing mistake.

Institution key: `private = HKDF-SHA256(ikm = the 16 bytes, salt = "pleadli/backup-key/v1", info = "", 32 bytes)`, used as an X25519 scalar (clamped as usual); `public = X25519(private, 9)`. Its fingerprint is the first 8 bytes of SHA-256(public), hex, in groups of 4.

## Seal v1

To seal `plaintext` for recipient public key `R` with context `ctx` (a string naming what it is for):

1. Random ephemeral X25519 key `e`, `E = X25519(e, 9)`, `s = X25519(e, R)`.
2. `k = HKDF-SHA256(ikm = s, salt = E || R, info = "pleadli/seal/v1", 32 bytes)`.
3. Random 12-byte `n`; `c = AES-256-GCM(k, n, plaintext, aad = ctx)`.
4. The seal is base64url (no padding) of `0x01 || E || n || c`.

Contexts: `pleadli/storage/<storageId>/<computerId>` for a storage secret, `pleadli/backup/v1` for a backup's data key. A seal opened under any other context fails, so one cannot be swapped for another.

## The backup file

`<prefix>/<institution address>/<application>/<computer id>/<UTC time, 20261008T142233Z>.pleadli-backup`:

- `PLDBK1\n`, then a 4-byte big-endian length and that many bytes of JSON header: `{v:1, application, computer, createdAt, keyFingerprint, key}` where `key` is the 32-byte data key sealed to the institution public key under `pleadli/backup/v1`.
- The data, encrypted with ChaCha20-Poly1305 in STREAM form (`chacha20poly1305::aead::stream::EncryptorBE32`, 7-byte nonce prefix written first, 64 KiB chunks).

Restoring asks for the phrase, opens `key`, decrypts. The apps report each backup (`backup/report`), never send it.

## Storage settings (plaintext on pleadli.com) and secret (sealed)

- `s3`: `{endpoint, region, bucket, prefix}`; secret `{accessKeyId, secretAccessKey}`.
- `folder`: `{path}` (a network share or drive, as each computer sees it); no secret.
- `sftp`: `{host, port, username, path, hostKey}` (the server's SHA-256 key fingerprint, checked on connect); secret `{password}` or `{privateKey}`.

## What is inside, and restoring (`snapshot.rs`)

Inside the encrypted file: a description (application, date, document counts, newest migration), the database exported plain (the restoring computer encrypts it under its own key), and each document under its path relative to the application's document folder. Restoring takes the file and the phrase, checks everything (phrase, application, version, every chunk, database integrity, required tables) into a staging folder, and the next start sets the current database and documents aside under `pre-restore` and puts the backup in place. A database restored onto another computer forgets the old computer's Orchestra token, seal key and licence (`orchestra.rs` `adopt_device`), so that computer is activated again as itself.

## Sending the file (`storage.rs`)

`Target::open(entry, sealKey, computerId)` takes one `backup/config` storage entry, refuses it unless `approved`, and opens its secret; `upload(local, object_name(...))` sends the file; `check(application, computer)` writes a small `.pleadli-check` file to prove the settings before the first backup. A file is written as `<name>.partial` and renamed, so a broken-off copy never sits under a backup's name. Errors are an enum (`NotApproved`, `Settings`, `HostKey`, `Denied`, `Network`, `Refused`, `Io`) so each app says them in its own words.

- Folder: the folder must already exist (a drive not plugged in is an error, not a new folder on C:).
- S3: Signature Version 4, path-style (`<endpoint>/<bucket>/<key>`), one signed PUT, so at most 5 GB per backup. An empty region signs as `us-east-1`, which R2 and MinIO also accept. Checked against AWS's own signer.
- SFTP: the server's key must match `hostKey` (`SHA256:...` as `ssh-keygen -lf` prints it); a mismatch is `HostKey` with the key the server showed. Password or an unencrypted OpenSSH/PEM private key. Checked against a real OpenSSH server (the ignored test `sftp_to_a_real_server`).

## API (ORCHESTRA-API.md)

- `activate` and `heartbeat` take `sealKey` (base64url, 32 bytes): the computer's seal public key.
- `backup/config` (POST, token): `{backupKey: {publicKey, fingerprint} | null, storage: [{id, label, kind, settings, sealed | null}]}`. `sealed` is null until an administrator approves this computer for that storage.
- `backup/report` (POST, token): `{storageId?, at, sizeBytes?, ok, message?}`.
