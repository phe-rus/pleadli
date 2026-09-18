# Sync protocol and Head Office management

## Summary

Once a facility is active, this is the part that actually moves data. Whenever a facility's installation has internet, it sends its entire current list of prisoners to Head Office, which genuinely replaces whatever it had for that facility with the new snapshot, upserting what is still there and deleting what is not, in one transaction. There is no partial update logic and no conflict resolution to get wrong, since a facility always sends everything it currently has and Head Office always trusts whichever facility a token belongs to for that facility's own rows only. Head Office's own screens (a roster of every facility, national population stats, and search across all of them) are the same Prisons screens that already exist, just grouped by facility once data starts arriving.

## Requirements

**User stories**:
- As a facility officer, I want my prisoner records to reach Head Office automatically whenever I have internet, so that this is never a manual chore I have to remember.
- As a Head Office officer, I want to see every facility, whether it last synced, and a national population picture, so that I can actually oversee the estate instead of guessing.
- As a Head Office officer, I want to search for a prisoner across every facility, so that a transfer or an inquiry does not require calling around.

**Acceptance criteria**:
- **AC-1**: An active facility's first successful sync after pairing sends its entire existing Prisoner roster, not only prisoners admitted afterward, and Head Office ends up with exactly that set, no more, no fewer.
- **AC-2**: A facility syncs automatically on a background interval whenever it has internet, and an officer can also trigger a sync manually and see when it last succeeded.
- **AC-3**: Head Office's copy of a prisoner is always attributed to exactly the facility whose credential pushed it, regardless of anything the request body itself claims, and a prisoner deleted at a facility is removed from Head Office's copy on that facility's next successful sync, not kept forever.
- **AC-4**: Head Office's Facility roster screen shows every facility, its status, and its last synced time; its Reports screen shows aggregate population and occupancy stats broken down by facility; its Search reaches every synced prisoner across every facility. Every one of these three screens only ever considers rows with a non null `facility_id`.
- **AC-5**: A facility installation that is not Head Office never shows any of the Head Office specific screens in AC-4, and its own local Prisoner data is entirely unaffected by anything this spec adds (no `facility_id` ever gets set on a peer's own rows). A Head Office installation has no "admit a prisoner" action of its own at all, since every prisoner it ever holds must come from a synced facility, per the umbrella's decision.

## Decision

**Chosen option**: a single idempotent upsert endpoint that takes a facility's full current Prisoner list every time, with the receiving `facility_id` always resolved from the caller's sync token, never from the payload; Head Office's own screens reuse the existing Prisoner, Reports, and Search code, filtered and grouped by the new `facility_id` column rather than built as separate Head Office only views.

## Feature design

**Data model sketch**:
- `prisoners` (existing table, `apps/prisons/src-tauri/src/domain/prisoners.rs`): add one nullable column, `facility_id TEXT NULL REFERENCES facilities(id)`. Stays `NULL` forever on a facility's own local rows (a facility's own data has no need to name itself); is set, always server side, on every row Head Office receives through sync. This is why the same schema and the same domain code serve both roles unchanged. The existing `Prisoner` struct in `prisoners.rs` currently derives `Serialize + FromRow` only; add `Deserialize` to it, since this endpoint must decode a JSON array of it, which was a real gap in the original draft (the endpoint as first written could not have compiled).
- No new table for the sync payload itself; it is the existing `Prisoner` shape, sent as a JSON array, capped by `hq_server.rs`'s body size limit (see Key invariants).

**State transitions**: none beyond what `facilities.last_synced_at` already tracks (child 2), plus the `pending_verification` → `active` transition (child 2) that this endpoint's own behaviour depends on.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/sync/prisoners` (`hq_server.rs`, fixed port `47923`) | POST | JSON array of the facility's current `Prisoner` rows | `{ syncedCount, lastSyncedAt }` on success; `{ status: "pending_verification" }` (HTTP 200, not a failure) if the token is valid but the facility is not yet active | bearer sync token | 401 `{"error": "invalid"}` (wrong or revoked token; a revoked facility looks identical to an unknown one, but NOT identical to a merely pending one, since pending is not a security failure, see the umbrella's uniform failure contract) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `/sync/prisoners` | which `facility_id` gets stamped on every upserted row | resolved server side from `facilities.sync_token_hash` matching the bearer token, never from the request body |
| Facility roster screen | "last synced" per row | `facilities.last_synced_at`, updated on every successful `/sync/prisoners` call |
| Reports, per facility population breakdown | facility name shown next to a count | joined from `facilities.name` by `facility_id` |
| Head Office Search | which facilities are searched | every row in `prisoners` with `facility_id IS NOT NULL`; a revoked facility's already synced rows still appear (matches the "no data destruction on revoke" invariant from child 2), only new syncs from it are refused |
| Peer's sync status indicator | "last synced: 3 hours ago" | `peer_sync_config.last_synced_at` (the singleton table child 2 adds), updated locally by the peer immediately after a successful sync response |

**Key invariants**:
- **A sync is a real snapshot, not an append only upsert.** Inside one write transaction: upsert every row in the payload (by `prisoners.id`, a globally unique UUID already generated locally at admission time, so two different facilities' prisoners can never collide even without namespacing the id itself), stamping `facility_id` from the token's own resolved facility on every row, then `DELETE FROM prisoners WHERE facility_id = ? AND id NOT IN (<the payload's ids>)`, scoped to that one facility only. This is what makes AC-1 and AC-3's "deleted at a facility, gone from Head Office" actually true; an upsert alone, as first drafted, could only ever add rows, never remove them. SQLite's single writer transaction model already prevents two concurrent syncs, even for different facilities, from interleaving into a bad delete; no extra application level lock is needed.
- The endpoint does not read a `facilityId` field from the payload at all, so there is nothing for a malicious or buggy client to override; `facility_id` is set only from the authenticated token's own resolved facility.
- A facility's own local `prisoners` rows never have `facility_id` set locally; only Head Office's copies do. This means the exact same `list_prisoners` and `search` functions already in `apps/prisons/src-tauri/src/domain/` keep working unchanged for a facility installation. The Head Office specific views (roster, Reports breakdown, Search) each add an explicit `WHERE facility_id IS NOT NULL` (or an inner join to `facilities`) rather than relying on it happening to be true; this closes a real gap where a stray local row on a Head Office install (there should never be one, since AC-5 removes the "admit a prisoner" action there, but the query should not depend on that alone) could otherwise silently vanish from or corrupt an aggregate count.
- `hq_server.rs` sets an explicit request body size limit (`50MB`, comfortably above a realistic facility's roster in JSON) rather than axum's much smaller default, since the payload is a full array, not a single record; and a per IP rate limit (`10 requests/minute` on both of its routes) to make credential guessing impractical. If a facility's roster ever grows large enough to threaten that limit, chunk the request instead of raising the limit further, see the umbrella's Follow up; v1 does not chunk.

**Security model**: unchanged from child 2's contract, an active sync token proves exactly one thing, "push this facility's own snapshot," and nothing else; it cannot read data back, and a Head Office officer's own credentials (not this token) gate every Head Office screen and every prisoner admission action.

**Configuration required**: none new; reuses child 2's Cloudflare Tunnel and `hq_server.rs`.

**Critical test scenarios**:
- Happy path: a freshly paired facility with 40 existing prisoners performs its first sync and Head Office ends up with all 40, each attributed to that facility, verifies **AC-1**, **AC-3**.
- Failure case: a facility releases and later deletes a prisoner locally, then syncs again; that prisoner is removed from Head Office's copy on that sync, not left behind, verifies **AC-3**. Separately, two different facilities both admit a prisoner while offline, then both sync; both prisoners land at Head Office attributed to their own correct facility with no collision.
- Auth/permission: a facility's own installation never renders the Facility roster, national Reports breakdown, cross facility Search, or an "admit a prisoner" action, only the Head Office installation shows the first three and only a facility installation shows the last, verifies **AC-5**.
