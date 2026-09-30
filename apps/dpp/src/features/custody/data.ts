import * as z from 'zod'
import { api, seg } from '@/lib/api'

export const custodyEventSchema = z.object({
  id: z.string(),
  prosecutionFileId: z.string(),
  kind: z.enum(['arrest', 'court_production', 'remand', 'remand_both', 'remand_high_court', 'map', 'odp', 'odp_extension', 'bail', 'release', 'trial_start']),
  at: z.number(),
  personName: z.string().nullable(),
  note: z.string().nullable(),
  source: z.enum(['person', 'assist']),
  createdBy: z.string().nullable(),
  createdAt: z.number(),
})
export type CustodyEvent = z.infer<typeof custodyEventSchema>
export type NewCustodyEvent = { prosecutionFileId: string; kind: CustodyEvent['kind']; at: number; personName?: string | null; note?: string | null }

export const listCustody = async (fileId?: string) => z.array(custodyEventSchema).parse(await api('GET', '/api/custody-events', { query: { fileId } }))
export const createCustody = async (e: NewCustodyEvent) => custodyEventSchema.parse(await api('POST', '/api/custody-events', { body: e }))
export const deleteCustody = (id: string) => api('DELETE', `/api/custody-events/${seg(id)}`)
