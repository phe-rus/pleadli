import { api } from '@/lib/api'
import * as z from 'zod'
import {
  createStationDiaryEntrySchema,
  stationDiaryEntrySchema,
  type CreateStationDiaryEntryInput,
} from './schema'

// Same dev-only local server as features/people/data.ts — see
// src-tauri/src/server.rs.
export async function createStationDiaryEntry(input: CreateStationDiaryEntryInput) {
  const parsed = createStationDiaryEntrySchema.parse(input)
  const entry = await api('/station-diary', { method: 'POST', body: JSON.stringify(parsed) })
  return stationDiaryEntrySchema.parse(entry)
}

export async function updateStationDiaryEntry(id: string, input: CreateStationDiaryEntryInput) {
  const parsed = createStationDiaryEntrySchema.parse(input)
  const entry = await api(`/station-diary/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(parsed),
      })
  return stationDiaryEntrySchema.parse(entry)
}

export async function listStationDiaryEntries(query: string) {
  const entries = await api(`/station-diary?query=${encodeURIComponent(query)}`)
  return z.array(stationDiaryEntrySchema).parse(entries)
}
