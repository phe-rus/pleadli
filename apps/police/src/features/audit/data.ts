import { api } from '@/lib/api'
import * as z from 'zod'
import { auditEntrySchema, verificationSchema } from './schema'

export async function getAudit(limit: number) {
  return z.array(auditEntrySchema).parse(await api(`/audit?limit=${limit}`))
}

export async function verifyAudit() {
  return verificationSchema.parse(await api('/audit/verify'))
}
