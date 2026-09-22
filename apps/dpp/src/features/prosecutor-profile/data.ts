import { api } from '@/lib/api'
import { prosecutorProfileSchema, saveProsecutorProfileSchema, type SaveProsecutorProfileInput } from './schema'

export async function getProsecutorProfile() {
  return prosecutorProfileSchema.nullable().parse(await api('GET', '/api/prosecutor-profile'))
}

export async function saveProsecutorProfile(input: SaveProsecutorProfileInput) {
  const body = saveProsecutorProfileSchema.parse(input)
  return prosecutorProfileSchema.parse(await api('PUT', '/api/prosecutor-profile', { body }))
}
