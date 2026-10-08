# Pleadli Orchestra backups: keys, seals and the backup file

Decided by the user on 2026-10-08 (ORCHESTRA-PLAN.md sections 0 and 4): a recovery phrase for the institution, storage details sealed in the administrator's browser to each approved computer, and S3-compatible storage, a folder or drive, or an SFTP server. Pleadli stores no backups and holds nothing it can use to read one or to reach the storage.

Code: `www/src/lib/seal.ts` (browser and Worker), `packages/node-core/src/backup.rs` (apps). Both sides are checked against the test vectors in `packages/node-core/tests/seal-vectors.json`.

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

## API (ORCHESTRA-API.md)

- `activate` and `heartbeat` take `sealKey` (base64url, 32 bytes): the computer's seal public key.
- `backup/config` (POST, token): `{backupKey: {publicKey, fingerprint} | null, storage: [{id, label, kind, settings, sealed | null}]}`. `sealed` is null until an administrator approves this computer for that storage.
- `backup/report` (POST, token): `{storageId?, at, sizeBytes?, ok, message?}`.
