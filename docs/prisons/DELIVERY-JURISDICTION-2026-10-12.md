# Prisons jurisdiction and file improvements, 12 October 2026

## User direction

Uganda is the default. DR Congo comes next, then Kenya. Other countries follow later. Preserve both offline individual use and institutional use with multiple officers. This slice follows the existing jurisdiction boundary in JURISDICTIONS.md and the approved prisoner file direction in APPLE-PASS.md. No new dependency or database migration is needed.

## Delivered source changes

Law and jurisdiction is a visible Settings section, with the active jurisdiction, implemented legal basis, original source links and ordered planned countries. Today and the prisoner's identity header link to it on every tab. The facility setup explains Uganda's default and the expansion order. New strings have English, French and Swahili entries. UI language remains separate from law.

Unknown frontend ids no longer become Uganda. The backend validates country and jurisdiction during setup and profile saves. The rules resolver checks stored identity before supplying legal calculations. Sentences, prisoner files, obligations, legal queues and discharge assessments all use the selected rules. Only Uganda is operational. No Congolese or Kenyan legal parameters have been invented.

Remission eligibility compares the term end with the end of one calendar month after the sentence start. This fixes one-month sentences in 31-day months and terms exceeding a short February. Existing day-fraction rounding and forfeiture arithmetic are unchanged and remain part of the broader legal review.

The prisoner file uses a rounded segmented tab group directly beneath the identity header. Overview now holds the existing legal position, particulars, open tasks and timeline. Legal, Care, Property and History open directly without first scrolling past that summary. Existing Legal URLs still work; a file without a tab opens Overview. The segmented group scrolls horizontally in narrow windows. Existing record actions and legal procedures remain available.

## Evidence and limits

Official Uganda original Act and JSC guidance were read. The 2023 consolidated text exposes a section-numbering difference, so the UI identifies its original 2006 citation basis. Kenya's official judgment sources still refer to Cap. 90. The earlier claim that a 2024 replacement Act is the governing starting point is unverified and was removed from the canonical jurisdiction map. Current DR Congo law and amendment history have not been established from an authoritative source in this slice.

A full legal release review still needs source edition mapping, amendments, relevant judgments, multiple sentence handling, remand credit, life sentences, bail procedural conditions and a maintained public holiday calendar. The app does not automatically grant bail, parole or discharge on the strength of a date. DR Congo and Kenya remain unavailable for operational use until their own packs and workflow acceptance cases exist. National networks also need jurisdiction compatibility checks before supporting more than Uganda.

## Verification

Prisons type checking passed. Three Bun jurisdiction tests passed, covering Uganda defaults, rejection of planned and unknown ids, and country rollout order. The full Rust library suite ran 145 tests: 144 passed, one failed. All new country identity and stored jurisdiction guards, and all five sentence clock tests, passed. The remaining failure is `domain::officers::tests::badge_only_signs_in_without_a_secret_only_when_every_condition_holds` at officers.rs:958. It expects `BadgeOnlyNotAllowed` for an administrator while the current preexisting policy allows facility administrators to be marked passwordless. The `facility_admin` fixture role is valid in the current role catalogue. This slice did not modify officers.rs or auth_policy.rs and does not claim a clean full suite. Resolve the policy and test contract before release rather than weakening assertions to hide the mismatch.

Browser verification used the existing compiled debug headless node against `/tmp/pleadli-prisons-jurisdiction-review-20261012` and the revised frontend. A fictional facility was created without Head Office connectivity. Setup displayed Uganda and the rollout order, Today opened Law and jurisdiction, and the settings screen displayed sources and planned country order. A synthetic prisoner fixture verified Overview, Legal, Care, Property and History navigation and the persistent legal basis link. These are UI checks; the changed Rust logic was checked by the new compiled library tests, not that older headless binary. The updated native desktop window and Windows installer were not exercised.

Screenshots: `/tmp/pleadli-prisons-jurisdiction.png`, `/tmp/pleadli-prisons-file-overview.png`. No normal user database was used. No release was published. No scope row precisely matches this focused jurisdiction repair, so no scope feature has been marked complete.

The temporary UI and headless review servers were stopped after verification. The older compiled headless binary reported a segmentation fault during Ctrl+C termination. The UI had worked before termination. This is a native shutdown acceptance item; no cause or fix is claimed here.

## Follow-up at pause, 12 October 2026

See [current resume notes](RESUME-2026-10-12.md). The existing suite passed 144 tests with the disputed sign-in test explicitly excluded. A new discharge lifecycle and duplicate-request regression passed. A second new regression for invalid release types was saved but its compilation was interrupted due to memory pressure. The release-type validation fix has not been implemented. The user has not resolved the administrator sign-in policy choice. All Pleadli development servers and build processes are stopped; current scope is Prisons only.
