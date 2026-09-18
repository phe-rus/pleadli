import * as z from 'zod'
import { api } from '@/lib/api'
import {
  courtOutcomeResultSchema,
  courtProductionSchema,
  createCourtProductionSchema,
  recordCourtOutcomeSchema,
  remandListEntrySchema,
  type CreateCourtProductionInput,
  type RecordCourtOutcomeInput,
} from './schema'

export async function createCourtProduction(input: CreateCourtProductionInput) {
  const parsed = createCourtProductionSchema.parse(input)
  const body = { ...parsed, courtReference: parsed.courtReference || null, purpose: parsed.purpose || null }
  return courtProductionSchema.parse(await api('POST', '/api/prisons/court-productions', { body }))
}

export async function listCourtProductionsForPrisoner(prisonerId: string) {
  const productions = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/court-productions`)
  return z.array(courtProductionSchema).parse(productions)
}

export async function listRemand() {
  return z.array(remandListEntrySchema).parse(await api('GET', '/api/prisons/remand'))
}

export async function recordCourtOutcome(input: RecordCourtOutcomeInput) {
  const { productionId, ...rest } = recordCourtOutcomeSchema.parse(input)
  const body = { ...rest, notes: rest.notes || null }
  return courtOutcomeResultSchema.parse(
    await api('PUT', `/api/prisons/court-productions/${encodeURIComponent(productionId)}/outcome`, { body }),
  )
}

export async function cancelCourtProduction(productionId: string, reason: string) {
  return courtProductionSchema.parse(
    await api('POST', `/api/prisons/court-productions/${encodeURIComponent(productionId)}/cancel`, { body: { reason } }),
  )
}
