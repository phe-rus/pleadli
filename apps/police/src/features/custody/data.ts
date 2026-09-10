import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import { createCustodyRecordSchema, custodyRecordSchema, type CreateCustodyRecordInput } from './schema'

const DEV_SERVER_URL = 'http://127.0.0.1:47821'

async function devFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DEV_SERVER_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(await response.text())
  return response.status === 204 ? null : response.json()
}

function toRustInput(input: CreateCustodyRecordInput) {
  return {
    ...input,
    location: input.location || null,
    notes: input.notes || null,
  }
}

export async function createCustodyRecord(input: CreateCustodyRecordInput) {
  const parsed = toRustInput(createCustodyRecordSchema.parse(input))
  const record = isTauri()
    ? await invoke('create_custody_record', { input: parsed })
    : await devFetch('/custody', { method: 'POST', body: JSON.stringify(parsed) })
  return custodyRecordSchema.parse(record)
}

export async function updateCustodyRecord(id: string, input: CreateCustodyRecordInput) {
  const parsed = toRustInput(createCustodyRecordSchema.parse(input))
  const record = isTauri()
    ? await invoke('update_custody_record', { id, input: parsed })
    : await devFetch(`/custody/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return custodyRecordSchema.parse(record)
}

export async function listCustodyRecords(query: string) {
  const records = isTauri()
    ? await invoke('list_custody_records', { query })
    : await devFetch(`/custody?query=${encodeURIComponent(query)}`)
  return z.array(custodyRecordSchema).parse(records)
}
