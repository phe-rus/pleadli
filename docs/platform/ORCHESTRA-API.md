# Pleadli Orchestra API v1 (for the apps)

Base: `https://pleadli.com/api/orchestra/v1/`. JSON in, JSON out. Code: `www/src/api/orchestra-v1.ts`. Plan: `ORCHESTRA-PLAN.md` sections 3 and 8b.

Every call names the computer by `device` (SHA-256, lowercase hex, of the OS machine identifier: Windows MachineGuid, Linux machine-id, macOS hardware UUID; never the raw value) and `application` (`police | dpp | courts | lawyers | prisons`), optionally `version`, `os`, `country` (2 letters), and `sealKey` (base64url X25519 public key for backups; kept only on `activate` or a `heartbeat` with the token, and a new one drops the computer's storage access).

| Endpoint | Method | Body extra | Answer |
|---|---|---|---|
| `key` | GET | | online public key, its certificate |
| `trial` | POST | `localTrialStartedAt?` (ms) | licence state (below) |
| `activate` | POST | `key` (PLD-XXXX-...) | licence state + `token` (keep it; shown once) |
| `heartbeat` | POST | | licence state; send `Authorization: Bearer <token>` |
| `papers` | POST, token | `code, reference, kind, office, contentSha256, fileSha256?, issuedAt` | `{ok, code}` |
| `papers/withdraw` | POST, token | `code, reason?` | `{ok}` |
| `backup/config` | POST, token | | `{computer, backupKey: {publicKey, fingerprint} \| null, storage: [{id, label, kind, settings, approved, sealed}]}`; `computer` is this computer's id, used in seal contexts and backup paths |
| `backup/report` | POST, token | `storageId?, at, sizeBytes?, ok, message?` | `{ok}` |
| `track` | POST, token | `code` (12 chars), `stage`, `office?`, `at`, `nextAt?` | `{ok, code}` |

Licence state: `{ state: trial | trial_ended | licensed | licence_ended, trial: {startedAt, endsAt, ended}, licence: Signed | null, offices?: [{address, name}], reason?, serverTime }`; `offices` (licensed only) is the institution and its offices, for choosing the `office` papers are issued from. The trial start is the earlier of the server's and the app's own, so a reinstall continues the same 30 days. Records are never locked when a trial or licence ends.

`office` is an Orchestra address (`ug.police.albertine.kagadi`); for papers it must be the institution or one of its own offices. Tracking `stage` is one of `reported, investigating, with_dpp, charged, in_court, remanded, on_bail, judgment, released, closed`: a fixed list so no names can be sent.

Backups (keys, seals, the backup file): ORCHESTRA-BACKUP.md. `sealed` opens with the computer's seal key under the context `pleadli/storage/<storage id>/<computer id>`.

Errors: `{error, message}` with 400 invalid, 401 not_activated, 403 revoked / suspended / expired / wrong_application / licence_needed, 404 unknown_key, 409 seats_full / code_taken, 422 unknown_office.

## Signed licences

`Signed = { key, payload, signature, cert }`: `payload` is base64url JSON bytes, `signature` the Ed25519 signature over exactly those bytes. The payload: `{v:1, kind:"pleadli.licence", licence, institution, address, application, seats, device, issuedAt, refreshAfter (+7 days), validUntil (+37 days, at most expiresAt), expiresAt}`. The app checks `device` is its own, refreshes after `refreshAfter`, and treats the licence as ended after `validUntil`.

## Keys and recovery

Two levels, so a lost or leaked online key never needs an app update:

- **Root key**: offline only (USB stick plus a printed sheet, two places). Apps embed its public half (`orchestra-root-public-key.txt` once made). It signs only certificates of online keys.
- **Online key**: Worker secret `ORCHESTRA_SIGNING_KEY` (and `www/.dev.vars` for local dev). `cert` in every Signed answer is the root's statement `{kind:"pleadli.signing-key", key, publicKey, issuedAt}` about it. The app checks `cert` with the root key, then the licence with `cert.publicKey`.

Run in your own terminal from `www/` (key material never goes through an assistant or git):

- `bun scripts/orchestra-keys.ts init /media/usb/pleadli-keys`: makes the root key, backs up the current online key to the same folder, writes the certificate to `www/src/lib/orchestra-key-cert.json` (public; commit and deploy).
- `bun scripts/orchestra-keys.ts rotate /media/usb/pleadli-keys`: online key lost or leaked: new key, backed up, uploaded with wrangler, certified. Then deploy.
- `bun scripts/orchestra-keys.ts certify /media/usb/pleadli-keys`: certify the key in `.dev.vars` again.

Until `init` runs, `cert` is null and `key` reads `orchestra-uncertified`; apps must not ship before then.
