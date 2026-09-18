import * as z from 'zod'
import { api } from '@/lib/api'
import {
  prisonerSchema,
  updatePrisonerSchema,
  type UpdatePrisonerInput,
} from './schema'

function toRustUpdateInput(input: UpdatePrisonerInput) {
  return {
    ...input,
    otherNames: input.otherNames || null,
    nationalId: input.nationalId || null,
    reference: input.reference || null,
    currentLocation: input.currentLocation || null,
    sex: input.sex || null,
    educationLevel: input.educationLevel || null,
    nationality: input.nationality || null,
    offence: input.offence || null,
    pendingDocumentType: input.documentsPending ? input.pendingDocumentType || null : null,
    notes: input.notes || null,
  }
}

export async function updatePrisoner(id: string, input: UpdatePrisonerInput) {
  const body = toRustUpdateInput(updatePrisonerSchema.parse(input))
  return prisonerSchema.parse(await api('PUT', `/api/prisons/prisoners/${encodeURIComponent(id)}`, { body }))
}

export async function listPrisoners(query: string) {
  return z.array(prisonerSchema).parse(await api('GET', '/api/prisons/prisoners', { query: { query } }))
}

export async function listInCustody() {
  return z.array(prisonerSchema).parse(await api('GET', '/api/prisons/prisoners/in-custody'))
}

export async function getPrisoner(id: string) {
  return prisonerSchema.nullable().parse(await api('GET', `/api/prisons/prisoners/${encodeURIComponent(id)}`))
}
