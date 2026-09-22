import { api } from '@/lib/api'
import { saveStationProfileSchema, stationProfileSchema, type SaveStationProfileInput } from './schema'

export async function getStationProfile() {
  const profile = await api('/station-profile')
  return stationProfileSchema.nullable().parse(profile)
}

export async function saveStationProfile(input: SaveStationProfileInput) {
  const parsed = saveStationProfileSchema.parse(input)
  const profile = await api('/station-profile', { method: 'PUT', body: JSON.stringify(parsed) })
  return stationProfileSchema.parse(profile)
}
