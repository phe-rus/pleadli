import { api } from '@/lib/api'
import { advocateProfileSchema, type SaveProfileInput } from './schema'

export async function getProfile() {
  return advocateProfileSchema.nullable().parse(await api('GET', '/api/profile'))
}

export async function saveProfile(input: SaveProfileInput) {
  return advocateProfileSchema.parse(await api('PUT', '/api/profile', { body: input }))
}
