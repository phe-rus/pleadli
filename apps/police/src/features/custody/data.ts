import { api } from '@/lib/api'
import * as z from 'zod'
import { createCustodyRecordSchema, custodyRecordSchema, type CreateCustodyRecordInput } from './schema'

function toRustInput(input: CreateCustodyRecordInput) {
  return {
    ...input,
    location: input.location || null,
    notes: input.notes || null,
  }
}

export async function createCustodyRecord(input: CreateCustodyRecordInput) {
  const parsed = toRustInput(createCustodyRecordSchema.parse(input))
  const record = await api('/custody', { method: 'POST', body: JSON.stringify(parsed) })
  return custodyRecordSchema.parse(record)
}

export async function updateCustodyRecord(id: string, input: CreateCustodyRecordInput) {
  const parsed = toRustInput(createCustodyRecordSchema.parse(input))
  const record = await api(`/custody/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(parsed) })
  return custodyRecordSchema.parse(record)
}

export async function listCustodyRecords(query: string) {
  const records = await api(`/custody?query=${encodeURIComponent(query)}`)
  return z.array(custodyRecordSchema).parse(records)
}
