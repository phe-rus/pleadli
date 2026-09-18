import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createVisitSchema, visitSchema, type CreateVisitInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47922'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createVisit(input: CreateVisitInput) {
  const parsed = createVisitSchema.parse(input)
  const rustInput = {
    ...parsed,
    visitorIdentification: parsed.visitorIdentification || null,
    supervisingOfficer: parsed.supervisingOfficer || null,
    notes: parsed.notes || null,
    authorizedBy: parsed.authorizedBy || null,
  }
  const visit = isTauri()
    ? await invoke('create_visit', { input: rustInput })
    : await devFetch('/visits', { method: 'POST', body: JSON.stringify(rustInput) })
  return visitSchema.parse(visit)
}

export async function listVisitsForPrisoner(prisonerId: string) {
  const visits = isTauri()
    ? await invoke('list_visits_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/visits`)
  return z.array(visitSchema).parse(visits)
}
