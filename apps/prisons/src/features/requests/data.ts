import * as z from 'zod'
import { api } from '@/lib/api'
import {
  createRequestSchema,
  requestSchema,
  resolveRequestSchema,
  type CreateRequestInput,
  type ResolveRequestInput,
} from './schema'

export async function createRequest(input: CreateRequestInput) {
  const body = createRequestSchema.parse(input)
  return requestSchema.parse(await api('POST', '/api/prisons/requests', { body }))
}

export async function resolveRequest(id: string, input: ResolveRequestInput) {
  const parsed = resolveRequestSchema.parse(input)
  const body = { ...parsed, outcomeNote: parsed.outcomeNote || null }
  return requestSchema.parse(await api('PUT', `/api/prisons/requests/${encodeURIComponent(id)}/resolve`, { body }))
}

export async function listRequests() {
  return z.array(requestSchema).parse(await api('GET', '/api/prisons/requests'))
}

export async function listRequestsForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/requests`)
  return z.array(requestSchema).parse(rows)
}
