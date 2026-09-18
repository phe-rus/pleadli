import * as z from 'zod'
import { api } from '@/lib/api'
import {
  facilitySchema,
  pairingPayloadSchema,
  peerSyncConfigSchema,
  registerFacilityInputSchema,
  syncRunResultSchema,
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
