import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createIncidentSchema, incidentSchema, type CreateIncidentInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateIncidentInput) {
  return {
    ...input,
    location: input.location || null,
  }
}

export async function createIncident(input: CreateIncidentInput) {
  const parsed = toRustInput(createIncidentSchema.parse(input))
  const incident = isTauri()
    ? await invoke('create_incident', { input: parsed })
    : await devFetch('/incidents', { method: 'POST', body: JSON.stringify(parsed) })
  return incidentSchema.parse(incident)
}

export async function updateIncident(id: string, input: CreateIncidentInput) {
  const parsed = toRustInput(createIncidentSchema.parse(input))
  const incident = isTauri()
    ? await invoke('update_incident', { id, input: parsed })
    : await devFetch(`/incidents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return incidentSchema.parse(incident)
}

export async function listIncidents(query: string) {
  const incidents = isTauri()
    ? await invoke('list_incidents', { query })
    : await devFetch(`/incidents?query=${encodeURIComponent(query)}`)
  return z.array(incidentSchema).parse(incidents)
}
