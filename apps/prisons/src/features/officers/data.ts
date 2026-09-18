import * as z from 'zod'
import { api } from '@/lib/api'
import { createOfficerSchema, officerSchema, updateOfficerSchema, type CreateOfficerInput, type UpdateOfficerInput } from './schema'

/** Accounts of this installation. Needs the `accounts.manage` permission,
 * checked by the node; no admin password is re-asked. */
export async function listOfficers() {
  return z.array(officerSchema).parse(await api('GET', '/api/auth/accounts'))
}

export async function createOfficer(input: CreateOfficerInput) {
  const body = createOfficerSchema.parse(input)
  return officerSchema.parse(await api('POST', '/api/auth/accounts', { body }))
}

export async function updateOfficer(id: string, input: UpdateOfficerInput) {
  const body = updateOfficerSchema.parse(input)
  return officerSchema.parse(await api('PUT', `/api/auth/accounts/${encodeURIComponent(id)}`, { body }))
}
