import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createRequestSchema,
  requestSchema,
  resolveRequestSchema,
  type CreateRequestInput,
  type ResolveRequestInput,
} from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createRequest(input: CreateRequestInput) {
  const parsed = createRequestSchema.parse(input)
  const record = isTauri()
    ? await invoke('create_request', { input: parsed })
    : await devFetch('/requests', { method: 'POST', body: JSON.stringify(parsed) })
  return requestSchema.parse(record)
}

export async function resolveRequest(id: string, input: ResolveRequestInput) {
  const parsed = resolveRequestSchema.parse(input)
  const rustInput = { ...parsed, outcomeNote: parsed.outcomeNote || null }
  const record = isTauri()
    ? await invoke('resolve_request', { id, input: rustInput })
    : await devFetch(`/requests/${encodeURIComponent(id)}/resolve`, { method: 'PUT', body: JSON.stringify(rustInput) })
  return requestSchema.parse(record)
}

export async function listRequests() {
  const records = isTauri() ? await invoke('list_requests') : await devFetch('/requests')
  return z.array(requestSchema).parse(records)
}

export async function listRequestsForPrisoner(prisonerId: string) {
  const records = isTauri()
    ? await invoke('list_requests_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/requests`)
  return z.array(requestSchema).parse(records)
}
