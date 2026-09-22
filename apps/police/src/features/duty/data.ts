import { api } from '@/lib/api'
import * as z from 'zod'
import { createDutyAssignmentSchema, dutyAssignmentSchema, type CreateDutyAssignmentInput } from './schema'

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
  const assignment = await api('/duty', { method: 'POST', body: JSON.stringify(parsed) })
  return dutyAssignmentSchema.parse(assignment)
}

export async function updateDutyAssignment(id: string, input: CreateDutyAssignmentInput) {
  const parsed = toRustInput(createDutyAssignmentSchema.parse(input))
  const assignment = await api(`/duty/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return dutyAssignmentSchema.parse(assignment)
}

export async function listDutyAssignments(query: string) {
  const assignments = await api(`/duty?query=${encodeURIComponent(query)}`)
  return z.array(dutyAssignmentSchema).parse(assignments)
}
