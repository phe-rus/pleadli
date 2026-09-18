import * as z from 'zod'

/** Uganda Prisons Service's real 19 region structure (docs/prisons/
 * RESEARCH.md §1), matching the `CHECK` constraint on the `facilities`
 * table exactly. */
export const facilityRegions = [
  'Southern',
  'Northern',
  'Kigezi',
  'Mid Central',
  'Central',
  'Kampala Extra',
  'Eastern',
  'North Central',
  'Mid Western',
  'Mid Northern',
  'Mid Eastern',
  'South Western',
  'East Central',
  'North Eastern',
  'Iganga',
  'Western',
  'North Western',
  'Kooki',
  'South Eastern',
] as const

export const facilityStatuses = ['pending_verification', 'active', 'revoked'] as const

export function facilityStatusLabel(status: string) {
  switch (status) {
    case 'pending_verification':
      return 'Pending verification'
    case 'active':
      return 'Active'
    case 'revoked':
      return 'Revoked'
    default:
      return status
  }
}

export const facilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  facilityNumber: z.string(),
  location: z.string(),
  region: z.string(),
  headOfficerName: z.string(),
  status: z.enum(facilityStatuses),
  verifyingOfficerEmail: z.string(),
  /** Manual, no-email-yet stand-in — see `domain/facilities.rs`'s own doc
   * comment. Only ever set while `status === 'pending_verification'`. */
  verificationCodePlaintext: z.string().nullable(),
  lastSyncedAt: z.number().nullable(),
  createdAt: z.number(),
})

export type Facility = z.infer<typeof facilitySchema>

export const registerFacilityInputSchema = z.object({
  name: z.string().min(1, 'Facility name is required.'),
  facilityNumber: z.string().min(1, 'Facility ID or number is required.'),
  location: z.string().min(1, 'Location is required.'),
  region: z.enum(facilityRegions),
  headOfficerName: z.string().min(1, "The head officer's name is required."),
})

export type RegisterFacilityInput = z.infer<typeof registerFacilityInputSchema>

/** A peer's own local sync status (`peer_sync_config`), read by Settings'
 * Network & Sync section on a facility installation. Meaningless (all
 * null) on Head Office, which never registers with anyone. */
export const peerSyncConfigSchema = z.object({
  hqHostname: z.string().nullable(),
  facilityId: z.string().nullable(),
  lastSyncedAt: z.number().nullable(),
  lastSyncStatus: z.string().nullable(),
  lastError: z.string().nullable(),
})

export type PeerSyncConfig = z.infer<typeof peerSyncConfigSchema>

/** What `generate_pairing_code` returns on the Head Office side (spec
 * child 2 AC-1): a single `pairingCode` string (`<hostname>#<secret>`)
 * that carries Head Office's own hostname, so the facility officer pastes
 * one thing and never types a hostname, port, or certificate. */
export const pairingPayloadSchema = z.object({
  pairingCode: z.string(),
  hostname: z.string(),
  expiresAt: z.number(),
})

export type PairingPayload = z.infer<typeof pairingPayloadSchema>

/** Splits the one string the facility officer pasted into the hostname it
 * carries and the pairing secret. The secret can contain no `#` (base64url
 * alphabet), so the hostname is everything up to the LAST `#`. The node
 * validates it again; this is only to give an immediate, friendly error and
 * to show which Head Office the code points at. */
export function parsePairingCode(pairingCode: string) {
  const sharp = pairingCode.lastIndexOf('#')
  if (sharp <= 0 || sharp === pairingCode.length - 1) throw new Error('That does not look like a Pleadli pairing code.')
  return { hostname: pairingCode.slice(0, sharp), secret: pairingCode.slice(sharp + 1) }
}

/** The full acknowledgement from a `/sync/prisoners` push attempt (child 3
 * AC-1/AC-4): the facility's own status after a `sync_now`, plus how many
 * rows Head Office confirmed. Networks surface the same values the app
 * reads for its own status display. */
export const syncRunResultSchema = z.object({
  status: z.string(),
  count: z.number().nullable(),
})

export type SyncRunResult = z.infer<typeof syncRunResultSchema>

/** The outcome statuses a facility's sync can be in, for readability
 * labels — the plain strings are stored (last_sync_status) and match
 * push_snapshot's return values exactly. */
export function syncStatusLabel(status: string | null) {
  switch (status) {
    case 'ok':
      return 'In sync'
    case 'pending_verification':
      return 'Waiting for Head Office verification'
    case 'rejected':
      return 'Rejected by Head Office'
    case 'error':
      return 'Sync failed'
    default:
      return 'Never synced'
  }
}
