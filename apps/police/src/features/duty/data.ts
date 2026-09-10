import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createDutyAssignmentSchema, dutyAssignmentSchema, type CreateDutyAssignmentInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateDutyAssignmentInput) {
  return {
    ...input,
    officerRank: input.officerRank || null,
    unit: input.unit || null,
    notes: input.notes || null,
  }
}

export async function createDutyAssignment(input: CreateDutyAssignmentInput) {
  const parsed = toRustInput(createDutyAssignmentSchema.parse(input))
  const assignment = isTauri()
    ? await invoke('create_duty_assignment', { input: parsed })
    : await devFetch('/duty', { method: 'POST', body: JSON.stringify(parsed) })
  return dutyAssignmentSchema.parse(assignment)
}

export async function updateDutyAssignment(id: string, input: CreateDutyAssignmentInput) {
  const parsed = toRustInput(createDutyAssignmentSchema.parse(input))
  const assignment = isTauri()
    ? await invoke('update_duty_assignment', { id, input: parsed })
    : await devFetch(`/duty/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return dutyAssignmentSchema.parse(assignment)
}

export async function listDutyAssignments(query: string) {
  const assignments = isTauri()
    ? await invoke('list_duty_assignments', { query })
    : await devFetch(`/duty?query=${encodeURIComponent(query)}`)
  return z.array(dutyAssignmentSchema).parse(assignments)
}
