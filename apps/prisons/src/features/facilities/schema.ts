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
