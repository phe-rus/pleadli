# Website and downloads, first delivery

Date: 12 October 2026. Implemented locally after the request to proceed. Not deployed. This is a bounded first slice of Stage 1A in the [roadmap](DEVELOPMENT-ROADMAP-2026-10-12.md), not completion of the whole programme.

## Changes

* Downloads now show each app's purpose, three existing product highlights and an explicitly labelled illustration. The illustration component is shared with product pages rather than copied.
* Download information comes from the app's updater feed and matching public GitHub release. Direct Windows x64 EXE actions include version, publication date and size; a validated MSI is a secondary option.
* Hardcoded release fallback was removed. Missing feeds and lookup failures have separate explanations. Service failures provide a link to the public release list instead of offering an unverified installer.
* One six second deadline bounds each app lookup. Only non draft, non prerelease, matching versioned releases with valid published assets qualify. Asset URLs are restricted to the expected public repository and tag.
* Product pages share the same download controls. Their loader retains locale independent values; translated content is read when rendering.
* English, French and Kiswahili copy was updated in the Python translation sources and regenerated. Homepage introduction no longer promises completed institutional exchange or guaranteed detention outcomes.
* Installation guidance no longer makes bypassing a Windows warning the default instruction. The release documentation distinguishes updater signatures from publisher signing.

Code: `www/src/functions/releases.{func,server}.ts`, `www/src/components/{download-actions,product-mockup}.tsx`, download/product routes, product data, translation sources and generated message catalogues.

## Verification

* Website TypeScript check passed before the changes and after the changes.
* Seven release tests passed, covering valid metadata, missing feeds, rate/server failures, malformed versions/JSON, drafts/prereleases, version mismatch, asset URL/size rejection, optional MSI and the shared request deadline.
* Production client/server build passed. It emitted 54 CSS optimiser warnings about selectors from shared styles; those styles were not changed in this slice. This remains a separate styling issue to investigate.
* Live public metadata lookup returned Police 0.1.2, DPP/Lawyers/Prisons 0.1.1 and Courts missing. No binary was downloaded or executed by this check.
* Browser review confirmed English, French and Kiswahili download content, translated dates/sizes, the Courts unavailable state and direct release assets.
* At 390 by 844 pixels, viewport width and document content width both measured 390 pixels. Mobile and desktop layouts were visually inspected.
* Navigation to DPP rendered its product page and shared installer control; switching that page to French translated its content. No browser console error was returned in the inspected log sample.

## Still open

These illustrations are not release screenshots. Capture genuine candidate release screens using fictional records, and record version/locale/date before replacing them. Further website capability and security copy still needs reconciliation with the capability ledger.

Windows publisher signing, the reported installation prompt, clean install/update/uninstall acceptance and Courts release support remain Stage 1B work. This website change does not fix SmartScreen, certify installer safety or establish institutional readiness.

The website administrator signup finding, Police TLS/interchange completion, recording durability and other recovery/access findings remain in the [capability backlog](CAPABILITY-AND-DELIVERY-BACKLOG-2026-10-12.md). They were not changed in this downloads slice.
