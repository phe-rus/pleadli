import { api } from '@/lib/api'
import { facilityProfileSchema, saveFacilityProfileSchema, type SaveFacilityProfileInput } from './schema'

export async function getFacilityProfile() {
  return facilityProfileSchema.parse(await api('GET', '/api/prisons/facility'))
}

export async function saveFacilityProfile(input: SaveFacilityProfileInput) {
  const parsed = saveFacilityProfileSchema.parse(input)
  const body = {
    name: parsed.name.trim(),
    facilityNumber: parsed.facilityNumber.trim() || null,
    location: parsed.location.trim() || null,
    region: parsed.region.trim() || null,
    approvedCapacity: parsed.approvedCapacity ? Number(parsed.approvedCapacity) : null,
    ...(parsed.language ? { language: parsed.language } : {}),
  }
  return facilityProfileSchema.parse(await api('PUT', '/api/prisons/facility', { body }))
}
