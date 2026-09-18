import * as z from 'zod'
import { api } from '@/lib/api'
import { createVisitSchema, visitListItemSchema, visitSchema, type CreateVisitInput } from './schema'

export async function createVisit(input: CreateVisitInput) {
  const parsed = createVisitSchema.parse(input)
  const body = {
    ...parsed,
    visitorIdentification: parsed.visitorIdentification || null,
    supervisingOfficer: parsed.supervisingOfficer || null,
    notes: parsed.notes || null,
    authorizedBy: parsed.authorizedBy || null,
  }
  return visitSchema.parse(await api('POST', '/api/prisons/visits', { body }))
}

export async function listVisitsForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/visits`)
  return z.array(visitSchema).parse(rows)
}

export async function listVisits(query: string) {
  return z.array(visitListItemSchema).parse(await api('GET', '/api/prisons/visits', { query: { query } }))
}
