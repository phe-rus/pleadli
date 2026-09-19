import * as z from 'zod'
import { api } from '@/lib/api'
import { auditRowSchema, createOfficerSchema, officerSchema, updateOfficerSchema, type CreateOfficerInput, type UpdateOfficerInput } from './schema'

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

export async function deleteOfficer(id: string) {
  await api('DELETE', `/api/auth/accounts/${encodeURIComponent(id)}`)
}

/** The 50 most recent audit rows for one officer, or for one badge number
 * (what Head Office recorded about a facility officer). */
export async function listOfficerActivity(filter: { officerId?: string; badge?: string }) {
  return z.array(auditRowSchema).parse(await api('GET', '/api/system/audit', { query: { ...filter, limit: '50' } }))
}
