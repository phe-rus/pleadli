# Signup access, release safeguards and operating modes

Date: 12 October 2026. Implemented locally after the request to proceed. Not deployed. No release was triggered, installer published, production account modified or billing integration added.

## Operating modes

The user clarified that Pleadli is a SaaS platform that can be used by one person alone offline or by an institution with multiple users. The homepage and download introduction now state both paths in English, French and Kiswahili. The roadmap records ownership, permissions, subscriptions and connectivity as separate concerns, with offline and local network acceptance trials still required. This copy change does not implement new onboarding or establish that every app has completed those trials.

## Website access

Public email signup previously assigned the platform admin role to addresses listed in `PLEADLI_STAFF_EMAILS`, with a default staff address. Entering an address did not establish control of it. That hook was removed. The Better Auth admin plugin now explicitly uses the ordinary user role by default. Existing trusted admin operations remain available; institution roles remain separate.

The local development seed script accepts only localhost or 127.0.0.1 on port 3000. Its two accounts are ordinary users. It was syntax checked, not executed. Development and production admin provisioning need a trusted operator process; email signup is no longer a bootstrap mechanism. Existing administrators can use the authenticated role management path in `www/src/functions/admin.func.ts`. Where no administrator exists, bootstrap needs a trusted database operator to verify the exact account and grant the role, with an audit record. No automatic first user promotion was added.

Removing the signup rule does not retroactively establish that existing admin accounts are legitimate. Before deployment, the operator should review current admin membership and sessions against approved accounts and revoke any unexpected access. Production accounts were not inspected in this work.

## Release safeguards

The Windows workflow now checks the selected app configuration and pushed tag, requires a version above the current published feed, builds into a draft, validates downloaded candidate assets, generates checksums, and publishes before advancing the rolling updater feed. It refuses to rebuild an already public version. Jobs for the same app serialize.

Bun is pinned to the repository version and dependency installation uses the frozen lockfile. The Police and Prisons Cloudflare sidecar is pinned to an official release and SHA256 digest. The digest was compared with the official GitHub asset metadata. No sidecar binary was executed locally.

Candidate validation checks EXE and MSI presence and nonempty size, matching version, exact public installer URLs, supported Windows platform entries, and agreement between feed signatures and signature files. These are structural checks. They do not establish cryptographic signature validity, Windows publisher trust, malware absence or successful installation. Courts remains outside the workflow. See [release operations and recovery](../RELEASING.md).

## Verification and limits

* Eleven tests passed across website release metadata, real auth handler access checks with an isolated SQLite database, and release candidate validation.
* Website TypeScript check and production build passed. Release tooling passed a separate strict TypeScript check. Workflow YAML parsed and the local seed script passed Bash syntax checking.
* The production build still reports the existing shared CSS selector warnings and a chunk size warning. Neither has been resolved by this slice.
* The existing public Police feed signatures matched the published signature files, providing a check of the format expected by the new validator.
* Browser review confirmed the new solo and institutional wording on the homepage and downloads page. Screenshot: `/tmp/pleadli-solo-institution-home.png`.

The auth test uses the production auth configuration and schema with an in memory SQLite adapter; it does not exercise deployed Cloudflare D1. The Windows workflow has not run on Actions with these changes. Windows publisher signing and clean install/update/uninstall trials remain open. Offline entitlement terms, personal/institutional onboarding and multiple user recovery trials remain planned work.
