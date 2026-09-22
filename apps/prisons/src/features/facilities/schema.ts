import { ugRegions } from '@/features/jurisdiction'
import * as z from 'zod'
import { m } from '@/paraglide/messages'

/** Uganda Prisons Service's real 19 region structure (docs/prisons/
 * RESEARCH.md §1), matching the `CHECK` constraint on the `facilities`
 * table exactly. */
export const facilityRegions = ugRegions

export const facilityStatuses = ['pending_verification', 'active', 'revoked'] as const

export function facilityStatusLabel(status: string) {
  switch (status) {
    case 'pending_verification':
      return m.facilities_pending_verification()
    case 'active':
      return m.facilities_active()
    case 'revoked':
      return m.facilities_revoked()
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
  verificationExpiresAt: z.number().nullable(),
  lastSyncedAt: z.number().nullable(),
  createdAt: z.number(),
  connectedBy: z.string().nullable(),
  officerCount: z.number(),
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
export const connectionStates = ['none', 'pending', 'connected', 'rejected', 'revoked'] as const

export const peerSyncConfigSchema = z.object({
  hqHostname: z.string().nullable(),
  facilityId: z.string().nullable(),
  lastSyncedAt: z.number().nullable(),
  lastSyncStatus: z.string().nullable(),
  lastError: z.string().nullable(),
  connectionState: z.enum(connectionStates),
  requestedByBadge: z.string().nullable(),
  requestedByName: z.string().nullable(),
  facilityDisplayName: z.string().nullable(),
  rosterPushedAt: z.number().nullable(),
  rosterCount: z.number().nullable(),
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
  if (sharp <= 0 || sharp === pairingCode.length - 1) throw new Error(m.facilities_that_does_not_look_like_a_2())
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
      return m.facilities_waiting_for_head_office_verification()
    case 'rejected':
      return m.facilities_rejected_by_head_office()
    case 'error':
      return m.facilities_sync_failed()
    default:
      return m.facilities_never_synced()
  }
}


/** What Head Office tells a facility about a number it looked up. */
export const facilityLookupSchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string(),
  region: z.string(),
  status: z.enum(facilityStatuses),
})

export type FacilityLookup = z.infer<typeof facilityLookupSchema>

export const connectResultSchema = z.object({
  state: z.enum(['connected', 'pending']),
  facilityId: z.string(),
  facilityName: z.string(),
})

export type ConnectResult = z.infer<typeof connectResultSchema>

export type ConnectFacilityInput = {
  hqAddress: string
  facilityNumber: string
  requesterBadge: string
  requesterName: string
  activationCode?: string
  /** The certificate fingerprint a person confirmed, for a local-network address. */
  hqFingerprint?: string
}

/** Who answered at an address, and the certificate it presented. */
export const hqIdentitySchema = z.object({ address: z.string(), name: z.string(), fingerprint: z.string().nullable() })
export type HqIdentity = z.infer<typeof hqIdentitySchema>

/** A Head Office that answered a search of the local network. A suggestion only. */
export const discoveredHqSchema = z.object({ address: z.string(), name: z.string() })
export type DiscoveredHq = z.infer<typeof discoveredHqSchema>

/** Where a connect call goes: before any account exists it is an onboarding
 * route, afterwards a permission-checked network route. */
export type ConnectScope = 'onboarding' | 'network'

export const connectionRequestSchema = z.object({
  id: z.string(),
  facilityId: z.string(),
  facilityName: z.string(),
  facilityNumber: z.string(),
  requestedByBadge: z.string(),
  requestedByName: z.string(),
  requestedFrom: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'superseded']),
  replacesExisting: z.boolean(),
  decidedByBadge: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.number().nullable(),
  createdAt: z.number(),
})

export type ConnectionRequest = z.infer<typeof connectionRequestSchema>

export const facilityOfficerSchema = z.object({
  facilityId: z.string(),
  facilityName: z.string(),
  badgeNumber: z.string(),
  name: z.string(),
  role: z.string(),
  isAdmin: z.boolean(),
  active: z.boolean(),
  syncedAt: z.number(),
})

export type FacilityOfficer = z.infer<typeof facilityOfficerSchema>

export const hqNetworkStatusSchema = z.object({
  local: z.object({ listening: z.boolean(), address: z.string() }),
  lan: z.object({
    enabled: z.boolean(),
    listening: z.boolean(),
    discoverable: z.boolean(),
    addresses: z.array(z.string()),
    fingerprint: z.string().nullable(),
  }),
  cloudflare: z.object({
    configured: z.boolean(),
    tunnelProvisioned: z.boolean(),
    hostname: z.string().nullable(),
    connector: z.enum(['running', 'stopped', 'missing']),
    state: z.enum(['not_configured', 'configured_not_connected', 'connected']),
  }),
  publicBase: z.string(),
  pendingRequests: z.number(),
})

export type HqNetworkStatus = z.infer<typeof hqNetworkStatusSchema>

export const exchangeViews = ['not_active', 'never', 'current', 'stale', 'silent', 'stalled'] as const

export const facilityExchangeSchema = z.object({
  facilityId: z.string(),
  name: z.string(),
  facilityNumber: z.string(),
  region: z.string(),
  standing: z.string(),
  view: z.enum(exchangeViews),
  lastContactAt: z.number().nullable(),
  lastSuccessAt: z.number().nullable(),
  lastVia: z.string().nullable(),
  reportedState: z.string().nullable(),
  reportedPending: z.number().nullable(),
  reportedLastError: z.string().nullable(),
  refusedLastDay: z.number(),
})

export const exchangeEventSchema = z.object({
  id: z.string(),
  facilityId: z.string(),
  facilityName: z.string(),
  at: z.number(),
  kind: z.string(),
  result: z.string(),
  detail: z.string().nullable(),
  via: z.string(),
})

export const exchangeOverviewSchema = z.object({
  facilities: z.array(facilityExchangeSchema),
  events: z.array(exchangeEventSchema),
})

export type ExchangeOverview = z.infer<typeof exchangeOverviewSchema>

export const reachabilitySchema = z.object({ reachable: z.boolean(), checkedAt: z.number() })

export const createFacilityInputSchema = registerFacilityInputSchema
