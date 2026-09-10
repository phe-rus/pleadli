import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createExhibitMovementSchema,
  createExhibitSchema,
  exhibitMovementSchema,
  exhibitSchema,
  type CreateExhibitInput,
  type CreateExhibitMovementInput,
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

export async function createExhibit(input: CreateExhibitInput) {
  const parsed = createExhibitSchema.parse(input)
  const exhibit = isTauri()
    ? await invoke('create_exhibit', { input: parsed })
    : await devFetch('/exhibits', { method: 'POST', body: JSON.stringify(parsed) })
  return exhibitSchema.parse(exhibit)
}

export async function updateExhibit(id: string, input: CreateExhibitInput) {
  const parsed = createExhibitSchema.parse(input)
  const exhibit = isTauri()
    ? await invoke('update_exhibit', { id, input: parsed })
    : await devFetch(`/exhibits/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return exhibitSchema.parse(exhibit)
}

export async function listExhibits(query: string) {
  const exhibits = isTauri()
    ? await invoke('list_exhibits', { query })
    : await devFetch(`/exhibits?query=${encodeURIComponent(query)}`)
  return z.array(exhibitSchema).parse(exhibits)
}

export async function createExhibitMovement(exhibitId: string, input: CreateExhibitMovementInput) {
  const parsed = createExhibitMovementSchema.parse(input)
  const movement = isTauri()
    ? await invoke('create_exhibit_movement', { exhibitId, input: parsed })
    : await devFetch(`/exhibits/${encodeURIComponent(exhibitId)}/movements`, {
        method: 'POST',
        body: JSON.stringify(parsed),
      })
  return exhibitMovementSchema.parse(movement)
}

export async function listExhibitMovements(exhibitId: string) {
  const movements = isTauri()
    ? await invoke('list_exhibit_movements', { exhibitId })
    : await devFetch(`/exhibits/${encodeURIComponent(exhibitId)}/movements`)
  return z.array(exhibitMovementSchema).parse(movements)
}
