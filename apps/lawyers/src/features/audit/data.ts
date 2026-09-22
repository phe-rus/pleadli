import { api } from '@/lib/api'
import * as z from 'zod'
import { auditEntrySchema, verificationSchema } from './schema'

export async function getAudit(matterId?: string, limit = 50) {
  return z.array(auditEntrySchema).parse(await api('GET', '/api/audit', { query: { matterId, limit } }))
}

export async function verifyAudit() {
  return verificationSchema.parse(await api('GET', '/api/audit/verify'))
}
