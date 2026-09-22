import { api } from '@/lib/api'
import * as z from 'zod'
import { createIncidentSchema, incidentSchema, type CreateIncidentInput } from './schema'

function toRustInput(input: CreateIncidentInput) {
  return {
    ...input,
    location: input.location || null,
  }
}

export async function createIncident(input: CreateIncidentInput) {
  const parsed = toRustInput(createIncidentSchema.parse(input))
  const incident = await api('/incidents', { method: 'POST', body: JSON.stringify(parsed) })
  return incidentSchema.parse(incident)
}

export async function updateIncident(id: string, input: CreateIncidentInput) {
  const parsed = toRustInput(createIncidentSchema.parse(input))
  const incident = await api(`/incidents/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return incidentSchema.parse(incident)
}

export async function listIncidents(query: string) {
  const incidents = await api(`/incidents?query=${encodeURIComponent(query)}`)
  return z.array(incidentSchema).parse(incidents)
}
