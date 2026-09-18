import * as z from 'zod'
import { api } from '@/lib/api'
import { createReleaseSchema, dischargeAssessmentSchema, releaseSchema, type CreateReleaseInput } from './schema'

export async function createRelease(input: CreateReleaseInput) {
  const parsed = createReleaseSchema.parse(input)
  const body = {
    ...parsed,
    orderedBy: parsed.orderedBy || null,
    basis: parsed.basis || null,
    notes: parsed.notes || null,
    exception: parsed.exception
      ? { reason: parsed.exception.reason, authoriser: parsed.exception.authoriser }
      : null,
  }
  return releaseSchema.parse(await api('POST', '/api/prisons/releases', { body }))
}

export async function listReleasesForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/releases`)
  return z.array(releaseSchema).parse(rows)
}

export async function getDischargeCheck(prisonerId: string) {
  return dischargeAssessmentSchema.parse(await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/discharge-check`))
}
