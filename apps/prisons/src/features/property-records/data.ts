import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  createPropertyRecordSchema,
  propertyRecordSchema,
  returnPropertyRecordSchema,
  type CreatePropertyRecordInput,
  type ReturnPropertyRecordInput,
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

export async function createPropertyRecord(input: CreatePropertyRecordInput) {
  const parsed = createPropertyRecordSchema.parse(input)
  const record = isTauri()
    ? await invoke('create_property_record', { input: parsed })
    : await devFetch('/property-records', { method: 'POST', body: JSON.stringify(parsed) })
  return propertyRecordSchema.parse(record)
}

export async function returnPropertyRecord(id: string, input: ReturnPropertyRecordInput) {
  const parsed = returnPropertyRecordSchema.parse(input)
  const rustInput = { ...parsed, returnedNote: parsed.returnedNote || null }
  const record = isTauri()
    ? await invoke('return_property_record', { id, input: rustInput })
    : await devFetch(`/property-records/${encodeURIComponent(id)}/return`, { method: 'PUT', body: JSON.stringify(rustInput) })
  return propertyRecordSchema.parse(record)
}

export async function listPropertyRecordsForPrisoner(prisonerId: string) {
  const records = isTauri()
    ? await invoke('list_property_records_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/property-records`)
  return z.array(propertyRecordSchema).parse(records)
}
