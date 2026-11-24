# Pleadli records API: institution-controlled lookup

Written 2026-11-22. **Status: built and tested in `www` (22 tests across 7 files pass, `tsc` clean). NOT deployed, no migration applied to any remote database, no institution app calls it yet.** The dashboard WAF rule is not configured (see `PUBLIC-AND-FIELD-API.md`, "Limits").

## The principle

Pleadli Lookup is not a public website of cases. It is a records API in which **the institution that created a record owns it and decides who sees which field**. Pleadli's job is discovery, enforcing that decision, delivery, verification and an audit trail. Nothing is public because Pleadli says so, and a record is seen only to the extent the institution and the applicable law allow. The two anonymous lookups (`/api/public/v1/verify`, `/track`) stay exactly as they were: they answer only "is this paper genuine" and "which stage is this case at", from what an institution chose to send.

## Five audiences

| Audience | How a caller becomes one | Default |
|---|---|---|
| `public` | Anyone with a credential, or anonymous at `/verify` and `/track` | Sees only fields the institution marked `public`. If none, the record does not exist for them |
| `application` | A **grant** from the issuing institution to that credential | Nothing extra without the grant. Registering an application grants nothing |
| `lawyer` | A grant that names **who verified** the lawyer (required) and when, with an expiry | A credential that calls itself `lawyer` is a label, not a permission |
| `party` | A grant tied to **one record** and a named verifier, with an expiry | Never a type of record, only that matter |
| `institution` | A grant from one institution to another institution's credential | Also the only audience that can read a `sealed` record |

**Audiences are not a ladder.** A party is not "above" a lawyer. Each field lists the exact audiences it is for; a caller sees it only if one of the levels granted to them *for that record* is listed (`public` means anyone). A grant from institution A never reaches institution B's records.

## What an institution controls

1. **Which records**: only what an app sends with `records/publish` exists in the cloud. Unpublished investigations, evidence and personal information are not there unless an officer chose to project them.
2. **Which fields**: every field sent must carry an audience (or a list). A field without one is refused (`422 policy_incomplete`), so nothing is disclosed by omission.
3. **Status**: `published`, `withdrawn`, `corrected`, `superseded` (names the replacing reference) or `sealed`. Sealing hides the record from everyone but the institution, at once.
4. **Who gets in**: credentials, grants (30 days by default, 180 at most) and revocation. A revoked or expired grant or credential stops working on the next call.
5. **Who looked**: `records/access` returns the institution's audit (below).

## How a reference is resolved

A CRB number, court file number or DPP file number is **not globally unique**. A record is found by **issuing institution + jurisdiction + reference kind + reference** (and optionally record type). `jurisdiction`, `kind` and `reference` are all required: a number alone is refused with `400`. If two institutions in the same country used the same number, both are returned, each labelled with its institution, never merged; pass `institution=<address>` to name one. References are normalised so `CRB 123/2026`, `crb-123-2026` and `CRB.123.2026` are the same.

## Calling it (callers)

```
GET https://pleadli.com/api/records/v1/records?jurisdiction=UG&kind=crb&reference=CRB%20123/2026
Authorization: Bearer plr_...
```

```jsonc
{
  "count": 1,
  "results": [{
    "institution": "Gulu Central Police Station",
    "jurisdiction": "UG", "recordType": "criminal_case", "referenceKind": "crb", "reference": "CRB 123/2026",
    "status": "published",            // published | withdrawn | corrected | superseded | sealed
    "statusNote": null, "supersededByReference": null,
    "audience": "lawyer", "audiences": ["public", "lawyer"],
    "fields": { "stage": "Charged", "station": "Desk 7 CID", "offence": "Theft" },   // only what YOU may see
    "freshness": { "sourceUpdatedAt": 1795300330556, "projectedAt": 1795303930611, "ageHours": 1, "stale": false },
    "authority": "institution_projection"
  }]
}
```

- **Fields you may not see are not in the response.** There is no "hidden" flag for a client to honour.
- **Empty `results` (HTTP 200) means "nothing you may see".** It is identical for an unknown reference, an unpublished record, a sealed record and a record you have no grant for, so a caller cannot learn that a protected record exists.
- **Freshness.** `sourceUpdatedAt` is when the institution last changed it at its own end; `stale: true` after seven days. A `withdrawn`, `corrected` or `superseded` record is returned with that status (and the replacing reference) so no one acts on it unaware.
- **Errors**: `401 {"error":"unauthorized"}` (missing, unknown, revoked and expired credentials are indistinguishable), `400 invalid`, `405`, `429 {"error":"too_many_requests","retryAfter":N}` with `Retry-After`.
- A typed contract and a client are in `docs/platform/examples/records-client.ts` (`PleadliRecords`, `DisclosedRecord`, `RecordsError`, `describeCase`).

### Order of checks (so refusals teach nothing)

1. Credential verified. Failures are limited **by connecting address**, so guessing credentials is slow and cannot spend a real application's quota.
2. Quota charged to the **verified** credential and its institution (120/user, 600/credential, 3,000/institution per minute; Durable Object counter, see `PUBLIC-AND-FIELD-API.md`). Quota buckets are never named by anything the caller sends.
3. Query shape checked (400) before any record is read.
4. Record resolved, audience computed from grants, fields filtered **on the server**.
5. Access written to the audit. If the audit cannot be written, nothing is returned.

## Institution side (through a licensed computer, `/api/orchestra/v1/`)

| Call | What it does |
|---|---|
| `records/publish` | Project a record: key (`jurisdiction`, `recordType`, `referenceKind`, `reference`), `fields`, `fieldPolicy` (field to audience or list), `status`, `sourceUpdatedAt`. Re-publishing the same key is a new version, not a second record |
| `records/status` | Withdraw, correct, supersede (needs `supersededByReference` of the same institution) or seal |
| `records/credentials` | Register a credential (`application`, `lawyer` or `institution` label), 1 to 365 days. The secret is shown **once**; only its hash is kept. Grants nothing |
| `records/credentials/revoke` | Revoke one of the institution's own credentials |
| `records/grants` | Grant a credential `application`, `lawyer`, `party` or `institution` access to this institution's records, optionally limited to one `recordType` or one `record`. `lawyer` and `party` need `verifiedBy`; `party` needs `record` |
| `records/grants/revoke` | Revoke a grant this institution made (not another's) |
| `records/access` | The institution's audit: time, credential, outcome, audience, a hash of the reference, a count of fields. **Never a field value or the reference itself** |

## Offline offices

An office with no connectivity has nothing in the cloud unless it projected something earlier. That is by design:

- **Cloud projection (built)**: an office may project the fields it chooses; the projection says how old it is (`freshness`) and is never presented as authoritative.
- **Private information that needs the institution's approval (NOT built)**: the design is a Postbox request-response: the caller's request is sealed to the office's Postbox, an authorised officer approves or declines in the app, and any reply travels sealed back, never stored in clear on pleadli.com. The cloud API returns no field that policy reserves for approval. No `records_request` message kind exists in the apps or the relay permission table yet. Do not describe it as available.

## What public verification does and does not say

`/verify` establishes that an institution issued a paper through its licensed Pleadli app, whether it was later withdrawn or replaced, and (when the visitor drops the PDF) that the file is byte-for-byte the one issued. It does **not** say the paper is legally valid, that a procedure was followed, or that a court or registry holds it. The page says so. A record is an official record of the Judiciary or any other body only when that body issues it and says so.

## Integration with the apps and Extensions

The permission model is one model for all five apps and for future extensions: **an app or extension never reads another institution's records directly; it calls this API with a credential that institution granted.** An extension that wants records declares the capability, and the user (or institution) supplies a credential; the extension cannot widen it. None of the five apps calls the API yet, and no app yet has a "publish to Lookup" action: the first step is a deliberate per-record, per-field "Publish" screen, which is **not built**. Apps must never publish by default.

## Verified and not verified

Tests (`www/tests/records.test.ts`, 84 assertions, `quota.test.ts`, `public-lookup.test.ts`): unauthorized and guessed credentials; a label or registration granting nothing; unverified lawyer and party grants refused; party tied to one record; cross-institution grant isolation; same reference at two institutions and in two countries; revoked and expired grants and credentials; sealed, unknown and unauthorised answers identical; withdrawn, corrected, superseded and stale; bulk guessing stopped at the quota with an identical answer for real and unreal references; credential guessing limited by address; audit holds hashes and counts only and is visible only to the issuer.

**Not verified:** anything on the deployed Worker; real Durable Object atomicity (tests use a fake namespace with the same counting rule); any app calling the API; a real institution's data; legal sufficiency of any field policy.

## Open decisions (owner / institution, not code)

- **R1.** How a third-party developer or a lawyer without a licensed computer registers a credential. Today only a licensed institution computer can. A Pleadli Account screen for organisation administrators is the likely answer.
- **R2.** Which person at an institution may publish, issue credentials and grant access. Today any licensed computer of the institution can; every call is bounded (expiry, audit) but not role-checked.
- **R3.** Who verifies a lawyer or a party and how that verification is evidenced (Law Society roll check, ID check at the station). The API records *who vouched*; it does not check.
- **R4.** Which fields each institution may lawfully project, per country. This needs each institution's legal review; none is assumed.
- **R5.** Retention of the access audit and of withdrawn projections.
