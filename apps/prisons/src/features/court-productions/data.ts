import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  courtProductionSchema,
  createCourtProductionSchema,
  remandListEntrySchema,
  type CreateCourtProductionInput,
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

export async function createCourtProduction(input: CreateCourtProductionInput) {
  const parsed = createCourtProductionSchema.parse(input)
  const rustInput = { ...parsed, courtReference: parsed.courtReference || null, purpose: parsed.purpose || null }
  const production = isTauri()
    ? await invoke('create_court_production', { input: rustInput })
    : await devFetch('/court-productions', { method: 'POST', body: JSON.stringify(rustInput) })
  return courtProductionSchema.parse(production)
}

export async function listCourtProductionsForPrisoner(prisonerId: string) {
  const productions = isTauri()
    ? await invoke('list_court_productions_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/court-productions`)
  return z.array(courtProductionSchema).parse(productions)
}

export async function listRemand() {
  const entries = isTauri() ? await invoke('list_remand') : await devFetch('/remand')
  return z.array(remandListEntrySchema).parse(entries)
}
