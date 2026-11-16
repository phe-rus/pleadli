# Desktop release candidates, 12 October 2026

These are local candidate sources, not published installers or a claim of complete institutional interoperability.

## Candidate versions

| App | Published rolling feed checked today | Prepared candidate |
| --- | --- | --- |
| Police | 0.1.2 | 0.1.3 |
| DPP | 0.1.1 | 0.1.2 |
| Lawyers | 0.1.1 | 0.1.2 |
| Courts | No feed (GitHub returned 404) | 0.1.0, first release |
| Prisons | 0.1.1 | 0.1.2 |

Sources: the `latest.json` assets in `https://github.com/phe-rus/pleadli-releases/releases` for each app's `<app>-latest` release. The local release preflight reads each candidate's Tauri configuration. Package and Rust crate versions match it.

## Prepared in this slice

1. Courts supporting files: attach an original PDF, PNG, JPEG or UTF-8 text file, up to 10 MB; case list, preview, save copy; immutable original metadata, content fingerprint, encrypted storage and audit entry. Upload does not admit evidence. No delete action is included in this first slice.
2. Courts backup includes attachments alongside recordings. Restore seals each original under the local vault key and checks its bytes before removing the staged original. Unknown restored file names now stop restore and retain the original for recovery.
3. Root Bun lockfile and Police Cargo lockfile are no longer ignored. Frozen installation was checked locally. Both lockfiles must be included when this checkout is committed; a working local lockfile alone does not repair CI.
4. Courts added to release tooling and the workflow's `all` matrix, with signed updater configuration, a native updater plugin and a Software update page. Release copies check quietly and let the user choose installation and restart.
5. Explicit `bootstrap_courts` workflow input for Courts 0.1.0 only. The helper requires a real missing release (404), verified public history without a previous Courts release and the explicit switch. Authentication failures, network failures and missing feed assets still fail. The published feed is checked again immediately before publication.
6. Candidate metadata advances the four existing public feeds. Release tooling tests also cover first release refusal and ordinary version advancement.

## Publication gate

No release workflow was dispatched, remote commit pushed, installer published or updater feed changed by this slice. The existing checkout contains broad earlier work which must be reviewed and included deliberately in the release source checkpoint.

Before publication, build the Windows candidates from that exact checkpoint and test installation, upgrade, restart, local data retention, offline operation and backup recovery on clean Windows. Updater signatures verify update provenance; Windows publisher signing and installation prompt classification remain separate open work. Native file dialogs and physical printing need platform acceptance. The first Courts release requires Actions dispatch with `bootstrap_courts` enabled. Ordinary tag releases keep the missing feed guard.

If Courts publication succeeds but rolling feed creation/upload fails, keep the published version unchanged. Recover by creating `courts-latest` if absent and uploading the exact validated `latest.json` from that version. Do not rebuild or replace published installers. The bootstrap guard will correctly refuse a second first release once public Courts history exists.

## Integration release boundary

Police referrals are still local records. The shared signed package contract and DPP receiving interface exist, but Police package pairing, construction and incoming receipt handling are not implemented yet. Lawyers office networking and Prisons facility networking are separate institutional protocols; they do not establish the criminal case handover requested here. Courts case intake and court to prison warrant exchange still require implementation.

Do not advertise the full five app case journey as working based on this release preparation. See `CASE-CHAIN-ACCEPTANCE-2026-10-12.md` for the required demonstration.

## Local validation

All five frontend checks passed. Ten Bun release/export tests passed. All 48 Courts native library tests passed, including attachment isolation, tamper rejection and full encrypted backup/recovery. Frozen root Bun installation, workflow YAML parsing, matching app/crate/Tauri versions, Police locked offline Cargo metadata and diff whitespace checks passed. Published-feed checks confirmed each candidate advances its current feed and Courts satisfies the explicit first-release guard. These checks do not substitute for the Windows publication gate above.
