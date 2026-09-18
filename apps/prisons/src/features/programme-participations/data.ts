import { invoke, isTauri } from '@tauri-apps/api/core'
import * as z from 'zod'
import {
  certifyProgrammeParticipationSchema,
  createProgrammeParticipationSchema,
  programmeParticipationSchema,
  type CertifyProgrammeParticipationInput,
  type CreateProgrammeParticipationInput,
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

export async function createProgrammeParticipation(input: CreateProgrammeParticipationInput) {
  const parsed = createProgrammeParticipationSchema.parse(input)
  const rustInput = {
    ...parsed,
    notes: parsed.notes || null,
  }
  const participation = isTauri()
    ? await invoke('create_programme_participation', { input: rustInput })
    : await devFetch('/programme-participations', { method: 'POST', body: JSON.stringify(rustInput) })
  return programmeParticipationSchema.parse(participation)
}

export async function certifyProgrammeParticipation(id: string, input: CertifyProgrammeParticipationInput) {
  const parsed = certifyProgrammeParticipationSchema.parse(input)
  const rustInput = { ...parsed, certificateReference: parsed.certificateReference || null }
  const participation = isTauri()
    ? await invoke('certify_programme_participation', { id, input: rustInput })
    : await devFetch(`/programme-participations/${encodeURIComponent(id)}/certify`, { method: 'PUT', body: JSON.stringify(rustInput) })
  return programmeParticipationSchema.parse(participation)
}

export async function listProgrammeParticipationsForPrisoner(prisonerId: string) {
  const participations = isTauri()
    ? await invoke('list_programme_participations_for_prisoner', { prisonerId })
    : await devFetch(`/prisoners/${encodeURIComponent(prisonerId)}/programme-participations`)
  return z.array(programmeParticipationSchema).parse(participations)
}
