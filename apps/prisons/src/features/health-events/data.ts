import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createHealthEventSchema,
  healthEventSchema,
  hospitalisedEntrySchema,
  type CreateHealthEventInput,
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

export async function createHealthEvent(input: CreateHealthEventInput) {
  const parsed = createHealthEventSchema.parse(input)
  const rustInput = {
    ...parsed,
    facilityName: parsed.facilityName || null,
    authorizedBy: parsed.authorizedBy || null,
    notes: parsed.notes || null,
  }
  const event = isTauri()
    ? await invoke('create_health_event', { input: rustInput })
    : await devFetch('/health-events', { method: 'POST', body: JSON.stringify(rustInput) })
  return healthEventSchema.parse(event)
}

export async function listHealthEventsForPrisoner(prisonerId: string) {
  const events = isTauri()
    ? await invoke('list_health_events_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/health-events`)
  return z.array(healthEventSchema).parse(events)
}

export async function listHospitalised() {
  const entries = isTauri() ? await invoke('list_hospitalised') : await devFetch('/hospitalised')
  return z.array(hospitalisedEntrySchema).parse(entries)
}
