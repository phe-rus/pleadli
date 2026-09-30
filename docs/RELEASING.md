# Releasing the desktop apps (Windows, with auto-update)

DPP, Lawyers, Prisons and Police are built on GitHub Actions
(`.github/workflows/release.yml`) and published to the **public** repository
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

1. Raise `version` in the app's `src-tauri/tauri.conf.json` (all four are at
   `0.1.0` for the first release). An installed copy updates only to a higher
   version.
2. Commit and push.
3. Actions > Release > Run workflow, choose the app (or `all`). Or push a tag:
   `git tag lawyers-v0.1.1 && git push origin lawyers-v0.1.1`.
4. About 15 to 25 minutes later the installers are at
   `https://github.com/phe-rus/pleadli-releases/releases` (`.msi` and
   `-setup.exe`), and `<app>-latest/latest.json` points at them.

## What is not done yet

- Windows installers are **not code-signed** (no certificate): Windows
  SmartScreen shows "Windows protected your PC" on first install; choose
  "More info", then "Run anyway". Updates after that install silently.
- Linux and macOS are not built by the workflow.
- The first run of the workflow has not happened; if it fails, the log names
  the step.
