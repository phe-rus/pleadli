import { signInResultSchema } from '@/features/session/schema'
import { api, setSessionToken } from '@/lib/api'
import { numberingPreviewSchema, type Draft } from './schema'

/** What a prisoner-number pattern would produce, checked by the node with
 * the same rules that apply once it is saved. */
export async function previewNumbering(input: { pattern: string; reset: string; facilityNumber: string }) {
  return numberingPreviewSchema.parse(
    await api('POST', '/api/system/onboarding/numbering-preview', {
      body: { pattern: input.pattern, reset: input.reset, facilityNumber: input.facilityNumber || null },
    }),
  )
}

/** Saves the whole setup in one step on the node and signs the first
 * administrator in. Nothing is kept if any part is refused. */
export async function setupFacility(draft: Draft, jurisdiction: { id: string; country: string }) {
  const result = signInResultSchema.parse(
    await api('POST', '/api/system/onboarding/facility', {
      body: {
        profile: {
          name: draft.name.trim(),
          facilityNumber: draft.facilityCode.trim(),
          location: draft.location.trim() || null,
          region: draft.region.trim() || null,
          approvedCapacity: null,
          country: jurisdiction.country,
          jurisdiction: jurisdiction.id,
          language: 'en',
          badgePrefix: draft.badgePrefix.trim() || null,
          documentPrefix: (draft.documentPrefix.trim() || draft.facilityCode.trim()) || null,
        },
        numbering: { pattern: draft.numberingPattern.trim(), reset: draft.numberingReset },
        authMode: draft.authMode,
        admin: { badgeNumber: draft.adminBadge.trim(), name: draft.adminName.trim(), password: draft.adminPassword },
      },
    }),
  )
  setSessionToken(result.token)
  return result
}

/** Saves Head Office's identity and first administrator in one step and signs
 * them in. No Pleadli Cloud code is involved. Nothing is kept if any part is
 * refused. */
export async function setupHeadOffice(draft: Draft, jurisdiction: { id: string; country: string }) {
  const result = signInResultSchema.parse(
    await api('POST', '/api/system/onboarding/head-office', {
      body: {
        profile: {
          name: draft.name.trim(),
          facilityNumber: draft.facilityCode.trim(),
          location: draft.location.trim() || null,
          region: null,
          approvedCapacity: null,
          country: jurisdiction.country,
          jurisdiction: jurisdiction.id,
          language: 'en',
          badgePrefix: draft.badgePrefix.trim() || null,
          documentPrefix: (draft.documentPrefix.trim() || draft.facilityCode.trim()) || null,
        },
        admin: { badgeNumber: draft.adminBadge.trim(), name: draft.adminName.trim(), password: draft.adminPassword },
      },
    }),
  )
  setSessionToken(result.token)
  return result
}
