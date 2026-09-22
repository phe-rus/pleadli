import { api } from '@/lib/api'
import * as z from 'zod'
import {
  createShiftHandoverSchema,
  officerCheckInSchema,
  shiftHandoverSchema,
  type CreateShiftHandoverInput,
} from './schema'

export async function checkInByBadge(badgeNumber: string) {
  const checkIn = await api('/check-ins', { method: 'POST', body: JSON.stringify({ badgeNumber }) })
  return officerCheckInSchema.parse(checkIn)
}

export async function listCheckIns(query: string) {
  const checkIns = await api(`/check-ins?query=${encodeURIComponent(query)}`)
  return z.array(officerCheckInSchema).parse(checkIns)
}

function toRustInput(input: CreateShiftHandoverInput) {
  return { ...input, unit: input.unit || null, notes: input.notes || null }
}

export async function createShiftHandover(input: CreateShiftHandoverInput) {
  const parsed = toRustInput(createShiftHandoverSchema.parse(input))
  const handover = await api('/shift-handovers', { method: 'POST', body: JSON.stringify(parsed) })
  return shiftHandoverSchema.parse(handover)
}

export async function listShiftHandovers(query: string) {
  const handovers = await api(`/shift-handovers?query=${encodeURIComponent(query)}`)
  return z.array(shiftHandoverSchema).parse(handovers)
}
