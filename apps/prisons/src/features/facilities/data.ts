import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { facilitySchema, peerSyncConfigSchema, registerFacilityInputSchema, type RegisterFacilityInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text().catch(() => response.statusText))
  return response.status === 204 ? null : response.json()
}

/** Requires an active HQ session, checked server side (spec: docs/specs/
 * prisons/0001-head-office-peer-sync-network/index.md's cross child
 * contract); throws a plain error if none exists, since read only pages
 * don't need a coded error class the way officer/activation calls do. */
export async function listFacilities() {
  const facilities = isTauri() ? await invoke('list_facilities') : await devFetch('/facilities')
  return z.array(facilitySchema).parse(facilities)
}

/** No session required, same trust level as `get_hq_config` — this is a
 * peer's own local status, not a Head Office record. */
export async function getPeerSyncConfig() {
  const config = isTauri() ? await invoke('get_peer_sync_config') : await devFetch('/peer-sync-config')
  return peerSyncConfigSchema.parse(config)
}

/** No session required: the facility's own first-launch onboarding step,
 * before any pairing or officer session exists yet. */
export async function registerFacilitySelf(input: RegisterFacilityInput) {
  const parsed = registerFacilityInputSchema.parse(input)
  const facility = isTauri()
    ? await invoke('register_facility_self', { input: parsed })
    : await devFetch('/facilities/register', { method: 'POST', body: JSON.stringify(parsed) })
  return facilitySchema.parse(facility)
}

/** No session required, same as `getPeerSyncConfig` — a facility's own
 * read of its own registration/verification status. */
export async function getOwnFacility() {
  const facility = isTauri() ? await invoke('get_own_facility') : await devFetch('/facilities/own')
  return facilitySchema.nullable().parse(facility)
}

export async function verifyFacility(facilityId: string, code: string) {
  const facility = isTauri()
    ? await invoke('verify_facility', { facilityId, code })
    : await devFetch(`/facilities/${encodeURIComponent(facilityId)}/verify`, { method: 'POST', body: JSON.stringify({ code }) })
  return facilitySchema.parse(facility)
}
