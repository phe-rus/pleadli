import * as z from 'zod'
import { api } from '@/lib/api'
import {
  certifyProgrammeParticipationSchema,
  createProgrammeParticipationSchema,
  programmeParticipationSchema,
  type CertifyProgrammeParticipationInput,
  type CreateProgrammeParticipationInput,
} from './schema'

export async function createProgrammeParticipation(input: CreateProgrammeParticipationInput) {
  const parsed = createProgrammeParticipationSchema.parse(input)
  const body = { ...parsed, notes: parsed.notes || null }
  return programmeParticipationSchema.parse(await api('POST', '/api/prisons/programme-participations', { body }))
}

export async function certifyProgrammeParticipation(id: string, input: CertifyProgrammeParticipationInput) {
  const parsed = certifyProgrammeParticipationSchema.parse(input)
  const body = { ...parsed, certificateReference: parsed.certificateReference || null }
  const path = `/api/prisons/programme-participations/${encodeURIComponent(id)}/certify`
  return programmeParticipationSchema.parse(await api('PUT', path, { body }))
}

export async function listProgrammeParticipationsForPrisoner(prisonerId: string) {
  const rows = await api('GET', `/api/prisons/prisoners/${encodeURIComponent(prisonerId)}/programme-participations`)
  return z.array(programmeParticipationSchema).parse(rows)
}
