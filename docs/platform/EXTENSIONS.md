# Pleadli Extensions

Written 2026-11-22. **Status: the package, trust, capability, lifecycle and isolation core is built and tested. NO executable extension logic runs (the WebAssembly runtime is not built). No app has an Extensions screen. No catalogue exists.**

Code: `packages/node-core/src/extensions.rs` (feature `extensions`), 3 tests including a full life of an example extension.

## Package: `.pleadli`

One file: magic `PLEADLI-EXT\x01`, a 4-byte manifest length, the manifest (JSON), then the files in the order the manifest lists them. There are no paths inside an archive format, so no zip-slip. Limits: 8 MB package, 64 files, 2 MB a file.

Manifest (`schema` 1): `id` (reverse domain), `version` (x.y.z), `name`, `description`, `publisher`, `targets` (any of `police`, `dpp`, `courts`, `lawyers`, `prisons`), `min_app_version`, `capabilities` (name and a reason the person will read), `entry` (a `.wasm` file, parsed but never run), `files` (path, SHA-256, size), optional `signature` (Ed25519 key and signature over the manifest without the signature).

`inspect` checks, and changes nothing: magic and lengths, every file's hash and size, no bytes left over, paths (lower-case, no `..`, no leading dot, no absolute, no repeats), id and version, targets, that the extension is for this app and this app is new enough, a closed capability list, and the signature.

## Trust

`Verified`: the signature verifies against a key the app trusts. `Developer`: unsigned, or signed by a key the app does not trust; installs only when the person explicitly accepts a developer extension. A signature that is present but wrong is refused (never downgraded to unsigned). A Verified extension cannot be replaced by a Developer package under the same id. **Open:** which keys the apps trust (Pleadli's root key, an institution's own key) and how a catalogue vouches; none is configured.

## Capabilities (closed list)

`storage`, `templates.documents`, `templates.forms`, `ui.menu`, `ui.panel`; sensitive, called out on the consent screen: `reports.read`, `documents.read`, `records.lookup`, `export.write`, `import.read`; and `network:<exact host>` (no wildcard, no IP address, no `localhost`). Nothing else exists: no file system, database, key, audit or Postbox capability. A capability is permission to ask the host, which still applies the app's authorisation; an extension never gets the SQLCipher key, the vault, the audit chain or the Postbox. **Not yet built:** the host-side APIs behind the sensitive capabilities. Granting `documents.read` today lets the host decide to serve a document; no app serves one.

## Lifecycle and isolation

Install puts it **off with nothing granted**. Enable grants exactly the subset the person chooses (never beyond what it declared). Update: must be newer; if it asks for more than was granted it stays off with a reason until the person agrees again; old files are replaced only after the new ones are written. Remove deletes files and storage. Each extension has its own folder and a 1 MB storage quota; storage keys cannot climb. `Host::call` audits every call and every refusal (the app writes the returned `AuditEvent`s to its audit chain), catches a panic, and switches the extension off after 3 genuine failures in a row; ordinary refusals (a missing file, a full storage) are not counted; a success resets the count.

## Verified, and not

Verified (unit tests): tampered file, edited signed manifest, truncation, trailing bytes, not-a-package, oversize, untrusted and unsigned signers, wrong app and version, unknown, wildcard and address capabilities, bad paths and ids, install disabled, grant subset, refused paths, no network by default, exact-host network, panic isolation and auto-disable, update needing consent, downgrade refusal, signed-to-unsigned refusal, removal deleting storage. **Not verified:** any use inside an app window; drag-and-drop and file-picker install (no UI); the WebAssembly runtime (design only: a restricted runtime with no ambient authority, host imports limited to the granted capabilities); a catalogue; a real signing key; compatibility across app versions beyond `min_app_version`.

## Categories this supports today and later

Today (declarative, through `read_asset`): document and form templates, reference sources, jurisdiction packs as data. Needs the WASM runtime: external-system connectors, reporting logic, import and export logic, controlled AI integrations, jurisdiction workflows with logic. Settings must keep **Connections** and **Extensions** separate (not built).

## Next steps in order

1. An `Extensions` section in Settings (list, drag-and-drop or file install, consent screen showing sensitive capabilities, enable and disable, remove) in one app first (Lawyers), then the shared shell. 2. A restricted WebAssembly runtime (wasmi or similar, no WASI, only granted host imports, fuel and memory limits). 3. Wire `AuditEvent`s into each app's audit chain. 4. A signed example in the repo. 5. Catalogue metadata through Pleadli Cloud.
