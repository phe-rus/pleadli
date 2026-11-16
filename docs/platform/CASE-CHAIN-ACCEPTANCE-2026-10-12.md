# Complete criminal case acceptance trial

Prepared on 12 October 2026 for the user's requested Police, DPP, Lawyers, Courts and Prisons trial. Status: implementation and acceptance work remains. This is a trial plan, not a completed trial report.

## One complete fictional case

Use an isolated pilot data directory for every application. Record a fictional theft case, complainant, accused, witness, statements, scanned supporting document and proposed charge. Use references prefixed `PILOT-UG-2026-001` and fictional people rather than importing a real person's data to develop the workflow.

| Handover | Required action and evidence | Current implementation boundary |
| --- | --- | --- |
| Police to DPP | Station receives an invitation, verifies the office fingerprint, answers, gets confirmed, exports a signed sealed referral, DPP reviews and accepts it, returns its reference and receipt | Shared contract and DPP receiver exist; Police package side remains to build |
| DPP back to Police | Return directions, station resubmission on the same file, subsequent decision and issued papers | DPP package support exists; Police receipt and notice intake remains to build |
| Advocate case workspace | Open the instructed matter and receive the materials the advocate is authorised to hold, keeping source references and acknowledgement | Lawyers has its own office network; cross app intake remains to build |
| DPP or advocate to Courts | Court reviews the filing, accepts it into its own register, records its reference and hearing, preserves source reference and papers | Courts local case registration and attachments exist; signed filing intake remains to build |
| Courts to Prisons | Court prepares and issues the appropriate warrant; prison reviews authority, accepts admission and records its own prisoner/custody reference | Local court orders and prison admission domains exist; shared warrant contract and receiver remain to build |
| Prison back to Court | Admission receipt, production request/acknowledgement and attendance/outcome as applicable | Facility networking is not this court interchange; the cross app contract remains to build |
| Court outcome and prison discharge | Court issues the outcome and release authority; prison validates all active custody authorities, property and pending gates before a person confirms discharge | Prison discharge logic exists; upstream authenticated warrant/outcome intake and full trial remain to verify |

The advocate is an authorised participant, not a mandatory intermediate owner of the prosecution's whole file. Institutions retain their own authoritative records. No incoming package alone admits an exhibit, decides a case or releases a prisoner.

## Transport sequence

First prove the Police to DPP slice through the existing `.pxpkg` signed and sealed contract, including return, resubmission and receipt. Build the remaining recipient specific contracts and acceptance screens. Use the same verified package contents for file and network transport; do not create a second interpretation of a case for network delivery.

Run the complete scenario twice with fresh isolated data:

1. File transport, using explicit export and import at each institution.
2. Verified network transport, using approved pairing and encrypted connections, with disconnection and restart during transfer.

Keep the Police command network, Lawyers office network and Prisons facility network distinct from cross institution case exchange. A generic CSV, JSON, Markdown or PDF import does not count as authenticated case delivery.

## Required failure and recovery checks

* Wrong recipient, unknown or revoked sender, altered package and altered attachment are refused before acceptance.
* Duplicate delivery and retries do not create duplicate cases, people, custody admissions or receipts.
* Interruption and offline queues survive restart. Queued, transmitted, received and accepted are distinct visible states.
* Sender sees the recipient's acknowledgement and new local reference. A saved export is not labelled delivered.
* Backup and restore preserve records, attachments, identities and pending exchange state; repeat the acknowledgement after restore without duplication.
* Local offline work continues for a solo user. Institutional access and concurrent users are checked independently from subscription entitlement.
* A warrant or release notice must be reviewed through the prison's existing custody and discharge gates. Unsupported or incomplete authority stays pending for review.

## Release sequence

Prepare candidate builds for all five apps, finish the remaining prison improvements and verify their existing discharge/estate workflows, then implement Police package exchange against DPP. Continue through court and prison contracts. Publish capability claims only for the exact flows demonstrated and recorded with screenshots, package identifiers, institution references, audit results and failure recovery evidence.
