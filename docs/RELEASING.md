# Releasing the desktop apps (Windows, with auto-update)

DPP, Lawyers, Prisons and Police are built on GitHub Actions
(the `release` job in `.github/workflows/ci.yml`) and published to the **public** repository
`phe-rus/pleadli-releases`. This repository stays private. Installed copies
check `https://github.com/phe-rus/pleadli-releases/releases/download/<app>-latest/latest.json`
15 seconds after start and every 6 hours, and offer "Install and restart". An
update is installed only if it is signed with the key below.

## Once

1. Create the public releases repository (it needs one commit, hence the README):

   ```sh
   gh repo create phe-rus/pleadli-releases --public --add-readme --description "Pleadli desktop installers and update feeds"
   ```

2. Make a token that can create releases there: GitHub > Settings > Developer
   settings > Fine-grained tokens > new token, repository access
   `phe-rus/pleadli-releases`, permission **Contents: Read and write**.

3. Give this repository the two secrets:

   ```sh
   gh secret set TAURI_SIGNING_PRIVATE_KEY -R phe-rus/pleadli < ~/.tauri/pleadli-updater.key
   gh secret set RELEASES_TOKEN -R phe-rus/pleadli   # paste the token from step 2
   ```

4. **Back up `~/.tauri/pleadli-updater.key`** somewhere safe and offline. If it
   is lost, installed copies can never be updated again; they would have to be
   reinstalled by hand. Its public half is already in each app's
   `tauri.conf.json` (`plugins.updater.pubkey`). It has no password.

## Each release

1. Raise `version` in the app's `src-tauri/tauri.conf.json` above the published
   updater feed. The workflow
   refuses equal versions, rollback, missing updater configuration and missing
   EXE or MSI targets.
2. Commit and push.
3. Put `:release` in the commit message (all five apps build), or Actions > CI > Run workflow > release. Other tokens: `:test`, `:lint`, `:all`. A commit with no token runs nothing.
4. The workflow builds into a draft. It downloads the candidate assets, checks
   versions, installer URLs and signature file agreement, and adds
   `SHA256SUMS.txt`. Only then does it publish and advance the fixed updater
   feed. Failed candidates remain drafts. Published versions cannot be replaced.

These checks do not execute a Windows installer or cryptographically verify its
updater signature. Windows publisher signing and candidate acceptance are still
open. Per app workflow concurrency serializes release jobs. Changes made outside
this workflow must use the same version and publication discipline.

Publication and updater advancement are separate GitHub operations. If publication
succeeds but updating the rolling feed fails, the public candidate remains available
and the old feed remains in place. An operator should inspect the run and candidate,
then upload that exact validated `latest.json` to the rolling release. Do not rebuild
or overwrite the published version. Recheck the current feed before recovery.

The four existing apps already have rolling feeds. A new app needs a separately
reviewed first release and feed bootstrap; this workflow deliberately fails if the
previous feed is missing. Courts remains excluded.

Bun is pinned to 1.4.2 and installation uses the frozen lockfile. Police and Prisons
use the Cloudflare sidecar pin in `toolings/releases/cloudflared.json`. Its Windows
x64 digest was compared with the official GitHub release metadata on 12 October
2026: [cloudflared 2026.10.0](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.0).
Review a new official version and digest together before changing the pin.

## What is not done yet

- Windows publisher signing uses a self-issued Pleadli certificate (CN=Pleadli, valid to 2031-11-20, SHA-256 fingerprint 71:F3:E6:3A:81:90:85:17:98:9A:94:76:94:53:7F:B1:01:B5:AD:F4:B6:3D:1B:B0:51:5F:65:94:58:BA:05:E6). Private key and PFX password stay in .signing/ (git-ignored) (back them up offline) and in the repo secrets WINDOWS_CERT_PFX_BASE64 and WINDOWS_CERT_PASSWORD. Offices trust the public pleadli.com/pleadli-code-signing.cer once (Trusted Root and Trusted Publisher). It is not a public authority, so unmanaged computers still see the SmartScreen warning.
  Tauri updater signatures do not establish Windows publisher trust. Classify
  any reported prompt on clean Windows and verify the downloaded binaries.
  Do not make bypassing a warning the standard office installation procedure.
  Publisher signing, timestamping and install/update acceptance remain release work.
- Linux and macOS are not built by the workflow.
- Four apps have published Windows releases. Courts is excluded from the
  workflow and has no public release or updater feed in the 12 October 2026
  inventory. See [the artifact baseline](platform/CAPABILITY-AND-DELIVERY-BACKLOG-2026-10-12.md).

## 12 October candidate preparation update

The local candidate workflow now includes Courts in `all`, at 0.1.0, with updater configuration and a Software update pane. The earlier statement that Courts is excluded describes the previous workflow. Its first public feed has not been created. First release dispatch must explicitly enable `bootstrap_courts`; the guard verifies a 404 and no existing public Courts history. Missing or failed feeds for all ordinary updates remain blocking. See [candidate preparation](platform/RELEASE-CANDIDATES-2026-10-12.md) for versions, acceptance gates and recovery instructions.

The root `bun.lock` is now allowed by `.gitignore` and must be included in the release source commit, because the workflow uses frozen installation. No workflow dispatch or publication is implied by local candidate preparation.
