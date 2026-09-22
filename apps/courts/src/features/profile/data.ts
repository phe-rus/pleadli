import { api } from '@/lib/api'
import { benchProfileSchema, type SaveProfileInput } from './schema'

export async function getProfile() {
  return benchProfileSchema.nullable().parse(await api('GET', '/api/profile'))
}

export async function saveProfile(input: SaveProfileInput) {
  return benchProfileSchema.parse(await api('PUT', '/api/profile', { body: input }))
}
