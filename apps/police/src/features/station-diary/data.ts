import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createStationDiaryEntrySchema,
  stationDiaryEntrySchema,
  type CreateStationDiaryEntryInput,
} from './schema'

// Same dev-only local server as features/people/data.ts — see
// src-tauri/src/server.rs.
const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

export async function createStationDiaryEntry(input: CreateStationDiaryEntryInput) {
  const parsed = createStationDiaryEntrySchema.parse(input)
  const entry = isTauri()
    ? await invoke('create_station_diary_entry', { input: parsed })
    : await devFetch('/station-diary', { method: 'POST', body: JSON.stringify(parsed) })
  return stationDiaryEntrySchema.parse(entry)
}

export async function updateStationDiaryEntry(id: string, input: CreateStationDiaryEntryInput) {
  const parsed = createStationDiaryEntrySchema.parse(input)
  const entry = isTauri()
    ? await invoke('update_station_diary_entry', { id, input: parsed })
    : await devFetch(`/station-diary/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return stationDiaryEntrySchema.parse(entry)
}

export async function listStationDiaryEntries(query: string) {
  const entries = isTauri()
    ? await invoke('list_station_diary_entries', { query })
    : await devFetch(`/station-diary?query=${encodeURIComponent(query)}`)
  return z.array(stationDiaryEntrySchema).parse(entries)
}
