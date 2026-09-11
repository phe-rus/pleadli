import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createShiftHandoverSchema,
  officerCheckInSchema,
  shiftHandoverSchema,
  type CreateShiftHandoverInput,
} from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function checkInByBadge(badgeNumber: string) {
  const checkIn = isTauri()
    ? await invoke('check_in_officer_by_badge', { badgeNumber })
    : await devFetch('/check-ins', { method: 'POST', body: JSON.stringify({ badgeNumber }) })
  return officerCheckInSchema.parse(checkIn)
}

export async function listCheckIns(query: string) {
  const checkIns = isTauri()
    ? await invoke('list_check_ins', { query })
    : await devFetch(`/check-ins?query=${encodeURIComponent(query)}`)
  return z.array(officerCheckInSchema).parse(checkIns)
}

function toRustInput(input: CreateShiftHandoverInput) {
  return { ...input, unit: input.unit || null, notes: input.notes || null }
}

export async function createShiftHandover(input: CreateShiftHandoverInput) {
  const parsed = toRustInput(createShiftHandoverSchema.parse(input))
  const handover = isTauri()
    ? await invoke('create_shift_handover', { input: parsed })
    : await devFetch('/shift-handovers', { method: 'POST', body: JSON.stringify(parsed) })
  return shiftHandoverSchema.parse(handover)
}

export async function listShiftHandovers(query: string) {
  const handovers = isTauri()
    ? await invoke('list_shift_handovers', { query })
    : await devFetch(`/shift-handovers?query=${encodeURIComponent(query)}`)
  return z.array(shiftHandoverSchema).parse(handovers)
}
