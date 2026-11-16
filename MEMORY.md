# Pleadli working memory

Updated 12 October 2026, Africa/Nairobi.

## Current pause

The user is resting. Do not restart development servers, compilation, linking or test builds without a new request to resume. Memory pressure interrupted the Prisons test build twice. All Pleadli development ports, Vite, workerd, Cargo, rustc and rust-lld were stopped. Unrelated user apps and SSH were left running. The deployed website remains online.

## Immediate scope

Only Prisons for now. The user explicitly narrowed the work to Prisons. Do not move to Police, Android, HQ work for the other apps or new desktop releases yet.

Resume from [Prisons handoff](docs/prisons/RESUME-2026-10-12.md). The discharge validation fix is NOT implemented. Its new regression test is saved but was interrupted during compilation. Do not report that test as passed or the fix as delivered.

## User preferences

* Avoid em dashes in copy, metadata and replies.
* Preserve solo offline use and institutional use with multiple users.
* Uganda is the default legal jurisdiction. DR Congo comes next, then Kenya. Planned countries must not silently inherit Uganda rules.
* The product name is Pleadli Legal Orchestra. The slogan is: A better place for your work.
* Prefer considered, calm product presentation, wide software previews, real fictional-data screenshots and polished controls. Keep wording understandable to ordinary users.
* Keep memory usage low. Leave unnecessary servers off and avoid concurrent builds.
* Complete authorised work without repeated permission questions, but do not silently decide unresolved business or security policies.

## Website delivered

Website source is committed and pushed to origin/main. The www working tree was clean at pause.

* 62bc97f: website visual refresh, screenshots, preview playback, public page polish and related existing website fixes.
* f602e52: page specific SEO titles and keywords, translated main titles, updated structured-data slogan.
* Both changes deployed to https://pleadli.com.
* Latest Cloudflare version: 0dce3bf2-b4d8-4845-bed1-053fc9540903.
* Production build passed. All 21 live public routes passed checks for distinct titles, descriptions and keywords, single metadata tags, matching social metadata, correct canonical URLs and no em dashes in those fields.
* Website tests: 8 passed. Frontend type checking passed.

## Checkout caution

The repository contains extensive earlier uncommitted desktop and shared package changes. Preserve them. Website deployment did not commit or release these desktop changes. Do not use broad git staging, reset or cleanup commands. No desktop release was published during this session.
