import * as z from 'zod'
import { api } from '@/lib/api'
import {
  createHealthEventSchema,
  healthEventSchema,
  hospitalisedEntrySchema,
  type CreateHealthEventInput,
} from './schema'

export async function createHealthEvent(input: CreateHealthEventInput) {
  const parsed = createHealthEventSchema.parse(input)
  const body = {
    ...parsed,
    facilityName: parsed.facilityName || null,
    authorizedBy: parsed.authorizedBy || null,
    notes: parsed.notes || null,
  }
  return healthEventSchema.parse(await api('POST', '/api/prisons/health-events', { body }))
}

export async function listHealthEventsForPrisoner(prisonerId: string) {
  const events = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/health-events`)
  return z.array(healthEventSchema).parse(events)
}

export async function listHospitalised() {
  return z.array(hospitalisedEntrySchema).parse(await api('GET', '/api/prisons/hospitalised'))
}
