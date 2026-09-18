import * as z from 'zod'
import { api } from '@/lib/api'
import {
  createPropertyRecordSchema,
  propertyRecordSchema,
  returnPropertyRecordSchema,
  type CreatePropertyRecordInput,
  type ReturnPropertyRecordInput,
} from './schema'

export async function createPropertyRecord(input: CreatePropertyRecordInput) {
  const body = createPropertyRecordSchema.parse(input)
  return propertyRecordSchema.parse(await api('POST', '/api/prisons/property-records', { body }))
}

export async function returnPropertyRecord(id: string, input: ReturnPropertyRecordInput) {
  const parsed = returnPropertyRecordSchema.parse(input)
  const body = { ...parsed, returnedNote: parsed.returnedNote || null }
  return propertyRecordSchema.parse(await api('PUT', `/api/prisons/property-records/${encodeURIComponent(id)}/return`, { body }))
}

export async function listPropertyRecordsForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/property-records`)
  return z.array(propertyRecordSchema).parse(rows)
}
