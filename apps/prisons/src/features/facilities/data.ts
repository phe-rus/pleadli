import * as z from 'zod'
import { api } from '@/lib/api'
import {
  connectResultSchema,
  connectionRequestSchema,
  facilityLookupSchema,
  facilityOfficerSchema,
  facilitySchema,
  hqNetworkStatusSchema,
  reachabilitySchema,
  pairingPayloadSchema,
  peerSyncConfigSchema,
  registerFacilityInputSchema,
  syncRunResultSchema,
  type ConnectFacilityInput,
  type ConnectScope,
  type RegisterFacilityInput,
} from './schema'

/** Head Office: every facility paired with it (`hq.estate.read`). */
export async function listFacilities() {
  return z.array(facilitySchema).parse(await api('GET', '/api/hq/facilities'))
}

/** This installation's own connection to Head Office. */
export async function getPeerSyncConfig() {
  return peerSyncConfigSchema.parse(await api('GET', '/api/system/network/peer'))
}

export async function verifyFacility(facilityId: string, code: string) {
  return facilitySchema.parse(await api('POST', `/api/hq/facilities/${encodeURIComponent(facilityId)}/verify`, { body: { code } }))
}

/** Returns a pairing code containing Head Office's own hostname. */
export async function generatePairingCode(officerEmail: string) {
  return pairingPayloadSchema.parse(await api('POST', '/api/hq/facilities/pairing-code', { body: { officerEmail } }))
}

export async function resendVerificationCode(facilityId: string) {
  return facilitySchema.parse(await api('POST', `/api/hq/facilities/${encodeURIComponent(facilityId)}/resend-code`))
}

export async function revokeFacility(facilityId: string) {
  return facilitySchema.parse(await api('POST', `/api/hq/facilities/${encodeURIComponent(facilityId)}/revoke`))
}

/** First-launch pairing. The node, not the webview, makes the outbound call
 * to Head Office and stores the credentials it issues. */
export async function pairWithHeadOffice(pairingCode: string, input: RegisterFacilityInput) {
  const details = registerFacilityInputSchema.parse(input)
  await api('POST', '/api/system/onboarding/pair', { body: { pairingCode, ...details } })
}

/** Pairing after first launch, for a facility that started on its own. */
export async function pairWithHeadOfficeLater(pairingCode: string, input: RegisterFacilityInput) {
  const details = registerFacilityInputSchema.parse(input)
  await api('POST', '/api/system/network/pair', { body: { pairingCode, ...details } })
}

export async function syncNow() {
  return syncRunResultSchema.parse(await api('POST', '/api/system/network/sync-now'))
}

/** Head Office adds a facility to its roster ahead of the facility connecting. */
export async function createFacility(input: RegisterFacilityInput) {
  return facilitySchema.parse(await api('POST', '/api/hq/facilities', { body: registerFacilityInputSchema.parse(input) }))
}

export async function listConnectionRequests() {
  return z.array(connectionRequestSchema).parse(await api('GET', '/api/hq/connection-requests'))
}

export async function decideConnectionRequest(id: string, decision: 'approve' | 'reject') {
  return connectionRequestSchema.parse(await api('POST', `/api/hq/connection-requests/${encodeURIComponent(id)}/${decision}`))
}

export async function listFacilityOfficers() {
  return z.array(facilityOfficerSchema).parse(await api('GET', '/api/hq/facility-officers'))
}

export async function getHqNetworkStatus() {
  return hqNetworkStatusSchema.parse(await api('GET', '/api/hq/network/status'))
}

/** The node looks the facility up on Head Office; the webview never calls it. */
export async function lookupFacility(scope: ConnectScope, hqAddress: string, facilityNumber: string) {
  const path = scope === 'onboarding' ? '/api/system/onboarding/facility-lookup' : '/api/system/network/facility-lookup'
  return facilityLookupSchema.nullable().parse(await api('POST', path, { body: { hqAddress, facilityNumber } }))
}

export async function connectFacility(scope: ConnectScope, input: ConnectFacilityInput) {
  const path = scope === 'onboarding' ? '/api/system/onboarding/connect-facility' : '/api/system/network/connect-facility'
  return connectResultSchema.parse(await api('POST', path, { body: input }))
}

export async function refreshConnection(scope: ConnectScope) {
  const path = scope === 'onboarding' ? '/api/system/onboarding/connection/refresh' : '/api/system/network/connection/refresh'
  return peerSyncConfigSchema.parse(await api('POST', path))
}

export async function cancelConnection(scope: ConnectScope) {
  const path = scope === 'onboarding' ? '/api/system/onboarding/connection/cancel' : '/api/system/network/connection/cancel'
  await api('POST', path)
}

export async function getReachability() {
  return reachabilitySchema.parse(await api('GET', '/api/system/network/reachability'))
}
