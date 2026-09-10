import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createStationEstablishmentMemberSchema,
  saveStationProfileSchema,
  stationEstablishmentMemberSchema,
  stationProfileSchema,
  type CreateStationEstablishmentMemberInput,
  type SaveStationProfileInput,
} from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function getStationProfile() {
  const profile = isTauri()
    ? await invoke('get_station_profile')
    : await devFetch('/station-profile')
  return stationProfileSchema.nullable().parse(profile)
}

export async function saveStationProfile(input: SaveStationProfileInput) {
  const parsed = saveStationProfileSchema.parse(input)
  const profile = isTauri()
    ? await invoke('save_station_profile', { input: parsed })
    : await devFetch('/station-profile', { method: 'PUT', body: JSON.stringify(parsed) })
  return stationProfileSchema.parse(profile)
}

export async function createEstablishmentMember(input: CreateStationEstablishmentMemberInput) {
  const parsed = createStationEstablishmentMemberSchema.parse(input)
  const member = isTauri()
    ? await invoke('create_station_establishment_member', { input: parsed })
    : await devFetch('/station-establishment', { method: 'POST', body: JSON.stringify(parsed) })
  return stationEstablishmentMemberSchema.parse(member)
}

export async function updateEstablishmentMember(id: string, input: CreateStationEstablishmentMemberInput) {
  const parsed = createStationEstablishmentMemberSchema.parse(input)
  const member = isTauri()
    ? await invoke('update_station_establishment_member', { id, input: parsed })
    : await devFetch(`/station-establishment/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return stationEstablishmentMemberSchema.parse(member)
}

export async function listEstablishment(query: string) {
  const members = isTauri()
    ? await invoke('list_station_establishment', { query })
    : await devFetch(`/station-establishment?query=${encodeURIComponent(query)}`)
  return z.array(stationEstablishmentMemberSchema).parse(members)
}
